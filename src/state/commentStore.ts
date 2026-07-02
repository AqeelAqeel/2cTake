import { create } from 'zustand'
import type { CommentAnchor, PendingComment } from '../types/comment'
import { useAnnotationStore } from './annotationStore'

/**
 * Buffers reviewer comments during a recording, the same way `annotationStore`
 * buffers stroke snapshots. Nothing hits the network here — comments (and their
 * voice clips) are persisted at SEND time once the recording row exists.
 *
 * A `draft` is an anchor that's been placed but not yet committed: the composer
 * is open over it. Committing the draft (`addComment`) moves it into `comments`.
 */

export interface CommentDraft {
  anchor: CommentAnchor
  timestampMs: number | null
  /** screen position (relative to the canvas container) for the composer popover */
  screen: { x: number; y: number }
}

interface CommentState {
  comments: PendingComment[]
  /** when true, taps on the artifact place comments instead of drawing */
  commentMode: boolean
  draft: CommentDraft | null

  setCommentMode: (on: boolean) => void
  openDraft: (anchor: CommentAnchor, screen: { x: number; y: number }) => void
  cancelDraft: () => void
  addComment: (input: {
    bodyText: string
    audioBlob?: Blob | null
    audioDurationMs?: number | null
  }) => void
  removeComment: (id: string) => void
  reset: () => void
}

function nowTimestampMs(): number | null {
  const startTime = useAnnotationStore.getState().recordingStartTime
  if (!startTime) return null
  return Math.max(0, Date.now() - startTime)
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: [],
  commentMode: false,
  draft: null,

  setCommentMode: (on) => set({ commentMode: on, draft: on ? get().draft : null }),

  openDraft: (anchor, screen) =>
    set({ draft: { anchor, timestampMs: nowTimestampMs(), screen } }),

  cancelDraft: () => set({ draft: null }),

  addComment: ({ bodyText, audioBlob, audioDurationMs }) => {
    const draft = get().draft
    if (!draft) return
    const trimmed = bodyText.trim()
    // Require either text or a voice clip — otherwise discard the empty draft.
    if (!trimmed && !audioBlob) {
      set({ draft: null })
      return
    }
    const comment: PendingComment = {
      id: crypto.randomUUID(),
      anchor: draft.anchor,
      timestampMs: draft.timestampMs,
      bodyText: trimmed,
      audioBlob: audioBlob ?? null,
      audioDurationMs: audioDurationMs ?? null,
    }
    set((state) => ({ comments: [...state.comments, comment], draft: null }))
  },

  removeComment: (id) =>
    set((state) => ({ comments: state.comments.filter((c) => c.id !== id) })),

  reset: () => set({ comments: [], commentMode: false, draft: null }),
}))
