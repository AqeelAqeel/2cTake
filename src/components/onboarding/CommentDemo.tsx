import { MessageSquarePlus, Mic } from 'lucide-react'
import { DemoFrame } from './DemoFrame'

/** A pin drops onto the doc, then a comment composer opens and "types" itself. */
export function CommentDemo() {
  return (
    <DemoFrame>
      {/* Comment-mode toggle (top-right, mirrors the real UI) */}
      <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-goblin-pink text-white shadow-md">
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </div>

      {/* Dropped pin */}
      <div
        className="absolute left-[30%] top-[42%]"
        style={{ animation: 'rob-pin-drop 5s ease-in-out infinite' }}
      >
        <span className="flex h-5 w-5 -rotate-45 items-center justify-center rounded-full rounded-bl-none bg-goblin-pink text-white shadow-lg">
          <span className="rotate-45 text-[9px] font-bold">1</span>
        </span>
      </div>

      {/* Composer popover */}
      <div
        className="absolute left-[38%] top-[48%] w-[48%] rounded-lg border border-border bg-surface p-2 shadow-xl"
        style={{ animation: 'rob-popover-in 5s ease-in-out infinite' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-semibold text-text-secondary">Add comment</span>
          <span className="text-[8px] text-timestamp">0:12</span>
        </div>
        <div className="mt-1.5 overflow-hidden rounded-full">
          <div
            className="h-1.5 rounded-full bg-text-muted/40"
            style={{ animation: 'rob-type 5s ease-in-out infinite' }}
          />
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="flex items-center gap-0.5 rounded-md bg-surface-tertiary px-1.5 py-0.5 text-[7px] font-medium text-text-secondary">
            <Mic className="h-2 w-2" /> Speak
          </span>
          <span className="ml-auto rounded-md bg-goblin-green px-2 py-0.5 text-[7px] font-semibold text-white">
            Save
          </span>
        </div>
      </div>
    </DemoFrame>
  )
}
