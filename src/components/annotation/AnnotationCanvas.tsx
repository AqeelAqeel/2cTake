import { useEffect, useRef, useState, useCallback } from 'react'
import { Canvas as FabricCanvas, FabricImage } from 'fabric'
import { Download, FileText, Loader2 } from 'lucide-react'
import { renderAllPdfPages } from '../../lib/pdfRenderer'
import { useAnnotationStore } from '../../state/annotationStore'
import { useAnnotationGestures } from './useAnnotationGestures'
import { useAnnotationTools } from './useAnnotationTools'
import { ZoomIndicator } from './ZoomIndicator'
import { ToolPalette } from './ToolPalette'
import { StickyToggle } from './StickyToggle'

interface AnnotationCanvasProps {
  url: string
  type: 'pdf' | 'image' | 'document'
  className?: string
}

export function AnnotationCanvas({ url, type, className = '' }: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<FabricCanvas | null>(null)
  const initialized = useRef(false)

  const [loading, setLoading] = useState(true)
  const [fitZoom, setFitZoom] = useState(1)
  const [bgDimensions, setBgDimensions] = useState({ width: 0, height: 0 })
  const bgDimensionsRef = useRef({ width: 0, height: 0 })
  const fitZoomRef = useRef(1)

  const {
    activeTool,
    brushSize,
    color,
    eraserMode,
    annotationEnabled,
    zoomLevel,
    setActiveTool,
    setBrushSize,
    setColor,
    setEraserMode,
    setAnnotationEnabled,
    setZoomLevel,
    captureSnapshot,
  } = useAnnotationStore()

  // ---- Initialize Fabric canvas ----
  useEffect(() => {
    if (initialized.current || !canvasElRef.current || !containerRef.current) return
    initialized.current = true

    const container = containerRef.current
    const canvas = new FabricCanvas(canvasElRef.current, {
      selection: false,
      preserveObjectStacking: true,
      allowTouchScrolling: false,
    })

    canvas.setDimensions({
      width: container.clientWidth,
      height: container.clientHeight,
    })

    canvasRef.current = canvas

    return () => {
      canvas.dispose()
      initialized.current = false
      canvasRef.current = null
    }
  }, [])

  // ---- Load artifact as background ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !url) return

    let cancelled = false
    setLoading(true)

    const loadBackground = async () => {
      try {
        let imageUrl = url
        let imgWidth = 0
        let imgHeight = 0

        if (type === 'pdf') {
          const result = await renderAllPdfPages(url)
          imageUrl = result.dataUrl
          imgWidth = result.width
          imgHeight = result.height
        }

        if (cancelled) return

        const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })
        if (cancelled) return

        imgWidth = imgWidth || img.width
        imgHeight = imgHeight || img.height
        setBgDimensions({ width: imgWidth, height: imgHeight })
        bgDimensionsRef.current = { width: imgWidth, height: imgHeight }

        // Calculate fit zoom
        const container = containerRef.current
        if (!container) return
        const containerW = container.clientWidth
        const containerH = container.clientHeight
        // For tall documents (multi-page PDFs), fit to width so content is readable
        const aspectRatio = imgHeight / imgWidth
        const fit = aspectRatio > 1.8
          ? containerW / imgWidth
          : Math.min(containerW / imgWidth, containerH / imgHeight)
        setFitZoom(fit)
        fitZoomRef.current = fit

        // Set image at natural size — viewport zoom handles fitting
        img.scaleToWidth(imgWidth)
        img.scaleToHeight(imgHeight)

        canvas.backgroundImage = img
        // Keep canvas at container dimensions (set during init).
        // Do NOT resize to image dimensions — that causes double-scaling
        // when the resize observer resets CSS back to the container size.

        // Apply fit zoom and center
        canvas.setZoom(fit)
        const vpw = imgWidth * fit
        const vph = imgHeight * fit
        const offsetX = (containerW - vpw) / 2
        const offsetY = (containerH - vph) / 2
        const vpt = canvas.viewportTransform!
        vpt[4] = offsetX
        vpt[5] = offsetY
        canvas.setViewportTransform(vpt)
        setZoomLevel(fit)

        canvas.renderAll()
        setLoading(false)
      } catch (err) {
        console.error('Failed to load artifact:', err)
        setLoading(false)
      }
    }

    loadBackground()
    return () => {
      cancelled = true
    }
  }, [url, type, setZoomLevel])

  // ---- Resize handling ----
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const observer = new ResizeObserver(() => {
      const containerW = container.clientWidth
      const containerH = container.clientHeight
      if (containerW === 0 || containerH === 0) return

      // Update both backing store AND CSS to match container.
      // Using cssOnly causes a mismatch that leads to browser-level
      // double-scaling on top of Fabric's viewport zoom.
      canvas.setDimensions({ width: containerW, height: containerH })

      // Re-center artifact at current zoom to prevent drift on mobile
      const dims = bgDimensionsRef.current
      if (dims.width > 0 && dims.height > 0) {
        // Recalculate fit zoom for new container size
        const aspectRatio = dims.height / dims.width
        const newFit = aspectRatio > 1.8
          ? containerW / dims.width
          : Math.min(containerW / dims.width, containerH / dims.height)
        // If user hasn't manually zoomed (still at fit level), re-fit
        const currentZoom = canvas.getZoom()
        const wasAtFit = Math.abs(currentZoom - fitZoomRef.current) < 0.02
        const zoom = wasAtFit ? newFit : currentZoom

        fitZoomRef.current = newFit
        // Update state only if meaningfully changed to avoid re-render loops
        setFitZoom(prev => Math.abs(prev - newFit) > 0.001 ? newFit : prev)

        if (wasAtFit) canvas.setZoom(zoom)

        const vpw = dims.width * zoom
        const vph = dims.height * zoom
        const offsetX = (containerW - vpw) / 2
        const offsetY = (containerH - vph) / 2
        const vpt = canvas.viewportTransform!
        vpt[4] = offsetX
        vpt[5] = offsetY
        canvas.setViewportTransform(vpt)
        canvas.renderAll()
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ---- Gesture hook ----
  const handleZoomChange = useCallback(
    (zoom: number) => {
      setZoomLevel(zoom)
    },
    [setZoomLevel]
  )

  useAnnotationGestures({
    canvas: canvasRef.current,
    containerRef,
    bgDimensionsRef,
    onZoomChange: handleZoomChange,
    annotationEnabled,
    activeTool,
  })

  // ---- Snapshot capture ----
  const handleSnapshotCapture = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    captureSnapshot(JSON.stringify(canvas.toJSON()))
  }, [captureSnapshot])

  // ---- Tool hook ----
  const { updateBrushForZoom } = useAnnotationTools({
    canvas: canvasRef.current,
    activeTool,
    brushSize,
    color,
    eraserMode,
    annotationEnabled,
    onSnapshotCapture: handleSnapshotCapture,
  })

  // Update brush width when zoom changes
  useEffect(() => {
    updateBrushForZoom()
  }, [zoomLevel, updateBrushForZoom])

  // ---- Zoom preset handler ----
  const handleZoomPreset = useCallback(
    (newZoom: number) => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const containerW = container.clientWidth
      const containerH = container.clientHeight

      canvas.setZoom(newZoom)

      // Center the canvas
      const vpw = bgDimensions.width * newZoom
      const vph = bgDimensions.height * newZoom
      const offsetX = (containerW - vpw) / 2
      const offsetY = (containerH - vph) / 2
      const vpt = canvas.viewportTransform!
      vpt[4] = offsetX
      vpt[5] = offsetY
      canvas.setViewportTransform(vpt)
      canvas.renderAll()

      setZoomLevel(newZoom)
    },
    [bgDimensions, setZoomLevel]
  )

  // ---- Document type: fallback (no canvas) ----
  if (type === 'document') {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface-tertiary p-8 ${className}`}>
        <FileText className="h-12 w-12 text-text-muted" />
        <p className="text-sm text-text-secondary text-center">
          Document markup is not yet supported. Download the file to review it.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-tertiary transition-colors"
        >
          <Download className="h-4 w-4" />
          Download file
        </a>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-border bg-surface-tertiary ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-surface-tertiary/80">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      )}

      {/* Fabric canvas */}
      <canvas ref={canvasElRef} />

      {/* UI overlays */}
      <ZoomIndicator
        zoom={zoomLevel}
        onZoomChange={handleZoomPreset}
        fitZoom={fitZoom}
      />

      <ToolPalette
        activeTool={activeTool}
        brushSize={brushSize}
        color={color}
        eraserMode={eraserMode}
        visible={annotationEnabled}
        onSelectTool={setActiveTool}
        onSelectSize={setBrushSize}
        onSelectColor={setColor}
        onSelectEraserMode={setEraserMode}
      />

      <StickyToggle
        enabled={annotationEnabled}
        onToggle={() => setAnnotationEnabled(!annotationEnabled)}
      />
    </div>
  )
}
