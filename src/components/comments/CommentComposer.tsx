import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2, Send, X, Loader2 } from 'lucide-react'
import { startDictation, type DictationHandle } from '../../lib/commentDictation'

interface CommentComposerProps {
  /** position (relative to the canvas container) to anchor the popover near */
  screen: { x: number; y: number }
  /** width of the layer, used to keep the popover on-screen */
  layerWidth: number
  /** height of the layer, used to flip the popover above near the bottom edge */
  layerHeight: number
  /** the live recording stream — dictation taps its audio track */
  recordingStream: MediaStream | null
  onSave: (input: {
    bodyText: string
    audioBlob: Blob | null
    audioDurationMs: number | null
  }) => void
  onCancel: () => void
}

const COMPOSER_WIDTH = 256
// Approximate rendered height, used only to decide whether to flip the popover
// above the anchor when a tap lands near the bottom edge.
const COMPOSER_EST_HEIGHT = 200

export function CommentComposer({
  screen,
  layerWidth,
  layerHeight,
  recordingStream,
  onSave,
  onCancel,
}: CommentComposerProps) {
  const [text, setText] = useState('')
  const [isDictating, setIsDictating] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioDurationMs, setAudioDurationMs] = useState<number | null>(null)
  const [dictationUnavailable, setDictationUnavailable] = useState(false)
  const dictationRef = useRef<DictationHandle | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
    return () => {
      // Abort any in-flight dictation if the composer unmounts
      dictationRef.current?.cancel()
    }
  }, [])

  const startMic = () => {
    const handle = startDictation(recordingStream, (partial) => setText(partial))
    if (!handle.active) {
      setDictationUnavailable(true)
      return
    }
    dictationRef.current = handle
    setIsDictating(true)
  }

  const stopMic = async () => {
    const handle = dictationRef.current
    if (!handle) return
    const { blob, durationMs } = await handle.stop()
    dictationRef.current = null
    setIsDictating(false)
    if (blob.size > 0) {
      setAudioBlob(blob)
      setAudioDurationMs(durationMs)
    }
  }

  const discardAudio = () => {
    setAudioBlob(null)
    setAudioDurationMs(null)
  }

  const handleSave = async () => {
    if (isDictating) await stopMic()
    onSave({
      bodyText: text,
      audioBlob,
      audioDurationMs,
    })
  }

  const canSave = text.trim().length > 0 || !!audioBlob || isDictating

  // Keep the popover on-screen horizontally; open above if near the bottom edge.
  const left = Math.max(8, Math.min(screen.x, layerWidth - COMPOSER_WIDTH - 8))
  const flipUp = screen.y + 16 + COMPOSER_EST_HEIGHT > layerHeight
  const top = flipUp
    ? Math.max(8, screen.y - COMPOSER_EST_HEIGHT - 16)
    : screen.y + 16

  return (
    <div
      className="absolute z-40 rounded-2xl border border-border bg-surface/95 backdrop-blur p-2.5 shadow-2xl"
      style={{ left, top, width: COMPOSER_WIDTH, pointerEvents: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className="text-[11px] font-semibold text-text-secondary">Add comment</span>
        <button
          onClick={onCancel}
          className="rounded-md p-0.5 text-text-muted hover:bg-surface-tertiary hover:text-text-primary"
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isDictating ? 'Listening…' : 'Type or tap the mic to speak'}
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSave) handleSave()
          if (e.key === 'Escape') onCancel()
        }}
      />

      {/* Voice note status */}
      {audioBlob && !isDictating && (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-goblin-pink/10 px-2.5 py-1.5">
          <Mic className="h-3.5 w-3.5 text-goblin-pink" />
          <span className="flex-1 text-[11px] font-medium text-text-secondary">
            Voice note ({Math.max(1, Math.round((audioDurationMs ?? 0) / 1000))}s)
          </span>
          <button
            onClick={discardAudio}
            className="rounded-md p-0.5 text-text-muted hover:text-red-500"
            title="Remove voice note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {dictationUnavailable && (
        <p className="mt-1.5 px-1 text-[10px] text-text-muted">
          Mic unavailable for dictation — type your comment instead.
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        {/* Mic toggle */}
        {!isDictating ? (
          <button
            onClick={startMic}
            disabled={dictationUnavailable}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-tertiary disabled:opacity-40 transition-colors"
            title="Dictate"
          >
            <Mic className="h-3.5 w-3.5" />
            {audioBlob ? 'Redo' : 'Speak'}
          </button>
        ) : (
          <button
            onClick={stopMic}
            className="flex items-center gap-1.5 rounded-xl bg-goblin-pink px-3 py-2 text-[12px] font-semibold text-white hover:brightness-110 transition-all"
            title="Stop dictation"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
              <Square className="h-2 w-2 fill-white" />
            </span>
            Stop
          </button>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="ml-auto flex items-center gap-1.5 rounded-xl bg-goblin-green px-3.5 py-2 text-[12px] font-semibold text-white hover:brightness-110 disabled:opacity-40 transition-all"
        >
          {isDictating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
    </div>
  )
}
