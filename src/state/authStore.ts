import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        set({
          user: {
            id: session.user.id,
            email: session.user.email ?? '',
            name: session.user.user_metadata?.full_name ?? null,
            avatar_url: session.user.user_metadata?.avatar_url ?? null,
          },
          loading: false,
        })
      } else {
        set({ user: null, loading: false })
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          set({
            user: {
              id: session.user.id,
              email: session.user.email ?? '',
              name: session.user.user_metadata?.full_name ?? null,
              avatar_url: session.user.user_metadata?.avatar_url ?? null,
            },
          })
        } else {
          set({ user: null })
        }
      })
    } catch {
      set({ loading: false, error: 'Failed to initialize auth' })
    }
  },

  signInWithGoogle: async () => {
    set({ error: null })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) set({ error: error.message })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  },
}))
