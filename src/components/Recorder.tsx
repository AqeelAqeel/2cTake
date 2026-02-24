import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Circle,
  Pause,
  Play,
  Square,
  RotateCcw,
  Send,
  Eye,
  Clock,
} from 'lucide-react'
import { RecordingEngine } from '../lib/recorder'
import { useRecorderStore } from '../state/recorderStore'
import { formatTimestamp } from '../lib/transcription'

interface RecorderProps {
  onSend: (blob: Blob, duration: number) => void
  maxDuration?: number | null
}

export function Recorder({ onSend, maxDuration }: RecorderProps) {
  const {
    state,
    mediaStream,
    recordedBlob,
    duration,
    setState,
    setRecordedBlob,
    setDuration,
    reset,
  } = useRecorderStore()

  const engineRef = useRef<RecordingEngine | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const [finalDuration, setFinalDuration] = useState(0)

  // Set up live preview
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream
    }
  }, [mediaStream])

  // Set up preview playback
  useEffect(() => {
    if (previewRef.current && recordedBlob && state === 'preview') {
      previewRef.current.src = URL.createObjectURL(recordedBlob)
    }
  }, [recordedBlob, state])

  const startRecording = useCallback(() => {
    if (!mediaStream) return

    const engine = new RecordingEngine()
    engineRef.current = engine

    if (maxDuration) {
      engine.maxDuration = maxDuration
    }

    engine.onDurationUpdate = (secs) => setDuration(secs)
    engine.onStop = (blob, dur) => {
      setRecordedBlob(blob)
      setFinalDuration(dur)
      setState('stopped')
    }
    engine.onError = () => {
      setState('error')
    }

    engine.start(mediaStream)
    setState('recording')
  }, [mediaStream, maxDuration, setState, setRecordedBlob, setDuration])

  const pauseRecording = () => {
    engineRef.current?.pause()
    setState('paused')
  }

  const resumeRecording = () => {
    engineRef.current?.resume()
    setState('recording')
  }

  const stopRecording = () => {
    engineRef.current?.stop()
  }

  const previewRecording = () => {
    setState('preview')
  }

  const reRecord = () => {
    reset()
    setDuration(0)
  }

  const sendRecording = () => {
    if (recordedBlob) {
      onSend(recordedBlob, finalDuration)
    }
  }

  const isRecordingActive = state === 'recording' || state === 'paused'

  return (
    <div className="flex flex-col gap-4">
      {/* Video feed */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {state === 'preview' && recordedBlob ? (
          <video
            ref={previewRef}
            controls
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover -scale-x-100"
          />
        )}

        {/* Recording indicator */}
        {state === 'recording' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-medium text-white">REC</span>
          </div>
        )}

        {state === 'paused' && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1">
            <Pause className="h-3 w-3 text-white" />
            <span className="text-xs font-medium text-white">PAUSED</span>
          </div>
        )}

        {/* Timer */}
        {(isRecordingActive || state === 'stopped') && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5">
            {isRecordingActive && (
              <Clock className="h-3.5 w-3.5 text-white/70" />
            )}
            <span className="font-mono text-sm text-white">
              {formatTimestamp(state === 'stopped' ? finalDuration : duration)}
            </span>
            {maxDuration && isRecordingActive && (
              <span className="font-mono text-sm text-white/50">
                / {formatTimestamp(maxDuration)}
              </span>
            )}
          </div>
        )}

        {/* Time remaining bar */}
        {maxDuration && isRecordingActive && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-full transition-all duration-500 ease-linear"
              style={{
                width: `${Math.min((duration / maxDuration) * 100, 100)}%`,
                backgroundColor:
                  duration / maxDuration > 0.9
                    ? '#ef4444'
                    : duration / maxDuration > 0.75
                      ? '#f59e0b'
                      : '#6366f1',
              }}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
          >
            <Circle className="h-4 w-4 fill-current" />
            Start Recording
          </button>
        )}

        {state === 'recording' && (
          <>
            <button
              onClick={pauseRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-surface border border-border px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-text-primary px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-colors"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          </>
        )}

        {state === 'paused' && (
          <>
            <button
              onClick={resumeRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-text-primary px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-colors"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          </>
        )}

        {state === 'stopped' && (
          <>
            <button
              onClick={previewRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-surface border border-border px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
            <button
              onClick={reRecord}
              className="inline-flex items-center gap-2 rounded-xl bg-surface border border-border px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Re-record
            </button>
            <button
              onClick={sendRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </>
        )}

        {state === 'preview' && (
          <>
            <button
              onClick={reRecord}
              className="inline-flex items-center gap-2 rounded-xl bg-surface border border-border px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Record again
            </button>
            <button
              onClick={sendRecording}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </>
        )}
      </div>
    </div>
  )
}
