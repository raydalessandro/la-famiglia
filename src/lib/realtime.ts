'use client'

import { supabase } from './supabase/client'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useEffect, useRef } from 'react'

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export type RealtimeCallback<T> = (
  event: RealtimeEvent,
  payload: { new: T | null; old: T | null }
) => void

const activeChannels: RealtimeChannel[] = []

export function subscribeToTable<T>(
  table: string,
  callback: RealtimeCallback<T>,
  filter?: string
): RealtimeChannel {
  const channelName = `${table}_${filter || 'all'}_${Date.now()}`

  const config: {
    event: '*'
    schema: string
    table: string
    filter?: string
  } = {
    event: '*',
    schema: 'public',
    table,
  }

  if (filter) {
    config.filter = filter
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      config,
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        callback(payload.eventType as RealtimeEvent, {
          new: (payload.new && Object.keys(payload.new).length > 0 ? payload.new : null) as T | null,
          old: (payload.old && Object.keys(payload.old).length > 0 ? payload.old : null) as T | null,
        })
      }
    )
    .subscribe()

  activeChannels.push(channel)

  return channel
}

export function unsubscribeAll(): void {
  for (const channel of activeChannels) {
    supabase.removeChannel(channel)
  }
  activeChannels.length = 0
}

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

    const channel = subscribeToTable<T>(
      table,
      (e, p) => callbackRef.current(e, p),
      filter
    )

    return () => {
      supabase.removeChannel(channel)
      const index = activeChannels.indexOf(channel)
      if (index !== -1) {
        activeChannels.splice(index, 1)
      }
    }
  }, [table, filter, enabled])
}
