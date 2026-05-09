'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { MemberPublic, ApiResponse } from '@/types/database'

type UseMembersReturn = {
  members: MemberPublic[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  getMember: (id: string) => MemberPublic | undefined
}

export function useMembers(): UseMembersReturn {
  const [members, setMembers] = useState<MemberPublic[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/members')
      const result: ApiResponse<MemberPublic[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setMembers(result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch members')
    } finally {
      setIsLoading(false)
    }
  }, [])

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
