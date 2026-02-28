import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../state/sessionStore'
import {
  Upload,
  FileText,
  Image,
  File as FileIcon,
  X,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Clock,
  Link,
  Globe,
} from 'lucide-react'

type InputMode = 'file' | 'url'

interface UrlValidation {
  valid: boolean
  type: 'google_docs' | 'google_slides' | 'generic' | ''
  message: string
}

function validateUrl(url: string): UrlValidation {
  if (!url.trim()) return { valid: false, type: '', message: '' }

  try {
    new URL(url)
  } catch {
    return { valid: false, type: '', message: 'Invalid URL' }
  }

  if (/docs\.google\.com\/document\/d\//.test(url))
    return { valid: true, type: 'google_docs', message: 'Google Doc \u2014 will export as PDF' }
  if (/docs\.google\.com\/presentation\/d\//.test(url))
    return { valid: true, type: 'google_slides', message: 'Google Slides \u2014 will export as PDF' }
  return { valid: true, type: 'generic', message: 'Web page \u2014 will capture as screenshot' }
}

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

  const [inputMode, setInputMode] = useState<InputMode>('file')
  const [artifactUrl, setArtifactUrl] = useState('')
  const [urlValidation, setUrlValidation] = useState<UrlValidation | null>(null)

  const [pdfPreview, setPdfPreview] = useState<string | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(false)

  const handleFile = (f: File) => {
    setFile(f)
    setPdfPreview(null)
    setPdfPageCount(0)
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }

  // Render PDF preview when a PDF file is selected
  useEffect(() => {
    if (!file || file.type !== 'application/pdf') {
      setPdfPreview(null)
      setPdfPageCount(0)
      return
    }

    let cancelled = false
    const objectUrl = URL.createObjectURL(file)

    setPdfLoading(true)
    import('../lib/pdfRenderer').then(({ renderAllPdfPages }) => {
      renderAllPdfPages(objectUrl, 1).then((result) => {
        if (!cancelled) {
          setPdfPreview(result.dataUrl)
          setPdfPageCount(result.pageCount)
          setPdfLoading(false)
        }
        URL.revokeObjectURL(objectUrl)
      }).catch(() => {
        if (!cancelled) setPdfLoading(false)
        URL.revokeObjectURL(objectUrl)
      })
    })

    return () => {
      cancelled = true
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleUrlChange = (value: string) => {
    setArtifactUrl(value)
    setUrlValidation(value.trim() ? validateUrl(value) : null)
  }

  const hasArtifact =
    inputMode === 'file' ? !!file : !!(artifactUrl.trim() && urlValidation?.valid)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasArtifact || !title.trim()) return

    const session = await createSession({
      title: title.trim(),
      context: context.trim(),
      artifactFile: inputMode === 'file' ? file! : undefined,
      artifactUrl: inputMode === 'url' ? artifactUrl.trim() : undefined,
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
    localStorage.setItem('2ctake_sender_onboarded', 'true')
    setTimeout(() => setCopied(false), 2000)
  }

  const loadingMessage =
    inputMode === 'url'
      ? urlValidation?.type === 'google_docs' || urlValidation?.type === 'google_slides'
        ? 'Fetching document...'
        : 'Capturing screenshot...'
      : 'Creating session...'

  // Success state
  if (created) {
    return (
      <div className="h-full overflow-y-auto px-6 py-8">
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
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-8">
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
                {val === null ? 'No limit' : `${val / 60}m`}
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

        {/* Artifact input */}
        <div>
          <label className="block text-sm font-medium text-text-primary">
            Artifact
          </label>

          {/* Mode toggle */}
          <div className="mt-1.5 flex rounded-lg border border-border bg-surface-tertiary p-0.5">
            <button
              type="button"
              onClick={() => setInputMode('file')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === 'file'
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === 'url'
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Link className="h-3.5 w-3.5" />
              Paste URL
            </button>
          </div>

          {inputMode === 'file' ? (
            <>
              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-10 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
                >
                  <Upload className="h-8 w-8 text-text-muted" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-text-primary">
                      Drop a file here or click to upload
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      PDF, image, or document (DOCX, PPTX, XLSX, TXT, CSV)
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-tertiary px-4 py-3">
                  {file.type === 'application/pdf' ? (
                    <FileText className="h-5 w-5 text-red-500 shrink-0" />
                  ) : file.type.startsWith('image/') ? (
                    <Image className="h-5 w-5 text-blue-500 shrink-0" />
                  ) : (
                    <FileIcon className="h-5 w-5 text-violet-500 shrink-0" />
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
                      setPdfPreview(null)
                      setPdfPageCount(0)
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

              {file?.type === 'application/pdf' && (
                <div className="mt-3 rounded-xl border border-border overflow-hidden">
                  {pdfLoading ? (
                    <div className="flex items-center justify-center py-8 bg-surface-tertiary">
                      <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
                      <span className="ml-2 text-sm text-text-muted">Rendering preview...</span>
                    </div>
                  ) : pdfPreview ? (
                    <div className="max-h-64 overflow-y-auto bg-surface-tertiary">
                      <img
                        src={pdfPreview}
                        alt="PDF Preview"
                        className="w-full"
                      />
                      <div className="sticky bottom-0 bg-surface-tertiary/90 backdrop-blur-sm px-3 py-1.5 text-xs text-text-muted text-center border-t border-border">
                        {pdfPageCount} page{pdfPageCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.rtf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </>
          ) : (
            <div className="mt-3">
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <input
                  type="url"
                  value={artifactUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="w-full rounded-xl border border-border bg-surface pl-10 pr-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-colors"
                />
              </div>

              {urlValidation && (
                <p className={`mt-2 text-xs ${urlValidation.valid ? 'text-brand-600' : 'text-red-500'}`}>
                  {urlValidation.message}
                </p>
              )}

              <p className="mt-2 text-xs text-text-muted">
                Google Docs, Google Slides, or any public web page
              </p>
            </div>
          )}
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
          disabled={loading || !hasArtifact || !title.trim()}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {loadingMessage}
            </span>
          ) : (
            'Create Session'
          )}
        </button>
      </form>
    </div>
    </div>
  )
}
