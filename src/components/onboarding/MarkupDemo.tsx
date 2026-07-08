import { Highlighter, Pen, Circle } from 'lucide-react'
import { DemoFrame } from './DemoFrame'

/** A marker highlight wiping across a line while a tool cursor rides its edge. */
export function MarkupDemo() {
  return (
    <DemoFrame>
      {/* Tool palette */}
      <div className="absolute left-2 top-2 flex flex-col gap-1 rounded-full bg-surface/95 p-1 shadow-md ring-1 ring-border">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-goblin-pink text-white">
          <Highlighter className="h-3.5 w-3.5" />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-tertiary text-text-muted">
          <Pen className="h-3 w-3" />
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-tertiary text-text-muted">
          <Circle className="h-3 w-3" />
        </span>
      </div>

      {/* Highlight wipe over a line of text */}
      <div className="absolute left-[28%] right-[12%] top-[54%]">
        <div
          className="h-3 origin-left rounded-sm bg-goblin-pink/30"
          style={{ animation: 'rob-marker-wipe 4.5s ease-in-out infinite' }}
        />
        <span
          className="absolute -top-1"
          style={{ animation: 'rob-marker-cursor 4.5s ease-in-out infinite' }}
        >
          <Highlighter className="h-4 w-4 -rotate-90 text-goblin-pink drop-shadow" />
        </span>
      </div>
    </DemoFrame>
  )
}
