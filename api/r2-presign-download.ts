// Vercel Serverless Function: POST /api/r2-presign-download
//
// Batch-mints presigned GET URLs for private R2 objects (recordings bucket).
// The caller passes an array of keys; the server verifies that the caller
// owns every session referenced by those keys, then signs them all.
//
// Caller authentication: Supabase JWT in `Authorization: Bearer <token>`.
// Ownership rule: every key's path prefix `{sessionId}/...` must match a
// session whose `owner_id` equals the authenticated user's id.
//
// Why batch: `fetchRecordings` in the frontend used to loop over N recordings
// calling Supabase `createSignedUrl` N times. Presigning N keys in one round
// trip is strictly better for latency and also saves R2 ops.
//
// Required env vars (all server-only):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_RECORDINGS_BUCKET
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { AwsClient } from 'aws4fetch'
import { createClient } from '@supabase/supabase-js'

interface PresignDownloadRequest {
  keys: string[]
}

const PRESIGN_TTL_SECONDS = 3600 // 1 hour — matches old Supabase signed URL TTL

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })

function getR2Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const accountId = process.env.R2_ACCOUNT_ID
  if (!accessKeyId || !secretAccessKey || !accountId) {
    throw new Error('R2 credentials not configured')
  }
  return {
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto',
    }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  }
}

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase service credentials not configured')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

async function signGetUrl(bucket: string, key: string): Promise<string> {
  const { client, endpoint } = getR2Client()
  const url = new URL(`${endpoint}/${bucket}/${key}`)
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SECONDS))
  const signed = await client.sign(new Request(url.toString(), { method: 'GET' }), {
    aws: { signQuery: true },
  })
  return signed.url
}

/**
 * Extracts the session UUID from a recordings-bucket key.
 * Keys are formatted: `{sessionId}/{reviewerId}/{filename}`.
 * Returns null if the key shape is unexpected.
 */
function parseSessionIdFromKey(key: string): string | null {
  const parts = key.split('/')
  if (parts.length < 3) return null
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(parts[0])) return null
  return parts[0]
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // Authenticate caller via Supabase JWT
  const authHeader = req.headers.get('authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return json({ error: 'Authorization header required' }, 401)
  }

  let body: PresignDownloadRequest
  try {
    body = (await req.json()) as PresignDownloadRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const keys = Array.isArray(body.keys) ? body.keys.filter(Boolean) : []
  if (keys.length === 0) {
    return json({ urls: {} })
  }
  if (keys.length > 200) {
    return json({ error: 'Too many keys in one request (max 200)' }, 400)
  }

  const RECORDINGS_BUCKET = process.env.R2_RECORDINGS_BUCKET
  if (!RECORDINGS_BUCKET) {
    return json({ error: 'R2 bucket not configured' }, 500)
  }

  let sb
  try {
    sb = getSupabaseAdmin()
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }

  // Verify caller
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json({ error: 'Invalid session' }, 401)
  }
  const userId = userData.user.id

  // Collect unique session IDs referenced by the requested keys
  const sessionIds = new Set<string>()
  const keyToSessionId: Record<string, string> = {}
  for (const key of keys) {
    const sid = parseSessionIdFromKey(key)
    if (!sid) {
      return json({ error: `Malformed key: ${key}` }, 400)
    }
    sessionIds.add(sid)
    keyToSessionId[key] = sid
  }

  // Check the caller owns every referenced session in ONE query
  const { data: owned, error: ownErr } = await sb
    .from('sessions')
    .select('id')
    .in('id', Array.from(sessionIds))
    .eq('owner_id', userId)

  if (ownErr) {
    return json({ error: ownErr.message }, 500)
  }

  const ownedSet = new Set((owned ?? []).map((row: { id: string }) => row.id))
  for (const sid of sessionIds) {
    if (!ownedSet.has(sid)) {
      return json({ error: 'One or more keys are not owned by the caller' }, 403)
    }
  }

  // All clear — sign in parallel
  const entries = await Promise.all(
    keys.map(async (key) => [key, await signGetUrl(RECORDINGS_BUCKET, key)] as const)
  )

  const urls = Object.fromEntries(entries)
  return json({ urls })
}
