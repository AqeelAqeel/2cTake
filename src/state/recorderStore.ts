import { create } from 'zustand'
import type { RecorderState } from '../types'

interface RecorderStore {
  state: RecorderState
  mediaStream: MediaStream | null
  recordedBlob: Blob | null
  duration: number
  uploadProgress: number
  error: string | null

  setState: (state: RecorderState) => void
  setMediaStream: (stream: MediaStream | null) => void
  setRecordedBlob: (blob: Blob | null) => void
  setDuration: (duration: number) => void
  setUploadProgress: (progress: number) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useRecorderStore = create<RecorderStore>((set) => ({
  state: 'idle',
  mediaStream: null,
  recordedBlob: null,
  duration: 0,
  uploadProgress: 0,
  error: null,

  setState: (state) => set({ state }),
  setMediaStream: (mediaStream) => set({ mediaStream }),
  setRecordedBlob: (recordedBlob) => set({ recordedBlob }),
  setDuration: (duration) => set({ duration }),
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  setError: (error) => set({ error, state: error ? 'error' : 'idle' }),
  reset: () =>
    set({
      state: 'idle',
      recordedBlob: null,
      duration: 0,
      uploadProgress: 0,
      error: null,
    }),
}))
