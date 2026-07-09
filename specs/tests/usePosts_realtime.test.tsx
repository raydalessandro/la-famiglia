/**
 * usePosts — realtime chirurgico (Fase A4).
 *
 * Prima: ogni evento realtime (post nuovo, reaction, voto) → fetchPosts
 * completo → lista resettata a pagina 1 (feed collassato se avevi
 * scrollato). Ora ogni evento tocca SOLO il post interessato:
 *  - posts INSERT → fetch del singolo post + prepend, lista esistente intatta
 *  - posts DELETE → rimozione locale SENZA alcun fetch
 *  - reactions/votes → refetch (debounced 400ms) del solo post toccato
 *  - eventi per post fuori dalla lista → ignorati
 *  - votePoll → barre aggiornate ottimisticamente prima della risposta
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type RealtimeCb = (event: string, payload: { new: unknown; old: unknown }) => void
const realtimeCallbacks = new Map<string, RealtimeCb>()

vi.mock('@/lib/realtime', () => ({
  useRealtimeSubscription: (table: string, cb: RealtimeCb) => {
    realtimeCallbacks.set(table, cb)
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useOptionalAuth: () => ({ member: { id: 'me', name: 'Alessio' } }),
}))

vi.mock('@/lib/offline-queue', () => ({
  enqueueOperation: vi.fn(),
}))

import { usePosts } from '@/hooks/usePosts'
import { clearSwrCache } from '@/lib/swr-cache'

// ---------------------------------------------------------------------------
// Fixtures + fetch stub
// ---------------------------------------------------------------------------

function makePost(id: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    author_id: 'author-1',
    text,
    post_type: 'normal',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    author: { id: 'author-1', name: 'Giovanna' },
    images: [],
    likes: [],
    comments_count: 0,
    liked_by_me: false,
    bookmarked_by_me: false,
    reactions: [],
    poll: null,
    ...extra,
  }
}

const P1 = makePost('p1', 'Primo')
const P2 = makePost('p2', 'Secondo')

let fetchCalls: string[] = []
/** Risposte per URL dei singoli post: `/api/posts/{id}` → post. */
let singlePostResponses: Record<string, unknown>

function stubFetch() {
  fetchCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      fetchCalls.push(url)
      // Feed pagina 1
      if (url.startsWith('/api/posts?')) {
        return json({ data: [P1, P2], total: 2, page: 1, per_page: 10, has_more: false, error: null })
      }
      // Singolo post
      const m = url.match(/^\/api\/posts\/([\w-]+)$/)
      if (m) {
        const post = singlePostResponses[m[1]]
        if (!post) return json({ data: null, error: 'Post non trovato' }, 404)
        return json({ data: post, error: null })
      }
      // Vote endpoints etc.
      return json({ data: null, error: null })
    }),
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fire(table: string, event: string, payload: { new?: unknown; old?: unknown }) {
  const cb = realtimeCallbacks.get(table)
  if (!cb) throw new Error(`Nessuna subscription per ${table}`)
  act(() => cb(event, { new: payload.new ?? null, old: payload.old ?? null }))
}

async function mountFeed() {
  const rendered = renderHook(() => usePosts())
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false))
  await waitFor(() => expect(rendered.result.current.posts).toHaveLength(2))
  fetchCalls = [] // azzera: d'ora in poi contiamo solo i fetch causati dagli eventi
  return rendered
}

