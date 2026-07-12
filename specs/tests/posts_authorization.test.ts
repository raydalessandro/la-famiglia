// @vitest-environment node
/**
 * Authorization test per DELETE /api/posts/:id (B1 — security audit
 * follow-up).
 *
 * Regola implementata (src/app/api/posts/[id]/route.ts):
 *   DELETE consentito SOLO se caller è l'autore (post.author_id) oppure
 *   admin. Altrimenti 403. Senza auth → 401. Post inesistente → 404.
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

vi.mock('@/lib/storage', () => ({
  deleteImage: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/posts', () => ({
  buildPostWithDetails: vi.fn(),
  buildPostsWithDetails: vi.fn(),
}))

vi.mock('@/lib/mentions', () => ({
  deleteMentionsForSource: vi.fn(() => Promise.resolve()),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const AUTHOR = {
  id: 'member-author',
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

const STRANGER = { ...AUTHOR, id: 'member-stranger', name: 'Wario', is_admin: false }
const ADMIN = { ...AUTHOR, id: 'member-admin', name: 'Admin', is_admin: true }

const MOCK_POST = {
  id: 'post-1',
  author_id: 'member-author',
  text: 'Ciao famiglia',
  post_type: 'normal',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Supabase builder
// ---------------------------------------------------------------------------
function setupPostsDb(opts: { post?: unknown; postError?: unknown } = {}) {
  const deleteCalls: Array<[string, unknown]> = []
  mockFrom.mockImplementation((table: string) => {
    if (table === 'posts') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: opts.post === undefined ? MOCK_POST : opts.post,
                error: opts.postError ?? null,
              })
            ),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn((col: string, val: unknown) => {
            deleteCalls.push([col, val])
            return Promise.resolve({ error: null })
          }),
        })),
      }
    }
    if (table === 'post_images' || table === 'post_comments') {
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    }
    throw new Error(`Tabella inattesa: ${table}`)
  })
  return { deleteCalls }
}

function makeRequest(method: string): Request {
  return new Request('http://localhost/api/posts/post-1', { method })
}

const params = { params: Promise.resolve({ id: 'post-1' }) }

const UNAUTHENTICATED = () =>
  NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id — authorization
// ---------------------------------------------------------------------------
describe('DELETE /api/posts/:id — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { DELETE } = await import('@/app/api/posts/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as never, params)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('403 se il caller non è né autore né admin (nessun DELETE eseguito)', async () => {
    mockRequireAuth.mockResolvedValueOnce(STRANGER)
    const { deleteCalls } = setupPostsDb()

    const { DELETE } = await import('@/app/api/posts/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as never, params)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
    expect(deleteCalls).toEqual([]) // il post NON viene toccato
  })

  it('200 quando l\'autore elimina il proprio post', async () => {
    mockRequireAuth.mockResolvedValueOnce(AUTHOR)
    const { deleteCalls } = setupPostsDb()

    const { DELETE } = await import('@/app/api/posts/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as never, params)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.error).toBeNull()
    expect(deleteCalls).toEqual([['id', 'post-1']])
  })

  it('200 quando un admin elimina il post di un altro', async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN)
    const { deleteCalls } = setupPostsDb()

    const { DELETE } = await import('@/app/api/posts/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as never, params)

    expect(res.status).toBe(200)
    expect(deleteCalls).toEqual([['id', 'post-1']])
  })

  it('404 se il post non esiste', async () => {
    mockRequireAuth.mockResolvedValueOnce(AUTHOR)
    setupPostsDb({ post: null, postError: { message: 'not found' } })

    const { DELETE } = await import('@/app/api/posts/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as never, params)

    expect(res.status).toBe(404)
  })
})
