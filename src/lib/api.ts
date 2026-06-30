// Client helpers for the authenticated Vercel /api functions.
import { supabase } from './supabase'

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error((data.error as string) || `Request failed (${res.status})`)
  }
  return data as T
}

export interface SendTextPayload {
  link: string
  message?: string
  templateId?: string
  contactIds?: string[]
  to?: string[]
  sessionId?: string
  senderName?: string
}

export interface SendTextResult {
  ok: boolean
  sent: number
  total: number
  batches: { recipients: string[]; ok: boolean; conversationId?: string; error?: string }[]
  error?: string
}

export function sendQuoText(payload: SendTextPayload): Promise<SendTextResult> {
  return authedPost<SendTextResult>('/api/quo-send', payload)
}

export interface AssistantTurn {
  role: 'user' | 'assistant'
  content: string
}

export function askAssistant(messages: AssistantTurn[]): Promise<{ reply: string }> {
  return authedPost<{ reply: string }>('/api/assistant', { messages })
}
