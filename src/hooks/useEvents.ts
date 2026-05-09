'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { CalendarEventWithDetails, CreateEventInput, UpdateEventInput, ApiResponse } from '@/types/database'

type UseEventsReturn = {
  events: CalendarEventWithDetails[]
  isLoading: boolean
  error: string | null
  createEvent: (input: CreateEventInput) => Promise<boolean>
  updateEvent: (id: string, input: UpdateEventInput) => Promise<boolean>
  deleteEvent: (id: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function useEvents(month: number, year: number): UseEventsReturn {
  const [events, setEvents] = useState<CalendarEventWithDetails[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/events?month=${month}&year=${year}`)
      const result: ApiResponse<CalendarEventWithDetails[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setEvents(result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch events')
    } finally {
      setIsLoading(false)
    }
  }, [month, year])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useRealtimeSubscription('events', () => fetchEvents(), undefined, true)

  const createEvent = useCallback(async (input: CreateEventInput): Promise<boolean> => {
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (res.ok) { await fetchEvents(); return true }
      return false
    } catch {
      return false
    }
  }, [fetchEvents])

  const updateEvent = useCallback(async (id: string, input: UpdateEventInput): Promise<boolean> => {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (res.ok) { await fetchEvents(); return true }
      return false
    } catch {
      return false
    }
  }, [fetchEvents])

  const deleteEvent = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
      if (res.ok) { await fetchEvents(); return true }
      return false
    } catch {
      return false
    }
  }, [fetchEvents])

  return { events, isLoading, error, createEvent, updateEvent, deleteEvent, refetch: fetchEvents }
}
