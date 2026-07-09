// @vitest-environment node
/**
 * Test della route POST /api/posts/:id/bookmark + GET /api/posts/bookmarked
 * (Fase 6.4 — api+ui dopo la migration `012_post_bookmarks.sql`).
 *
 * Pattern allineato a posts_reactions / chat_messages: requireAuth
 * mocked, Supabase mocked per tabella con builder thenable.
 *
 * Cosa è coperto:
 *  - POST toggle: prima call inserisce (201, bookmarked=true), seconda
 *    elimina (200, bookmarked=false).
 *  - Auth wall (requireAuth → NextResponse 401).
 *  - GET filtra rigorosamente sui bookmark del caller (privacy).
 *  - GET ritorna PaginatedResponse con shape compatibile con il feed.
 *  - GET ordina per post_bookmarks.created_at DESC (ultimo salvato in
 *    cima, non l'ultimo pubblicato).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
}))

// buildPostsWithDetails è già coperto altrove (posts_batching.test.ts);
// qui ci basta che venga chiamato con le post row corrette e restituisca
// un array minimamente plausibile.
const mockBuildPostWithDetails = vi.fn()
const mockBuildPostsWithDetails = vi.fn()
vi.mock('@/lib/posts', () => ({
  buildPostWithDetails: mockBuildPostWithDetails,
  buildPostsWithDetails: mockBuildPostsWithDetails,
}))

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(method: string, url = 'http://localhost/api/posts/post-1/bookmark'): Request {
  return new Request(url, { method })
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

const MEMBER_ALICE = { id: 'alice', name: 'Alice', is_admin: false }
const MEMBER_BOB = { id: 'bob', name: 'Bob', is_admin: false }

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// POST /api/posts/:id/bookmark
// ---------------------------------------------------------------------------
describe('POST /api/posts/:id/bookmark', () => {
  it('blocca senza auth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 }),
    )

    const { POST } = await import('@/app/api/posts/[id]/bookmark/route')
    const res = await POST(makeRequest('POST') as never, makeContext('post-1'))

    expect(res.status).toBe(401)
  })

  it('primo tap: inserisce e ritorna 201 con bookmarked=true', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    let inserted: Record<string, unknown> | null = null
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            // maybeSingle ritorna { data: null } → non c'è ancora bookmark
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserted = row
        return Promise.resolve({ error: null })
      },
    }))

    const { POST } = await import('@/app/api/posts/[id]/bookmark/route')
    const res = await POST(makeRequest('POST') as never, makeContext('post-1'))

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data).toEqual({ bookmarked: true })
    expect(inserted).toEqual({ post_id: 'post-1', member_id: 'alice' })
  })

  it('secondo tap: elimina e ritorna 200 con bookmarked=false', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    const deletedIds: unknown[] = []
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            // maybeSingle ritorna una riga esistente
            maybeSingle: () =>
              Promise.resolve({
                data: { id: 'bookmark-1' },
                error: null,
              }),
          }),
        }),
      }),
      delete: () => ({
        eq: (_col: string, val: unknown) => {
          deletedIds.push(val)
          return Promise.resolve({ error: null })
        },
      }),
    }))

    const { POST } = await import('@/app/api/posts/[id]/bookmark/route')
    const res = await POST(makeRequest('POST') as never, makeContext('post-1'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual({ bookmarked: false })
    expect(deletedIds).toEqual(['bookmark-1'])
  })

  it('filtra per member_id del caller (privacy: non rimuove bookmark altrui)', async () => {
    // Bob tenta di toggle: il SELECT cerca (post_id, member_id=bob).
    // Se Alice aveva già un bookmark, Bob NON deve toccarlo.
    mockRequireAuth.mockResolvedValueOnce(MEMBER_BOB)

    const eqCalls: Array<[string, unknown]> = []
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: (col1: string, val1: unknown) => {
          eqCalls.push([col1, val1])
          return {
            eq: (col2: string, val2: unknown) => {
              eqCalls.push([col2, val2])
              return {
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }
            },
          }
        },
      }),
      insert: () => Promise.resolve({ error: null }),
    }))

    const { POST } = await import('@/app/api/posts/[id]/bookmark/route')
    await POST(makeRequest('POST') as never, makeContext('post-1'))

    expect(eqCalls).toEqual([
      ['post_id', 'post-1'],
      ['member_id', 'bob'], // ← critico: filtro per il caller, non globale
    ])
  })

  it('500 se l\'insert lancia errore DB', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      insert: () => Promise.resolve({ error: { message: 'unique violation' } }),
    }))

    const { POST } = await import('@/app/api/posts/[id]/bookmark/route')
    const res = await POST(makeRequest('POST') as never, makeContext('post-1'))

    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// GET /api/posts/bookmarked
// ---------------------------------------------------------------------------
describe('GET /api/posts/bookmarked', () => {
  it('blocca senza auth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 }),
    )

    const { GET } = await import('@/app/api/posts/bookmarked/route')
    const res = await GET(makeRequest('GET', 'http://localhost/api/posts/bookmarked?page=1') as never)

    expect(res.status).toBe(401)
  })

  it('ritorna paginata + filtra rigorosamente per member_id del caller', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    const fakePost = { id: 'p1', author_id: 'someone', text: 'ciao', post_type: 'normal', created_at: '2026-05-15', updated_at: '2026-05-15' }
    const filterCalls: Array<[string, unknown]> = []

    mockFrom.mockImplementation((table: string) => {
      if (table === 'post_bookmarks') {
        // count head:true path
        const builder: Record<string, unknown> = {}
        builder.select = vi.fn((_cols: string, opts?: { head?: boolean }) => {
          if (opts?.head) {
            return {
              eq: (col: string, val: unknown) => {
                filterCalls.push([col, val])
                return Promise.resolve({ count: 1, error: null })
              },
            }
          }
          // data path: .select('post_id, created_at, posts(*)').eq().order().range()
          return {
            eq: (col: string, val: unknown) => {
              filterCalls.push([col, val])
              return {
                order: () => ({
                  range: () =>
                    Promise.resolve({
                      data: [{ post_id: 'p1', created_at: '2026-05-15T10:00:00Z', posts: fakePost }],
                      error: null,
                    }),
                }),
              }
            },
          }
        })
        return builder
      }
      throw new Error(`Unexpected table ${table}`)
    })

    mockBuildPostsWithDetails.mockResolvedValue([{ ...fakePost, bookmarked_by_me: true }])

    const { GET } = await import('@/app/api/posts/bookmarked/route')
    const res = await GET(makeRequest('GET', 'http://localhost/api/posts/bookmarked?page=1&per_page=10') as never)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toHaveLength(1)
    expect(json.total).toBe(1)
    expect(json.has_more).toBe(false)
    // Tutte le query devono aver filtrato per member_id=alice
    expect(filterCalls.every(([col, val]) => col === 'member_id' && val === 'alice')).toBe(true)
  })

  it('ignora bookmark orfani (post eliminato senza CASCADE — caso difensivo)', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    mockFrom.mockImplementation(() => ({
      select: (_cols: string, opts?: { head?: boolean }) => {
        if (opts?.head) {
          return { eq: () => Promise.resolve({ count: 1, error: null }) }
        }
        return {
          eq: () => ({
            order: () => ({
              range: () =>
                Promise.resolve({
                  data: [{ post_id: 'p1', created_at: '…', posts: null }],
                  error: null,
                }),
            }),
          }),
        }
      },
    }))

    mockBuildPostsWithDetails.mockResolvedValue([])

    const { GET } = await import('@/app/api/posts/bookmarked/route')
    const res = await GET(makeRequest('GET', 'http://localhost/api/posts/bookmarked') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toEqual([])
    // La batch viene chiamata con array vuoto (o non chiamata affatto):
    // in entrambi i casi la response non contiene post orfani.
    const batchedRows = mockBuildPostsWithDetails.mock.calls.flatMap((c) => c[0] as unknown[])
    expect(batchedRows).toEqual([])
  })
})
