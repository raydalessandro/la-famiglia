'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { useOptionalAuth } from '@/hooks/useAuth'
import { cacheKey, readCache, writeCache } from '@/lib/swr-cache'
import { MemberPublic, ApiResponse } from '@/types/database'

type UseMembersReturn = {
  members: MemberPublic[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  getMember: (id: string) => MemberPublic | undefined
}

export function useMembers(): UseMembersReturn {
  // Cache SWR (Fase A2): render immediato dei membri cached, fetch di
  // revalidation SEMPRE in background al mount. Skeleton solo al
  // primissimo accesso (cache vuota).
  const auth = useOptionalAuth()
  const key = cacheKey(auth?.member?.id, 'members')
  const [members, setMembers] = useState<MemberPublic[]>(
    () => readCache<MemberPublic[]>(key) ?? [],
  )
  const [isLoading, setIsLoading] = useState<boolean>(() => readCache(key) === null)
  const [error, setError] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/members')
      const result: ApiResponse<MemberPublic[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setMembers(result.data ?? [])
        writeCache(key, result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch members')
    } finally {
      setIsLoading(false)
    }
  }, [key])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  useRealtimeSubscription('members', () => fetchMembers(), undefined, true)

  const getMember = useCallback(
    (id: string) => members.find((m) => m.id === id),
    [members]
  )

  return { members, isLoading, error, refetch: fetchMembers, getMember }
}
