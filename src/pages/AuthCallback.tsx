import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../state/authStore'

export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('Auth callback error:', error.message)
          navigate('/login', { replace: true })
          return
        }
      }

      // Wait for session to be fully available before navigating,
      // otherwise ProtectedRoute sees user=null and redirects to /login
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        useAuthStore.setState({
          user: {
            id: session.user.id,
            email: session.user.email ?? '',
            name: session.user.user_metadata?.full_name ?? null,
            avatar_url: session.user.user_metadata?.avatar_url ?? null,
          },
          loading: false,
        })
      }

      navigate('/', { replace: true })
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  )
}
