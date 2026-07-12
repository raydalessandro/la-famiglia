'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { useOptionalAuth } from '@/hooks/useAuth'
import { cacheKey, readCache, writeCache } from '@/lib/swr-cache'
import { Notification, ApiResponse } from '@/types/database'

type UseNotificationsReturn = {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  error: string | null
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refetch: () => Promise<void>
}

export function useNotifications(): UseNotificationsReturn {
  // Cache SWR (A6.5): notifiche renderizzate subito dalla cache,
  // revalidation sempre in background al mount (niente flash sui refetch
  // realtime).
  const auth = useOptionalAuth()
  const key = cacheKey(auth?.member?.id, 'notifications')
  const [notifications, setNotifications] = useState<Notification[]>(
    () => readCache<Notification[]>(key) ?? [],
  )
  const [isLoading, setIsLoading] = useState<boolean>(() => readCache(key) === null)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/notifications')
      const result: ApiResponse<Notification[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setNotifications(result.data ?? [])
        writeCache(key, result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch notifications')
    } finally {
      setIsLoading(false)
    }
  }, [key])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useRealtimeSubscription('notifications', () => fetchNotifications(), undefined, true)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const markAsRead = useCallback(async (id: string): Promise<void> => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: [id] }),
      })
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        )
      }
    } catch {
      // Non-critical
    }
  }, [])

  const markAllAsRead = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      }
    } catch {
      // Non-critical
    }
  }, [])

  return { notifications, unreadCount, isLoading, error, markAsRead, markAllAsRead, refetch: fetchNotifications }
}
