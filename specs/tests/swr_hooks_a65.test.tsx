/**
 * Integrazione cache SWR ↔ hook dati — estensione A6.5.
 *
 * Stesso contratto di swr_hooks.test.tsx applicato agli hook coperti
 * dalla fase A6.5: con cache per il member corrente l'hook parte con i
 * dati cached e isLoading=false (NIENTE skeleton), e la revalidation
 * fetch parte comunque in background aggiornando dati + cache. Senza
 * cache: comportamento storico (isLoading=true → fetch → dati).
 *
 * Copre: useChat (messaggi, con la convenzione DESC→reverse→ASC),
 * useTasks e useNotifications.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { cacheKey, writeCache, readCache, clearSwrCache } from '@/lib/swr-cache'

// Realtime no-op
vi.mock('@/lib/realtime', () => ({
  useRealtimeSubscription: vi.fn(),
}))

// Auth: member fisso 'me' — la cache è scoped su di lui.
vi.mock('@/hooks/useAuth', () => ({
  useOptionalAuth: () => ({ member: { id: 'me', name: 'Alessio' } }),
}))

// Storage no-op (useChat importa compressImage per i media, mai usato qui).
vi.mock('@/lib/storage', () => ({
  compressImage: vi.fn(async (f: File) => f),
}))

import { useChat } from '@/hooks/useChat'
import { useTasks } from '@/hooks/useTasks'
import { useNotifications } from '@/hooks/useNotifications'
import type { MemberPublic } from '@/types/database'

const MEMBER: MemberPublic = {
  id: 'me',
  name: 'Alessio',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'figlio',
  bio: '',
  is_admin: false,
  is_active: true,
  color: '#ff0000',
}

const baseMsg = {
  group_id: 'group-1',
  author_id: 'me',
  text: '',
  message_type: 'text' as const,
  media_url: null,
  edited_at: null,
  deleted_at: null,
  reply_to_message_id: null,
  reply_to: null,
  author: MEMBER,
}

// Lista ASC (vecchio → nuovo): è la forma che vive nello state e in cache.
const CACHED_MSGS_ASC = [
  { ...baseMsg, id: 'c-1', text: 'primo (cache)', created_at: '2026-07-01T10:00:01Z' },
  { ...baseMsg, id: 'c-2', text: 'secondo (cache)', created_at: '2026-07-01T10:00:02Z' },
]

// Pagina 1 dal server: DESC (più recente prima).
const SERVER_MSGS_DESC = [
  { ...baseMsg, id: 's-2', text: 'secondo (server)', created_at: '2026-07-02T10:00:02Z' },
  { ...baseMsg, id: 's-1', text: 'primo (server)', created_at: '2026-07-02T10:00:01Z' },
]

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearSwrCache()
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown) {
  fetchSpy = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchSpy)
}

describe('useChat (messaggi) + cache SWR', () => {
  const chatResponse = {
    data: SERVER_MSGS_DESC,
    total: 2,
    page: 1,
    per_page: 30,
    has_more: false,
    error: null,
  }

  it('senza cache: isLoading=true al mount, poi dati reversati (ASC)', async () => {
    stubFetch(chatResponse)

    const { result } = renderHook(() => useChat('group-1', [MEMBER]))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.messages).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Il server manda DESC, lo state è ASC.
    expect(result.current.messages.map((m) => m.id)).toEqual(['s-1', 's-2'])
  })

  it('con cache: la lista reversata appare SUBITO, poi revalidation dal server', async () => {
    writeCache(cacheKey('me', 'chat-msgs:group-1'), CACHED_MSGS_ASC)
    stubFetch(chatResponse)

    const { result } = renderHook(() => useChat('group-1', [MEMBER]))
    // Primo render: messaggi cached già in ordine ASC, niente skeleton.
    expect(result.current.isLoading).toBe(false)
    expect(result.current.messages.map((m) => m.id)).toEqual(['c-1', 'c-2'])

    // La revalidation parte comunque e aggiorna dati + cache.
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.id)).toEqual(['s-1', 's-2']),
    )
    const cached = readCache<{ id: string }[]>(cacheKey('me', 'chat-msgs:group-1'))
    expect(cached?.map((m) => m.id)).toEqual(['s-1', 's-2'])
  })

  it('il fetch scrive in cache la pagina 1 già reversata', async () => {
    stubFetch(chatResponse)

    const { result } = renderHook(() => useChat('group-1', [MEMBER]))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const cached = readCache<{ id: string }[]>(cacheKey('me', 'chat-msgs:group-1'))
    expect(cached?.map((m) => m.id)).toEqual(['s-1', 's-2'])
  })
})

describe('useTasks + cache SWR', () => {
  const TASK_CACHED = { id: 't-old', title: 'Dal cache', is_completed: false }
  const TASKS_FRESH = [{ id: 't-new', title: 'Fresco dal server', is_completed: false }]

  it('senza cache: isLoading=true al mount, poi dati dal fetch', async () => {
    stubFetch({ data: TASKS_FRESH, error: null })

    const { result } = renderHook(() => useTasks())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.tasks).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tasks).toEqual(TASKS_FRESH)
  })

  it('con cache: dati SUBITO senza skeleton, revalidation aggiorna dati + cache', async () => {
    writeCache(cacheKey('me', 'tasks:all:all'), [TASK_CACHED])
    stubFetch({ data: TASKS_FRESH, error: null })

    const { result } = renderHook(() => useTasks())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.tasks).toEqual([TASK_CACHED])

    await waitFor(() => expect(result.current.tasks).toEqual(TASKS_FRESH))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(readCache(cacheKey('me', 'tasks:all:all'))).toEqual(TASKS_FRESH)
  })

  it('i filtri fanno parte della chiave: cache separata per assignee', async () => {
    writeCache(cacheKey('me', 'tasks:all:all'), [TASK_CACHED])
    stubFetch({ data: TASKS_FRESH, error: null })

    // Con filtro assignee la chiave è diversa → niente cache → skeleton.
    const { result } = renderHook(() => useTasks({ assigneeId: 'x' }))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.tasks).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(readCache(cacheKey('me', 'tasks:x:all'))).toEqual(TASKS_FRESH)
  })
})

describe('useNotifications + cache SWR', () => {
  const NOTIF_CACHED = { id: 'n-old', title: 'Dal cache', is_read: false }
  const NOTIFS_FRESH = [
    { id: 'n-new', title: 'Fresca dal server', is_read: false },
    { id: 'n-new-2', title: 'Già letta', is_read: true },
  ]

  it('senza cache: isLoading=true al mount, poi dati dal fetch', async () => {
    stubFetch({ data: NOTIFS_FRESH, error: null })

    const { result } = renderHook(() => useNotifications())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.notifications).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.notifications).toEqual(NOTIFS_FRESH)
    expect(result.current.unreadCount).toBe(1)
  })

  it('con cache: dati SUBITO senza skeleton, revalidation aggiorna dati + cache', async () => {
    writeCache(cacheKey('me', 'notifications'), [NOTIF_CACHED])
    stubFetch({ data: NOTIFS_FRESH, error: null })

    const { result } = renderHook(() => useNotifications())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.notifications).toEqual([NOTIF_CACHED])
    expect(result.current.unreadCount).toBe(1)

    await waitFor(() => expect(result.current.notifications).toEqual(NOTIFS_FRESH))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(readCache(cacheKey('me', 'notifications'))).toEqual(NOTIFS_FRESH)
  })
})
