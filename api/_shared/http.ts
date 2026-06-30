// Shared HTTP helpers for the Vercel /api functions.
// Files in api/_shared are NOT turned into routes (underscore prefix).

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
    },
  })

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

// ── Signature-agnostic adapter ──────────────────────────────────────────────
// Depending on the project/runtime, Vercel may invoke a function with either
// the Web Fetch signature `(request: Request) => Response` OR the legacy Node
// signature `(req, res)`. We always author handlers against the Web `Request`
// and let this adapter bridge the legacy case so the same code runs either way.

/* eslint-disable @typescript-eslint/no-explicit-any */

async function readRawBody(req: any): Promise<Buffer> {
  // If the platform already parsed/consumed the body, reconstruct from req.body.
  if (req.readableEnded || req.body !== undefined) {
    const b = req.body
    if (b === undefined || b === null) return Buffer.alloc(0)
    if (Buffer.isBuffer(b)) return b
    if (typeof b === 'string') return Buffer.from(b)
    return Buffer.from(JSON.stringify(b))
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

async function nodeToRequest(req: any): Promise<Request> {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = (req.headers['host'] as string) || 'localhost'
  const url = `${proto}://${host}${req.url || '/'}`

  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((val) => headers.append(k, String(val)))
    else if (v != null) headers.set(k, String(v))
  }

  const method = (req.method as string) || 'GET'
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const raw = await readRawBody(req)
    if (raw.length) body = raw.toString('utf8')
  }

  return new Request(url, { method, headers, body })
}

async function writeResponse(res: any, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value: string, key: string) => {
    res.setHeader(key, value)
  })
  const buf = Buffer.from(await response.arrayBuffer())
  res.end(buf)
}

type WebHandler = (request: Request) => Promise<Response>

export function webHandler(core: WebHandler) {
  return async function handler(a: any, b?: any): Promise<Response | void> {
    // Legacy Node signature: (req, res). `res` exposes setHeader/end.
    if (b && typeof b.setHeader === 'function' && typeof b.end === 'function') {
      const request = await nodeToRequest(a)
      const response = await core(request)
      await writeResponse(b, response)
      return
    }
    // Web Fetch signature: (request).
    return core(a as Request)
  }
}
