import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import { useRecorderStore } from '../state/recorderStore'
import { uploadRecording, registerReviewer } from '../lib/upload'
import { ArtifactViewer } from '../components/ArtifactViewer'
import { PermissionsGate } from '../components/PermissionsGate'
import { Recorder } from '../components/Recorder'
import { UploadProgress } from '../components/UploadProgress'
import { Video, Loader2, AlertCircle, Clock } from 'lucide-react'
import type { Session } from '../types'

type ReviewStep = 'loading' | 'error' | 'entry' | 'permissions' | 'recording' | 'uploading' | 'done'

export function ReviewLink() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const { fetchSessionByToken } = useSessionStore()
  const recorderStore = useRecorderStore()

  const [step, setStep] = useState<ReviewStep>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [name, setName] = useState('')
  const [reviewerId, setReviewerId] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'uploading' | 'success' | 'error'>('uploading')

  useEffect(() => {
    if (!shareToken) return
    fetchSessionByToken(shareToken).then((s) => {
      if (s) {
        setSession(s)
        setStep('entry')
      } else {
        setStep('error')
      }
    })
  }, [shareToken, fetchSessionByToken])

  const handleStartReview = async () => {
    if (!session || !name.trim()) return
    try {
      const id = await registerReviewer(session.id, name.trim())
      setReviewerId(id)
      setStep('permissions')
    } catch {
      setStep('error')
    }
  }

  const handlePermissionsGranted = (stream: MediaStream) => {
    recorderStore.setMediaStream(stream)
    recorderStore.reset()
    setStep('recording')
  }

  const handleSend = useCallback(
    async (blob: Blob, _duration: number) => {
      if (!session || !reviewerId) return
      setStep('uploading')
      setUploadStatus('uploading')

      try {
        await uploadRecording(blob, session.id, reviewerId, (pct) => {
          recorderStore.setUploadProgress(pct)
        })
        // Update recording duration
        setUploadStatus('success')
        setStep('done')
      } catch {
        setUploadStatus('error')
      }
    },
    [session, reviewerId, recorderStore]
  )

  const handleRetryUpload = () => {
    // User would need to re-record since we don't persist the blob
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

  // Permissions
  if (step === 'permissions') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
          <PermissionsGate onGranted={handlePermissionsGranted} />
        </div>
      </div>
    )
  }

  // Recording interface
  return (
    <div className="flex h-screen flex-col lg:flex-row">
      {/* Artifact panel */}
      <div className="flex-1 overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r lg:p-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {session?.title}
          </h2>
          {session?.context && (
            <p className="mt-1 text-xs text-text-secondary">{session.context}</p>
          )}
        </div>
        {session && (
          <ArtifactViewer
            url={session.artifact_url}
            type={session.artifact_type}
            className="h-[calc(100%-3rem)]"
          />
        )}
      </div>

      {/* Recorder panel */}
      <div className="w-full p-4 lg:w-[420px] lg:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            Recording as <span className="font-medium text-text-primary">{name}</span>
          </p>
          {session?.max_duration && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-tertiary px-2.5 py-1 text-xs text-text-muted">
              <Clock className="h-3 w-3" />
              {session.max_duration / 60}m limit
            </span>
          )}
        </div>
        <Recorder onSend={handleSend} maxDuration={session?.max_duration} />
      </div>
    </div>
  )
}
