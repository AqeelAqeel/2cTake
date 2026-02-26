import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import { ArtifactViewer } from '../components/ArtifactViewer'
import { AnnotationPlayback } from '../components/annotation/AnnotationPlayback'
import { TranscriptPanel } from '../components/TranscriptPanel'
import {
  ArrowLeft,
  Copy,
  Check,
  Loader2,
  Play,
  Trash2,
  Video,
} from 'lucide-react'
import { formatTimestamp } from '../lib/transcription'
import type { Recording } from '../types'

// ── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  ['#6366f1', '#818cf8'],
  ['#8b5cf6', '#a78bfa'],
  ['#ec4899', '#f472b6'],
  ['#f59e0b', '#fbbf24'],
  ['#10b981', '#34d399'],
  ['#06b6d4', '#22d3ee'],
  ['#f43f5e', '#fb7185'],
  ['#3b82f6', '#60a5fa'],
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; bg: string; text: string; dot: string; pulse?: boolean }
  > = {
    complete: {
      label: 'Ready',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      dot: 'bg-emerald-500',
    },
    transcribing: {
      label: 'Transcribing',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      dot: 'bg-blue-500',
      pulse: true,
    },
    processing: {
      label: 'Processing',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      dot: 'bg-blue-500',
      pulse: true,
    },
    uploaded: {
      label: 'Queued',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
    },
    uploading: {
      label: 'Uploading',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      dot: 'bg-amber-500',
      pulse: true,
    },
    pending: {
      label: 'Pending',
      bg: 'bg-slate-50',
      text: 'text-slate-600',
      dot: 'bg-slate-400',
    },
    failed: {
      label: 'Failed',
      bg: 'bg-red-50',
      text: 'text-red-700',
      dot: 'bg-red-500',
    },
  }
  const c = config[status] || config.pending
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.pulse ? 'animate-pulse-dot' : ''}`}
      />
      {c.label}
    </span>
  )
}

// ── Recording Card ───────────────────────────────────────────────────────────

function RecordingCard({
  recording,
  isSelected,
  onClick,
}: {
  recording: Recording
  isSelected: boolean
  onClick: () => void
}) {
  const name = recording.reviewer?.name || 'Anonymous'
  const colors = getAvatarColor(name)

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl w-full text-left transition-all ${
        isSelected
          ? 'border border-brand-300/40 bg-brand-50/50'
          : 'border border-transparent hover:bg-surface-tertiary'
      }`}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white tracking-wide"
        style={{
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
        }}
      >
        {getInitials(name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-text-primary truncate">
            {name}
          </span>
          <StatusBadge status={recording.status} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-text-muted">
            {formatTimestamp(recording.duration)}
          </span>
          <span className="text-[10px] text-border">&middot;</span>
          <span className="text-xs text-text-muted">
            {relativeDate(recording.created_at)}
          </span>
        </div>
      </div>

      {/* Play indicator */}
      {recording.status === 'complete' && (
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            isSelected ? 'bg-brand-100' : 'bg-surface-tertiary'
          }`}
        >
          <Play
            className={`w-2.5 h-2.5 fill-current ${
              isSelected ? 'text-brand-600' : 'text-text-muted'
            }`}
          />
        </div>
      )}
    </button>
  )
}

// ── Empty Reviews ────────────────────────────────────────────────────────────

function EmptyReviews({ shareToken }: { shareToken: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/review/${shareToken}`

  return (
    <div className="h-full flex flex-col items-center justify-center p-10 text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center mb-4">
        <Video className="w-7 h-7 text-brand-500" />
      </div>
      <h3 className="text-base font-semibold text-text-primary">
        No reviews yet
      </h3>
      <p className="text-[13px] text-text-secondary mt-1.5 max-w-[280px] leading-relaxed">
        Share the review link to start collecting feedback on this artifact.
      </p>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(link)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 transition-colors shadow-[0_2px_8px_rgba(79,70,229,0.25)]"
      >
        <Copy className="w-3.5 h-3.5" />
        {copied ? 'Copied!' : 'Copy review link'}
      </button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    currentSession,
    recordings,
    transcripts,
    annotations,
    loading,
    fetchSession,
    fetchRecordings,
    fetchTranscript,
    fetchAnnotations,
    deleteSession,
  } = useSessionStore()

  const [copied, setCopied] = useState(false)
  const [selectedRecording, setSelectedRecording] = useState<string | null>(
    null
  )
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeTab, setActiveTab] = useState<'transcript' | 'info'>(
    'transcript'
  )
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (id) {
      fetchSession(id)
      fetchRecordings(id)
    }
  }, [id, fetchSession, fetchRecordings])

  useEffect(() => {
    if (selectedRecording) {
      fetchTranscript(selectedRecording)
      const rec = recordings.find((r) => r.id === selectedRecording)
      if (rec) fetchAnnotations(rec)
    }
  }, [selectedRecording, fetchTranscript, fetchAnnotations, recordings])

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

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
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
  const activeAnnotations = selectedRecording
    ? annotations[selectedRecording] ?? []
    : []

  return (
    <div className="flex h-full animate-slide-in">
      {/* ── Left: Artifact Viewer ── */}
      <div className="flex-1 flex flex-col min-w-0 p-5 pr-2.5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <button
            onClick={() => navigate('/')}
            className="w-[34px] h-[34px] rounded-[10px] border border-border bg-white flex items-center justify-center shrink-0 hover:bg-surface-tertiary transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-text-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-text-primary truncate">
              {currentSession.title}
            </h2>
            {currentSession.context && (
              <p className="text-xs text-text-secondary truncate mt-0.5">
                {currentSession.context}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-tertiary transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Share
                </>
              )}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg border border-border bg-white p-1.5 text-text-muted hover:text-red-500 hover:border-red-200 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Artifact */}
        <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border bg-surface-tertiary relative">
          <ArtifactViewer
            url={currentSession.artifact_url}
            type={currentSession.artifact_type}
            className="h-full"
          />
          {activeAnnotations.length > 0 && (
            <AnnotationPlayback
              artifactUrl={currentSession.artifact_url}
              artifactType={currentSession.artifact_type}
              snapshots={activeAnnotations}
              currentTime={currentTime}
            />
          )}
        </div>
      </div>

      {/* ── Right: Reviews Panel ── */}
      <div className="w-[420px] border-l border-surface-tertiary flex flex-col bg-white overflow-hidden shrink-0">
        {recordings.length === 0 ? (
          <EmptyReviews shareToken={currentSession.share_token} />
        ) : (
          <>
            {/* Recordings list */}
            <div className="px-4 pt-4 pb-2 border-b border-surface-tertiary shrink-0">
              <div className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em] mb-2.5 pl-0.5">
                Reviews ({recordings.length})
              </div>
              <div className="flex flex-col gap-0.5">
                {recordings.map((rec) => (
                  <RecordingCard
                    key={rec.id}
                    recording={rec}
                    isSelected={selectedRecording === rec.id}
                    onClick={() => {
                      setSelectedRecording(rec.id)
                      setCurrentTime(0)
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Video + Transcript */}
            {activeRecording && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Video */}
                <div className="px-4 pt-4 shrink-0">
                  <div className="overflow-hidden rounded-xl border border-border bg-black">
                    <video
                      ref={videoRef}
                      key={activeRecording.id}
                      src={activeRecording.video_url}
                      controls
                      className="aspect-video w-full"
                      onTimeUpdate={handleTimeUpdate}
                    />
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 px-4 pt-3 border-b border-surface-tertiary shrink-0">
                  {(
                    [
                      { key: 'transcript' as const, label: 'Transcript' },
                      { key: 'info' as const, label: 'Details' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-4 pb-3 pt-2 text-[13px] transition-all border-b-2 ${
                        activeTab === tab.key
                          ? 'font-semibold text-brand-600 border-brand-600'
                          : 'font-normal text-text-muted border-transparent hover:text-text-secondary'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-2 pb-4">
                  {activeTab === 'transcript' ? (
                    <TranscriptPanel
                      transcript={activeTranscript}
                      onTimestampClick={handleTimestampClick}
                      currentTime={currentTime}
                    />
                  ) : (
                    <div className="px-2 pt-4 grid gap-4">
                      {[
                        {
                          label: 'Reviewer',
                          value:
                            activeRecording.reviewer?.name || 'Anonymous',
                        },
                        {
                          label: 'Duration',
                          value: formatTimestamp(activeRecording.duration),
                        },
                        {
                          label: 'Recorded',
                          value: new Date(
                            activeRecording.created_at
                          ).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }),
                        },
                        {
                          label: 'Status',
                          value: activeRecording.status,
                        },
                        {
                          label: 'Transcript',
                          value: activeTranscript?.status || '—',
                        },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em] mb-1">
                            {item.label}
                          </div>
                          <div className="text-sm text-text-primary">
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-center text-lg font-semibold text-text-primary">
              Delete artifact?
            </h3>
            <p className="mt-2 text-center text-sm text-text-secondary">
              This session and all recordings will be permanently deleted.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl border border-border bg-white py-2.5 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
