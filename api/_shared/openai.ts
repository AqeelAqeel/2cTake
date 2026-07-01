// Minimal OpenAI chat-completions client. Reuses OPENAI_API_KEY (already set
// for the Whisper transcription pipeline).

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function openaiChat(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not configured')

  // Project-scoped keys (sk-proj-…) work with plain bearer auth, but we also
  // forward optional project/org headers so calls can be pinned explicitly.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  if (process.env.OPENAI_PROJECT) headers['OpenAI-Project'] = process.env.OPENAI_PROJECT
  if (process.env.OPENAI_ORGANIZATION) headers['OpenAI-Organization'] = process.env.OPENAI_ORGANIZATION

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model || 'gpt-4o-mini',
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 600,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content?.trim() || ''
}
