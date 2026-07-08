import { DemoFrame } from './DemoFrame'

const WORDS = ['This', 'part', 'really', 'stands', 'out', 'to', 'me…']

/** REC pill + floating webcam PiP + a live transcript streaming in word-by-word. */
export function RecordingDemo() {
  return (
    <DemoFrame dim>
      {/* REC pill */}
      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/80 px-2 py-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse-dot" />
        <span className="text-[8px] font-semibold text-white">REC 0:08</span>
      </div>

      {/* Webcam picture-in-picture */}
      <div
        className="absolute right-2 top-2 h-11 w-11 overflow-hidden rounded-full border-2 border-white/80 shadow-lg"
        style={{
          background: 'linear-gradient(135deg,#FF6EB4,#4f46e5)',
          animation: 'rob-float 4s ease-in-out infinite',
        }}
      >
        {/* faux face silhouette */}
        <div className="absolute left-1/2 top-[34%] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white/85" />
        <div className="absolute -bottom-1 left-1/2 h-4 w-7 -translate-x-1/2 rounded-t-full bg-white/85" />
      </div>

      {/* Live transcript */}
      <div className="absolute inset-x-2 bottom-2 rounded-lg bg-black/80 px-2 py-1.5">
        <div className="flex flex-wrap gap-x-1 gap-y-0.5">
          {WORDS.map((w, i) => (
            <span
              key={i}
              className="text-[8px] font-medium text-white"
              style={{ animation: 'rob-word 4.5s ease infinite', animationDelay: `${i * 0.4}s` }}
            >
              {w}
            </span>
          ))}
        </div>
      </div>
    </DemoFrame>
  )
}
