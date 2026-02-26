import { PenTool } from 'lucide-react'

interface StickyToggleProps {
  enabled: boolean
  onToggle: () => void
}

export function StickyToggle({ enabled, onToggle }: StickyToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`absolute top-3 right-3 z-30 rounded-full p-2.5 shadow-lg border transition-all duration-200 ${
        enabled
          ? 'bg-brand-600 border-brand-600 text-white hover:bg-brand-700'
          : 'bg-surface/90 backdrop-blur border-border text-text-muted hover:text-text-primary hover:bg-surface-tertiary'
      }`}
      title={enabled ? 'Disable markup tools' : 'Enable markup tools'}
    >
      <PenTool className="h-4 w-4" />
    </button>
  )
}
