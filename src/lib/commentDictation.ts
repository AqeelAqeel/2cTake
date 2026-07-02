// Inline voice dictation for reviewer comments.
//
// The hard constraint: dictating a comment must NOT interrupt the in-progress
// webcam recording or grab the mic a second time. So instead of calling
// getUserMedia again, we wrap the *existing* recording stream's audio tracks in
// a fresh MediaStream and point a short-lived MediaRecorder at them. The tracks
// are shared, not cloned-and-stopped — the main recording keeps reading them.
//
// On top of the audio clip (which is what gets stored + sent to Whisper), we
// best-effort run the browser's SpeechRecognition API to populate the comment
// text live as the reviewer speaks. It's a progressive enhancement: where it's
// unavailable or flaky, the audio clip + async Whisper transcript still work.

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export interface DictationHandle {
  /** Stop, returning the recorded clip. */
  stop: () => Promise<{ blob: Blob; durationMs: number }>
  /** Abort without producing a clip (also stops live transcription). */
  cancel: () => void
  /** True if we attached to a real audio track. */
  active: boolean
}

function pickAudioMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c
    }
  }
  return ''
}

/**
 * Begin dictating a comment off the existing recording stream.
 *
 * @param stream      the live recording MediaStream (recorderStore.mediaStream)
 * @param onPartial   called with the running transcript as the user speaks
 *                    (only fires where SpeechRecognition is available)
 */
export function startDictation(
  stream: MediaStream | null,
  onPartial?: (text: string) => void
): DictationHandle {
  const audioTracks = stream?.getAudioTracks().filter((t) => t.readyState === 'live') ?? []

  if (audioTracks.length === 0) {
    return {
      active: false,
      stop: async () => ({ blob: new Blob(), durationMs: 0 }),
      cancel: () => {},
    }
  }

  // Share the tracks — do NOT stop them on teardown; they belong to the recording.
  const clipStream = new MediaStream(audioTracks)
  const mime = pickAudioMime()
  const recorder = new MediaRecorder(
    clipStream,
    mime ? { mimeType: mime } : undefined
  )
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  const startedAt = performance.now()
  recorder.start()

  // ── Optional live transcription via SpeechRecognition ──────────────────────
  let recognition: SpeechRecognitionLike | null = null
  let finalText = ''
  if (onPartial) {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (Ctor) {
      try {
        recognition = new Ctor()
        recognition.lang = navigator.language || 'en-US'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.onresult = (event) => {
          const e = event as SpeechRecognitionEventLike
          let interim = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i]
            const transcript = res[0]?.transcript ?? ''
            if (res.isFinal) finalText += transcript
            else interim += transcript
          }
          onPartial((finalText + interim).trim())
        }
        recognition.onerror = () => {
          /* best-effort — the audio clip + Whisper still cover us */
        }
        recognition.start()
      } catch {
        recognition = null
      }
    }
  }

  const stopRecognition = () => {
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      /* ignore */
    }
    recognition = null
  }

  return {
    active: true,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stopRecognition()
          const blob = new Blob(chunks, { type: mime || 'audio/webm' })
          resolve({ blob, durationMs: Math.round(performance.now() - startedAt) })
        }
        if (recorder.state !== 'inactive') recorder.stop()
        else {
          stopRecognition()
          resolve({ blob: new Blob(chunks, { type: mime || 'audio/webm' }), durationMs: 0 })
        }
      }),
    cancel: () => {
      stopRecognition()
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
    },
  }
}
