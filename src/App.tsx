import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { useEffect } from 'react'
import posthog from 'posthog-js'
import { useAuthStore } from './state/authStore'
import { Layout } from './components/Layout'
import { LandingPage } from './pages/LandingPage'
import { Dashboard } from './pages/Dashboard'
import { NewSession } from './pages/NewSession'
import { SessionDetail } from './pages/SessionDetail'
import { ReviewLink } from './pages/ReviewLink'
import { AuthCallback } from './pages/AuthCallback'

function PostHogPageview() {
  const location = useLocation()
  useEffect(() => {
    posthog.capture('$pageview', {
      $current_url: window.location.href,
    })
  }, [location.pathname, location.search])
  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <>
      <Analytics />
      <BrowserRouter>
        <PostHogPageview />
        <Routes>
          <Route path="/login" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/review/:shareToken" element={<ReviewLink />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="new" element={<NewSession />} />
            <Route path="session/:id" element={<SessionDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}
