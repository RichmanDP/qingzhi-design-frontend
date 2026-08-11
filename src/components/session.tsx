import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { authStore } from '../lib/api'

interface SessionValue {
  authenticated: boolean
  userLabel: string
  setSession: (token: string, userLabel?: string) => void
  signOut: () => void
}

const USER_KEY = 'qingzhi.session.user.v1'
const SessionContext = createContext<SessionValue>({ authenticated: false, userLabel: '本地用户', setSession: () => undefined, signOut: () => undefined })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(() => Boolean(authStore.getToken()))
  const [userLabel, setUserLabel] = useState(() => window.localStorage.getItem(USER_KEY) ?? '本地管理员')
  const setSession = useCallback((token: string, nextLabel = '本地管理员') => {
    authStore.setToken(token)
    window.localStorage.setItem(USER_KEY, nextLabel)
    setAuthenticated(true)
    setUserLabel(nextLabel)
  }, [])
  const signOut = useCallback(() => {
    authStore.clear()
    window.localStorage.removeItem(USER_KEY)
    setAuthenticated(false)
  }, [])
  const value = useMemo(() => ({ authenticated, userLabel, setSession, signOut }), [authenticated, userLabel, setSession, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
