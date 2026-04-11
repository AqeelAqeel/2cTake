import { supabase } from './supabase'
import type { AnnotationSnapshot } from '../types/annotation'
import { isR2Enabled, presignUpload, putToR2 } from './r2'

/**
 * Uploads a reviewer's recording blob + optional annotation snapshots.
 *
 * Runs in one of two modes, switched by the `VITE_USE_R2` env flag:
 *
 *   R2 path (new):
 *     1. POST /api/r2-presign-upload → get a presigned PUT URL
 *     2. XHR PUT the blob to R2 (real byte-level progress)
 *     3. Insert the recording row (path only, no URL)
 *     4. Invoke the transcribe edge function
 *     5. If annotations exist: presign + PUT annotation JSON
 *
 *   Supabase path (legacy):
 *     Same sequence using supabase.storage.from('recordings').upload(...).
 *
 * `shareToken` is required for the R2 path because the presign endpoint
 * uses it to validate the reviewer is allowed to upload for this session.
 */
export async function uploadRecording(
  blob: Blob,
  sessionId: string,
  reviewerId: string,
  shareToken: string | undefined,
  onProgress?: (pct: number) => void,
  annotations?: AnnotationSnapshot[]
): Promise<{ videoUrl: string; recordingId: string }> {
  let videoPath: string

  if (isR2Enabled()) {
    if (!shareToken) {
      throw new Error('shareToken is required when VITE_USE_R2 is enabled')
    }

    // 1. Presign
    const presigned = await presignUpload({
      kind: 'recording',
      contentType: 'video/webm',
      shareToken,
      reviewerId,
    })

    // 2. PUT with real byte-level progress. Scale to 0-80% so we leave
    //    headroom for the DB insert + transcribe invoke milestones below.
    await putToR2(presigned, blob, (bytePct) => {
      onProgress?.(Math.round(bytePct * 0.8))
    })

    videoPath = presigned.key
  } else {
    const fileName = `${sessionId}/${reviewerId}/${Date.now()}.webm`

    onProgress?.(10)
    const { error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(fileName, blob, {
        contentType: 'video/webm',
        upsert: false,
      })

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
    onProgress?.(60)
    videoPath = fileName
  }

  // 3. Store the storage PATH (not a URL) — matches current schema in both paths
  const { data: recording, error: dbError } = await supabase
    .from('recordings')
    .insert({
      session_id: sessionId,
      reviewer_id: reviewerId,
      video_url: videoPath,
      duration: 0,
      status: 'uploaded',
    })
    .select()
    .single()

  if (dbError) throw new Error(`Save failed: ${dbError.message}`)
  onProgress?.(85)

  // 4. Trigger transcription (edge function resolves video_path against the
  //    same storage backend we just uploaded to — it reads R2_* env vars
  //    when they're set)
  try {
    await supabase.functions.invoke('transcribe', {
      body: { recording_id: recording.id, video_path: videoPath },
    })
  } catch {
    // Transcription is async — failure here is non-blocking
    console.warn('Transcription trigger failed, will retry later')
  }

  // 5. Store annotation snapshots if present
  if (annotations && annotations.length > 0) {
    try {
      const annotationBlob = new Blob([JSON.stringify(annotations)], {
        type: 'application/json',
      })

      if (isR2Enabled()) {
        const annotationPresigned = await presignUpload({
          kind: 'annotation',
          contentType: 'application/json',
          shareToken,
          reviewerId,
          recordingId: recording.id,
        })
        await putToR2(annotationPresigned, annotationBlob)
      } else {
        const annotationPath = `${sessionId}/${reviewerId}/${recording.id}_annotations.json`
        await supabase.storage
          .from('recordings')
          .upload(annotationPath, annotationBlob, {
            contentType: 'application/json',
            upsert: false,
          })
      }
    } catch {
      console.warn('Annotation upload failed, non-blocking')
    }
  }

  onProgress?.(100)

  return {
    videoUrl: videoPath,
    recordingId: recording.id,
  }
}

export async function registerReviewer(
  sessionId: string,
  name: string
): Promise<string> {
  let browserUuid = localStorage.getItem('2ctake_browser_uuid')
  if (!browserUuid) {
    browserUuid = crypto.randomUUID()
    localStorage.setItem('2ctake_browser_uuid', browserUuid)
  }

  const { data, error } = await supabase
    .from('reviewers')
    .insert({
      session_id: sessionId,
      name,
      browser_uuid: browserUuid,
    })
    .select()
    .single()

  if (error) throw new Error(`Registration failed: ${error.message}`)
  return data.id
}
