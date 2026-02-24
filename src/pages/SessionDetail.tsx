import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import { ArtifactViewer } from '../components/ArtifactViewer'
import { TranscriptPanel } from '../components/TranscriptPanel'
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Play,
  User,
  Clock,
  Trash2,
} from 'lucide-react'
import { formatTimestamp } from '../lib/transcription'

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    currentSession,
    recordings,
    transcripts,
    loading,
    fetchSession,
    fetchRecordings,
    fetchTranscript,
    deleteSession,
  } = useSessionStore()

  const [copied, setCopied] = useState(false)
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (id) {
      fetchSession(id)
      fetchRecordings(id)
    }
  }, [id, fetchSession, fetchRecordings])

  // Fetch transcript when recording is selected
  useEffect(() => {
    if (selectedRecording) {
      fetchTranscript(selectedRecording)
    }
  }, [selectedRecording, fetchTranscript])

  // Auto-select first recording
  useEffect(() => {
    if (recordings.length > 0 && !selectedRecording) {
      setSelectedRecording(recordings[0].id)
    }
  }, [recordings, selectedRecording])

  const copyLink = async () => {
    if (!currentSession) return
    const url = `${window.location.origin}/review/${currentSession.share_token}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    if (!currentSession) return
    await deleteSession(currentSession.id)
    navigate('/')
  }

  const handleTimestampClick = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      videoRef.current.play()
    }
  }

  if (loading || !currentSession) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    )
  }

  const activeRecording = recordings.find((r) => r.id === selectedRecording)
  const activeTranscript = selectedRecording
    ? transcripts[selectedRecording]
    : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/')}
            className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-text-primary">
            {currentSession.title}
          </h1>
          {currentSession.context && (
            <p className="mt-1 text-sm text-text-secondary">
              {currentSession.context}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-tertiary transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Share link
              </>
            )}
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-border bg-surface p-2 text-text-muted hover:text-red-500 hover:border-red-200 transition-colors"
            title="Delete session"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Delete this session and all recordings? This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-tertiary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Content grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left - Artifact */}
        <div className="lg:col-span-1">
          <h3 className="mb-3 text-sm font-medium text-text-primary">
            Artifact
          </h3>
          <ArtifactViewer
            url={currentSession.artifact_url}
            type={currentSession.artifact_type}
            className="h-64 lg:h-80"
          />
        </div>

        {/* Center - Video + Transcript */}
        <div className="lg:col-span-2">
          {/* Recording selector */}
          {recordings.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-3 text-sm font-medium text-text-primary">
                Recordings ({recordings.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {recordings.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => setSelectedRecording(rec.id)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selectedRecording === rec.id
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-border bg-surface text-text-secondary hover:bg-surface-tertiary'
                    }`}
                  >
                    <User className="h-3.5 w-3.5" />
                    {rec.reviewer?.name || 'Anonymous'}
                    <span className="flex items-center gap-1 text-xs text-text-muted">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(rec.duration)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Video player */}
          {activeRecording ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <video
                  ref={videoRef}
                  src={activeRecording.video_url}
                  controls
                  className="aspect-video w-full"
                />
              </div>

              {/* Transcript */}
              <div className="rounded-xl border border-border bg-surface p-4">
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  Transcript
                </h4>
                <TranscriptPanel
                  transcript={activeTranscript}
                  onTimestampClick={handleTimestampClick}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface py-16">
              <Play className="h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-secondary">
                No recordings yet. Share the link to collect feedback.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
