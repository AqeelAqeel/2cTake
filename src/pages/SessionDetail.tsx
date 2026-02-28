import { useEffect, useRef, useState, useCallback } from 'react'
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
  Pause,
  Trash2,
  Video,
  FileText,
  PenLine,
  MessageSquare,
  Users,
  Minus,
  PanelLeft,
  X,
  Maximize2,
  Minimize2,
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
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.bg} ${c.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.pulse ? 'animate-pulse-dot' : ''}`}
      />
      {c.label}
    </span>
  )
}

// ── Sidebar Reviewer Card ────────────────────────────────────────────────────

function SidebarReviewerCard({
  recording,
  isSelected,
  index,
  onClick,
}: {
  recording: Recording
  isSelected: boolean
  index: number
  onClick: () => void
}) {
  const name = recording.reviewer?.name || 'Anonymous'
  const colors = getAvatarColor(name)

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl w-full text-left transition-all ${
        isSelected
          ? 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] border border-border/60'
          : 'border border-transparent hover:bg-white/60'
      }`}
    >
      {/* Numbered avatar */}
      <div className="relative shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white tracking-wide"
          style={{
            background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
          }}
        >
          {getInitials(name)}
        </div>
        <div
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
          style={{
            background: colors[0],
            boxShadow: '0 0 0 2px var(--color-surface-tertiary)',
          }}
        >
          {index + 1}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-text-primary truncate">
            {name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-text-muted">
            {formatTimestamp(recording.duration)}
          </span>
          <StatusBadge status={recording.status} />
        </div>
      </div>
    </button>
  )
}

// ── Mobile Reviewer Pill ─────────────────────────────────────────────────────

function MobileReviewerPill({
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
      className={`flex items-center gap-2 px-3 py-2 rounded-full shrink-0 transition-all ${
        isSelected
          ? 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.1)] border border-border/60'
          : 'border border-transparent bg-white/50'
      }`}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
        style={{
          background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
        }}
      >
        {getInitials(name)}
      </div>
      <span className="text-[12px] font-medium text-text-primary whitespace-nowrap">
        {name}
      </span>
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
      <h3
        className="text-lg font-semibold text-text-primary"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        No reviews yet
      </h3>
      <p className="text-[13px] text-text-secondary mt-2 max-w-[300px] leading-relaxed">
        Share the review link to start collecting feedback on this artifact.
      </p>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(link)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-[13px] font-medium hover:bg-brand-700 transition-colors shadow-[0_2px_8px_rgba(79,70,229,0.25)]"
      >
        <Copy className="w-3.5 h-3.5" />
        {copied ? 'Copied!' : 'Copy review link'}
      </button>
    </div>
  )
}

// ── Custom Video Player ──────────────────────────────────────────────────────

type PlayerSize = 'small' | 'large'

