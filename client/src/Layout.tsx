import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useIsFetching, useIsMutating } from '@tanstack/react-query'
import { getDashboard, logout } from './api.ts'
import { useStore } from './store.ts'

/** Chrome shared by every signed-in page: nav, quota readout, theme, sign out. */
export default function Layout() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const dark = useStore((s) => s.dark)
  const toggleDark = useStore((s) => s.toggleDark)

  // Cheap, and it keeps the quota readout honest on every page.
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard })
  const quota = data?.quota

  // Any in-flight query or mutation drives the top bar — visible even when the
  // results are scrolled out of view.
  const busy = useIsFetching() + useIsMutating() > 0

  const links = [
    { to: '/search', label: 'Search' },
    { to: '/map', label: 'Map' },
    { to: '/leads', label: 'Leads' },
    { to: '/dashboard', label: 'Dashboard' },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Indeterminate top progress bar — the global "something's loading" cue. */}
      {busy && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent">
          <div className="h-full w-2/5 animate-[loadbar_1.1s_ease-in-out_infinite] rounded-r-full bg-indigo-500" />
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <NavLink to="/search" className="text-lg font-bold">
            Local Lead Finder
          </NavLink>

          <nav className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-xs font-medium ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-400'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {quota && (
              <span className="hidden text-xs text-slate-500 sm:inline">
                {quota.searchesUsed}/{quota.searchesLimit > 1e15 ? '∞' : quota.searchesLimit} searches ·
                ${quota.spentTodayUsd.toFixed(3)} today
              </span>
            )}
            <span className="hidden text-xs text-slate-500 md:inline">{user?.email}</span>
            <button
              onClick={toggleDark}
              aria-label="Toggle dark mode"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-700"
            >
              {dark ? '☀' : '☾'}
            </button>
            <button
              onClick={async () => {
                await logout()
                // Drop every cached response — the next user must not see it.
                qc.clear()
                setUser(null)
                navigate('/login', { replace: true })
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  )
}
