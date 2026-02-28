import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import { EditSessionModal } from '../components/EditSessionModal'
import { SenderOnboardingWizard } from '../components/SenderOnboardingWizard'
import type { Session } from '../types'
import {
  Plus,
  FileText,
  Image,
  Loader2,
  Inbox,
  Copy,
  Check,
  Search,
  Pencil,
  Trash2,
  Mic,
  Send,
  X,
  Video,
  CheckCircle,
  ChevronRight,
} from 'lucide-react'

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function Dashboard() {
  const { sessions, loading, error, fetchSessions, deleteSession } =
    useSessionStore()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [editSession, setEditSession] = useState<Session | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    if (deleteTarget) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [deleteTarget])

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artifact_type.toLowerCase().includes(q) ||
        (s.context?.toLowerCase().includes(q) ?? false)
    )
  }, [sessions, search])

  const copyLink = async (session: Session) => {
    const url = `${window.location.origin}/review/${session.share_token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(session.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteSession(deleteTarget.id)
    setDeleteTarget(null)
  }

  const totalRecordings = sessions.reduce(
    (sum, s) => sum + (s.recording_count ?? 0),
    0
  )
  const recordedCount = sessions.filter(
    (s) => (s.recording_count ?? 0) > 0
  ).length

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto px-4 sm:px-8 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (sessions.length === 0) {
    return <EmptyState />
  }

  return (
    <div
      className="h-full overflow-y-auto warm-scroll"
      style={{ backgroundColor: 'var(--color-surface-warm)' }}
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-8 py-5 sm:py-7">
        {/* ── Stats Row ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 sm:mb-7">
          <StatCard
            label="Sent"
            value={sessions.length}
            icon={<Send className="w-3.5 h-3.5" />}
            color="var(--color-brand-600)"
            bg="var(--color-brand-50)"
          />
          <StatCard
            label="Reviews"
            value={totalRecordings}
            icon={<Video className="w-3.5 h-3.5" />}
            color="#059669"
            bg="#ecfdf5"
          />
          <StatCard
            label="Recorded"
            value={recordedCount}
            icon={<CheckCircle className="w-3.5 h-3.5" />}
            color="#0284c7"
            bg="#f0f9ff"
          />
        </div>

        {/* ── Search + New Artifact ── */}
        <div className="flex items-center gap-2 sm:gap-3 mb-5 sm:mb-6">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search artifacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border bg-white py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none transition-all"
              style={{
                borderColor: 'var(--color-warm-border)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-brand-400)'
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-brand-50)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-warm-border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Link
            to="/new"
            className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl bg-brand-600 px-4 sm:px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-sm hover:bg-brand-700 active:bg-brand-800 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Artifact</span>
            <span className="sm:hidden">New</span>
          </Link>
        </div>

        {/* ── Session Cards ── */}
        <div className="flex flex-col gap-2.5">
          {filtered.map((session, i) => (
            <div
              key={session.id}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <SessionCard
                session={session}
                onClick={() => navigate(`/session/${session.id}`)}
                onCopy={() => copyLink(session)}
                onEdit={() => setEditSession(session)}
                onDelete={() => setDeleteTarget(session)}
                copied={copiedId === session.id}
              />
            </div>
          ))}
          {filtered.length === 0 && search && (
            <div
              className="text-center py-16 text-sm"
              style={{
                color: 'var(--color-timestamp)',
                fontFamily: 'var(--font-serif)',
              }}
            >
              No artifacts match &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Modal ── */}
      {editSession && (
        <EditSessionModal
          session={editSession}
          onClose={() => setEditSession(null)}
        />
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-center text-lg font-semibold text-text-primary">
              Delete artifact?
            </h3>
            <p className="mt-2 text-center text-sm text-text-secondary">
              &ldquo;
              <span className="font-medium">{deleteTarget.title}</span>
              &rdquo; and all its recordings will be permanently deleted.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
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

/* ═══════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════ */

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <div
      className="rounded-xl bg-white p-3.5 sm:p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      style={{ border: `1px solid var(--color-warm-border)` }}
    >
      <div
        className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider mb-1.5"
        style={{ color }}
      >
        <span
          className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ backgroundColor: bg }}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-2xl sm:text-[28px] font-bold tracking-tight text-text-primary tabular-nums">
        {value}
      </div>
    </div>
  )
}

function SessionCard({
  session,
  onClick,
  onCopy,
  onEdit,
  onDelete,
  copied,
}: {
  session: Session
  onClick: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  copied: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 sm:gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white w-full text-left transition-all shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
      style={{ border: `1px solid var(--color-warm-border)` }}
    >
      {/* Artifact thumbnail */}
      <div
        className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor: 'var(--color-surface-warm)',
          border: '1px solid var(--color-warm-border)',
        }}
      >
        {session.artifact_type === 'pdf' || session.artifact_type === 'document' ? (
          <FileText className="w-5 h-5 text-text-muted stroke-[1.5]" />
        ) : (
          <Image className="w-5 h-5 text-text-muted stroke-[1.5]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className="text-[14px] sm:text-[15px] font-semibold text-text-primary truncate leading-snug"
        >
          {session.title}
        </div>
        {session.context && (
          <div className="text-xs text-text-secondary truncate mt-0.5 leading-relaxed">
            {session.context}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className={`flex items-center gap-1 text-xs font-medium ${
              (session.recording_count ?? 0) > 0
                ? 'text-brand-600'
                : 'text-text-muted'
            }`}
          >
            <Mic className="w-3 h-3" />
            {session.recording_count ?? 0} review
            {(session.recording_count ?? 0) !== 1 ? 's' : ''}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-warm-border)' }}>
            &middot;
          </span>
          <span className="text-xs" style={{ color: 'var(--color-timestamp)' }}>
            {relativeDate(session.created_at)}
          </span>
        </div>
      </div>

      {/* Desktop: Actions (show on hover) */}
      <div
        className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCopy()
          }}
          className="rounded-lg p-2 text-text-muted hover:bg-surface-tertiary hover:text-text-secondary transition-colors"
          title="Copy share link"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="rounded-lg p-2 text-text-muted hover:bg-surface-tertiary hover:text-text-secondary transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded-lg p-2 text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Mobile: Chevron */}
      <ChevronRight className="w-4 h-4 text-text-muted shrink-0 sm:hidden" />
    </button>
  )
}

function EmptyState() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('2ctake_sender_onboarded')
  )

  const handleOnboardingClose = () => {
    localStorage.setItem('2ctake_sender_onboarded', 'true')
    setShowOnboarding(false)
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: 'var(--color-surface-warm)' }}
    >
      <div className="flex flex-col items-center py-24 mx-auto max-w-4xl px-6 sm:px-8">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'var(--color-brand-50)' }}
        >
          <Inbox className="h-8 w-8 text-brand-400" />
        </div>
        <h2
          className="mt-5 text-lg font-semibold text-text-primary"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          No artifacts yet
        </h2>
        <p className="mt-1.5 max-w-xs text-center text-sm text-text-secondary">
          Create your first artifact to start collecting video feedback from
          reviewers
        </p>
        <Link
          to="/new"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white no-underline shadow-sm hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Artifact
        </Link>
      </div>

      {showOnboarding && (
        <SenderOnboardingWizard onClose={handleOnboardingClose} />
      )}
    </div>
  )
}
