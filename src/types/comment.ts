// Reviewer comments — Google-Docs-style pins, highlights, and voice notes
// dropped on the artifact while recording. See migration 012_comments.sql.

export type CommentAnchorKind = 'pin' | 'highlight'

/**
 * Where a comment lives on the artifact. All values are normalized 0..1 against
 * the artifact's natural dimensions, so they survive zoom / pan / resize and map
 * cleanly between the reviewer (capture) and sender (playback) coordinate spaces.
 *
 * - pin:        a point. (x, y) is the marker tip.
 * - highlight:  a rectangle. (x, y) is the top-left; (w, h) the size.
 */
export interface CommentAnchor {
  kind: CommentAnchorKind
  x: number
  y: number
  w?: number
  h?: number
}

/**
 * A comment buffered client-side during recording, before it's persisted.
 * `audioBlob` is the dictated voice clip captured off the existing recording
 * mic track (never a second getUserMedia call).
 */
export interface PendingComment {
  id: string // client-generated uuid; React key + ordering
  anchor: CommentAnchor
  timestampMs: number | null
  bodyText: string
  audioBlob?: Blob | null
  audioDurationMs?: number | null
}

export type CommentTranscriptStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'complete'
  | 'failed'

/**
 * A persisted comment row. `audio_url` is a storage PATH in the DB; the sender
 * store resolves it to a playable URL (signed URL or R2 presign) on read.
 */
export interface ReviewerComment {
  id: string
  session_id: string
  reviewer_id: string
  recording_id: string | null
  body_text: string | null
  audio_url: string | null
  transcript_text: string | null
  transcript_status: CommentTranscriptStatus
  anchor: CommentAnchor
  timestamp_ms: number | null
  created_at: string
  reviewer?: { name: string } | null
}
