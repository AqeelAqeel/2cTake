// Vercel Serverless Function: POST /api/r2-presign-upload
//
// Mints a short-lived presigned PUT URL for Cloudflare R2. Three upload kinds:
//
//   kind: 'recording'   — anonymous reviewer uploads a .webm reaction.
//                         Validated by share_token + reviewer_id lookup.
//   kind: 'annotation'  — anonymous reviewer uploads annotation JSON.
//                         Validated same way + must reference an existing
//                         recording that belongs to the same session.
//   kind: 'artifact'    — authenticated sender uploads a PDF/image.
//                         Validated via Supabase JWT in the Authorization
//                         header.
//
// The server ALWAYS generates the R2 key. The client never supplies one —
// that's what keeps a malicious reviewer from overwriting another session's
// objects.
//
// Required env vars (all server-only):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//   R2_ARTIFACTS_BUCKET, R2_RECORDINGS_BUCKET
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { AwsClient } from 'aws4fetch'
import { createClient } from '@supabase/supabase-js'

type UploadKind = 'recording' | 'annotation' | 'artifact'

interface PresignRequest {
  kind: UploadKind
  contentType: string
  // recording + annotation
  shareToken?: string
  reviewerId?: string
  // annotation only
  recordingId?: string
  // artifact only
  ext?: string
}

interface PresignResponse {
  url: string
  key: string
  headers: Record<string, string>
}

const PRESIGN_TTL_SECONDS = 300 // 5 min — upload must START within this window

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

async function signPutUrl(
  bucket: string,
  key: string,
  contentType: string
): Promise<string> {
  const { client, endpoint } = getR2Client()
  const url = new URL(`${endpoint}/${bucket}/${key}`)
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SECONDS))
  const signed = await client.sign(
    new Request(url.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    }),
    { aws: { signQuery: true } }
  )
  return signed.url
}

function sanitizeExt(ext: string | undefined): string {
  if (!ext) return 'bin'
  const cleaned = ext.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return cleaned || 'bin'
}

export default async function handler(req: Request): Promise<Response> {
  // Minimal CORS (same-origin Vercel deploy; localhost dev)
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

  let body: PresignRequest
  try {
    body = (await req.json()) as PresignRequest
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { kind, contentType } = body
  if (!kind || !contentType) {
    return json({ error: 'kind and contentType are required' }, 400)
  }

  const ARTIFACTS_BUCKET = process.env.R2_ARTIFACTS_BUCKET
  const RECORDINGS_BUCKET = process.env.R2_RECORDINGS_BUCKET
  if (!ARTIFACTS_BUCKET || !RECORDINGS_BUCKET) {
    return json({ error: 'R2 buckets not configured' }, 500)
  }

  let sb
  try {
    sb = getSupabaseAdmin()
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }

  let bucket: string
  let key: string

  try {
    if (kind === 'recording' || kind === 'annotation') {
      const { shareToken, reviewerId } = body
      if (!shareToken || !reviewerId) {
        return json({ error: 'shareToken and reviewerId are required' }, 400)
      }

      // Validate share_token → session
      const { data: session, error: sessionErr } = await sb
        .from('sessions')
        .select('id')
        .eq('share_token', shareToken)
        .single()

      if (sessionErr || !session) {
        return json({ error: 'Invalid share token' }, 403)
      }

      // Validate reviewer belongs to that session
      const { data: reviewer, error: reviewerErr } = await sb
        .from('reviewers')
        .select('id')
        .eq('id', reviewerId)
        .eq('session_id', session.id)
        .single()

      if (reviewerErr || !reviewer) {
        return json({ error: 'Invalid reviewer for this session' }, 403)
      }

      bucket = RECORDINGS_BUCKET

      if (kind === 'recording') {
        // Server-chosen key → reviewer can't spoof or overwrite.
        const objectId = globalThis.crypto.randomUUID()
        key = `${session.id}/${reviewerId}/${objectId}.webm`
      } else {
        // annotation
        const { recordingId } = body
        if (!recordingId) {
          return json({ error: 'recordingId is required for annotation uploads' }, 400)
        }

        // Verify the recording exists AND belongs to this session + reviewer
        const { data: recording, error: recErr } = await sb
          .from('recordings')
          .select('id')
          .eq('id', recordingId)
          .eq('session_id', session.id)
          .eq('reviewer_id', reviewerId)
          .single()

        if (recErr || !recording) {
          return json({ error: 'Recording does not belong to this reviewer' }, 403)
        }

        key = `${session.id}/${reviewerId}/${recordingId}_annotations.json`
      }
    } else if (kind === 'artifact') {
      // Authenticated sender upload — verify via Supabase JWT
      const authHeader = req.headers.get('authorization') || ''
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (!jwt) {
        return json({ error: 'Authorization header required' }, 401)
      }

      const { data: userData, error: userErr } = await sb.auth.getUser(jwt)
      if (userErr || !userData.user) {
        return json({ error: 'Invalid session' }, 401)
      }

      bucket = ARTIFACTS_BUCKET
      // Match the current keyspace exactly: `{uuid}.{ext}` at bucket root.
      // This way the backfill and new uploads live in one flat namespace.
      const ext = sanitizeExt(body.ext)
      key = `${globalThis.crypto.randomUUID()}.${ext}`
    } else {
      return json({ error: `Unknown kind: ${kind}` }, 400)
    }

    const url = await signPutUrl(bucket, key, contentType)

    const response: PresignResponse = {
      url,
      key,
      headers: { 'Content-Type': contentType },
    }

    return json(response)
  } catch (err) {
    console.error('[r2-presign-upload] error:', err)
    return json({ error: (err as Error).message || 'Internal error' }, 500)
  }
}
