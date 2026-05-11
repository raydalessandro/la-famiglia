// @vitest-environment node
/**
 * Tests for POST/DELETE /api/posts/[id]/reactions (Fase 2 — F3.2).
 *
 * Reactions are 3 predefined emoji (❤️ 😄 👏). A member can leave one of
 * each on a post, but the same (post, member, emoji) triple is UNIQUE —
 * POST is therefore idempotent. DELETE removes a single (post, member,
 * emoji) tuple.
 *
 * Pattern follows auth_routes.test.ts: mock requireAuth + createServerClient,
 * import handlers AFTER mocks, drive responses through a chainable builder.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

async function parseResponse(res: Response): Promise<{ status: number; body: any }> {
  const body = await res.json()
  return { status: res.status, body }
}

function makeContext(postId: string) {
  return { params: Promise.resolve({ id: postId }) }
}

// ---------------------------------------------------------------------------
// Mock module setup — must be hoisted before route imports
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  requireAuth: vi.fn(),
  toPublicMember: vi.fn((m: any) => m),
}))

vi.mock('../../src/lib/supabase/client', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('../../src/lib/notifications', () => ({
  notifyMembers: vi.fn(async () => undefined),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}))

// ---------------------------------------------------------------------------
// Late imports
// ---------------------------------------------------------------------------

import * as authLib from '../../src/lib/auth'
import { createServerClient } from '../../src/lib/supabase/client'
import * as notifLib from '../../src/lib/notifications'

import {
  POST as reactionsPOST,
  DELETE as reactionsDELETE,
} from '../../src/app/api/posts/[id]/reactions/route'

const mockRequireAuth = vi.mocked(authLib.requireAuth)
const mockCreateServerClient = vi.mocked(createServerClient)
const mockNotifyMembers = vi.mocked(notifLib.notifyMembers)

// ---------------------------------------------------------------------------
// Canonical fixtures
// ---------------------------------------------------------------------------

const MOCK_MEMBER = {
  id: 'member-1',
  name: 'Maria',
  avatar_emoji: '👵',
  avatar_url: null,
  family_role: 'nonna',
  bio: '',
  pin_hash: 'h',
  is_admin: false,
  is_active: true,
  color: '#E8A838',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const POST_ID = 'post-1'
const POST_AUTHOR_ID = 'member-2' // different from MOCK_MEMBER.id

const MOCK_REACTION = {
  id: 'reaction-1',
  post_id: POST_ID,
  member_id: MOCK_MEMBER.id,
  emoji: '❤️',
  created_at: '2026-01-02T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Chainable supabase mock — different behavior per .from(table)
// ---------------------------------------------------------------------------

type BuilderState = {
  post?: { data: any; error: any }
  existingReaction?: { data: any; error: any }
  insertedReaction?: { data: any; error: any }
  deleteCount?: number
}

function makeSupabase(state: BuilderState) {
  const fromMock = vi.fn((table: string) => {
    if (table === 'posts') {
      const b: any = {}
      b.select = vi.fn().mockReturnValue(b)
      b.eq = vi.fn().mockReturnValue(b)
      b.single = vi.fn().mockResolvedValue(state.post ?? { data: null, error: { code: 'PGRST116' } })
      return b
    }
    if (table === 'post_reactions') {
      const b: any = {}
      // SELECT chain: from().select().eq().eq().eq().maybeSingle()
      b.select = vi.fn().mockReturnValue(b)
      b.eq = vi.fn().mockReturnValue(b)
      b.maybeSingle = vi.fn().mockResolvedValue(state.existingReaction ?? { data: null, error: null })
      b.single = vi.fn().mockResolvedValue(state.insertedReaction ?? { data: MOCK_REACTION, error: null })
      // INSERT chain: from().insert(...).select().single()
      b.insert = vi.fn().mockReturnValue(b)
      // DELETE chain: from().delete().eq().eq().eq()
      b.delete = vi.fn().mockImplementation(() => {
        const del: any = {}
        // After delete, .eq() calls are chained then thenable.
        del.eq = vi.fn().mockReturnValue(del)
        // Final resolve when awaited
        del.then = (onFulfilled: (v: any) => any) =>
          Promise.resolve({ data: null, error: null, count: state.deleteCount ?? 1 }).then(onFulfilled)
        return del
      })
      return b
    }
    return {} as any
  })

  return { from: fromMock } as unknown as ReturnType<typeof createServerClient>
}

// ---------------------------------------------------------------------------
// POST /api/posts/:id/reactions
// ---------------------------------------------------------------------------

describe('POST /api/posts/:id/reactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 }) as any,
    )

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, { emoji: '❤️' })
    const res = await reactionsPOST(req as any, makeContext(POST_ID))
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(401)
  })

  it('returns 400 when emoji is missing', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, {})
    const res = await reactionsPOST(req as any, makeContext(POST_ID))
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
    expect(body.data).toBeNull()
    expect(body.error).toBeTruthy()
  })

  it('returns 400 when emoji is not whitelisted', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, { emoji: '🍕' })
    const res = await reactionsPOST(req as any, makeContext(POST_ID))
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 404 when post does not exist', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)
    mockCreateServerClient.mockReturnValue(
      makeSupabase({ post: { data: null, error: { code: 'PGRST116' } } }),
    )

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, { emoji: '❤️' })
    const res = await reactionsPOST(req as any, makeContext(POST_ID))
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(404)
  })

  it('returns 201 with reaction body on first POST', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        post: { data: { id: POST_ID, author_id: POST_AUTHOR_ID }, error: null },
        existingReaction: { data: null, error: null },
        insertedReaction: { data: MOCK_REACTION, error: null },
      }),
    )

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, { emoji: '❤️' })
    const res = await reactionsPOST(req as any, makeContext(POST_ID))
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(201)
    expect(body.error).toBeNull()
    expect(body.data.reaction).toMatchObject({
      post_id: POST_ID,
      member_id: MOCK_MEMBER.id,
      emoji: '❤️',
    })
  })

  it('returns 200 idempotent when reaction already exists', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        post: { data: { id: POST_ID, author_id: POST_AUTHOR_ID }, error: null },
        existingReaction: { data: MOCK_REACTION, error: null },
      }),
    )

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, { emoji: '❤️' })
    const res = await reactionsPOST(req as any, makeContext(POST_ID))
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.data.reaction.id).toBe(MOCK_REACTION.id)
  })

  it('notifies post author when reactor is different', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        post: { data: { id: POST_ID, author_id: POST_AUTHOR_ID }, error: null },
        existingReaction: { data: null, error: null },
        insertedReaction: { data: MOCK_REACTION, error: null },
      }),
    )

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, { emoji: '❤️' })
    await reactionsPOST(req as any, makeContext(POST_ID))

    // notifyMembers is fire-and-forget — give the microtask queue a tick
    await new Promise((r) => setTimeout(r, 0))

    expect(mockNotifyMembers).toHaveBeenCalledTimes(1)
    expect(mockNotifyMembers).toHaveBeenCalledWith(
      [POST_AUTHOR_ID],
      expect.any(String), // notification type
      expect.any(String), // title
      expect.stringContaining(MOCK_MEMBER.name),
      `/posts/${POST_ID}`,
    )
  })

  it('does NOT notify when post author is the reactor', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)
    mockCreateServerClient.mockReturnValue(
      makeSupabase({
        post: { data: { id: POST_ID, author_id: MOCK_MEMBER.id }, error: null },
        existingReaction: { data: null, error: null },
        insertedReaction: { data: { ...MOCK_REACTION, member_id: MOCK_MEMBER.id }, error: null },
      }),
    )

    const req = makeRequest('POST', `http://localhost/api/posts/${POST_ID}/reactions`, { emoji: '❤️' })
    await reactionsPOST(req as any, makeContext(POST_ID))
    await new Promise((r) => setTimeout(r, 0))

    expect(mockNotifyMembers).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id/reactions?emoji=...
// ---------------------------------------------------------------------------

describe('DELETE /api/posts/:id/reactions?emoji=...', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 }) as any,
    )

    const req = makeRequest('DELETE', `http://localhost/api/posts/${POST_ID}/reactions?emoji=%E2%9D%A4%EF%B8%8F`)
    const res = await reactionsDELETE(req as any, makeContext(POST_ID))
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(401)
  })

  it('returns 400 when emoji query param is missing', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)

    const req = makeRequest('DELETE', `http://localhost/api/posts/${POST_ID}/reactions`)
    const res = await reactionsDELETE(req as any, makeContext(POST_ID))
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 400 when emoji is not whitelisted', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)

    const req = makeRequest('DELETE', `http://localhost/api/posts/${POST_ID}/reactions?emoji=🍕`)
    const res = await reactionsDELETE(req as any, makeContext(POST_ID))
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 200 with removed:true when reaction is removed', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)
    mockCreateServerClient.mockReturnValue(makeSupabase({ deleteCount: 1 }))

    const req = makeRequest('DELETE', `http://localhost/api/posts/${POST_ID}/reactions?emoji=❤️`)
    const res = await reactionsDELETE(req as any, makeContext(POST_ID))
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.error).toBeNull()
    expect(body.data.removed).toBe(true)
  })

  it('returns 200 with removed:false when nothing to remove (idempotent)', async () => {
    mockRequireAuth.mockResolvedValue(MOCK_MEMBER as any)
    mockCreateServerClient.mockReturnValue(makeSupabase({ deleteCount: 0 }))

    const req = makeRequest('DELETE', `http://localhost/api/posts/${POST_ID}/reactions?emoji=❤️`)
    const res = await reactionsDELETE(req as any, makeContext(POST_ID))
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.data.removed).toBe(false)
  })
})
