import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Session, Recording, Transcript } from '../types'

interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  recordings: Recording[]
  transcripts: Record<string, Transcript>
  loading: boolean
  error: string | null

  fetchSessions: () => Promise<void>
  fetchSession: (id: string) => Promise<void>
  fetchSessionByToken: (token: string) => Promise<Session | null>
  createSession: (data: {
    title: string
    context: string
    artifactFile: File
    maxDuration: number | null
  }) => Promise<Session | null>
  updateSession: (
    id: string,
    updates: { title?: string; context?: string | null }
  ) => Promise<string | null>
  fetchRecordings: (sessionId: string) => Promise<void>
  fetchTranscript: (recordingId: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSession: null,
  recordings: [],
  transcripts: {},
  loading: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('sessions')
      .select('*, recordings(count)')
      .order('created_at', { ascending: false })

    if (error) {
      set({ error: error.message, loading: false })
    } else {
      const sessions = (data ?? []).map(
        ({ recordings: counts, ...rest }: any) => ({
          ...rest,
          recording_count: counts?.[0]?.count ?? 0,
        })
      )
      set({ sessions, loading: false })
    }
  },

  fetchSession: async (id: string) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      set({ error: error.message, loading: false })
    } else {
      set({ currentSession: data, loading: false })
    }
  },

  fetchSessionByToken: async (token: string) => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('share_token', token)
      .single()

    if (error) return null
    return data as Session
  },

  createSession: async ({ title, context, artifactFile, maxDuration }) => {
    set({ loading: true, error: null })

    // Get the authenticated user's ID for owner_id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      set({ error: 'You must be signed in to create a session', loading: false })
      return null
    }

    const fileExt = artifactFile.name.split('.').pop()?.toLowerCase()
    const artifactType = fileExt === 'pdf' ? 'pdf' : 'image'
    const filePath = `${crypto.randomUUID()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('artifacts')
      .upload(filePath, artifactFile)

    if (uploadError) {
      set({ error: `Upload failed: ${uploadError.message}`, loading: false })
      return null
    }

    const { data: urlData } = supabase.storage
      .from('artifacts')
      .getPublicUrl(filePath)

    const shareToken = crypto.randomUUID().replace(/-/g, '').slice(0, 12)

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        owner_id: user.id,
        title,
        context,
        artifact_url: urlData.publicUrl,
        artifact_type: artifactType,
        share_token: shareToken,
        max_duration: maxDuration,
      })
      .select()
      .single()

    if (error) {
      set({ error: error.message, loading: false })
      return null
    }

    const session = { ...data, recording_count: 0 } as Session
    set((state) => ({
      sessions: [session, ...state.sessions],
      loading: false,
    }))
    return session
  },

  updateSession: async (id, updates) => {
    const { error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', id)

    if (error) return error.message

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
      currentSession:
        state.currentSession?.id === id
          ? { ...state.currentSession, ...updates }
          : state.currentSession,
    }))
    return null
  },

  fetchRecordings: async (sessionId: string) => {
    const { data, error } = await supabase
      .from('recordings')
      .select('*, reviewer:reviewers(*)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      // video_url stores a storage path — resolve to signed URLs
      const withSignedUrls = await Promise.all(
        (data as Recording[]).map(async (rec) => {
          const { data: signedData } = await supabase.storage
            .from('recordings')
            .createSignedUrl(rec.video_url, 3600) // 1 hour expiry
          return {
            ...rec,
            video_url: signedData?.signedUrl ?? rec.video_url,
          }
        })
      )
      set({ recordings: withSignedUrls })
    }
  },

  fetchTranscript: async (recordingId: string) => {
    const existing = get().transcripts[recordingId]
    if (existing?.status === 'complete') return

    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('recording_id', recordingId)
      .single()

    if (!error && data) {
      set((state) => ({
        transcripts: {
          ...state.transcripts,
          [recordingId]: data as Transcript,
        },
      }))
    }
  },

  deleteSession: async (id: string) => {
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (!error) {
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
      }))
    }
  },
}))