function VideoPlayer({
  videoRef,
  recording,
  currentTime,
  onTimeUpdate,
  playerSize,
  onToggleSize,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  recording: Recording
  currentTime: number
  onTimeUpdate: () => void
  playerSize: PlayerSize
  onToggleSize: () => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(recording.duration || 0)
  const progressRef = useRef<HTMLDivElement>(null)

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
    } else {
      videoRef.current.pause()
    }
  }, [videoRef])

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!videoRef.current || !progressRef.current) return
      const rect = progressRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      videoRef.current.currentTime = ratio * (videoRef.current.duration || duration)
    },
    [videoRef, duration]
  )

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      className="relative group bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.15)] transition-all duration-300"
      style={{
        maxHeight: playerSize === 'small' ? '220px' : undefined,
      }}
    >
      <video
        ref={videoRef}
        key={recording.id}
        src={recording.video_url}
        className="w-full block"
        style={{
          maxHeight: playerSize === 'small' ? '220px' : undefined,
          objectFit: playerSize === 'small' ? 'contain' : undefined,
        }}
        onTimeUpdate={() => {
          onTimeUpdate()
          setIsPlaying(!videoRef.current?.paused)
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration)
          }
        }}
        onClick={togglePlay}
        playsInline
      />

      {/* Play/pause overlay */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 cursor-pointer ${
          isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
        }`}
        style={{
          background: isPlaying
            ? 'transparent'
            : 'radial-gradient(circle, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 100%)',
        }}
        onClick={togglePlay}
      >
        <div
          className={`rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/20 ${
            playerSize === 'small' ? 'w-10 h-10' : 'w-12 h-12 sm:w-14 sm:h-14'
          }`}
        >
          {isPlaying ? (
            <Pause className={`text-white fill-white ${playerSize === 'small' ? 'w-4 h-4' : 'w-5 h-5 sm:w-6 sm:h-6'}`} />
          ) : (
            <Play className={`text-white fill-white ml-0.5 ${playerSize === 'small' ? 'w-4 h-4' : 'w-5 h-5 sm:w-6 sm:h-6'}`} />
          )}
        </div>
      </div>

      {/* Bottom controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-0">
        {/* Time display + size toggle */}
        <div className="flex items-center justify-between px-3 sm:px-4 pb-1.5">
          <span className="text-[11px] sm:text-[12px] font-mono text-white/80 tabular-nums tracking-wide">
            {formatTimestamp(currentTime)}
            <span className="text-white/40 mx-1">/</span>
            {formatTimestamp(duration)}
          </span>

          {/* Size toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSize()
            }}
            className="w-7 h-7 rounded-md flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all"
            title={playerSize === 'small' ? 'Theater mode' : 'Mini player'}
          >
            {playerSize === 'small' ? (
              <Maximize2 className="w-3.5 h-3.5" />
            ) : (
              <Minimize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="h-[5px] cursor-pointer group/progress"
          onClick={handleSeek}
        >
          <div className="h-full relative">
            <div className="absolute inset-0 bg-white/20" />
            <div
              className="absolute inset-y-0 left-0 bg-brand-500 transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Markups Tab ──────────────────────────────────────────────────────────────

function MarkupsPanel({
  annotations,
  onTimestampClick,
  currentTime,
}: {
  annotations: { timestamp: number; canvasJSON: string }[]
  onTimestampClick: (seconds: number) => void
  currentTime: number
}) {
  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-timestamp)]">
        <PenLine className="h-8 w-8" />
        <p className="text-sm" style={{ fontFamily: 'var(--font-serif)' }}>
          No markups in this review
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {annotations.map((snap, i) => {
        const isActive =
          currentTime >= snap.timestamp &&
          (i === annotations.length - 1 || currentTime < annotations[i + 1].timestamp)
        return (
          <button
            key={i}
            onClick={() => onTimestampClick(snap.timestamp)}
            className="flex items-center gap-4 sm:gap-5 w-full text-left transition-all"
            style={{
              padding: '14px 16px',
              borderLeft: isActive
                ? '3px solid var(--color-brand-500)'
                : '3px solid transparent',
              backgroundColor: isActive
                ? 'var(--color-warm-highlight)'
                : 'transparent',
            }}
          >
            <span
              className="shrink-0 text-[12px] font-medium font-mono tabular-nums"
              style={{
                color: isActive
                  ? 'var(--color-brand-600)'
                  : 'var(--color-timestamp)',
              }}
            >
              {formatTimestamp(snap.timestamp)}
            </span>
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: isActive
                    ? 'var(--color-brand-100)'
                    : 'var(--color-surface-tertiary)',
                }}
              >
                <PenLine
                  className="w-3.5 h-3.5"
                  style={{
                    color: isActive
                      ? 'var(--color-brand-600)'
                      : 'var(--color-text-muted)',
                  }}
                />
              </div>
              <span
                className="text-[14px] transition-colors"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: isActive
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                Annotation {i + 1}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Notes Tab ────────────────────────────────────────────────────────────────

function NotesPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-timestamp)]">
      <MessageSquare className="h-8 w-8" />
      <p className="text-sm" style={{ fontFamily: 'var(--font-serif)' }}>
        Notes coming soon
      </p>
      <p className="text-xs text-text-muted max-w-[240px] text-center leading-relaxed">
        You&rsquo;ll be able to jot down thoughts and action items for each review.
      </p>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

type TabKey = 'transcript' | 'markups' | 'notes'

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
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeTab, setActiveTab] = useState<TabKey>('transcript')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [playerSize, setPlayerSize] = useState<PlayerSize>('small')
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

  const activeName = activeRecording?.reviewer?.name || 'Anonymous'
  const activeColors = getAvatarColor(activeName)

  const tabs: { key: TabKey; label: string; icon: typeof FileText; count?: number }[] = [
    { key: 'transcript', label: 'Transcript', icon: FileText },
    { key: 'markups', label: 'Markups', icon: PenLine, count: activeAnnotations.length },
    { key: 'notes', label: 'Notes', icon: MessageSquare },
  ]

  return (
    <div className="flex h-full animate-slide-in">
      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left Sidebar (desktop always, mobile as drawer) ── */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border/60 flex flex-col bg-surface-tertiary/95 backdrop-blur-xl shrink-0
          transition-transform duration-200 ease-out
          md:static md:translate-x-0 md:z-auto md:bg-surface-tertiary/50 md:backdrop-blur-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header with back + title */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border/40 shrink-0">
          <button
            onClick={() => {
              setSidebarOpen(false)
              navigate('/')
            }}
            className="w-8 h-8 rounded-lg border border-border/60 bg-white flex items-center justify-center shrink-0 hover:bg-surface-tertiary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-text-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-bold text-text-primary truncate">
              {currentSession.title}
            </h2>
            {currentSession.context && (
              <p className="text-[10px] text-text-muted truncate mt-0.5">
                {currentSession.context}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={copyLink}
              className="rounded-lg p-1.5 text-text-muted hover:bg-white hover:text-text-secondary transition-colors"
              title="Copy share link"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg p-1.5 text-text-muted hover:text-red-500 hover:bg-white transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            {/* Close button on mobile */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1.5 text-text-muted hover:bg-white hover:text-text-secondary transition-colors md:hidden"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Reviewer list */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em] mb-2 pl-1">
            <Users className="w-3 h-3" />
            Reviewers ({recordings.length})
          </div>
          <div className="flex flex-col gap-0.5">
            {recordings.map((rec, i) => (
              <SidebarReviewerCard
                key={rec.id}
                recording={rec}
                isSelected={selectedRecording === rec.id}
                index={i}
                onClick={() => {
                  setSelectedRecording(rec.id)
                  setCurrentTime(0)
                  setSidebarOpen(false)
                }}
              />
            ))}
          </div>
        </div>

        {/* Compact artifact preview */}
        <div className="flex-1 min-h-0 mx-3 mb-2 rounded-xl overflow-hidden border border-border/40 bg-white relative">
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

        {/* Bottom bar: zoom + active reviewer */}
        {activeRecording && (
          <div className="px-3 pb-3 shrink-0">
            <div
              className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
              style={{ border: '1px solid var(--color-warm-border)' }}
            >
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <Minus className="w-3 h-3" />
                <span className="font-mono font-medium text-text-secondary">100%</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{
                    background: `linear-gradient(135deg, ${activeColors[0]}, ${activeColors[1]})`,
                  }}
                >
                  {getInitials(activeName)}
                </div>
                <span className="text-[12px] font-medium text-text-primary">
                  {activeName}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile header bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40 shrink-0 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 rounded-lg border border-border/60 bg-white flex items-center justify-center shrink-0"
          >
            <PanelLeft className="w-3.5 h-3.5 text-text-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-bold text-text-primary truncate">
              {currentSession.title}
            </h2>
          </div>
          <button
            onClick={copyLink}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-tertiary transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Mobile reviewer pills (horizontal scroll) */}
        {recordings.length > 1 && (
          <div className="flex gap-2 px-3 py-2 overflow-x-auto shrink-0 md:hidden" style={{ backgroundColor: 'var(--color-surface-warm)' }}>
            {recordings.map((rec) => (
              <MobileReviewerPill
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
        )}

        {recordings.length === 0 ? (
          <EmptyReviews shareToken={currentSession.share_token} />
        ) : activeRecording ? (
          <>
            {/* Video player */}
            <div className="px-3 sm:px-6 pt-3 sm:pt-4 pb-1 shrink-0">
              <VideoPlayer
                videoRef={videoRef}
                recording={activeRecording}
                currentTime={currentTime}
                onTimeUpdate={handleTimeUpdate}
                playerSize={playerSize}
                onToggleSize={() => setPlayerSize((s) => (s === 'small' ? 'large' : 'small'))}
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-0 px-3 sm:px-6 pt-3 sm:pt-4 border-b border-border/40 shrink-0 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 pb-3 pt-1 text-[12px] sm:text-[13px] transition-all border-b-2 whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'font-semibold text-text-primary border-brand-600'
                      : 'font-normal text-text-muted border-transparent hover:text-text-secondary'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        activeTab === tab.key
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-surface-tertiary text-text-muted'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div
              className="flex-1 overflow-y-auto warm-scroll"
              style={{ backgroundColor: 'var(--color-surface-warm)' }}
            >
              <div className="py-2">
                {activeTab === 'transcript' && (
                  <TranscriptPanel
                    transcript={activeTranscript}
                    onTimestampClick={handleTimestampClick}
                    currentTime={currentTime}
                  />
                )}
                {activeTab === 'markups' && (
                  <MarkupsPanel
                    annotations={activeAnnotations}
                    onTimestampClick={handleTimestampClick}
                    currentTime={currentTime}
                  />
                )}
                {activeTab === 'notes' && <NotesPanel />}
              </div>
            </div>
          </>
        ) : null}
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
                className="flex-1 rounded-xl border bg-white py-2.5 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
                style={{ borderColor: 'var(--color-warm-border)' }}
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
