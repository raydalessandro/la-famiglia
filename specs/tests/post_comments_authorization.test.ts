// @vitest-environment node
/**
 * Authorization test per /api/posts/:id/comments (B1 — security audit
 * follow-up).
 *
 * Regole implementate (src/app/api/posts/[id]/comments/route.ts):
 *  - GET: solo autenticati (401 senza sessione). Family app: tutti i
 *    membri autenticati possono leggere i commenti di ogni post.
 *  - POST: solo autenticati (401 senza sessione). Ogni membro può
 *    commentare; l'author_id viene preso dalla sessione, mai dal body.
 *  - NON esiste una route DELETE per i commenti (nessun file
 *    comments/[commentId]/route.ts): niente regole autore/admin da coprire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
  // La route usa toPublicMember per lo shape dell'autore nel payload
  toPublicMember: vi.fn((m: Record<string, unknown>) => m),
}))

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

vi.mock('@/lib/notifications', () => ({
  notifyMembers: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/notification-events', () => ({
  emit: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/mentions', () => ({
  parseMentions: vi.fn(() => []),
  insertMentions: vi.fn(() => Promise.resolve([])),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MEMBER = {
  id: 'member-1',
  name: 'Mario',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  pin_hash: 'h',
  is_admin: false,
  is_active: true,
  color: '#fff',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const MOCK_COMMENT = {
  id: 'comment-1',
  post_id: 'post-1',
  author_id: 'member-1',
  text: 'Bellissimo!',
  created_at: '2026-05-01T00:00:00Z',
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/posts/post-1/comments', {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const params = { params: Promise.resolve({ id: 'post-1' }) }

const UNAUTHENTICATED = () =>
  NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET /api/posts/:id/comments
// ---------------------------------------------------------------------------
describe('GET /api/posts/:id/comments — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { GET } = await import('@/app/api/posts/[id]/comments/route')
    const res = await GET(makeRequest('GET') as never, params)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('200 per un membro autenticato', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [{ ...MOCK_COMMENT, members: MEMBER }],
              error: null,
            }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/posts/[id]/comments/route')
    const res = await GET(makeRequest('GET') as never, params)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].author).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// POST /api/posts/:id/comments
// ---------------------------------------------------------------------------
describe('POST /api/posts/:id/comments — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { POST } = await import('@/app/api/posts/[id]/comments/route')
    const res = await POST(makeRequest('POST', { text: 'Ciao' }) as never, params)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('201 per un membro autenticato; author_id preso dalla sessione', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)

    let insertedRow: Record<string, unknown> | null = null
    mockFrom.mockImplementation((table: string) => {
      if (table === 'posts') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { author_id: 'member-2' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'post_comments') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertedRow = row
            return {
              select: () => ({
                single: () => Promise.resolve({ data: MOCK_COMMENT, error: null }),
              }),
            }
          },
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { ...MOCK_COMMENT, members: MEMBER },
                  error: null,
                }),
            }),
          }),
        }
      }
      // members (mention pipeline fire-and-forget)
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    })

    const { POST } = await import('@/app/api/posts/[id]/comments/route')
    const res = await POST(makeRequest('POST', { text: 'Bellissimo!' }) as never, params)

    expect(res.status).toBe(201)
    // ← critico: l'author_id viene dalla sessione (anti-spoofing), non dal body
    expect(insertedRow).toEqual({
      post_id: 'post-1',
      author_id: 'member-1',
      text: 'Bellissimo!',
    })
  })

  it('404 se il post non esiste', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/posts/[id]/comments/route')
    const res = await POST(makeRequest('POST', { text: 'Ciao' }) as never, params)

    expect(res.status).toBe(404)
  })
})
