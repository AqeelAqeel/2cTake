import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import {
  Upload,
  FileText,
  Image,
  X,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Clock,
} from 'lucide-react'

export function NewSession() {
  const navigate = useNavigate()
  const { createSession, loading, error } = useSessionStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [maxDuration, setMaxDuration] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; shareToken: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleFile = (f: File) => {
    setFile(f)
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !title.trim()) return

    const session = await createSession({
      title: title.trim(),
      context: context.trim(),
      artifactFile: file,
      maxDuration,
    })

    if (session) {
      setCreated({ id: session.id, shareToken: session.share_token })
    }
  }

  const shareUrl = created
    ? `${window.location.origin}/review/${created.shareToken}`
    : ''

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Success state
  if (created) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-text-primary">
            Session created!
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Share this link with your reviewers
          </p>

          <div className="mt-6 flex items-center gap-2 rounded-lg border border-border bg-surface-tertiary px-4 py-3">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-sm text-text-primary outline-none"
            />
            <button
              onClick={copyLink}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
            >
              {copied ? (
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3" /> Copied
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Copy className="h-3 w-3" /> Copy
                </span>
              )}
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(`/session/${created.id}`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View session
            </button>
            <button
              onClick={() => navigate('/')}
              className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <button
        onClick={() => navigate('/')}
        className="mb-6 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="text-xl font-semibold text-text-primary">
        Create a feedback session
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Upload an artifact and generate a link for reviewers
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Session title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Homepage redesign review"
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors"
            required
          />
        </div>

        {/* Context */}
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Instructions for reviewers
            <span className="ml-1 text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="What should reviewers focus on? Any specific questions?"
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
          />
        </div>

        {/* Max recording duration */}
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Recording time limit
            <span className="ml-1 text-text-muted font-normal">(optional)</span>
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            {[null, 60, 120, 180, 300].map((val) => (
              <button
                key={val ?? 'none'}
                type="button"
                onClick={() => setMaxDuration(val)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  maxDuration === val
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface border border-border text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {val === null ? 'No limit' : val < 120 ? `${val / 60}m` : `${val / 60}m`}
              </button>
            ))}
          </div>
          {maxDuration && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-text-muted">
              <Clock className="h-3 w-3" />
              Recording will auto-stop after {maxDuration / 60} minute{maxDuration > 60 ? 's' : ''}
            </p>
          )}
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Artifact
          </label>

          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
            >
              <Upload className="h-8 w-8 text-text-muted" />
              <div className="text-center">
                <p className="text-sm font-medium text-text-primary">
                  Drop a file here or click to upload
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  PDF or image (PNG, JPG, WebP)
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-border bg-surface-tertiary px-4 py-3">
              {file.type === 'application/pdf' ? (
                <FileText className="h-5 w-5 text-red-500 shrink-0" />
              ) : (
                <Image className="h-5 w-5 text-blue-500 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {file.name}
                </p>
                <p className="text-xs text-text-muted">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  setPreview(null)
                }}
                className="shrink-0 rounded-lg p-1 text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {preview && (
            <div className="mt-3 rounded-xl border border-border overflow-hidden">
              <img
                src={preview}
                alt="Preview"
                className="max-h-48 w-full object-contain bg-surface-tertiary"
              />
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !file || !title.trim()}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating session...
            </span>
          ) : (
            'Create Session'
          )}
        </button>
      </form>
    </div>
  )
}
