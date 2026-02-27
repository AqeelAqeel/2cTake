export interface CompositeStreamOptions {
  lowerCanvas: HTMLCanvasElement
  upperCanvas: HTMLCanvasElement
  webcamStream: MediaStream
  fps?: number
  pipScale?: number
  pipPadding?: number
}

export interface CompositeStreamResult {
  stream: MediaStream
  destroy: () => void
}

export function createCompositeStream(options: CompositeStreamOptions): CompositeStreamResult {
  const {
    lowerCanvas,
    upperCanvas,
    webcamStream,
    fps = 30,
    pipScale = 0.18,
    pipPadding = 12,
  } = options

  const compositeCanvas = document.createElement('canvas')
  const ctx = compositeCanvas.getContext('2d')!

  // Hidden video element to pull webcam frames from
  const webcamVideo = document.createElement('video')
  webcamVideo.srcObject = webcamStream
  webcamVideo.muted = true
  webcamVideo.playsInline = true
  webcamVideo.play()

  const hasWebcamVideo = webcamStream.getVideoTracks().length > 0

  let rafId: number | null = null
  let destroyed = false

  // Lock dimensions on first meaningful frame to prevent resolution changes mid-recording
  let fixedW = 0
  let fixedH = 0

  function draw() {
    if (destroyed) return

    const sourceW = lowerCanvas.width
    const sourceH = lowerCanvas.height

    // Lock dimensions on first frame with actual content
    if (fixedW === 0 && sourceW > 0 && sourceH > 0) {
      fixedW = sourceW
      fixedH = sourceH
      compositeCanvas.width = fixedW
      compositeCanvas.height = fixedH
    }

    if (fixedW === 0) {
      rafId = requestAnimationFrame(draw)
      return
    }

    ctx.clearRect(0, 0, fixedW, fixedH)

    // Scale source canvas to fit fixed dimensions (handles resize during recording)
    const scale = Math.min(fixedW / sourceW, fixedH / sourceH)
    const dx = (fixedW - sourceW * scale) / 2
    const dy = (fixedH - sourceH * scale) / 2

    ctx.save()
    ctx.translate(dx, dy)
    ctx.scale(scale, scale)
    // Draw background + committed annotations
    ctx.drawImage(lowerCanvas, 0, 0)
    // Draw in-progress brush strokes
    ctx.drawImage(upperCanvas, 0, 0)
    ctx.restore()

    // Draw webcam PiP in bottom-right corner
    if (hasWebcamVideo && webcamVideo.readyState >= webcamVideo.HAVE_CURRENT_DATA) {
      const pipW = Math.round(fixedW * pipScale)
      const pipH = Math.round(pipW * (3 / 4))
      const pipX = fixedW - pipW - pipPadding
      const pipY = fixedH - pipH - pipPadding
      const radius = 12

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(pipX, pipY, pipW, pipH, radius)
      ctx.clip()

      // Mirror horizontally to match CSS -scale-x-100
      ctx.translate(pipX + pipW, pipY)
      ctx.scale(-1, 1)
      ctx.drawImage(webcamVideo, 0, 0, pipW, pipH)
      ctx.restore()

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(pipX, pipY, pipW, pipH, radius)
      ctx.stroke()
    }

    rafId = requestAnimationFrame(draw)
  }

  rafId = requestAnimationFrame(draw)

  // Capture video stream from composite canvas
  const videoStream = compositeCanvas.captureStream(fps)

  // Combine composite video + webcam audio
  const combinedStream = new MediaStream()
  for (const track of videoStream.getVideoTracks()) {
    combinedStream.addTrack(track)
  }
  for (const track of webcamStream.getAudioTracks()) {
    combinedStream.addTrack(track)
  }

  function destroy() {
    destroyed = true
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    webcamVideo.pause()
    webcamVideo.srcObject = null
    // Stop only composite video tracks, not webcam tracks (owned by recorderStore)
    for (const track of videoStream.getVideoTracks()) {
      track.stop()
    }
  }

  return { stream: combinedStream, destroy }
}
