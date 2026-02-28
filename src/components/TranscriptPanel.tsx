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
      <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-timestamp)]">
        <FileText className="h-8 w-8" />
        <p className="text-sm" style={{ fontFamily: 'var(--font-serif)' }}>
          No transcript available yet
        </p>
      </div>
    )
  }

  if (transcript.status === 'pending' || transcript.status === 'processing') {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
        <div className="text-center">
          <p
            className="text-[15px] font-medium text-text-primary"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Generating transcript&hellip;
          </p>
          <p className="text-xs text-[var(--color-timestamp)] mt-1.5">
            This usually takes a minute or two
          </p>
        </div>
      </div>
    )
  }

  if (transcript.status === 'failed') {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
          <X className="w-4 h-4 text-red-500" />
        </div>
        <div className="text-center">
          <p
            className="text-[15px] font-medium text-text-primary"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Transcription failed
          </p>
          <p className="text-xs text-[var(--color-timestamp)] mt-1.5">
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
        <div className="p-6">
          <p
            className="text-[15px] leading-[1.75] text-text-primary whitespace-pre-wrap"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {transcript.text}
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-timestamp)]">
        <p className="text-sm" style={{ fontFamily: 'var(--font-serif)' }}>
          No transcript available
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col">
      {segments.map((seg, i) => {
        const isActive = currentTime >= seg.start && currentTime < seg.end
        return (
          <button
            key={i}
            ref={isActive ? activeRef : null}
            onClick={() => onTimestampClick?.(seg.start)}
            className="flex gap-5 w-full text-left transition-all group"
            style={{
              padding: '16px 24px',
              borderLeft: isActive
                ? '3px solid var(--color-brand-500)'
                : '3px solid transparent',
              backgroundColor: isActive
                ? 'var(--color-warm-highlight)'
                : 'transparent',
            }}
          >
            <span
              className="shrink-0 text-[12px] font-medium font-mono pt-[3px] min-w-[42px] transition-colors tabular-nums"
              style={{
                color: isActive
                  ? 'var(--color-brand-600)'
                  : 'var(--color-timestamp)',
              }}
            >
              {formatTimestamp(seg.start)}
            </span>
            <span
              className="transition-all"
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '15px',
                lineHeight: '1.7',
                color: isActive
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {seg.text}
            </span>
          </button>
        )
      })}
    </div>
  )
}
