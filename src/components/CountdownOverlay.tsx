import { useState, useEffect } from 'react'

interface CountdownOverlayProps {
  onFinish: () => void
}

export function CountdownOverlay({ onFinish }: CountdownOverlayProps) {
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (count <= 0) {
      onFinish()
      return
    }
    const timer = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [count, onFinish])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative flex flex-col items-center gap-8">
        {count > 0 && (
          <span
            key={count}
            className="text-9xl font-black text-white animate-countdown-pop drop-shadow-lg"
          >
            {count}
          </span>
        )}
        <p className="text-lg font-semibold text-white/90 tracking-wide">
          No time limit! Just speak! Scroll! Zoom!
        </p>
      </div>
    </div>
  )
}
