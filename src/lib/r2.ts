// Cloudflare R2 client helper.
//
// Wraps the two Vercel functions under /api and provides:
//   - presignUpload()      — POST /api/r2-presign-upload
//   - putToR2()            — browser XHR PUT with real byte progress
//   - presignDownload()    — POST /api/r2-presign-download (batch)
//   - publicArtifactUrl()  — synchronous URL join for the public bucket
//   - isR2Enabled()        — feature-flag gate for migration
//
// Why XHR instead of fetch: the Fetch API does not expose upload progress
// events in browsers. MediaRecorder blobs can be 10–50 MB, and we want the
// progress bar in `<UploadProgress>` to move smoothly as bytes leave the
// machine, not jump in synthetic 10/60/80/100 milestones.

import { supabase } from './supabase'

export type UploadKind = 'recording' | 'annotation' | 'artifact' | 'comment'

export interface PresignedUpload {
  url: string
  key: string
  headers: Record<string, string>
}

export interface PresignUploadArgs {
  kind: UploadKind
  contentType: string
  // recording + annotation + comment
  shareToken?: string
  reviewerId?: string
  // annotation + comment (must reference an existing recording)
  recordingId?: string
  // artifact only
  ext?: string
}

/**
 * Returns true when the R2 migration flag is set for this build.
 * Callers branch on this to fall back to Supabase Storage while we cut over.
 */
export function isR2Enabled(): boolean {
  return import.meta.env.VITE_USE_R2 === 'true'
}

/**
 * Returns a synchronous public URL for an artifact key.
 *
 * The artifacts bucket is public-read via an R2.dev subdomain (or a custom
 * domain bound to the bucket). Legacy rows that already contain an absolute
 * URL are passed through untouched so the dual-read fallback works during
 * migration.
 */
export function publicArtifactUrl(keyOrUrl: string): string {
  if (!keyOrUrl) return keyOrUrl
  if (keyOrUrl.startsWith('http')) return keyOrUrl
  const base = import.meta.env.VITE_R2_ARTIFACTS_PUBLIC_BASE as string | undefined
  if (!base) {
    console.warn('[r2] VITE_R2_ARTIFACTS_PUBLIC_BASE is not set')
    return keyOrUrl
  }
  return `${base.replace(/\/$/, '')}/${keyOrUrl}`
}

async function authHeadersForArtifact(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function presignUpload(
  args: PresignUploadArgs
): Promise<PresignedUpload> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (args.kind === 'artifact') {
    Object.assign(headers, await authHeadersForArtifact())
  }

  const res = await fetch('/api/r2-presign-upload', {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Presign upload failed (${res.status}): ${errBody}`)
  }

  return (await res.json()) as PresignedUpload
}

export function putToR2(
  presigned: PresignedUpload,
  blob: Blob,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presigned.url)
    for (const [k, v] of Object.entries(presigned.headers)) {
      xhr.setRequestHeader(k, v)
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.round((e.loaded / e.total) * 100)
        onProgress(pct)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`R2 PUT failed: ${xhr.status} ${xhr.statusText}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error uploading to R2'))
    xhr.onabort = () => reject(new Error('Upload aborted'))
    xhr.send(blob)
  })
}

export async function presignDownload(
  keys: string[]
): Promise<Record<string, string>> {
  if (keys.length === 0) return {}

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    throw new Error('Cannot presign R2 downloads without an authenticated session')
  }

  const res = await fetch('/api/r2-presign-download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ keys }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Presign download failed (${res.status}): ${errBody}`)
  }

  const payload = (await res.json()) as { urls: Record<string, string> }
  return payload.urls ?? {}
}
