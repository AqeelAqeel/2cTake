import { Outlet, Link } from 'react-router-dom'
import { useAuthStore } from '../state/authStore'
import { LogOut, Play } from 'lucide-react'

export function Layout() {
  const { user, signOut } = useAuthStore()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border/60 bg-white/80 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-50">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center">
            <Play className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-text-primary">
            2cTake
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <button
            onClick={signOut}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-tertiary hover:text-text-secondary transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main — pages own their own padding and layout */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
