import { createContext, useContext, useEffect, useState } from 'react'
import { refresh, onAuthLostSet } from './api.ts'
import { useStore } from './store.ts'

/**
 * Restores the session once, at app start.
 *
 * A page reload has no access token — it lives in memory only — but the
 * httpOnly refresh cookie can mint a new one. Until that round trip finishes
 * we don't know whether the user is signed in, so route guards must wait
 * rather than bouncing everyone to /login on every refresh.
 */

const SessionContext = createContext<{ booting: boolean }>({ booting: true })

export const useSession = () => useContext(SessionContext)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const setUser = useStore((s) => s.setUser)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    // A 401 that survives a refresh attempt means the session is truly gone.
    onAuthLostSet(() => setUser(null))
    refresh()
      .then((s) => setUser(s.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false))
  }, [setUser])

  return <SessionContext.Provider value={{ booting }}>{children}</SessionContext.Provider>
}
