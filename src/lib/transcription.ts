import { supabase } from './supabase'
import type { Transcript } from '../types'

/**
 * Poll for transcript completion.
 * The actual transcription runs server-side via Supabase Edge Function.
 */
export async function pollTranscript(
  recordingId: string,
  maxAttempts = 30,
  intervalMs = 5000
): Promise<Transcript | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('recording_id', recordingId)
      .single()

    if (!error && data) {
      const transcript = data as Transcript
      if (transcript.status === 'complete' || transcript.status === 'failed') {
        return transcript
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return null
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
