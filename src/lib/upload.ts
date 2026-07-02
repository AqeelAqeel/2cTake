import { supabase } from './supabase'
import type { AnnotationSnapshot } from '../types/annotation'
import type { PendingComment } from '../types/comment'
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
  annotations?: AnnotationSnapshot[],
  comments?: PendingComment[]
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

  // 3. Store the storage PATH (not a URL) via a share_token-scoped RPC.
  //    Anon has no direct INSERT/SELECT on `recordings` (see migration 013) —
  //    create_recording validates token -> session -> reviewer and returns the id.
  if (!shareToken) {
    throw new Error('shareToken is required to create a recording')
  }
  const { data: recordingId, error: dbError } = await supabase.rpc('create_recording', {
    p_token: shareToken,
    p_reviewer_id: reviewerId,
    p_video_url: videoPath,
  })

  if (dbError || !recordingId) {
    throw new Error(`Save failed: ${dbError?.message ?? 'no recording id returned'}`)
  }
  onProgress?.(85)

  // 4. Trigger transcription (edge function resolves video_path against the
  //    same storage backend we just uploaded to — it reads R2_* env vars
  //    when they're set)
  try {
    await supabase.functions.invoke('transcribe', {
      body: { recording_id: recordingId, video_path: videoPath },
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
          recordingId: recordingId,
        })
        await putToR2(annotationPresigned, annotationBlob)
      } else {
        const annotationPath = `${sessionId}/${reviewerId}/${recordingId}_annotations.json`
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

  // 6. Persist reviewer comments (pins / highlights / voice notes). Each voice
  //    note's audio clip uploads to the recordings bucket, then transcription is
  //    triggered. Non-blocking — a failed comment never fails the recording.
  if (comments && comments.length > 0) {
    await persistComments(comments, {
      sessionId,
      reviewerId,
      recordingId: recordingId,
      shareToken,
    })
  }

  onProgress?.(100)

  return {
    videoUrl: videoPath,
    recordingId: recordingId,
  }
}

/**
 * Persists buffered reviewer comments after the recording row exists.
 *
 * For each comment:
 *   1. If it has a voice clip, upload it (R2 presign or Supabase Storage).
 *   2. Insert the row via the `add_comment` RPC — a SECURITY DEFINER function
 *      keyed on the session `share_token`. The reviewer (anon) has NO direct
 *      table access; the RPC validates token -> session -> reviewer -> recording
 *      before inserting and returns the new comment id.
 *   3. If audio was stored, fire the `transcribe` edge function for it.
 *
 * `shareToken` is required: it's the reviewer's authorization for the write.
 */
export async function persistComments(
  comments: PendingComment[],
  ctx: {
    sessionId: string
    reviewerId: string
    recordingId: string
    shareToken: string | undefined
  }
): Promise<void> {
  if (!ctx.shareToken) {
    console.warn('Cannot persist comments without a share token')
    return
  }

  for (const c of comments) {
    let audioPath: string | null = null

    if (c.audioBlob && c.audioBlob.size > 0) {
      try {
        if (isR2Enabled()) {
          const presigned = await presignUpload({
            kind: 'comment',
            contentType: c.audioBlob.type || 'audio/webm',
            shareToken: ctx.shareToken,
            reviewerId: ctx.reviewerId,
            recordingId: ctx.recordingId,
          })
          await putToR2(presigned, c.audioBlob)
          audioPath = presigned.key
        } else {
          const path = `${ctx.sessionId}/${ctx.reviewerId}/comments/${crypto.randomUUID()}.webm`
          const { error } = await supabase.storage
            .from('recordings')
            .upload(path, c.audioBlob, {
              contentType: c.audioBlob.type || 'audio/webm',
              upsert: false,
            })
          if (error) throw error
          audioPath = path
        }
      } catch (err) {
        console.warn('Comment audio upload failed, saving comment without audio:', err)
        audioPath = null
      }
    }

    const { data: commentId, error } = await supabase.rpc('add_comment', {
      p_token: ctx.shareToken,
      p_reviewer_id: ctx.reviewerId,
      p_recording_id: ctx.recordingId,
      p_body_text: c.bodyText || null,
      p_audio_url: audioPath,
      p_anchor: c.anchor,
      p_timestamp_ms: c.timestampMs,
    })

    if (error || !commentId) {
      console.warn('Comment insert failed, skipping:', error?.message)
      continue
    }

    if (audioPath) {
      try {
        await supabase.functions.invoke('transcribe', {
          body: { comment_id: commentId, audio_path: audioPath },
        })
      } catch {
        console.warn('Comment transcription trigger failed, will retry later')
      }
    }
  }
}

export async function registerReviewer(
  shareToken: string,
  name: string
): Promise<string> {
  let browserUuid = localStorage.getItem('2ctake_browser_uuid')
  if (!browserUuid) {
    browserUuid = crypto.randomUUID()
    localStorage.setItem('2ctake_browser_uuid', browserUuid)
  }

  // Anon has no direct INSERT/SELECT on `reviewers` (migration 013). The
  // register_reviewer RPC validates the share_token -> session and returns the
  // new reviewer id.
  const { data: reviewerId, error } = await supabase.rpc('register_reviewer', {
    p_token: shareToken,
    p_name: name,
    p_browser_uuid: browserUuid,
  })

  if (error || !reviewerId) {
    throw new Error(`Registration failed: ${error?.message ?? 'no reviewer id returned'}`)
  }
  return reviewerId as string
}
