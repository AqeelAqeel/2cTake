import { supabase } from './supabase'
import type { AnnotationSnapshot } from '../types/annotation'

export async function uploadRecording(
  blob: Blob,
  sessionId: string,
  reviewerId: string,
  onProgress?: (pct: number) => void,
  annotations?: AnnotationSnapshot[]
): Promise<{ videoUrl: string; recordingId: string }> {
  const fileName = `${sessionId}/${reviewerId}/${Date.now()}.webm`

  // Upload video to storage
  onProgress?.(10)
  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(fileName, blob, {
      contentType: 'video/webm',
      upsert: false,
    })

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
  onProgress?.(60)

  // Store the storage PATH (not a public URL) — bucket is private
  const { data: recording, error: dbError } = await supabase
    .from('recordings')
    .insert({
      session_id: sessionId,
      reviewer_id: reviewerId,
      video_url: fileName,
      duration: 0,
      status: 'uploaded',
    })
    .select()
    .single()

  if (dbError) throw new Error(`Save failed: ${dbError.message}`)
  onProgress?.(80)

  // Trigger transcription (edge function gets the storage path)
  try {
    await supabase.functions.invoke('transcribe', {
      body: { recording_id: recording.id, video_path: fileName },
    })
  } catch {
    // Transcription is async — failure here is non-blocking
    console.warn('Transcription trigger failed, will retry later')
  }

  // Store annotation snapshots if present
  if (annotations && annotations.length > 0) {
    try {
      const annotationBlob = new Blob(
        [JSON.stringify(annotations)],
        { type: 'application/json' }
      )
      const annotationPath = `${sessionId}/${reviewerId}/${recording.id}_annotations.json`
      await supabase.storage
        .from('recordings')
        .upload(annotationPath, annotationBlob, {
          contentType: 'application/json',
          upsert: false,
        })
    } catch {
      console.warn('Annotation upload failed, non-blocking')
    }
  }

  onProgress?.(100)

  return {
    videoUrl: fileName,
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
