import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

interface UploadProgressProps {
  progress: number
  status: 'uploading' | 'success' | 'error'
  onRetry?: () => void
}

export function UploadProgress({ progress, status, onRetry }: UploadProgressProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      {status === 'uploading' && (
        <>
          <Upload className="h-10 w-10 text-brand-500 animate-pulse" />
          <p className="text-sm font-medium text-text-secondary">
            Uploading your feedback...
          </p>
          <div className="w-64 h-2 rounded-full bg-surface-tertiary overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-text-muted">{progress}%</span>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle className="h-10 w-10 text-emerald-500" />
          <p className="text-sm font-medium text-text-primary">
            Feedback sent successfully!
          </p>
          <p className="text-xs text-text-muted">
            You can close this tab now.
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-10 w-10 text-red-500" />
          <p className="text-sm font-medium text-text-primary">
            Upload failed
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Try again
            </button>
          )}
        </>
      )}
    </div>
  )
}
