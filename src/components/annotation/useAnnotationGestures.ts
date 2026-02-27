import { useEffect, useRef } from 'react'
import { useGesture } from '@use-gesture/react'
import type { Canvas } from 'fabric'
import { Point } from 'fabric'

interface UseAnnotationGesturesConfig {
  canvas: Canvas | null
  containerRef: React.RefObject<HTMLDivElement | null>
  bgDimensionsRef: React.RefObject<{ width: number; height: number }>
  onZoomChange: (zoom: number) => void
  annotationEnabled: boolean
  activeTool: string
  minZoom?: number
  maxZoom?: number
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/**
 * Clamp viewport so the artifact can't be panned out of view.
 * - If artifact (at zoom) is smaller than container → center it on that axis.
 * - If larger → keep edges from pulling inward past container edges.
 */
function clampViewport(
  canvas: Canvas,
  container: HTMLDivElement,
  dims: { width: number; height: number }
) {
  if (dims.width === 0 || dims.height === 0) return

  const zoom = canvas.getZoom()
  const artW = dims.width * zoom
  const artH = dims.height * zoom
  const cW = container.clientWidth
  const cH = container.clientHeight
  const vpt = canvas.viewportTransform!

  if (artW <= cW) {
    // Center horizontally
    vpt[4] = (cW - artW) / 2
  } else {
    // Left edge can't go right of container left (vpt[4] <= 0)
    // Right edge can't go left of container right (vpt[4] >= cW - artW)
    vpt[4] = clamp(vpt[4], cW - artW, 0)
  }

  if (artH <= cH) {
    // Center vertically
    vpt[5] = (cH - artH) / 2
  } else {
    // Top edge can't go below container top (vpt[5] <= 0)
    // Bottom edge can't go above container bottom (vpt[5] >= cH - artH)
    vpt[5] = clamp(vpt[5], cH - artH, 0)
  }

  canvas.setViewportTransform(vpt)
}

export function useAnnotationGestures({
  canvas,
  containerRef,
  bgDimensionsRef,
  onZoomChange,
  annotationEnabled,
  activeTool,
  minZoom = 0.25,
  maxZoom = 4,
}: UseAnnotationGesturesConfig) {
  const lastZoomRef = useRef(1)
  const isPinching = useRef(false)
  // Track latest values in refs so gesture callbacks see current state
  const annotationEnabledRef = useRef(annotationEnabled)
  const activeToolRef = useRef(activeTool)
  annotationEnabledRef.current = annotationEnabled
  activeToolRef.current = activeTool

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
        clampViewport(canvas, containerRef.current, bgDimensionsRef.current)
        lastZoomRef.current = zoom
        onZoomChange(zoom)
      },
      onPinchEnd: () => {
        isPinching.current = false
      },
      onDrag: ({ delta: [dx, dy], touches, event, pinching }) => {
        if (!canvas || !containerRef.current || pinching || isPinching.current) return

        // Two-finger drag always pans (touch)
        if (touches > 1) {
          event?.preventDefault()
          canvas.relativePan(new Point(dx, dy))
          clampViewport(canvas, containerRef.current, bgDimensionsRef.current)
          canvas.renderAll()
          return
        }

        // Single-finger / mouse drag pans when annotations are off
        // or when using select tool on empty canvas area
        const canPan =
          !annotationEnabledRef.current ||
          activeToolRef.current === 'select'

        if (canPan && touches <= 1) {
          event?.preventDefault()
          canvas.relativePan(new Point(dx, dy))
          clampViewport(canvas, containerRef.current, bgDimensionsRef.current)
          canvas.renderAll()
        }
      },
      onWheel: ({ delta: [dx, dy], event }) => {
        const we = event as WheelEvent
        if (!canvas || !containerRef.current) return

        // Ctrl/Cmd + scroll = zoom (standard canvas behavior)
        // Trackpad pinch generates ctrlKey wheel events, so pinch-to-zoom still works
        if (we.ctrlKey || we.metaKey) {
          event.preventDefault()
          if (Math.abs(dy) < 0.5) return
          const rect = containerRef.current.getBoundingClientRect()
          const factor = dy > 0 ? 0.95 : 1.05
          const newZoom = clamp(canvas.getZoom() * factor, minZoom, maxZoom)
          const pointer = new Point(
            we.clientX - rect.left,
            we.clientY - rect.top
          )
          canvas.zoomToPoint(pointer, newZoom)
          clampViewport(canvas, containerRef.current, bgDimensionsRef.current)
          lastZoomRef.current = newZoom
          onZoomChange(newZoom)
          return
        }

        // Regular scroll = pan the document
        event.preventDefault()
        canvas.relativePan(new Point(-dx, -dy))
        clampViewport(canvas, containerRef.current, bgDimensionsRef.current)
        canvas.renderAll()
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
