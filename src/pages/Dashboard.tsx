import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import { EditSessionModal } from '../components/EditSessionModal'
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
  Eye,
  Video,
  LayoutGrid,
  List,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  X,
} from 'lucide-react'

type SortKey = 'title' | 'artifact_type' | 'created_at' | 'recording_count'
type SortDir = 'asc' | 'desc'

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
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')
  const [editSession, setEditSession] = useState<Session | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (deleteTarget) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [deleteTarget])

  const filtered = useMemo(() => {
    let result = [...sessions]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artifact_type.toLowerCase().includes(q) ||
          (s.context?.toLowerCase().includes(q) ?? false)
      )
    }

    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'artifact_type':
          cmp = a.artifact_type.localeCompare(b.artifact_type)
          break
        case 'created_at':
          cmp =
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
          break
        case 'recording_count':
          cmp = (a.recording_count ?? 0) - (b.recording_count ?? 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [sessions, search, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'created_at' ? 'desc' : 'asc')
    }
  }

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
  const pdfCount = sessions.filter((s) => s.artifact_type === 'pdf').length
  const imageCount = sessions.filter((s) => s.artifact_type === 'image').length

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return <EmptyState />
  }

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Your Artifacts
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage and track feedback on your live artifacts
          </p>
        </div>
        <Link
          to="/new"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white no-underline shadow-sm hover:bg-brand-700 active:bg-brand-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Artifact
        </Link>
      </div>

      {/* ── Stats ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Artifacts"
          value={sessions.length}
          icon={<FileText className="h-4 w-4" />}
          accent="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Recordings"
          value={totalRecordings}
          icon={<Video className="h-4 w-4" />}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="PDFs"
          value={pdfCount}
          icon={<FileText className="h-4 w-4" />}
          accent="bg-rose-50 text-rose-600"
        />
        <StatCard
          label="Images"
          value={imageCount}
          icon={<Image className="h-4 w-4" />}
          accent="bg-sky-50 text-sky-600"
        />
      </div>

      {/* ── Toolbar ── */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search artifacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
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

        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            onClick={() => setViewMode('table')}
            className={`rounded-md px-2.5 py-1.5 transition-colors ${
              viewMode === 'table'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            title="Table view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-md px-2.5 py-1.5 transition-colors ${
              viewMode === 'grid'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search info */}
      {search && (
        <p className="mt-3 text-xs text-text-muted">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "
          {search}"
        </p>
      )}

      {/* ── Content ── */}
      {filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center py-16">
          <Search className="h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-secondary">
            No artifacts match your search
          </p>
          <button
            onClick={() => setSearch('')}
            className="mt-2 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Clear search
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* ── Table View ── */
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary/80">
                  <th className="px-5 py-3.5 text-left">
                    <SortButton
                      label="Name"
                      sortKey="title"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-5 py-3.5 text-left">
                    <SortButton
                      label="Type"
                      sortKey="artifact_type"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="hidden px-5 py-3.5 text-left sm:table-cell">
                    <SortButton
                      label="Created"
                      sortKey="created_at"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-5 py-3.5 text-left">
                    <SortButton
                      label="Reviews"
                      sortKey="recording_count"
                      currentKey={sortKey}
                      dir={sortDir}
                      onSort={toggleSort}
                    />
                  </th>
                  <th className="px-5 py-3.5 text-right">
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((session) => (
                  <tr
                    key={session.id}
                    className="group transition-colors hover:bg-brand-50/30"
                  >
                    {/* Name */}
                    <td className="px-5 py-4">
                      <Link
                        to={`/session/${session.id}`}
                        className="font-medium text-text-primary no-underline hover:text-brand-600 transition-colors"
                      >
                        {session.title}
                      </Link>
                      {session.context && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-text-muted">
                          {session.context}
                        </p>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-5 py-4">
                      <TypeBadge type={session.artifact_type} />
                    </td>

                    {/* Created */}
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <span className="text-sm text-text-secondary">
                        {relativeDate(session.created_at)}
                      </span>
                    </td>

                    {/* Reviews */}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                        <Video className="h-3.5 w-3.5 text-text-muted" />
                        {session.recording_count ?? 0}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <ActionButton
                          icon={
                            copiedId === session.id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )
                          }
                          label="Copy share link"
                          onClick={() => copyLink(session)}
                          activeClass={
                            copiedId === session.id ? 'text-emerald-600' : ''
                          }
                        />
                        <ActionButton
                          icon={<Eye className="h-3.5 w-3.5" />}
                          label="View"
                          onClick={() => navigate(`/session/${session.id}`)}
                        />
                        <ActionButton
                          icon={<Pencil className="h-3.5 w-3.5" />}
                          label="Edit"
                          onClick={() => setEditSession(session)}
                        />
                        <ActionButton
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          label="Delete"
                          onClick={() => setDeleteTarget(session)}
                          activeClass="hover:!text-red-500 hover:!bg-red-50"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Grid View ── */
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((session) => (
            <GridCard
              key={session.id}
              session={session}
              onCopy={() => copyLink(session)}
              onEdit={() => setEditSession(session)}
              onDelete={() => setDeleteTarget(session)}
              copied={copiedId === session.id}
            />
          ))}
        </div>
      )}

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
          <div className="relative w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
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
                className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
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
  accent,
}: {
  label: string
  value: number
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div
        className={`mb-3 inline-flex items-center justify-center rounded-lg p-2 ${accent}`}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold tabular-nums text-text-primary">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">{label}</p>
    </div>
  )
}

function TypeBadge({ type }: { type: 'pdf' | 'image' | 'document' }) {
  if (type === 'pdf') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
        <FileText className="h-3 w-3" />
        PDF
      </span>
    )
  }
  if (type === 'document') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        <FileText className="h-3 w-3" />
        Doc
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
      <Image className="h-3 w-3" />
      Image
    </span>
  )
}

function SortButton({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
}) {
  const active = sortKey === currentKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="group inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
    >
      {label}
      {active ? (
        dir === 'asc' ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      )}
    </button>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  activeClass = '',
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  activeClass?: string
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={label}
      className={`rounded-lg p-2 text-text-muted hover:bg-surface-tertiary hover:text-text-secondary transition-colors ${activeClass}`}
    >
      {icon}
    </button>
  )
}

function GridCard({
  session,
  onCopy,
  onEdit,
  onDelete,
  copied,
}: {
  session: Session
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  copied: boolean
}) {
  return (
    <div className="group rounded-xl border border-border bg-surface p-5 transition-all hover:border-brand-200 hover:shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-tertiary">
          {session.artifact_type === 'pdf' ? (
            <FileText className="h-5 w-5 text-rose-500" />
          ) : (
            <Image className="h-5 w-5 text-sky-500" />
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-tertiary hover:text-text-secondary transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-text-muted hover:bg-red-50 hover:text-red-500 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Link
        to={`/session/${session.id}`}
        className="mt-3 block font-medium text-text-primary no-underline hover:text-brand-600 transition-colors"
      >
        {session.title}
      </Link>

      <div className="mt-2 flex items-center gap-3">
        <span className="text-xs text-text-muted">
          {relativeDate(session.created_at)}
        </span>
        {(session.recording_count ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <Video className="h-3 w-3" />
            {session.recording_count}
          </span>
        )}
      </div>

      <button
        onClick={onCopy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-surface-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-brand-50 hover:text-brand-600 transition-colors"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            Copy link
          </>
        )}
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
        <Inbox className="h-8 w-8 text-brand-400" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-text-primary">
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
  )
}
