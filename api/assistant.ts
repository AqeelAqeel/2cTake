// POST /api/assistant
//
// In-app AI chatbot that represents 2c Take, grounded in the product docs.
// Used by the chat widget on the Contacts page. Authenticated senders only.
//
// Body: { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
// Returns: { reply: string }

import { json, preflight, webHandler } from './_shared/http.js'
import { getSupabaseAdmin, getUserFromJwt } from './_shared/supabase.js'
import { openaiChat, type ChatMessage } from './_shared/openai.js'
import { PRODUCT_SYSTEM_PROMPT } from './_shared/product-context.js'
import { loadAiContext } from './_shared/settings.js'

interface AssistantRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  projectId?: string
}

const MAX_TURNS = 20

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

  let body: AssistantRequest
  try {
    body = (await req.json()) as AssistantRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const turns = (body.messages ?? [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m): ChatMessage => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.slice(0, 4000),
    }))

  if (turns.length === 0) {
    return json({ error: 'messages is required' }, 400)
  }

  try {
    const ctx = await loadAiContext(sb, user.id, body.projectId)
    const system: ChatMessage[] = [{ role: 'system', content: PRODUCT_SYSTEM_PROMPT }]
    if (ctx.systemAddon) system.push({ role: 'system', content: ctx.systemAddon })

    const reply = await openaiChat([...system, ...turns], {
      temperature: 0.4,
      maxTokens: 600,
    })
    return json({ reply })
  } catch (err) {
    console.error('[assistant] error:', err)
    return json({ error: (err as Error).message || 'Assistant failed' }, 500)
  }
})
