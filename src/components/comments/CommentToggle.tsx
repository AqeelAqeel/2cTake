import { MessageSquarePlus } from 'lucide-react'

interface CommentToggleProps {
  enabled: boolean
  count: number
  onToggle: () => void
}

/**
 * Toggles "comment mode" on the artifact. Sits just below the markup toggle.
 * Shows a badge with the number of comments dropped so far this take.
 */
export function CommentToggle({ enabled, count, onToggle }: CommentToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`absolute top-16 right-3 z-30 rounded-full p-2.5 shadow-lg border transition-all duration-200 ${
        enabled
          ? 'bg-goblin-pink border-goblin-pink text-white hover:brightness-110'
          : 'bg-surface/90 backdrop-blur border-border text-text-muted hover:text-text-primary hover:bg-surface-tertiary'
      }`}
      title={enabled ? 'Done commenting' : 'Add a comment'}
    >
      <MessageSquarePlus className="h-4 w-4" />
      {count > 0 && (
        <span
          className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
            enabled ? 'bg-white text-goblin-pink' : 'bg-goblin-pink text-white'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
