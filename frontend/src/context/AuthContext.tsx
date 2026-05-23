import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, apiErrorMessage, ensureCSRF } from '@/api/client'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  totpRequired: boolean
  login: (username: string, password: string) => Promise<{ totpRequired: boolean }>
  verifyTotp: (token: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  totpRequired: false,
  login: async () => ({ totpRequired: false }),
  verifyTotp: async () => {},
  logout: async () => {},
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [totpRequired, setTotpRequired] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<User>('/accounts/me/')
      setUser(res.data)
      setTotpRequired(false)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    ensureCSRF().then(() => refresh().finally(() => setLoading(false)))
  }, [refresh])

  const login = async (username: string, password: string) => {
    await ensureCSRF()
    const res = await api.post<{ requires_2fa: boolean; user?: User }>(
      '/accounts/login/',
      { email: username, password }
    )
    if (res.data.requires_2fa) {
      setTotpRequired(true)
      return { totpRequired: true }
    }
    if (res.data.user) setUser(res.data.user)
    else await refresh()
    return { totpRequired: false }
  }

  const verifyTotp = async (token: string) => {
    await api.post('/accounts/totp-verify/', { token })
    setTotpRequired(false)
    await refresh()
  }

  const logout = async () => {
    try {
      await api.post('/accounts/logout/')
    } finally {
      setUser(null)
      setTotpRequired(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, totpRequired, login, verifyTotp, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export { apiErrorMessage }
