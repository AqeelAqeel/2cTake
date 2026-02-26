import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import { useRecorderStore } from '../state/recorderStore'
import { useAnnotationStore } from '../state/annotationStore'
import { uploadRecording, registerReviewer } from '../lib/upload'
import { ArtifactViewer } from '../components/ArtifactViewer'
import { AnnotationCanvas } from '../components/annotation/AnnotationCanvas'
import { Recorder } from '../components/Recorder'
import { UploadProgress } from '../components/UploadProgress'
import { OnboardingOverlay } from '../components/OnboardingOverlay'
import { CountdownOverlay } from '../components/CountdownOverlay'
import { Video, Loader2, AlertCircle, Mic } from 'lucide-react'
import type { Session } from '../types'

type ReviewStep = 'loading' | 'error' | 'entry' | 'onboarding' | 'countdown' | 'recording' | 'uploading' | 'done'

export function ReviewLink() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const { fetchSessionByToken } = useSessionStore()
  const recorderStore = useRecorderStore()

  const [step, setStep] = useState<ReviewStep>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [name, setName] = useState('')
  const [reviewerId, setReviewerId] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'success' | 'error'>('uploading')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const pipVideoRef = useRef<HTMLVideoElement>(null)

  // Connect PiP webcam to media stream when recording step renders
  useEffect(() => {
    if (step === 'recording' && pipVideoRef.current && recorderStore.mediaStream) {
      pipVideoRef.current.srcObject = recorderStore.mediaStream
    }
  }, [step, recorderStore.mediaStream])

  useEffect(() => {
    if (!shareToken) return
    console.log('[ReviewLink] Fetching session for token:', shareToken)
    fetchSessionByToken(shareToken)
      .then((s) => {
        if (s) {
          console.log('[ReviewLink] Session found:', { id: s.id, title: s.title })
          setSession(s)
          setStep('entry')
        } else {
          console.error('[ReviewLink] No session returned for token:', shareToken)
          setErrorDetail(`No session found for token: ${shareToken}`)
          setStep('error')
        }
      })
      .catch((err) => {
        console.error('[ReviewLink] Unexpected error:', err)
        setErrorDetail(`Unexpected error: ${err?.message ?? err}`)
        setStep('error')
      })
  }, [shareToken, fetchSessionByToken])

  const handleStartReview = async () => {
    if (!session || !name.trim()) return
    try {
      const id = await registerReviewer(session.id, name.trim())
      setReviewerId(id)
      setStep('onboarding')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ReviewLink] registerReviewer error:', err)
      setErrorDetail(`Failed to register reviewer: ${message}`)
      setStep('error')
    }
  }

  const handleOnboardingComplete = useCallback((stream: MediaStream) => {
    recorderStore.setMediaStream(stream)
    recorderStore.reset()
    useAnnotationStore.getState().reset()
    setStep('countdown')
  }, [recorderStore])

  const handleCountdownFinish = useCallback(() => {
    useAnnotationStore.getState().setRecordingStartTime(Date.now())
    setStep('recording')
  }, [])

  const handleSend = useCallback(
    async (blob: Blob, _duration: number) => {
      if (!session || !reviewerId) return
      setStep('uploading')
      setUploadStatus('uploading')

      const snapshots = useAnnotationStore.getState().snapshots

      try {
        await uploadRecording(
          blob,
          session.id,
          reviewerId,
          (pct) => {
            recorderStore.setUploadProgress(pct)
          },
          snapshots.length > 0 ? snapshots : undefined
        )
        setUploadStatus('success')
        setStep('done')
      } catch {
        setUploadStatus('error')
      }
    },
    [session, reviewerId, recorderStore]
  )

  const handleRetryUpload = () => {
    setStep('recording')
    recorderStore.reset()
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    )
  }

  // Error
  if (step === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h2 className="text-lg font-semibold text-text-primary">
          Session not found
        </h2>
        <p className="text-sm text-text-secondary">
          This link may be invalid or expired.
        </p>
        {errorDetail && (
          <pre className="mt-4 max-w-lg rounded-lg bg-red-950/50 border border-red-800/50 p-4 text-xs text-red-300 whitespace-pre-wrap break-all">
            {errorDetail}
          </pre>
        )}
        <p className="text-xs text-text-muted mt-2">
          Token: <code className="bg-surface-secondary px-1 py-0.5 rounded">{shareToken}</code>
        </p>
      </div>
    )
  }

  // Done
  if (step === 'done') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4">
        <UploadProgress progress={100} status="success" />
      </div>
    )
  }

  // Uploading
  if (step === 'uploading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4">
        <UploadProgress
          progress={recorderStore.uploadProgress}
          status={uploadStatus}
          onRetry={uploadStatus === 'error' ? handleRetryUpload : undefined}
        />
      </div>
    )
  }

  // Entry
  if (step === 'entry') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
              <Video className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-text-primary">
              {session?.title}
            </h1>
            {session?.context && (
              <p className="mt-2 text-sm text-text-secondary max-w-sm mx-auto">
                {session.context}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <label className="block text-sm font-medium text-text-primary">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) handleStartReview()
              }}
            />

            <button
              onClick={handleStartReview}
              disabled={!name.trim()}
              className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Start review
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-text-muted">
            Your recording will only be visible to the session creator.
          </p>
        </div>
      </div>
    )
  }

  // Onboarding and Countdown — show artifact blurred behind overlay
  if (step === 'onboarding' || step === 'countdown') {
    return (
      <div className="relative h-screen overflow-hidden">
        {/* Artifact behind, blurred */}
        {session && (
          <div className="h-full blur-md opacity-50 pointer-events-none">
            <div className="flex h-full flex-col lg:flex-row">
              <div className="flex-1 overflow-hidden p-4 lg:p-6">
                <ArtifactViewer
                  url={session.artifact_url}
                  type={session.artifact_type}
                  className="h-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* Overlay */}
        {step === 'onboarding' && (
          <OnboardingOverlay onComplete={handleOnboardingComplete} />
        )}
        {step === 'countdown' && (
          <CountdownOverlay onFinish={handleCountdownFinish} />
        )}
      </div>
    )
  }

  // Recording interface — artifact-first layout with floating controls
  const hasVideo = (recorderStore.mediaStream?.getVideoTracks()?.length ?? 0) > 0
  const isRecActive = recorderStore.state === 'recording' || recorderStore.state === 'paused'

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-surface-secondary">
      {/* Compact header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-surface border-b border-border">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-primary truncate">{session?.title}</h2>
          {session?.context && (
            <p className="text-xs text-text-secondary truncate">{session.context}</p>
          )}
        </div>
        <p className="text-xs text-text-muted shrink-0">
          as <span className="font-medium text-text-secondary">{name}</span>
        </p>
      </div>

      {/* Artifact fills remaining space */}
      <div className="flex-1 overflow-hidden relative">
        {session && (
          <AnnotationCanvas
            url={session.artifact_url}
            type={session.artifact_type}
            className="h-full w-full"
          />
        )}

        {/* Floating PiP webcam */}
        {hasVideo && (
          <div className="absolute bottom-3 right-3 z-20 w-24 aspect-[4/3] rounded-xl overflow-hidden shadow-xl border-2 border-white/20 bg-black">
            <video
              ref={pipVideoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover -scale-x-100"
            />
            {isRecActive && (
              <div className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </div>
        )}

        {/* Audio-only floating indicator */}
        {!hasVideo && isRecActive && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur px-3 py-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <Mic className="h-3.5 w-3.5 text-white/80" />
          </div>
        )}
      </div>

      {/* Compact recording controls */}
      <div className="shrink-0">
        <Recorder onSend={handleSend} maxDuration={session?.max_duration} autoStart compact />
      </div>
    </div>
  )
}
