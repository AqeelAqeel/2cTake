import { create } from 'zustand'
import posthog from 'posthog-js'
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
        const user = {
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.user_metadata?.full_name ?? null,
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
        }
        set({ user, loading: false })
        posthog.identify(user.id, {
          email: user.email,
          name: user.name,
        })
      } else {
        set({ user: null, loading: false })
      }

      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          const user = {
            id: session.user.id,
            email: session.user.email ?? '',
            name: session.user.user_metadata?.full_name ?? null,
            avatar_url: session.user.user_metadata?.avatar_url ?? null,
          }
          set({ user })
          posthog.identify(user.id, {
            email: user.email,
            name: user.name,
          })
        } else {
          set({ user: null })
          posthog.reset()
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
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) set({ error: error.message })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    posthog.reset()
    set({ user: null })
  },
}))
