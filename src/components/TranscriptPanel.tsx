import { FileText, Loader2 } from 'lucide-react'
import { formatTimestamp } from '../lib/transcription'
import type { Transcript } from '../types'

interface TranscriptPanelProps {
  transcript: Transcript | null | undefined
  onTimestampClick?: (seconds: number) => void
}

export function TranscriptPanel({ transcript, onTimestampClick }: TranscriptPanelProps) {
  if (!transcript) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-text-muted">
        <FileText className="h-8 w-8" />
        <p className="text-sm">No transcript available yet</p>
      </div>
    )
  }

  if (transcript.status === 'pending' || transcript.status === 'processing') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Generating transcript...</p>
      </div>
    )
  }

  if (transcript.status === 'failed') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-red-400">
        <FileText className="h-8 w-8" />
        <p className="text-sm">Transcription failed</p>
      </div>
    )
  }

  const segments = transcript.timestamps_json

  if (!segments || segments.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
          {transcript.text}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {segments.map((seg, i) => (
        <button
          key={i}
          onClick={() => onTimestampClick?.(seg.start)}
          className="flex w-full gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-tertiary transition-colors"
        >
          <span className="shrink-0 text-xs font-mono text-brand-500 pt-0.5">
            {formatTimestamp(seg.start)}
          </span>
          <span className="text-sm text-text-secondary leading-relaxed">
            {seg.text}
          </span>
        </button>
      ))}
    </div>
  )
}
