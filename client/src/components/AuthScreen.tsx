import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login, register } from '../api.ts'
import { useStore } from '../store.ts'

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

/** Shared by /login and /register — the mode comes from the route. */
export default function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const setUser = useStore((s) => s.setUser)
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session =
        mode === 'login' ? await login(email, password) : await register(email, password, name)
      setUser(session.user)
      // Send them where they were originally headed, if a guard redirected them.
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname
      navigate(from ?? '/search', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold text-slate-900 dark:text-slate-100">
          Local Lead Finder
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Find local businesses worth selling to.
        </p>

        <form
          onSubmit={submit}
          className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="text-sm font-semibold">
            {mode === 'login' ? 'Sign in' : 'Create your account'}
          </h2>

          {mode === 'register' && (
            <input
              className={field}
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            className={field}
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className={field}
            type="password"
            required
            minLength={8}
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <p className="text-center text-xs text-slate-500">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <Link to="/register" className="text-indigo-600 hover:underline">
                  Create one
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link to="/login" className="text-indigo-600 hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </form>

        <p className="mt-4 text-center text-[11px] leading-snug text-slate-400">
          Searches cost real money against the Google Places API. Every search is priced
          before it runs and capped by a daily quota.
        </p>
      </div>
    </div>
  )
}
