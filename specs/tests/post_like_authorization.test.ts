// @vitest-environment node
/**
 * Authorization test per POST /api/posts/:id/like (B1 — security audit
 * follow-up).
 *
 * Regola implementata (src/app/api/posts/[id]/like/route.ts):
 *  - POST: solo autenticati (401 senza sessione). Il toggle è scoped al
 *    member_id del caller (.eq('member_id', caller.id)) — non è possibile
 *    mettere/togliere like a nome di altri.
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
const MEMBER = { id: 'member-1', name: 'Mario', is_admin: false }

function makeRequest(): Request {
  return new Request('http://localhost/api/posts/post-1/like', { method: 'POST' })
}

const params = { params: Promise.resolve({ id: 'post-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// POST /api/posts/:id/like
// ---------------------------------------------------------------------------
describe('POST /api/posts/:id/like — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 }),
    )

    const { POST } = await import('@/app/api/posts/[id]/like/route')
    const res = await POST(makeRequest() as never, params)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('il toggle è scoped al member_id del caller (anti-spoofing)', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)

    const eqCalls: Array<[string, unknown]> = []
    let insertedRow: Record<string, unknown> | null = null
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: (col1: string, val1: unknown) => {
          eqCalls.push([col1, val1])
          return {
            eq: (col2: string, val2: unknown) => {
              eqCalls.push([col2, val2])
              return {
                // Nessun like esistente → il route inserisce
                single: () =>
                  Promise.resolve({ data: null, error: { code: 'PGRST116' } }),
              }
            },
          }
        },
      }),
      insert: (row: Record<string, unknown>) => {
        insertedRow = row
        return Promise.resolve({ error: null })
      },
    }))

    const { POST } = await import('@/app/api/posts/[id]/like/route')
    const res = await POST(makeRequest() as never, params)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toEqual({ liked: true })
    // ← critico: lookup filtrato per il caller, insert con l'id del caller
    expect(eqCalls).toEqual([
      ['post_id', 'post-1'],
      ['member_id', 'member-1'],
    ])
    expect(insertedRow).toEqual({ post_id: 'post-1', member_id: 'member-1' })
  })
})
