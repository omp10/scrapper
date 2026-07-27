import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useStore } from './store.ts'
import { useSession } from './session.tsx'

/**
 * Route guards.
 *
 * These are a UX convenience, not a security boundary — every protected API
 * route independently checks the JWT and the admin role. A user who edits the
 * URL gets the page shell and a 403 from every request behind it.
 */

export function RequireAuth() {
  const user = useStore((s) => s.user)
  const { booting } = useSession()
  const location = useLocation()

  if (booting) return <Splash />
  // Remember where they were headed so login can send them back there.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function RequireAdmin() {
  const user = useStore((s) => s.user)
  const { booting } = useSession()

  if (booting) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/search" replace />
  return <Outlet />
}

/** Signed-in users have no business on /login or /register. */
export function RedirectIfAuthed() {
  const user = useStore((s) => s.user)
  const { booting } = useSession()
  const location = useLocation()

  if (booting) return <Splash />
  if (user) {
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/search'
    return <Navigate to={from} replace />
  }
  return <Outlet />
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-950">
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center dark:bg-slate-950">
      <div>
        <p className="text-5xl font-bold text-slate-300 dark:text-slate-700">404</p>
        <p className="mt-2 text-sm text-slate-500">That page doesn't exist.</p>
        <a
          href="/search"
          className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Back to search
        </a>
      </div>
    </div>
  )
}
