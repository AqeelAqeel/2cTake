import { useEffect, useRef } from 'react'
import { useGesture } from '@use-gesture/react'
import type { Canvas } from 'fabric'
import { Point } from 'fabric'

interface UseAnnotationGesturesConfig {
  canvas: Canvas | null
  containerRef: React.RefObject<HTMLDivElement | null>
  onZoomChange: (zoom: number) => void
  minZoom?: number
  maxZoom?: number
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

export function useAnnotationGestures({
  canvas,
  containerRef,
  onZoomChange,
  minZoom = 0.25,
  maxZoom = 4,
}: UseAnnotationGesturesConfig) {
  const lastZoomRef = useRef(1)

  // Sync initial zoom
  useEffect(() => {
    if (canvas) lastZoomRef.current = canvas.getZoom()
  }, [canvas])

  useGesture(
    {
      onPinch: ({ offset: [scale], origin: [ox, oy], event }) => {
        event?.preventDefault()
        if (!canvas || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const zoom = clamp(scale, minZoom, maxZoom)
        canvas.zoomToPoint(new Point(ox - rect.left, oy - rect.top), zoom)
        lastZoomRef.current = zoom
        onZoomChange(zoom)
      },
      onWheel: ({ delta: [, dy], event }) => {
        event.preventDefault()
        if (!canvas || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const factor = dy > 0 ? 0.95 : 1.05
        const newZoom = clamp(canvas.getZoom() * factor, minZoom, maxZoom)
        const pointer = new Point(
          (event as WheelEvent).clientX - rect.left,
          (event as WheelEvent).clientY - rect.top
        )
        canvas.zoomToPoint(pointer, newZoom)
        lastZoomRef.current = newZoom
        onZoomChange(newZoom)
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
      pinch: {
        scaleBounds: { min: minZoom, max: maxZoom },
        from: () => [lastZoomRef.current, 0],
      },
    }
  )

  return { lastZoomRef }
}
