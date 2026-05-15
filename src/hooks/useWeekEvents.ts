'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { CalendarEventWithDetails, AttendanceStatus, ApiResponse } from '@/types/database'
import { getWeekStart } from '@/hooks/useActivities'

type UseWeekEventsReturn = {
  events: CalendarEventWithDetails[]
  isLoading: boolean
  error: string | null
  setMyEventAttendance: (
    eventId: string,
    status: AttendanceStatus,
    modifiedNotes?: string
  ) => Promise<boolean>
  clearMyEventAttendance: (eventId: string) => Promise<boolean>
  refetch: () => Promise<void>
}

// Hook specializzato per la pagina Attivita` unificata: ritorna gli eventi
// one-off della settimana corrente (lunedi-domenica) gia` arricchiti con
// `attendances` (vedi `GET /api/events?week_start=`). Realtime su `events`
// e `event_participants` perche la pagina deve aggiornarsi quando un
// membro conferma/salta o quando viene creato un nuovo evento.
//
// useEvents (l'hook esistente del calendario) resta separato: lavora a
// granularita mese, non sottoscrive event_participants ed e usato dalla
// pagina /calendar in sola lettura sulla card del giorno.
export function useWeekEvents(): UseWeekEventsReturn {
  const [events, setEvents] = useState<CalendarEventWithDetails[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`/api/events?week_start=${getWeekStart()}`)
      const data: ApiResponse<CalendarEventWithDetails[]> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to fetch events')
        return
      }
      setEvents(data.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useRealtimeSubscription('events', () => fetchEvents())
  useRealtimeSubscription('event_participants', () => fetchEvents())

  const setMyEventAttendance = async (
    eventId: string,
    status: AttendanceStatus,
    modifiedNotes?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/events/${eventId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, modified_notes: modifiedNotes }),
      })
      const data: ApiResponse<unknown> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to set attendance')
        return false
      }
      await fetchEvents()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set attendance')
      return false
    }
  }

  const clearMyEventAttendance = async (eventId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/events/${eventId}/attendance`, {
        method: 'DELETE',
      })
      const data: ApiResponse<unknown> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to clear attendance')
        return false
      }
      await fetchEvents()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear attendance')
      return false
    }
  }

  return {
    events,
    isLoading,
    error,
    setMyEventAttendance,
    clearMyEventAttendance,
    refetch: fetchEvents,
  }
}
