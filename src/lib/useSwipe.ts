import { useRef, useCallback } from 'react'

interface SwipeConfig {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
}: SwipeConfig) {
  const startX = useRef(0)
  const startY = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diffX = e.changedTouches[0].clientX - startX.current
      const diffY = e.changedTouches[0].clientY - startY.current

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
        if (diffX < 0) onSwipeLeft?.()
        else onSwipeRight?.()
      }
    },
    [onSwipeLeft, onSwipeRight, threshold]
  )

  return { onTouchStart, onTouchEnd }
}
