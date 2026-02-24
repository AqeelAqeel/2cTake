import { Outlet, Link } from 'react-router-dom'
import { useAuthStore } from '../state/authStore'
import { LogOut, Video } from 'lucide-react'

export function Layout() {
  const { user, signOut } = useAuthStore()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold no-underline text-text-primary">
            <Video className="h-5 w-5 text-brand-600" />
            2cTake
          </Link>

          <div className="flex items-center gap-3">
              {user?.avatar_url && (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full"
                />
              )}
              <span className="text-sm text-text-secondary hidden sm:inline">
                {user?.name || user?.email}
              </span>
              <button
                onClick={signOut}
                className="rounded-lg p-2 text-text-muted hover:bg-surface-tertiary hover:text-text-secondary transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
