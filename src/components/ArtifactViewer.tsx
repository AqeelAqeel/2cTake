interface ArtifactViewerProps {
  url: string
  type: 'pdf' | 'image'
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
