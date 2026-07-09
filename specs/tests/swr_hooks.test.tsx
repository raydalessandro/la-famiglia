/**
 * Integrazione cache SWR ↔ hook dati (Fase A2).
 *
 * Il contratto UX: se c'è cache per il member corrente, l'hook parte con
 * i dati cached e isLoading=false (NIENTE skeleton), e la revalidation
 * fetch parte comunque in background aggiornando dati + cache. Senza
 * cache: comportamento storico (isLoading=true → fetch → dati).
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

import { useMembers } from '@/hooks/useMembers'
import { usePosts } from '@/hooks/usePosts'

const MEMBERS_FRESH = [
  { id: 'a', name: 'Giovanna' },
  { id: 'b', name: 'Franco' },
]

const POST_CACHED = {
  id: 'post-cached',
  author_id: 'a',
  text: 'Dal cache',
  post_type: 'normal',
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  author: { id: 'a', name: 'Giovanna' },
  images: [],
  likes: [],
  comments_count: 0,
  liked_by_me: false,
  bookmarked_by_me: false,
  reactions: [],
  poll: null,
}

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

describe('useMembers + cache SWR', () => {
  it('senza cache: isLoading=true al mount, poi dati dal fetch', async () => {
    stubFetch({ data: MEMBERS_FRESH, error: null })

    const { result } = renderHook(() => useMembers())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.members).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.members).toEqual(MEMBERS_FRESH)
  })

  it('con cache: dati SUBITO senza skeleton, e revalidation in background', async () => {
    writeCache(cacheKey('me', 'members'), [{ id: 'old', name: 'Vecchio' }])
    stubFetch({ data: MEMBERS_FRESH, error: null })

    const { result } = renderHook(() => useMembers())
    // Primo render: dati cached, niente loading.
    expect(result.current.isLoading).toBe(false)
    expect(result.current.members).toEqual([{ id: 'old', name: 'Vecchio' }])

    // La revalidation parte comunque e aggiorna dati + cache.
    await waitFor(() => expect(result.current.members).toEqual(MEMBERS_FRESH))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(readCache(cacheKey('me', 'members'))).toEqual(MEMBERS_FRESH)
  })

  it('il fetch riuscito scrive la cache (primo accesso → secondo mount istantaneo)', async () => {
    stubFetch({ data: MEMBERS_FRESH, error: null })

    const first = renderHook(() => useMembers())
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()

    // Rimonta: deve partire già popolato.
    const second = renderHook(() => useMembers())
    expect(second.result.current.isLoading).toBe(false)
    expect(second.result.current.members).toEqual(MEMBERS_FRESH)
  })
})

describe('usePosts + cache SWR', () => {
  const feedResponse = {
    data: [{ ...POST_CACHED, id: 'post-fresh', text: 'Fresco dal server' }],
    total: 1,
    page: 1,
    per_page: 10,
    has_more: false,
    error: null,
  }

  it('con cache: il feed appare subito, poi si aggiorna dal server', async () => {
    writeCache(cacheKey('me', 'posts:feed'), {
      posts: [POST_CACHED],
      total: 1,
      hasMore: false,
    })
    stubFetch(feedResponse)

    const { result } = renderHook(() => usePosts())
    expect(result.current.isLoading).toBe(false)
    expect(result.current.posts[0].text).toBe('Dal cache')

    await waitFor(() => expect(result.current.posts[0].text).toBe('Fresco dal server'))
  })

  it('la cache del profilo (authorId) è separata da quella del feed', async () => {
    writeCache(cacheKey('me', 'posts:feed'), {
      posts: [POST_CACHED],
      total: 1,
      hasMore: false,
    })
    stubFetch(feedResponse)

    // Con authorId la chiave è diversa → niente cache → skeleton.
    const { result } = renderHook(() => usePosts('author-x'))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.posts).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('il fetch scrive lo snapshot di pagina 1 in cache', async () => {
    stubFetch(feedResponse)

    const { result } = renderHook(() => usePosts())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const cached = readCache<{ posts: { id: string }[] }>(cacheKey('me', 'posts:feed'))
    expect(cached?.posts[0].id).toBe('post-fresh')
  })
})
