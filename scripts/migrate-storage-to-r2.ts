#!/usr/bin/env -S node --experimental-strip-types
/**
 * One-shot backfill: copy every blob currently living in Supabase Storage
 * (artifacts + recordings buckets) to Cloudflare R2 at the SAME KEY, so no
 * DB rows need rewriting.
 *
 * Resumable: writes one JSON line per migrated object to `migrated_keys.jsonl`
 * in CWD. Re-running the script skips anything already in that log.
 *
 * Usage:
 *   1. Populate these env vars (e.g. in .env.local, then `source .env.local`):
 *        VITE_SUPABASE_URL
 *        SUPABASE_SERVICE_ROLE_KEY
 *        R2_ACCOUNT_ID
 *        R2_ACCESS_KEY_ID
 *        R2_SECRET_ACCESS_KEY
 *        R2_ARTIFACTS_BUCKET
 *        R2_RECORDINGS_BUCKET
 *   2. npx tsx scripts/migrate-storage-to-r2.ts        # real run
 *      npx tsx scripts/migrate-storage-to-r2.ts --dry  # no writes, just list
 *
 * What gets migrated:
 *   - every `sessions.artifact_url` that does NOT already start with "http"
 *   - every `recordings.video_url`
 *   - every annotation path inferred from the recordings table:
 *       `{session_id}/{reviewer_id}/{recording_id}_annotations.json`
 *     (skipped silently if it 404s — not every recording has annotations)
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'

interface MigrationLogEntry {
  kind: 'artifact' | 'recording' | 'annotation'
  key: string
  status: 'ok' | 'skipped' | 'failed'
  bytes?: number
  error?: string
  at: string
}

const LOG_PATH = 'migrated_keys.jsonl'
const DRY_RUN = process.argv.includes('--dry')

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

const SUPABASE_URL = requireEnv('VITE_SUPABASE_URL')
const SUPABASE_SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const R2_ACCOUNT = requireEnv('R2_ACCOUNT_ID')
const R2_ACCESS_KEY_ID = requireEnv('R2_ACCESS_KEY_ID')
const R2_SECRET = requireEnv('R2_SECRET_ACCESS_KEY')
const R2_ARTIFACTS_BUCKET = requireEnv('R2_ARTIFACTS_BUCKET')
const R2_RECORDINGS_BUCKET = requireEnv('R2_RECORDINGS_BUCKET')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET,
  service: 's3',
  region: 'auto',
})

const R2_ENDPOINT = `https://${R2_ACCOUNT}.r2.cloudflarestorage.com`

function loadCompleted(): Set<string> {
  if (!existsSync(LOG_PATH)) return new Set()
  const completed = new Set<string>()
  for (const line of readFileSync(LOG_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line) as MigrationLogEntry
      if (entry.status === 'ok' || entry.status === 'skipped') {
        completed.add(`${entry.kind}:${entry.key}`)
      }
    } catch {
      // ignore malformed lines
    }
  }
  return completed
}

function log(entry: MigrationLogEntry) {
  const line = JSON.stringify(entry)
  console.log(line)
  if (!DRY_RUN) appendFileSync(LOG_PATH, line + '\n')
}

async function copyObject(
  supabaseBucket: 'artifacts' | 'recordings',
  r2Bucket: string,
  key: string,
  contentType: string,
  kind: MigrationLogEntry['kind']
) {
  try {
    const { data: blob, error } = await supabase.storage
      .from(supabaseBucket)
      .download(key)

    if (error || !blob) {
      // Annotations often legitimately don't exist — log as skipped, not failed
      if (kind === 'annotation') {
        log({ kind, key, status: 'skipped', at: new Date().toISOString() })
        return
      }
      log({
        kind,
        key,
        status: 'failed',
        error: error?.message ?? 'no blob returned',
        at: new Date().toISOString(),
      })
      return
    }

    const bytes = blob.size

    if (DRY_RUN) {
      log({ kind, key, status: 'ok', bytes, at: new Date().toISOString() })
      return
    }

    const r2Res = await r2.fetch(`${R2_ENDPOINT}/${r2Bucket}/${key}`, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': contentType },
    })
    if (!r2Res.ok) {
      const errBody = await r2Res.text().catch(() => '')
      log({
        kind,
        key,
        status: 'failed',
        error: `R2 PUT ${r2Res.status}: ${errBody}`,
        at: new Date().toISOString(),
      })
      return
    }

    log({ kind, key, status: 'ok', bytes, at: new Date().toISOString() })
  } catch (err) {
    log({
      kind,
      key,
      status: 'failed',
      error: (err as Error).message,
      at: new Date().toISOString(),
    })
  }
}

function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'json') return 'application/json'
  return 'application/octet-stream'
}

async function main() {
  console.log(`[migrate] starting (dry=${DRY_RUN})`)
  const completed = loadCompleted()
  console.log(`[migrate] ${completed.size} keys already migrated`)

  // --- Artifacts ------------------------------------------------------------
  const { data: sessions, error: sessionsErr } = await supabase
    .from('sessions')
    .select('id, artifact_url')

  if (sessionsErr) throw sessionsErr

  for (const row of sessions ?? []) {
    const key = row.artifact_url as string
    if (!key || key.startsWith('http')) continue
    if (completed.has(`artifact:${key}`)) continue
    await copyObject('artifacts', R2_ARTIFACTS_BUCKET, key, contentTypeForKey(key), 'artifact')
  }

  // --- Recordings + annotations --------------------------------------------
  const { data: recordings, error: recErr } = await supabase
    .from('recordings')
    .select('id, session_id, reviewer_id, video_url')

  if (recErr) throw recErr

  for (const row of recordings ?? []) {
    const videoKey = row.video_url as string
    if (videoKey && !completed.has(`recording:${videoKey}`)) {
      await copyObject(
        'recordings',
        R2_RECORDINGS_BUCKET,
        videoKey,
        contentTypeForKey(videoKey),
        'recording'
      )
    }

    const annKey = `${row.session_id}/${row.reviewer_id}/${row.id}_annotations.json`
    if (!completed.has(`annotation:${annKey}`)) {
      await copyObject(
        'recordings',
        R2_RECORDINGS_BUCKET,
        annKey,
        'application/json',
        'annotation'
      )
    }
  }

  console.log('[migrate] done')
}

main().catch((err) => {
  console.error('[migrate] fatal:', err)
  process.exit(1)
})
