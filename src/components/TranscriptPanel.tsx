import { useEffect, useRef } from 'react'
import { FileText, Loader2, X } from 'lucide-react'
import { formatTimestamp } from '../lib/transcription'
import type { Transcript } from '../types'

interface TranscriptPanelProps {
  transcript: Transcript | null | undefined
  onTimestampClick?: (seconds: number) => void
  currentTime?: number
}

export function TranscriptPanel({
  transcript,
  onTimestampClick,
  currentTime = 0,
}: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentTime])

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
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-medium text-text-primary">
            Generating transcript&hellip;
          </p>
          <p className="text-xs text-text-muted mt-1">
            This usually takes a minute or two
          </p>
        </div>
      </div>
    )
  }

  if (transcript.status === 'failed') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
          <X className="w-4 h-4 text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-medium text-text-primary">
            Transcription failed
          </p>
          <p className="text-xs text-text-muted mt-1">
            The audio couldn&rsquo;t be processed
          </p>
        </div>
      </div>
    )
  }

  const segments = transcript.timestamps_json

  if (!segments || segments.length === 0) {
    if (transcript.text) {
      return (
        <div className="p-3">
          <p className="text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
            {transcript.text}
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-text-muted">
        <p className="text-[13px]">No transcript available</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-0.5">
      {segments.map((seg, i) => {
        const isActive = currentTime >= seg.start && currentTime < seg.end
        return (
          <button
            key={i}
            ref={isActive ? activeRef : null}
            onClick={() => onTimestampClick?.(seg.start)}
            className={`flex gap-2.5 px-3.5 py-2.5 rounded-[10px] w-full text-left transition-all ${
              isActive ? 'bg-brand-50' : 'hover:bg-surface-tertiary'
            }`}
          >
            <span
              className={`shrink-0 text-[11px] font-semibold font-mono pt-0.5 min-w-[36px] transition-colors ${
                isActive ? 'text-brand-600' : 'text-text-muted'
              }`}
            >
              {formatTimestamp(seg.start)}
            </span>
            <span
              className={`text-[13px] leading-relaxed transition-all ${
                isActive
                  ? 'text-text-primary font-medium'
                  : 'text-text-secondary'
              }`}
            >
              {seg.text}
            </span>
          </button>
        )
      })}
    </div>
  )
}
