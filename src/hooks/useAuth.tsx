'use client'

import { MemberPublic } from '@/types/database'
import { clearSwrCache } from '@/lib/swr-cache'
import { useState, useEffect, useCallback, createContext, useContext } from 'react'

type AuthContextValue = {
  member: MemberPublic | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  login: (memberId: string, pin: string) => Promise<boolean>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Cache locale dell'identità (Fase A5 — auth istantanea). Il member
 * pubblico dell'ultima sessione valida vive in localStorage: al mount
 * l'app parte GIÀ autenticata (niente spinner globale) e `GET /api/auth`
 * conferma in background — un 401/sessione scaduta smonta l'identità e
 * l'AuthGuard riporta al login. È solo la shape PUBLIC (il server manda
 * toPublicMember): niente pin_hash né preferenze private.
 *
 * Chiave FUORI dal namespace swr: la pulisce solo il logout / il 401,
 * non clearSwrCache (che gira anche al login, quando l'identità nuova
 * va mantenuta).
 */
const AUTH_CACHE_KEY = 'auth:member:v1'

function readCachedMember(): MemberPublic | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY)
    return raw ? (JSON.parse(raw) as MemberPublic) : null
  } catch {
    return null
  }
}

function writeCachedMember(member: MemberPublic | null): void {
  try {
    if (typeof window === 'undefined') return
    if (member) window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(member))
    else window.localStorage.removeItem(AUTH_CACHE_KEY)
  } catch {
    // Storage pieno o negato: la cache identità è un'ottimizzazione.
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [member, setMemberState] = useState<MemberPublic | null>(() => readCachedMember())
  // Con un member cached partiamo già "pronti": l'app renderizza subito
  // e la conferma della sessione avviene in background.
  const [isLoading, setIsLoading] = useState<boolean>(() => readCachedMember() === null)

  const isAuthenticated = member !== null
  const isAdmin = member?.is_admin ?? false

  // Unico punto che tocca state + cache insieme: mai disallineati.
  const setMember = useCallback((m: MemberPublic | null) => {
    setMemberState(m)
    writeCachedMember(m)
  }, [])

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth')
      if (response.ok) {
        const result = await response.json()
        if (result.data) {
          setMember(result.data.member)
        } else {
          setMember(null)
        }
      } else {
        setMember(null)
      }
    } catch {
      // Rete assente (PWA offline): tieni l'identità cached — i dati
      // arrivano comunque dalla cache SWR e dalla coda offline. La
      // sessione verrà riconfermata alla prossima apertura online.
    } finally {
      setIsLoading(false)
    }
  }, [setMember])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const login = useCallback(async (memberId: string, pin: string): Promise<boolean> => {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ member_id: memberId, pin }),
    })
    const result = await response.json()
    if (result.data) {
      // Cambio di identità: la cache SWR del member precedente (feed con
      // liked_by_me, unread counts, ...) non deve trapelare al nuovo.
      clearSwrCache()
      setMember(result.data.member)
      return true
    }
    return false
  }, [setMember])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth', { method: 'DELETE' })
    } finally {
      clearSwrCache()
      setMember(null)
    }
  }, [setMember])

  const refreshAuth = useCallback(async (): Promise<void> => {
    const response = await fetch('/api/auth')
    if (response.ok) {
      const result = await response.json()
      if (result.data) {
        setMember(result.data.member)
      } else {
        setMember(null)
      }
    } else {
      setMember(null)
    }
  }, [setMember])

  return (
    <AuthContext.Provider value={{ member, isLoading, isAuthenticated, isAdmin, login, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

/**
 * Variante non-throwing per gli hook dati (usePosts, useMembers, ...):
 * fuori da un AuthProvider (unit test renderHook senza wrapper) ritorna
 * null invece di lanciare — gli hook degradano a "cache disabilitata"
 * e il comportamento di fetch resta identico.
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext)
}
