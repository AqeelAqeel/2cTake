import { useState } from 'react'
import { Camera, Mic, AlertTriangle, RefreshCw } from 'lucide-react'

interface PermissionsGateProps {
  onGranted: (stream: MediaStream) => void
}

export function PermissionsGate({ onGranted }: PermissionsGateProps) {
  const [status, setStatus] = useState<'prompt' | 'requesting' | 'denied'>('prompt')
  const [error, setError] = useState<string | null>(null)

  const requestPermissions = async () => {
    setStatus('requesting')
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      })
      onGranted(stream)
    } catch (err) {
      setStatus('denied')
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError(
          'Permission denied. Please allow camera and microphone access in your browser settings, then try again.'
        )
      } else {
        setError('Could not access camera or microphone. Please check your device.')
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="flex gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <Camera className="h-7 w-7 text-brand-600" />
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <Mic className="h-7 w-7 text-brand-600" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold text-text-primary">
          Camera & microphone access
        </h3>
        <p className="mt-1 text-sm text-text-secondary max-w-sm">
          We need access to record your feedback. Your recording stays private
          and is only shared with the session creator.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 max-w-sm">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        onClick={requestPermissions}
        disabled={status === 'requesting'}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {status === 'denied' && <RefreshCw className="h-4 w-4" />}
        {status === 'requesting' ? 'Requesting...' : status === 'denied' ? 'Try again' : 'Allow access'}
      </button>
    </div>
  )
}
