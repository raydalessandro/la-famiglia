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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [member, setMember] = useState<MemberPublic | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const isAuthenticated = member !== null
  const isAdmin = member?.is_admin ?? false

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
    } finally {
      setIsLoading(false)
    }
  }, [])

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
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth', { method: 'DELETE' })
    } finally {
      clearSwrCache()
      setMember(null)
    }
  }, [])

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
  }, [])

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
