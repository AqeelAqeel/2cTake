import { Download, FileText } from 'lucide-react'

interface ArtifactViewerProps {
  url: string
  type: 'pdf' | 'image' | 'document'
  className?: string
}

export function ArtifactViewer({ url, type, className = '' }: ArtifactViewerProps) {
  if (type === 'pdf') {
    return (
      <iframe
        src={`${url}#toolbar=0`}
        className={`w-full rounded-lg border border-border ${className}`}
        style={{ minHeight: '500px' }}
        title="Artifact PDF"
      />
    )
  }

  if (type === 'document') {
    // Try Office Online viewer for docx/pptx/xlsx, fall back to download link
    const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    const ext = url.split('.').pop()?.toLowerCase() ?? ''
    const officeExts = ['docx', 'pptx', 'xlsx', 'doc', 'ppt', 'xls']
    const canPreview = officeExts.includes(ext)

    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        {canPreview && (
          <iframe
            src={officeViewerUrl}
            className="w-full rounded-lg border border-border"
            style={{ minHeight: '500px' }}
            title="Artifact Document"
          />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
        >
          <Download className="h-4 w-4" />
          Download file
        </a>
        {!canPreview && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-tertiary px-6 py-10">
            <FileText className="h-10 w-10 text-text-muted" />
            <p className="text-sm text-text-secondary">
              Preview not available — use the download link above to view this file.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center rounded-lg border border-border bg-surface-tertiary overflow-hidden ${className}`}>
      <img
        src={url}
        alt="Artifact"
        className="max-h-full max-w-full object-contain"
      />
    </div>
  )
}
