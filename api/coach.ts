// POST /api/coach
//
// Feedback-aggregation coaching chat. Pulls together the feedback a user has
// collected from people — inbound SMS replies today, reviewer video transcripts
// once that schema exists — and lets the user chat with an AI coach that
// synthesizes themes, sentiment, and action items.
//
// Multi-tenancy: everything is filtered by owner_id (service role + explicit
// eq('owner_id', user.id)). The AI prompt references contacts by NAME only —
// never phone numbers — so usernames and cell numbers are not correlated.
//
// Body: { messages: [{role, content}], projectId?: string }
// Returns: { reply, stats: { messages, contacts, transcripts } }

import { json, preflight, webHandler } from './_shared/http.js'
import { getSupabaseAdmin, getUserFromJwt } from './_shared/supabase.js'
import { openaiChat, type ChatMessage } from './_shared/openai.js'
import { loadAiContext } from './_shared/settings.js'

interface CoachRequest {
  messages?: { role: 'user' | 'assistant'; content: string }[]
  projectId?: string
}

const MAX_TURNS = 16
const MAX_FEEDBACK_ROWS = 300

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

  let body: CoachRequest
  try {
    body = (await req.json()) as CoachRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // ── Aggregate inbound SMS feedback (owner-scoped) ─────────────────────────
  let q = sb
    .from('messages_log')
    .select('content, contact_id, created_at')
    .eq('owner_id', user.id)
    .eq('direction', 'incoming')
    .order('created_at', { ascending: true })
    .limit(MAX_FEEDBACK_ROWS)
  if (body.projectId) q = q.eq('project_id', body.projectId)
  const { data: inbound } = await q

  // Map contact_id → name so the digest uses names, not phone numbers.
  const contactIds = [...new Set((inbound ?? []).map((r) => r.contact_id).filter(Boolean))]
  const nameById = new Map<string, string>()
  if (contactIds.length) {
    const { data: contacts } = await sb
      .from('contacts')
      .select('id, name')
      .eq('owner_id', user.id)
      .in('id', contactIds as string[])
    for (const c of contacts ?? []) nameById.set(c.id, c.name)
  }

  const feedbackLines = (inbound ?? [])
    .filter((r) => r.content)
    .map((r) => {
      const who = r.contact_id ? nameById.get(r.contact_id) ?? 'A contact' : 'Someone'
      return `- ${who}: "${r.content}"`
    })

  // Reviewer video transcripts — not available until the recordings/transcripts
  // schema lands in this project. Wired here so it lights up automatically:
  // once transcripts are owner-scoped (via projects), push them into feedbackLines.
  const transcriptCount = 0

  // ── Compose the coaching prompt ───────────────────────────────────────────
  const ctx = await loadAiContext(sb, user.id, body.projectId)

  const digest = feedbackLines.length
    ? feedbackLines.join('\n')
    : '(No feedback has been collected yet.)'

  const system: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are an AI feedback coach for 2c Take. Your job: help the user make sense of the ' +
        'feedback they have collected from people. Identify themes, sentiment, points of agreement ' +
        'and disagreement, and concrete next actions. Be candid, specific, and encouraging. Refer ' +
        'to people by name; never mention phone numbers. If there is no feedback yet, say so and ' +
        'suggest how to collect some.',
    },
  ]
  if (ctx.systemAddon) system.push({ role: 'system', content: ctx.systemAddon })
  system.push({
    role: 'system',
    content: `Aggregated feedback${ctx.projectName ? ` for project "${ctx.projectName}"` : ''}:\n${digest}`,
  })

  const turns = (body.messages ?? [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m): ChatMessage => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.slice(0, 4000),
    }))
  if (turns.length === 0) {
    turns.push({ role: 'user', content: 'Summarize the feedback so far and what I should focus on.' })
  }

  try {
    const reply = await openaiChat([...system, ...turns], { temperature: 0.4, maxTokens: 700 })
    return json({
      reply,
      stats: {
        messages: feedbackLines.length,
        contacts: contactIds.length,
        transcripts: transcriptCount,
      },
    })
  } catch (err) {
    console.error('[coach] error:', err)
    return json({ error: (err as Error).message || 'Coach failed' }, 500)
  }
})
