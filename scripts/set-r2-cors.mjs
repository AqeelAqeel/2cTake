// Applies a CORS policy to the R2 buckets so the browser can PUT directly to a
// presigned URL (r2.cloudflarestorage.com). Without this, the upload preflight
// is rejected ("No 'Access-Control-Allow-Origin' header") and every reviewer
// recording / artifact upload fails with "Network error uploading to R2".
//
// Reads R2 credentials from .env.local and calls the S3 PutBucketCors API via
// aws4fetch (the same client the /api functions use).
//
//   node scripts/set-r2-cors.mjs           # apply to both buckets
//   node scripts/set-r2-cors.mjs --dry-run # print the policy, don't write
//   node scripts/set-r2-cors.mjs --get     # print the current policy per bucket
//
// Safe to re-run: PutBucketCors replaces the policy wholesale.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { AwsClient } from 'aws4fetch'

const __dirname = dirname(fileURLToPath(import.meta.url))

// --- Load .env.local (only the keys we need; no dependency on dotenv) --------
function loadEnv() {
  const env = { ...process.env }
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let val = m[2].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (env[m[1]] === undefined) env[m[1]] = val
    }
  } catch {
    // fall back to process.env only
  }
  return env
}

const env = loadEnv()

const ACCOUNT_ID = env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY
const ARTIFACTS_BUCKET = env.R2_ARTIFACTS_BUCKET
const RECORDINGS_BUCKET = env.R2_RECORDINGS_BUCKET

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('Missing R2 credentials (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) in .env.local')
  process.exit(1)
}

const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`

// Origins allowed to upload directly to R2. Wildcards cover Vercel preview
// deploys and local dev; the two apex/www entries cover production.
const ALLOWED_ORIGINS = [
  'https://www.2ctake.com',
  'https://2ctake.com',
  'https://*.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

// CORS XML for the S3 PutBucketCors API. PUT is what presigned uploads use;
// GET/HEAD are harmless and useful if a client ever reads directly. We expose
// ETag so the browser can read the upload result.
function corsXml() {
  const rules = ALLOWED_ORIGINS.map(
    (o) => `  <CORSRule>
    <AllowedOrigin>${o}</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>`
  ).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
${rules}
</CORSConfiguration>`
}

const client = new AwsClient({
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
})

async function putCors(bucket) {
  const body = corsXml()
  const contentMd5 = createHash('md5').update(body).digest('base64')
  const res = await client.fetch(`${ENDPOINT}/${bucket}?cors`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/xml',
      'Content-MD5': contentMd5,
    },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`PutBucketCors failed for "${bucket}": ${res.status} ${text}`)
  }
  console.log(`✓ CORS applied to "${bucket}" (${res.status})`)
}

async function getCors(bucket) {
  const res = await client.fetch(`${ENDPOINT}/${bucket}?cors`, { method: 'GET' })
  const text = await res.text()
  console.log(`\n=== ${bucket} (${res.status}) ===\n${text || '(empty)'}`)
}

async function main() {
  const buckets = [ARTIFACTS_BUCKET, RECORDINGS_BUCKET].filter(Boolean)
  if (buckets.length === 0) {
    console.error('No bucket names found (R2_ARTIFACTS_BUCKET / R2_RECORDINGS_BUCKET)')
    process.exit(1)
  }

  if (process.argv.includes('--dry-run')) {
    console.log('Would apply this CORS policy to:', buckets.join(', '))
    console.log(corsXml())
    return
  }

  if (process.argv.includes('--get')) {
    for (const b of buckets) await getCors(b)
    return
  }

  for (const b of buckets) await putCors(b)
  console.log('\nDone. Verify with: node scripts/set-r2-cors.mjs --get')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
