// Thin server-side wrapper over the Quo REST API.
//
// Auth is the RAW api key in the Authorization header — Quo does NOT use a
// Bearer prefix (see https://www.quo.com/docs/mdx/api-reference/authentication).

const QUO_BASE = 'https://api.quo.com/v1'

export interface QuoConfig {
  apiKey: string
  from: string // E.164 workspace number we send FROM
  userId?: string
}

export function quoConfig(): QuoConfig {
  const apiKey = process.env.NEXT_QUO_API_KEY
  if (!apiKey) throw new Error('NEXT_QUO_API_KEY not configured')
  const from = process.env.QUO_FROM_NUMBER || process.env.QUO_PHONE_NUMBER_ID || ''
  if (!from) throw new Error('QUO_FROM_NUMBER not configured')
  return { apiKey, from, userId: process.env.QUO_USER_ID || undefined }
}

async function quoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { apiKey } = quoConfig()
  return fetch(`${QUO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

export interface QuoSendResult {
  ok: boolean
  status: number
  // Quo's message envelope on success
  messageId?: string
  conversationId?: string
  statusText?: string
  error?: string
  raw?: unknown
}

// Send a single text. `to` accepts 1–10 recipients; passing several creates one
// group conversation. Batch upstream if you have more than 10.
export async function quoSendMessage(opts: {
  content: string
  to: string[]
  from?: string
  userId?: string
}): Promise<QuoSendResult> {
  const cfg = quoConfig()
  const body: Record<string, unknown> = {
    content: opts.content,
    from: opts.from || cfg.from,
    to: opts.to,
  }
  const userId = opts.userId ?? cfg.userId
  if (userId) body.userId = userId

  const res = await quoFetch('/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  interface QuoPayload {
    data?: Record<string, unknown>
    message?: string
    error?: string
  }
  let payload: QuoPayload | null = null
  try {
    payload = (await res.json()) as QuoPayload
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: payload?.message || payload?.error || `Quo API error ${res.status}`,
      raw: payload,
    }
  }

  const data = payload?.data ?? {}
  return {
    ok: true,
    status: res.status,
    messageId: data.id as string | undefined,
    conversationId: data.conversationId as string | undefined,
    statusText: (data.status as string | undefined) ?? 'sent',
    raw: payload,
  }
}

// Split recipients into Quo's 10-per-message batches.
export function chunkRecipients<T>(items: T[], size = 10): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
