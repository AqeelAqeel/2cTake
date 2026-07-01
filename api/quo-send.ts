// POST /api/quo-send
//
// Authenticated sender texts a review link (a "group chat") to one or more
// recipients via Quo. Recipients can be saved contacts (by id) and/or raw
// E.164 numbers. The message body comes from a template or free text and
// supports {{link}}, {{name}}, {{sender}} placeholders.
//
// Quo caps a single message at 10 recipients, so larger lists are sent as
// several group messages. Every recipient is written to messages_log so the
// Contacts page can count messages sent.
//
// Auth: Supabase JWT (Authorization: Bearer <token>).

import { json, preflight, webHandler } from './_shared/http.js'
import { getSupabaseAdmin, getUserFromJwt } from './_shared/supabase.js'
import { quoSendMessage, chunkRecipients } from './_shared/quo.js'

interface SendRequest {
  link: string // full /review/<token> URL the recipients should open
  message?: string // free-text body (used when templateId is absent)
  templateId?: string
  contactIds?: string[]
  to?: string[] // extra raw E.164 numbers not in the address book
  sessionId?: string // for logging/attribution
  projectId?: string // ties these messages to a project for feedback aggregation
  senderName?: string // overrides {{sender}} (defaults to nothing)
}

interface Recipient {
  phone: string
  contactId: string | null
  name: string | null
}

function fillTemplate(
  body: string,
  vars: { link: string; name?: string | null; sender?: string | null }
): string {
  return body
    .replace(/\{\{\s*link\s*\}\}/gi, vars.link)
    .replace(/\{\{\s*name\s*\}\}/gi, vars.name || 'there')
    .replace(/\{\{\s*sender\s*\}\}/gi, vars.sender || 'someone')
}

export default webHandler(async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return preflight()
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let sb
  try {
    sb = getSupabaseAdmin()
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }

  const user = await getUserFromJwt(req, sb)
  if (!user) return json({ error: 'Authentication required' }, 401)

  let body: SendRequest
  try {
    body = (await req.json()) as SendRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const link = (body.link || '').trim()
  if (!link) return json({ error: 'link is required' }, 400)

  // ── Resolve recipients ────────────────────────────────────────────────
  const recipients: Recipient[] = []
  const seen = new Set<string>()

  if (body.contactIds?.length) {
    const { data: contacts, error } = await sb
      .from('contacts')
      .select('id, name, phone')
      .eq('owner_id', user.id)
      .in('id', body.contactIds)
    if (error) return json({ error: error.message }, 500)
    for (const c of contacts ?? []) {
      if (seen.has(c.phone)) continue
      seen.add(c.phone)
      recipients.push({ phone: c.phone, contactId: c.id, name: c.name })
    }
  }

  for (const raw of body.to ?? []) {
    const phone = raw.trim()
    if (!phone || seen.has(phone)) continue
    seen.add(phone)
    recipients.push({ phone, contactId: null, name: null })
  }

  if (recipients.length === 0) {
    return json({ error: 'No recipients — pass contactIds and/or to[]' }, 400)
  }

  // ── Resolve message body ──────────────────────────────────────────────
  let templateBody = body.message?.trim() || ''
  if (body.templateId) {
    const { data: tpl, error } = await sb
      .from('message_templates')
      .select('body')
      .eq('owner_id', user.id)
      .eq('id', body.templateId)
      .single()
    if (error || !tpl) return json({ error: 'Template not found' }, 404)
    templateBody = tpl.body
  }
  if (!templateBody) {
    templateBody = `{{sender}} wants your 2c take. Watch it here and record a quick reaction: {{link}}`
  }

  // ── Send in 10-recipient batches; log every recipient ─────────────────
  const batches = chunkRecipients(recipients, 10)
  const logRows: Record<string, unknown>[] = []
  const results: {
    recipients: string[]
    ok: boolean
    conversationId?: string
    error?: string
  }[] = []
  let sentCount = 0

  for (const batch of batches) {
    // Each recipient may have a personalized name; a group text shares one body,
    // so use the first named recipient (or "there") for {{name}}.
    const namedFor = batch.find((r) => r.name)?.name ?? null
    const content = fillTemplate(templateBody, {
      link,
      name: namedFor,
      sender: body.senderName ?? null,
    })

    const result = await quoSendMessage({
      content,
      to: batch.map((r) => r.phone),
    })

    results.push({
      recipients: batch.map((r) => r.phone),
      ok: result.ok,
      conversationId: result.conversationId,
      error: result.error,
    })

    if (result.ok) sentCount += batch.length

    for (const r of batch) {
      logRows.push({
        owner_id: user.id,
        session_id: body.sessionId ?? null,
        project_id: body.projectId ?? null,
        contact_id: r.contactId,
        direction: 'outgoing',
        quo_message_id: result.messageId ?? null,
        quo_conversation_id: result.conversationId ?? null,
        from_number: process.env.QUO_FROM_NUMBER ?? null,
        to_number: r.phone,
        content,
        status: result.ok ? result.statusText ?? 'sent' : `failed: ${result.error}`,
      })
    }
  }

  if (logRows.length) {
    const { error: logErr } = await sb.from('messages_log').insert(logRows)
    if (logErr) console.error('[quo-send] log insert failed:', logErr.message)
  }

  const anyOk = results.some((r) => r.ok)
  const allOk = results.every((r) => r.ok)
  return json(
    {
      ok: anyOk,
      sent: sentCount,
      total: recipients.length,
      batches: results,
      // surface the first error so the UI can show why a send failed
      error: allOk ? undefined : results.find((r) => !r.ok)?.error,
    },
    anyOk ? 200 : 502
  )
})
