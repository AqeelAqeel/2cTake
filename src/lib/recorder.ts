const MIME_TYPE = 'video/webm;codecs=vp9,opus'
const FALLBACK_MIME = 'video/webm'

export class RecordingEngine {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startTime = 0
  private pausedDuration = 0
  private pauseStart = 0
  private timerInterval: ReturnType<typeof setInterval> | null = null

  maxDuration: number | null = null

  onDurationUpdate?: (seconds: number) => void
  onStop?: (blob: Blob, duration: number) => void
  onError?: (error: string) => void

  async requestPermissions(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      })
      return stream
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera and microphone access is required to record feedback.'
          : 'Could not access camera or microphone.'
      throw new Error(msg)
    }
  }

  start(stream: MediaStream) {
    this.chunks = []
    this.pausedDuration = 0

    const mimeType = MediaRecorder.isTypeSupported(MIME_TYPE)
      ? MIME_TYPE
      : FALLBACK_MIME

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    })

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType })
      const duration = this.getElapsed()
      this.stopTimer()
      this.onStop?.(blob, duration)
    }

    this.mediaRecorder.onerror = () => {
      this.onError?.('Recording failed unexpectedly.')
    }

    this.mediaRecorder.start(1000) // 1s chunks
    this.startTime = Date.now()
    this.startTimer()
  }

  pause() {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.pause()
      this.pauseStart = Date.now()
      this.stopTimer()
    }
  }

  resume() {
    if (this.mediaRecorder?.state === 'paused') {
      this.pausedDuration += Date.now() - this.pauseStart
      this.mediaRecorder.resume()
      this.startTimer()
    }
  }

  stop() {
    if (
      this.mediaRecorder &&
      this.mediaRecorder.state !== 'inactive'
    ) {
      this.mediaRecorder.stop()
    }
  }

  destroy(stream: MediaStream | null) {
    this.stop()
    this.stopTimer()
    stream?.getTracks().forEach((t) => t.stop())
  }

  private getElapsed(): number {
    const now = Date.now()
    const paused =
      this.mediaRecorder?.state === 'paused'
        ? now - this.pauseStart
        : 0
    return Math.floor((now - this.startTime - this.pausedDuration - paused) / 1000)
  }

  private startTimer() {
    this.timerInterval = setInterval(() => {
      const elapsed = this.getElapsed()
      this.onDurationUpdate?.(elapsed)

      if (this.maxDuration && elapsed >= this.maxDuration) {
        this.stop()
      }
    }, 500)
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }
}