beforeEach(() => {
  clearSwrCache()
  window.localStorage.clear()
  realtimeCallbacks.clear()
  singlePostResponses = {}
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePosts — realtime chirurgico', () => {
  it('posts INSERT: prepend del nuovo post, lista esistente INTATTA', async () => {
    const { result } = await mountFeed()
    singlePostResponses['p3'] = makePost('p3', 'Nuovo!')

    fire('posts', 'INSERT', { new: { id: 'p3', author_id: 'author-2' } })

    await waitFor(() => expect(result.current.posts).toHaveLength(3))
    expect(result.current.posts.map((p) => p.id)).toEqual(['p3', 'p1', 'p2'])
    expect(result.current.total).toBe(3)
    // Ha fetchato SOLO il singolo post, mai la lista.
    expect(fetchCalls).toEqual(['/api/posts/p3'])
  })

  it('posts DELETE: rimozione locale senza NESSUN fetch', async () => {
    const { result } = await mountFeed()

    fire('posts', 'DELETE', { old: { id: 'p1' } })

    await waitFor(() => expect(result.current.posts).toHaveLength(1))
    expect(result.current.posts[0].id).toBe('p2')
    expect(result.current.total).toBe(1)
    expect(fetchCalls).toEqual([])
  })

  it('reaction su post visibile: refetch (debounced) del SOLO post toccato', async () => {
    const { result } = await mountFeed()
    singlePostResponses['p1'] = makePost('p1', 'Primo', {
      reactions: [{ id: 'r1', post_id: 'p1', member_id: 'x', emoji: '❤️', member: { id: 'x', name: 'F' } }],
    })

    fire('post_reactions', 'INSERT', { new: { post_id: 'p1', member_id: 'x', emoji: '❤️' } })

    await waitFor(() => expect(result.current.posts[0].reactions).toHaveLength(1), { timeout: 2000 })
    expect(fetchCalls).toEqual(['/api/posts/p1'])
    // p2 non è stato toccato.
    expect(result.current.posts[1]).toBe(result.current.posts[1])
    expect(result.current.posts.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('burst di reazioni sullo stesso post: UN solo fetch (debounce per-post)', async () => {
    const { result } = await mountFeed()
    singlePostResponses['p1'] = makePost('p1', 'Primo', { comments_count: 99 })

    fire('post_reactions', 'INSERT', { new: { post_id: 'p1', emoji: '❤️' } })
    fire('post_reactions', 'INSERT', { new: { post_id: 'p1', emoji: '😄' } })
    fire('post_reactions', 'DELETE', { old: { post_id: 'p1', emoji: '❤️' } })

    await waitFor(() => expect(result.current.posts[0].comments_count).toBe(99), { timeout: 2000 })
    expect(fetchCalls).toEqual(['/api/posts/p1'])
  })

  it('reaction su post FUORI dalla lista: nessun fetch', async () => {
    await mountFeed()

    fire('post_reactions', 'INSERT', { new: { post_id: 'post-di-unaltra-pagina' } })

    // Aspetta oltre il debounce per essere sicuri che non parta nulla.
    await new Promise((r) => setTimeout(r, 600))
    expect(fetchCalls).toEqual([])
  })

  it('voto realtime di un altro membro: patch del solo post col sondaggio', async () => {
    const { result } = await mountFeed()
    singlePostResponses['p2'] = makePost('p2', 'Secondo', { comments_count: 42 })

    fire('post_poll_votes', 'INSERT', { new: { post_id: 'p2', option_id: 'o1', member_id: 'x' } })

    await waitFor(() => expect(result.current.posts[1].comments_count).toBe(42), { timeout: 2000 })
    expect(fetchCalls).toEqual(['/api/posts/p2'])
  })

  it('votePoll: barre aggiornate OTTIMISTICAMENTE prima della risposta server', async () => {
    const poll = {
      id: 'poll-1',
      post_id: 'p1',
      question: 'Dove?',
      multi_choice: false,
      closes_at: null,
      created_at: '…',
      options: [
        { id: 'o1', poll_id: 'poll-1', label: 'Mare', sort_order: 0, created_at: '…', vote_count: 1, voted_by_me: false },
        { id: 'o2', poll_id: 'poll-1', label: 'Monti', sort_order: 1, created_at: '…', vote_count: 0, voted_by_me: false },
      ],
      total_votes: 1,
      is_closed: false,
    }
    // Il feed iniziale contiene P1 col sondaggio.
    const p1WithPoll = makePost('p1', 'Primo', { poll })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        fetchCalls.push(url)
        if (url.startsWith('/api/posts?')) {
          return json({ data: [p1WithPoll], total: 1, page: 1, per_page: 10, has_more: false, error: null })
        }
        if (url === '/api/posts/p1') {
          // Risposta server "lenta": qui non arriviamo prima dell'assert ottimistico.
          return json({ data: p1WithPoll, error: null })
        }
        return json({ data: null, error: null })
      }),
    )

    const { result } = renderHook(() => usePosts())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await waitFor(() => expect(result.current.posts).toHaveLength(1))

    act(() => {
      void result.current.votePoll('p1', 'o2')
    })

    // Subito dopo il tap (prima di qualunque await): barre già aggiornate.
    const optimistic = result.current.posts[0].poll!
    expect(optimistic.options.find((o) => o.id === 'o2')!.voted_by_me).toBe(true)
    expect(optimistic.options.find((o) => o.id === 'o2')!.vote_count).toBe(1)
  })
})
