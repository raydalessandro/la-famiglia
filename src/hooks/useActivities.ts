'use client'

import { ActivityWithDetails, CreateActivityInput, UpdateActivityInput, SetWeeklyStatusInput, ApiResponse } from '@/types/database'
import { useRealtimeSubscription } from '@/lib/realtime'
import { useState, useEffect, useCallback } from 'react'

type UseActivitiesReturn = {
  activities: ActivityWithDetails[]
  isLoading: boolean
  error: string | null
  createActivity: (input: CreateActivityInput) => Promise<boolean>
  updateActivity: (id: string, input: UpdateActivityInput) => Promise<boolean>
  deleteActivity: (id: string) => Promise<boolean>
  setWeeklyStatus: (activityId: string, input: SetWeeklyStatusInput) => Promise<boolean>
  resetWeeklyStatus: (activityId: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function getWeekStart(): string {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun
  const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, '0')
  const d = String(monday.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
  // NEVER use toISOString()
}

export function useActivities(): UseActivitiesReturn {
  const [activities, setActivities] = useState<ActivityWithDetails[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchActivities = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`/api/activities?week_start=${getWeekStart()}`)
      const data: ApiResponse<ActivityWithDetails[]> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to fetch activities')
        return
      }
      setActivities(data.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch activities')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  useRealtimeSubscription('activities', () => fetchActivities())
  useRealtimeSubscription('activity_weekly_status', () => fetchActivities())

  const createActivity = async (input: CreateActivityInput): Promise<boolean> => {
    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data: ApiResponse<unknown> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to create activity')
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create activity')
      return false
    }
  }

  const updateActivity = async (id: string, input: UpdateActivityInput): Promise<boolean> => {
    try {
      const res = await fetch(`/api/activities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data: ApiResponse<unknown> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to update activity')
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update activity')
      return false
    }
  }

  const deleteActivity = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/activities/${id}`, {
        method: 'DELETE',
      })
      const data: ApiResponse<unknown> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to delete activity')
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete activity')
      return false
    }
  }

  const setWeeklyStatus = async (activityId: string, input: SetWeeklyStatusInput): Promise<boolean> => {
    try {
      const res = await fetch(`/api/activities/${activityId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, week_start: getWeekStart() }),
      })
      const data: ApiResponse<unknown> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to set weekly status')
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set weekly status')
      return false
    }
  }

  const resetWeeklyStatus = async (activityId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/activities/${activityId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending', week_start: getWeekStart() }),
      })
      const data: ApiResponse<unknown> = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to reset weekly status')
        return false
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset weekly status')
      return false
    }
  }

  return {
    activities,
    isLoading,
    error,
    createActivity,
    updateActivity,
    deleteActivity,
    setWeeklyStatus,
    resetWeeklyStatus,
    refetch: fetchActivities,
  }
}
