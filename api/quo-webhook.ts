// POST /api/quo-webhook
//
// Inbound Quo message webhook. When a recipient texts back into the group
// thread, this:
//   1. verifies the Svix-style HMAC signature (when QUO_WEBHOOK_KEY is set),
//   2. logs the incoming message (so it's counted),
//   3. asks the AI — grounded in the product docs — for a reply,
//   4. sends that reply back into the same conversation via Quo (and logs it).
//
// Register it with:
//   POST https://api.quo.com/v1/webhooks/messages
//   { "events": ["message.received"], "url": "https://<deploy>/api/quo-webhook" }
// Store the returned whsec_... secret as QUO_WEBHOOK_KEY.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { json, preflight, webHandler } from './_shared/http.js'
import { getSupabaseAdmin } from './_shared/supabase.js'
import { quoSendMessage } from './_shared/quo.js'
import { openaiChat, type ChatMessage } from './_shared/openai.js'
import { PRODUCT_SYSTEM_PROMPT } from './_shared/product-context.js'
import { loadAiContext } from './_shared/settings.js'

// ── Svix-style signature verification ──────────────────────────────────────
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

function verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
  const id = headers.get('webhook-id')
  const ts = headers.get('webhook-timestamp')
  const sigHeader = headers.get('webhook-signature')
  if (!id || !ts || !sigHeader) return false

  // reject stale deliveries (>5 min skew)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(ts)) > 300) return false

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', secretBytes)
    .update(`${id}.${ts}.${rawBody}`)
    .digest('base64')

  // header is space-separated "v1,<base64sig>" entries
  return sigHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .some((sig) => sig && safeEqual(sig, expected))
}

interface QuoEvent {
  data?: {
    resource?: { id?: string; direction?: string; text?: string; createdAt?: string }
    context?: {
      conversationId?: string
      senderIdentifier?: string
      recipientIdentifiers?: string[]
    }
  }
  type?: string
}

export default webHandler(async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Must read the RAW body before parsing for signature verification.
  const rawBody = await req.text()

  // Fail CLOSED: a missing signing secret must never fall through to processing,
  // or a misconfigured deploy turns this into an open, billable AI-driven SMS
  // relay from our A2P number (sr-viber-surf SEC-002).
  const secret = process.env.QUO_WEBHOOK_KEY
  if (!secret) {
    console.error('[quo-webhook] QUO_WEBHOOK_KEY not configured — rejecting webhook')
    return json({ error: 'Webhook secret not configured' }, 500)
  }
  if (!verifySignature(rawBody, req.headers, secret)) {
    return json({ error: 'Invalid signature' }, 401)
  }

  let event: QuoEvent
  try {
    event = JSON.parse(rawBody) as QuoEvent
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const resource = event.data?.resource
  const context = event.data?.context
  const text = resource?.text?.trim()
  const sender = context?.senderIdentifier
  const conversationId = context?.conversationId
  const messageId = resource?.id

  // Only react to genuine inbound messages with text.
  if (resource?.direction && resource.direction !== 'incoming') {
    return json({ ok: true, skipped: 'not incoming' })
  }
  if (!text || !sender) {
    return json({ ok: true, skipped: 'no text/sender' })
  }

  let sb
  try {
    sb = getSupabaseAdmin()
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }

  // Idempotency: webhooks can retry. Skip if we've already logged this message.
  if (messageId) {
    const { data: existing } = await sb
      .from('messages_log')
      .select('id')
      .eq('quo_message_id', messageId)
      .eq('direction', 'incoming')
      .maybeSingle()
    if (existing) return json({ ok: true, skipped: 'duplicate' })
  }

  // Resolve owner + session from a prior message in this conversation, falling
  // back to matching the sender number against the address book.
  let ownerId: string | null = null
  let sessionId: string | null = null
  let projectId: string | null = null
  let contactId: string | null = null

  if (conversationId) {
    const { data: prior } = await sb
      .from('messages_log')
      .select('owner_id, session_id, project_id, contact_id')
      .eq('quo_conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (prior) {
      ownerId = prior.owner_id
      sessionId = prior.session_id
      projectId = prior.project_id
      contactId = prior.contact_id
    }
  }
  if (!contactId) {
    const { data: contact } = await sb
      .from('contacts')
      .select('id, owner_id')
      .eq('phone', sender)
      .limit(1)
      .maybeSingle()
    if (contact) {
      contactId = contact.id
      ownerId = ownerId ?? contact.owner_id
    }
  }

  // Log the inbound message (counted).
  await sb.from('messages_log').insert({
    owner_id: ownerId,
    session_id: sessionId,
    project_id: projectId,
    contact_id: contactId,
    direction: 'incoming',
    quo_message_id: messageId ?? null,
    quo_conversation_id: conversationId ?? null,
    from_number: sender,
    to_number: process.env.QUO_FROM_NUMBER ?? null,
    content: text,
    status: 'received',
  })

  // Build short conversation history for context.
  const history: ChatMessage[] = []
  if (conversationId) {
    const { data: recent } = await sb
      .from('messages_log')
      .select('direction, content, created_at')
      .eq('quo_conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10)
    for (const row of (recent ?? []).reverse()) {
      if (!row.content) continue
      history.push({
        role: row.direction === 'incoming' ? 'user' : 'assistant',
        content: row.content,
      })
    }
  }
  if (history.length === 0) history.push({ role: 'user', content: text })

  // Generate + send the AI reply.
  let reply = ''
  try {
    const ctx = await loadAiContext(sb, ownerId, projectId)
    const system: ChatMessage[] = [
      { role: 'system', content: PRODUCT_SYSTEM_PROMPT },
      {
        role: 'system',
        content:
          'You are replying over SMS. Keep replies under 320 characters, plain text, no markdown.',
      },
    ]
    if (ctx.systemAddon) system.push({ role: 'system', content: ctx.systemAddon })

    reply = await openaiChat([...system, ...history], {
      temperature: 0.4,
      maxTokens: 200,
    })
  } catch (err) {
    console.error('[quo-webhook] AI error:', err)
    return json({ ok: true, replied: false, error: (err as Error).message })
  }

  if (!reply) return json({ ok: true, replied: false })

  // Reply to the whole group: every external participant, minus our own number.
  const ourNumber = process.env.QUO_FROM_NUMBER
  const participants = new Set<string>([sender, ...(context?.recipientIdentifiers ?? [])])
  if (ourNumber) participants.delete(ourNumber)
  const to = [...participants].filter(Boolean)
  if (to.length === 0) to.push(sender)

  const sent = await quoSendMessage({ content: reply, to })

  await sb.from('messages_log').insert({
    owner_id: ownerId,
    session_id: sessionId,
    project_id: projectId,
    contact_id: contactId,
    direction: 'outgoing',
    quo_message_id: sent.messageId ?? null,
    quo_conversation_id: sent.conversationId ?? conversationId ?? null,
    from_number: ourNumber ?? null,
    to_number: to.join(','),
    content: reply,
    status: sent.ok ? 'ai-reply' : `failed: ${sent.error}`,
  })

  return json({ ok: true, replied: sent.ok, error: sent.ok ? undefined : sent.error })
})
