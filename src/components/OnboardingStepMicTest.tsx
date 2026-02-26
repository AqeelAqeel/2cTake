import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Camera,
  Mic,
  AlertTriangle,
  RefreshCw,
  Loader2,
  CheckCircle,
  Volume2,
  Play,
  Pause,
  Square,
  RotateCcw,
} from 'lucide-react'

const TEST_PHRASE = "my epoch's epistemics are epic benedicts"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

type MicTestStatus =
  | 'idle'
  | 'requesting'
  | 'denied'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'analyzing'
  | 'passed'
  | 'failed'

interface OnboardingStepMicTestProps {
  onPass: (stream: MediaStream) => void
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
}

function getWordMatches(transcription: string): { word: string; matched: boolean }[] {
  const expectedWords = normalize(TEST_PHRASE).split(' ')
  const actualWords = normalize(transcription).split(' ')

  return expectedWords.map((word) => ({
    word,
    matched: actualWords.includes(word),
  }))
}

function matchesPhrase(transcription: string): boolean {
  const matches = getWordMatches(transcription)
  const matchedCount = matches.filter((m) => m.matched).length
  return matchedCount >= matches.length * 0.6
}

export function OnboardingStepMicTest({ onPass }: OnboardingStepMicTestProps) {
  const [status, setStatus] = useState<MicTestStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const pausedAtRef = useRef(0)
  const mimeTypeRef = useRef('audio/webm')

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 250)
  }

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

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return

    setTranscription(null)
    setError(null)
    setElapsed(0)
    chunksRef.current = []

    const audioStream = new MediaStream(stream.getAudioTracks())

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
    mimeTypeRef.current = mimeType

    const recorder = new MediaRecorder(audioStream, { mimeType })
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.start(500)
    startTimeRef.current = Date.now()
    setStatus('recording')
    startTimer()
  }, [])

  const pauseRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.pause()
    pausedAtRef.current = Date.now()
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setStatus('paused')
  }

  const resumeRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    // Adjust start time to account for pause duration
    const pauseDuration = Date.now() - pausedAtRef.current
    startTimeRef.current += pauseDuration
    recorder.resume()
    setStatus('recording')
    startTimer()
  }

  const stopAndAnalyze = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Collect the final blob via a promise
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }))
      }
      recorder.stop()
    })

    setStatus('analyzing')

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/mic-test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
        body: blob,
      })

      if (!response.ok) {
        throw new Error(`Server error ${response.status}`)
      }

      const data = await response.json()
      const text = data?.text || ''
      setTranscription(text)

      const stream = streamRef.current!
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
  }, [onPass])

  const resetRecording = () => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    chunksRef.current = []
    setElapsed(0)
    setTranscription(null)
    setError(null)
    setStatus('ready')
  }

  const retry = () => {
    resetRecording()
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isRecording = status === 'recording' || status === 'paused'

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

      {/* Ready / Recording / Paused */}
      {(status === 'ready' || isRecording) && (
        <div className="flex flex-col items-center gap-4 w-full">
          {status === 'ready' && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 w-full">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-700 font-medium">Permissions granted</p>
            </div>
          )}

          {/* Test phrase card */}
          <div className="rounded-xl bg-surface-tertiary px-4 py-3 w-full">
            <p className="text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wider">
              {isRecording ? 'Say this now:' : 'Say this out loud:'}
            </p>
            <p className="text-sm font-semibold text-text-primary italic">
              "{TEST_PHRASE}"
            </p>
          </div>

          {/* Recording indicator + timer */}
          {isRecording && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {status === 'recording' ? (
                  <>
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm font-medium text-red-600">Recording</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-sm font-medium text-amber-600">Paused</span>
                  </>
                )}
              </div>
              <span className="font-mono text-sm text-text-secondary tabular-nums">
                {formatTime(elapsed)}
              </span>
            </div>
          )}

          {/* Transport controls */}
          <div className="flex items-center gap-2 w-full justify-center">
            {status === 'ready' && (
              <button
                onClick={startRecording}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors flex-1 justify-center"
              >
                <Volume2 className="h-4 w-4" />
                Start test
              </button>
            )}

            {status === 'recording' && (
              <>
                <button
                  onClick={pauseRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface border border-border px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors flex-1"
                >
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
                <button
                  onClick={stopAndAnalyze}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-text-primary px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-colors flex-1"
                >
                  <Square className="h-4 w-4" />
                  Done
                </button>
                <button
                  onClick={resetRecording}
                  className="inline-flex items-center justify-center rounded-xl bg-surface border border-border p-3 text-text-secondary hover:bg-surface-tertiary transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </>
            )}

            {status === 'paused' && (
              <>
                <button
                  onClick={resumeRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors flex-1"
                >
                  <Play className="h-4 w-4" />
                  Continue
                </button>
                <button
                  onClick={stopAndAnalyze}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-text-primary px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-colors flex-1"
                >
                  <Square className="h-4 w-4" />
                  Done
                </button>
                <button
                  onClick={resetRecording}
                  className="inline-flex items-center justify-center rounded-xl bg-surface border border-border p-3 text-text-secondary hover:bg-surface-tertiary transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </>
            )}
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

      {/* Passed - with word match visualization */}
      {status === 'passed' && (
        <div className="flex flex-col items-center gap-3 w-full">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-lg font-bold text-emerald-600">Test passed!</p>
          {transcription && (
            <div className="rounded-xl bg-surface-tertiary px-4 py-3 w-full">
              <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wider">Word match</p>
              <div className="flex flex-wrap gap-1.5">
                {getWordMatches(transcription).map((m, i) => (
                  <span
                    key={i}
                    className={`inline-block rounded-md px-2 py-0.5 text-sm font-medium ${
                      m.matched
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-500 line-through'
                    }`}
                  >
                    {m.word}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Heard: "{transcription}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Failed - with word match visualization */}
      {status === 'failed' && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="text-center">
            <p className="text-sm font-semibold text-red-600">
              Couldn't quite catch that
            </p>
          </div>

          {transcription && (
            <div className="rounded-xl bg-surface-tertiary px-4 py-3 w-full">
              <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wider">Word match</p>
              <div className="flex flex-wrap gap-1.5">
                {getWordMatches(transcription).map((m, i) => (
                  <span
                    key={i}
                    className={`inline-block rounded-md px-2 py-0.5 text-sm font-medium ${
                      m.matched
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-500 line-through'
                    }`}
                  >
                    {m.word}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Heard: "{transcription}"
              </p>
            </div>
          )}

          {error && !transcription && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 w-full">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

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
