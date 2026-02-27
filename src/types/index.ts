export interface Session {
  id: string
  owner_id: string
  title: string
  context: string | null
  artifact_url: string
  artifact_type: 'pdf' | 'image' | 'document'
  share_token: string
  max_duration: number | null
  source_url: string | null
  source_type: string | null
  owner_display_name: string | null
  created_at: string
  recording_count?: number
}

export interface Reviewer {
  id: string
  session_id: string
  name: string
  browser_uuid: string
  created_at: string
}

export interface Recording {
  id: string
  session_id: string
  reviewer_id: string
  video_url: string
  audio_url: string | null
  duration: number
  status: 'uploading' | 'uploaded' | 'transcribing' | 'complete' | 'failed'
  created_at: string
  reviewer?: Reviewer
}

export interface Transcript {
  id: string
  recording_id: string
  text: string
  timestamps_json: TranscriptSegment[]
  status: 'pending' | 'processing' | 'complete' | 'failed'
  created_at: string
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export type RecorderState =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'preview'
  | 'uploading'
  | 'success'
  | 'error'

export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
}
