import { RotateCcw, Pause, Check, Play } from 'lucide-react'
import { DemoFrame } from './DemoFrame'

/** The recorder control bar: pause, then preview with re-record / send. */
export function ControlsDemo() {
  return (
    <DemoFrame dim>
      {/* PAUSED badge */}
      <div
        className="absolute left-1/2 top-6 rounded-full bg-black/80 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-wider text-white"
        style={{ animation: 'rob-paused 5s ease-in-out infinite' }}
      >
        Paused
      </div>

      {/* Preview play button */}
      <div className="absolute left-1/2 top-[40%] -translate-x-1/2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-text-primary shadow-lg">
          <Play className="h-4 w-4 translate-x-[1px] fill-current" />
        </span>
      </div>

      {/* Control bar */}
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-2 rounded-lg bg-black/80 px-2 py-1.5">
        <span className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[8px] font-medium text-white/80">
          <RotateCcw className="h-2.5 w-2.5" /> Re-record
        </span>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white"
          style={{ animation: 'rob-press 5s ease-in-out infinite' }}
        >
          <Pause className="h-3 w-3 fill-current" />
        </span>
        <span className="flex items-center gap-1 rounded-md bg-goblin-green px-2 py-1 text-[8px] font-semibold text-white">
          <Check className="h-2.5 w-2.5" /> Send take
        </span>
      </div>
    </DemoFrame>
  )
}
