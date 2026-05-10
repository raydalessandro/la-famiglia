'use client'

import { supabase } from './supabase/client'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useEffect, useRef } from 'react'

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export type RealtimeCallback<T> = (
  event: RealtimeEvent,
  payload: { new: T | null; old: T | null }
) => void

export function useRealtimeSubscription<T>(
  table: string,
  callback: RealtimeCallback<T>,
  filter?: string,
  enabled?: boolean
): void {
  const callbackRef = useRef<RealtimeCallback<T>>(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const channelName = `${table}_${filter || 'all'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const config: {
      event: '*'
      schema: string
      table: string
      filter?: string
    } = { event: '*', schema: 'public', table }
    if (filter) config.filter = filter

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        config,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          callbackRef.current(payload.eventType as RealtimeEvent, {
            new: (payload.new && Object.keys(payload.new).length > 0 ? payload.new : null) as T | null,
            old: (payload.old && Object.keys(payload.old).length > 0 ? payload.old : null) as T | null,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, filter, enabled])
}
