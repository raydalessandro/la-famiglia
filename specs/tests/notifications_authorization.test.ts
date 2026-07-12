// @vitest-environment node
/**
 * Authorization test per /api/notifications (B1 — security audit
 * follow-up).
 *
 * Regole implementate (src/app/api/notifications/route.ts):
 *  - GET: solo autenticati (401). SELF-SCOPING: la query filtra sempre
 *    per .eq('member_id', caller.id) — nessuno legge notifiche altrui.
 *  - PATCH: solo autenticati (401). Sia il path `all: true` sia il path
 *    `notification_ids` sono scoped al member_id del caller: non è
 *    possibile marcare come lette le notifiche di un altro membro anche
 *    passando i loro id.
 *
 * Pattern "filterCalls" come in posts_bookmark.test.ts: registriamo le
 * chiamate .eq()/.in() e verifichiamo il filtro member_id.
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

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MEMBER_ALICE = { id: 'alice', name: 'Alice', is_admin: false }

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/notifications', {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const UNAUTHENTICATED = () =>
  NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET /api/notifications
// ---------------------------------------------------------------------------
describe('GET /api/notifications — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { GET } = await import('@/app/api/notifications/route')
    const res = await GET(makeRequest('GET') as never)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('SELF-SCOPING: la query filtra per member_id del caller', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    const filterCalls: Array<[string, unknown]> = []
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          filterCalls.push([col, val])
          return {
            order: () =>
              Promise.resolve({
                data: [{ id: 'n1', member_id: 'alice', is_read: false }],
                error: null,
              }),
          }
        },
      }),
    }))

    const { GET } = await import('@/app/api/notifications/route')
    const res = await GET(makeRequest('GET') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(1)
    // ← critico: le notifiche sono sempre filtrate per il caller
    expect(filterCalls).toEqual([['member_id', 'alice']])
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/notifications
// ---------------------------------------------------------------------------
describe('PATCH /api/notifications — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { PATCH } = await import('@/app/api/notifications/route')
    const res = await PATCH(makeRequest('PATCH', { all: true }) as never)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('all: true — l\'UPDATE è scoped a member_id del caller', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    const filterCalls: Array<[string, unknown]> = []
    mockFrom.mockImplementation(() => ({
      update: () => ({
        eq: (col1: string, val1: unknown) => {
          filterCalls.push([col1, val1])
          return {
            eq: (col2: string, val2: unknown) => {
              filterCalls.push([col2, val2])
              return Promise.resolve({ error: null })
            },
          }
        },
      }),
    }))

    const { PATCH } = await import('@/app/api/notifications/route')
    const res = await PATCH(makeRequest('PATCH', { all: true }) as never)

    expect(res.status).toBe(200)
    expect(filterCalls).toEqual([
      ['member_id', 'alice'], // ← critico: mai un update globale
      ['is_read', false],
    ])
  })

  it('notification_ids — l\'UPDATE filtra per member_id oltre che per id', async () => {
    // Alice passa anche id di notifiche NON sue: il filtro .eq('member_id')
    // garantisce che l'UPDATE tocchi solo le righe di Alice.
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    const inCalls: Array<[string, unknown]> = []
    const filterCalls: Array<[string, unknown]> = []
    mockFrom.mockImplementation(() => ({
      update: () => ({
        in: (col: string, vals: unknown) => {
          inCalls.push([col, vals])
          return {
            eq: (col2: string, val2: unknown) => {
              filterCalls.push([col2, val2])
              return Promise.resolve({ error: null })
            },
          }
        },
      }),
    }))

    const { PATCH } = await import('@/app/api/notifications/route')
    const res = await PATCH(
      makeRequest('PATCH', { notification_ids: ['n1', 'n-di-bob'] }) as never
    )

    expect(res.status).toBe(200)
    expect(inCalls).toEqual([['id', ['n1', 'n-di-bob']]])
    // ← critico: anche con id arbitrari, tocca solo le notifiche del caller
    expect(filterCalls).toEqual([['member_id', 'alice']])
  })

  it('400 se il body non contiene né notification_ids né all: true', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_ALICE)

    const { PATCH } = await import('@/app/api/notifications/route')
    const res = await PATCH(makeRequest('PATCH', {}) as never)

    expect(res.status).toBe(400)
  })
})
