// Vercel Serverless Function: GET /api/artifact?key=<uuid>.<ext>
//
// Same-origin proxy for the public artifacts bucket. The review page renders
// PDFs with pdf.js and images onto a Fabric canvas, both of which need
// CORS-clean bytes — and the r2.dev public subdomain serves no CORS headers
// (it is also rate-limited and not intended for production traffic). Routing
// artifact reads through our own domain removes CORS from the equation
// entirely and keeps working for anonymous reviewers, who have no Supabase
// session to presign with.
//
// Keys are server-minted UUIDs (see r2-presign-upload.ts), so objects are
// immutable — we tell the CDN to cache aggressively and the function runs
// roughly once per object per region.
//
// Required env vars (all server-only):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ARTIFACTS_BUCKET

import { AwsClient } from 'aws4fetch'
import { json, webHandler } from './_shared/http.js'

// Matches the artifact keyspace exactly: `{uuid}.{ext}` at bucket root.
// Anything else is rejected so this can't be used as an open proxy into
// other prefixes or buckets.
const ARTIFACT_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i

export default webHandler(async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const key = new URL(req.url).searchParams.get('key') ?? ''
  if (!ARTIFACT_KEY_RE.test(key)) {
    return json({ error: 'Invalid artifact key' }, 400)
  }

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_ARTIFACTS_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return json({ error: 'R2 not configured' }, 500)
  }

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  const upstream = await client.fetch(
    `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`,
    { method: 'GET' }
  )

  if (upstream.status === 404) {
    return json({ error: 'Artifact not found' }, 404)
  }
  if (!upstream.ok) {
    console.error('[artifact] R2 fetch failed:', upstream.status, key)
    return json({ error: 'Upstream error' }, 502)
  }

  const headers: Record<string, string> = {
    'Content-Type':
      upstream.headers.get('content-type') ?? 'application/octet-stream',
    // Immutable UUID keys → cache hard at the CDN and in the browser.
    'Cache-Control': 'public, max-age=3600, s-maxage=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
  }

  if (req.method === 'HEAD') {
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) headers['Content-Length'] = contentLength
    return new Response(null, { status: 200, headers })
  }

  // Buffer rather than stream: artifacts are small (a few MB at most) and
  // passing the upstream ReadableStream through the platform's handler
  // bridge stalled responses on Vercel. A buffered body also lets the
  // platform compute Content-Length itself.
  const body = await upstream.arrayBuffer()
  return new Response(body, { status: 200, headers })
})
