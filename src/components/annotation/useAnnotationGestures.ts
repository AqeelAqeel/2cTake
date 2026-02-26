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
  const isPinching = useRef(false)

  // Sync initial zoom
  useEffect(() => {
    if (canvas) lastZoomRef.current = canvas.getZoom()
  }, [canvas])

  useGesture(
    {
      onPinchStart: () => {
        isPinching.current = true
      },
      onPinch: ({ offset: [scale], origin: [ox, oy], event }) => {
        event?.preventDefault()
        if (!canvas || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const zoom = clamp(scale, minZoom, maxZoom)
        canvas.zoomToPoint(new Point(ox - rect.left, oy - rect.top), zoom)
        lastZoomRef.current = zoom
        onZoomChange(zoom)
      },
      onPinchEnd: () => {
        isPinching.current = false
      },
      onDrag: ({ delta: [dx, dy], touches, event, pinching }) => {
        // Only pan with two-finger drag (not during pinch)
        if (!canvas || pinching || isPinching.current) return
        if (touches > 1) {
          event?.preventDefault()
          canvas.relativePan(new Point(dx, dy))
          canvas.renderAll()
        }
      },
      onWheel: ({ delta: [, dy], event }) => {
        const we = event as WheelEvent
        // Only zoom with Ctrl/Cmd held (standard canvas behavior)
        // Trackpad pinch generates ctrlKey wheel events, so pinch-to-zoom still works
        if (!we.ctrlKey && !we.metaKey) return
        event.preventDefault()
        if (!canvas || !containerRef.current) return
        // Ignore tiny deltas (noise / momentum tail)
        if (Math.abs(dy) < 0.5) return
        const rect = containerRef.current.getBoundingClientRect()
        const factor = dy > 0 ? 0.95 : 1.05
        const newZoom = clamp(canvas.getZoom() * factor, minZoom, maxZoom)
        const pointer = new Point(
          we.clientX - rect.left,
          we.clientY - rect.top
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
      drag: {
        filterTaps: true,
        pointer: { touch: true },
      },
    }
  )

  return { lastZoomRef }
}
