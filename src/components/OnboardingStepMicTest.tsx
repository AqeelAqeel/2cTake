import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Mic, AlertTriangle, RefreshCw, Loader2, CheckCircle, Volume2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

const TEST_PHRASE = "my epoch's epistemics are epic benedicts"

type MicTestStatus =
  | 'idle'
  | 'requesting'
  | 'denied'
  | 'ready'
  | 'listening'
  | 'analyzing'
  | 'passed'
  | 'failed'

interface OnboardingStepMicTestProps {
  onPass: (stream: MediaStream) => void
}

function matchesPhrase(transcription: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()

  const expected = normalize(TEST_PHRASE)
  const actual = normalize(transcription)

  const expectedWords = expected.split(' ')
  const actualWords = actual.split(' ')
  const matched = expectedWords.filter((w) => actualWords.includes(w))

  return matched.length >= expectedWords.length * 0.6
}

export function OnboardingStepMicTest({ onPass }: OnboardingStepMicTestProps) {
  const [status, setStatus] = useState<MicTestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<string | null>(null)
  const [listenProgress, setListenProgress] = useState(0)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const requestPermissions = async () => {
    setStatus('requesting')
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      })
      streamRef.current = stream
      setStatus('ready')
    } catch (err) {
      setStatus('denied')
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError(
          'Permission denied. Please allow camera and microphone access in your browser settings, then try again.'
        )
      } else {
        setError('Could not access camera or microphone. Please check your device.')
      }
    }
  }

  const startListening = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return

    setStatus('listening')
    setTranscription(null)
    setListenProgress(0)
    chunksRef.current = []

    const audioStream = new MediaStream(stream.getAudioTracks())

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(audioStream, { mimeType })
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      const blob = new Blob(chunksRef.current, { type: mimeType })
      setStatus('analyzing')

      try {
        const { data, error: fnError } = await supabase.functions.invoke('mic-test', {
          body: blob,
        })

        if (fnError) throw fnError

        const text = data?.text || ''
        setTranscription(text)

        if (matchesPhrase(text)) {
          setStatus('passed')
          setTimeout(() => onPass(stream), 1200)
        } else {
          setStatus('failed')
        }
      } catch {
        setStatus('failed')
        setTranscription(null)
        setError('Could not analyze audio. Please try again.')
      }
    }

    recorder.start(500)

    // 6 second recording with progress
    const duration = 6000
    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      setListenProgress(Math.min(elapsed / duration, 1))
      if (elapsed >= duration) {
        recorder.stop()
      }
    }, 100)
  }, [onPass])

  const retry = () => {
    setStatus('ready')
    setError(null)
    setTranscription(null)
    setListenProgress(0)
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <img
        src="/reviewer/step-3.svg"
        alt=""
        className="w-full max-h-36 object-contain"
        draggable={false}
      />

      <div className="text-center">
        <h2 className="text-xl font-bold text-text-primary">Mic & camera check</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Grant permissions, then say the test phrase out loud.
        </p>
      </div>

      {/* Permissions request */}
      {(status === 'idle' || status === 'requesting' || status === 'denied') && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
              <Camera className="h-6 w-6 text-brand-600" />
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
              <Mic className="h-6 w-6 text-brand-600" />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 w-full">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={requestPermissions}
            disabled={status === 'requesting'}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {status === 'denied' && <RefreshCw className="h-4 w-4" />}
            {status === 'requesting'
              ? 'Requesting...'
              : status === 'denied'
                ? 'Try again'
                : 'Allow access'}
          </button>
        </div>
      )}

      {/* Ready to test */}
      {status === 'ready' && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 w-full">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700 font-medium">Permissions granted</p>
          </div>

          <div className="rounded-xl bg-surface-tertiary px-4 py-3 w-full">
            <p className="text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wider">Say this out loud:</p>
            <p className="text-sm font-semibold text-text-primary italic">
              "{TEST_PHRASE}"
            </p>
          </div>

          <button
            onClick={startListening}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors w-full justify-center"
          >
            <Volume2 className="h-4 w-4" />
            Start test
          </button>
        </div>
      )}

      {/* Listening */}
      {status === 'listening' && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="rounded-xl bg-surface-tertiary px-4 py-3 w-full">
            <p className="text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wider">Say this now:</p>
            <p className="text-sm font-semibold text-text-primary italic">
              "{TEST_PHRASE}"
            </p>
          </div>

          <div className="flex items-center gap-3 w-full">
            <div className="h-1.5 w-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-sm font-medium text-text-primary">Listening...</p>
          </div>

          <div className="w-full h-2 rounded-full bg-surface-tertiary overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-100"
              style={{ width: `${listenProgress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Analyzing */}
      {status === 'analyzing' && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-text-secondary">Analyzing your audio...</p>
        </div>
      )}

      {/* Passed */}
      {status === 'passed' && (
        <div className="flex flex-col items-center gap-3 w-full">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-lg font-bold text-emerald-600">Test passed!</p>
          {transcription && (
            <p className="text-xs text-text-muted text-center">
              Heard: "{transcription}"
            </p>
          )}
        </div>
      )}

      {/* Failed */}
      {status === 'failed' && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="text-center">
            <p className="text-sm font-semibold text-red-600">
              Couldn't quite catch that
            </p>
            {transcription && (
              <p className="mt-1 text-xs text-text-muted">
                Heard: "{transcription}"
              </p>
            )}
            {error && (
              <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
          </div>

          <button
            onClick={retry}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
