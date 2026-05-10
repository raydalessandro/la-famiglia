// @vitest-environment node
/**
 * Tests for GET / POST /api/chat/groups/:id/messages
 *
 * Bug 1: Missing membership check — anyone authenticated can read/write
 *   any chat group's messages, even private DMs they're not part of.
 *
 * Bug 2: Pagination shape mismatch — the route returns ApiResponse<...>
 *   but the hook expects PaginatedResponse<...> with `has_more`, so
 *   `loadMore` never works.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url: string = 'http://localhost/api/chat/groups/group-1/messages',
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

// ---------------------------------------------------------------------------
// Canonical mock objects
// ---------------------------------------------------------------------------

const MEMBER_IN_GROUP = {
  id: 'member-1',
  name: 'Mario',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  pin_hash: 'h',
  is_admin: false,
  is_active: true,
  color: '#ff0000',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const MEMBER_NOT_IN_GROUP = {
  ...MEMBER_IN_GROUP,
  id: 'outsider-9',
  name: 'Outsider',
  is_admin: false,
}

const ADMIN_NOT_IN_GROUP = {
  ...MEMBER_IN_GROUP,
  id: 'admin-7',
  name: 'BigBoss',
  is_admin: true,
}

const MOCK_MESSAGE = {
  id: 'msg-1',
  group_id: 'group-1',
  author_id: 'member-1',
  text: 'Ciao',
  message_type: 'text',
  media_url: null,
  created_at: '2026-05-01T00:00:00Z',
  author: {
    id: 'member-1',
    name: 'Mario',
    avatar_emoji: '🍕',
    color: '#ff0000',
  },
}

// ---------------------------------------------------------------------------
// vi.mock declarations
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Late imports
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import {
  GET as messagesGET,
  POST as messagesPOST,
} from '@/app/api/chat/groups/[id]/messages/route'

const mockRequireAuth = vi.mocked(requireAuth)
const mockCreateServerClient = vi.mocked(createServerClient)

// ---------------------------------------------------------------------------
// Supabase per-table mock builder
// ---------------------------------------------------------------------------

type TableConfig = {
  // chat_group_members: lookup of (group_id, member_id) → membership row | null
  membership?: { data: unknown; error: unknown }
  // chat_messages: SELECT (paginated)
  messagesSelect?: { data: unknown[] | null; error: unknown; count?: number | null }
  // chat_messages: INSERT
  messagesInsert?: { data: unknown; error: unknown }
  // chat_messages: SELECT one (after insert, with author join)
  messagesEnrich?: { data: unknown; error: unknown }
}

function makeDb(cfg: TableConfig = {}) {
  const fromMock = vi.fn((table: string) => {
    if (table === 'chat_group_members') {
      // Used as: db.from('chat_group_members').select('*').eq('group_id', x).eq('member_id', y).maybeSingle()
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(() => Promise.resolve(
        cfg.membership ?? { data: null, error: null }
      ))
      builder.single = vi.fn(() => Promise.resolve(
        cfg.membership ?? { data: null, error: null }
      ))
      return builder
    }

    if (table === 'chat_messages') {
      const builder: Record<string, unknown> = {}

      // SELECT pathway — supports both head:true (count) and data fetches.
      builder.select = vi.fn((_cols?: string, options?: { count?: string; head?: boolean }) => {
        const inner: Record<string, unknown> = {}
        const isHeadCount = options?.head === true

        inner.eq = vi.fn(() => inner)
        inner.order = vi.fn(() => inner)
        inner.range = vi.fn(() => Promise.resolve(
          cfg.messagesSelect ?? { data: [], error: null, count: 0 }
        ))
        inner.single = vi.fn(() => Promise.resolve(
          cfg.messagesEnrich ?? { data: MOCK_MESSAGE, error: null }
        ))

        // For count(*, { head: true }): the chain is .select(...).eq(...) and the
        // result is awaited directly (no .range). Make `inner` thenable too.
        if (isHeadCount) {
          ;(inner as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown
          ) =>
            Promise.resolve(
              cfg.messagesSelect ?? { data: null, error: null, count: 0 }
            ).then(resolve)
        } else {
          // Allow `await db.from('chat_messages').select(...).eq(...)` (no .range)
          ;(inner as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown
          ) =>
            Promise.resolve(
              cfg.messagesSelect ?? { data: [], error: null, count: 0 }
            ).then(resolve)
        }

        return inner
      })

      // INSERT pathway: .insert(...).select('*').single()
      builder.insert = vi.fn(() => {
        const inner: Record<string, unknown> = {}
        inner.select = vi.fn(() => inner)
        inner.single = vi.fn(() => Promise.resolve(
          cfg.messagesInsert ?? { data: MOCK_MESSAGE, error: null }
        ))
        return inner
      })

      return builder
    }

    if (table === 'chat_read_status') {
      const builder: Record<string, unknown> = {}
      builder.upsert = vi.fn(() => Promise.resolve({ data: null, error: null }))
      builder.insert = vi.fn(() => Promise.resolve({ data: null, error: null }))
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
      return builder
    }

    // Default: noop chainable
    const noop: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'range', 'single', 'maybeSingle']
    for (const m of methods) noop[m] = vi.fn(() => noop)
    ;(noop as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve)
    return noop
  })

  return { from: fromMock } as unknown as ReturnType<typeof createServerClient>
}

// ---------------------------------------------------------------------------
// Bug 1: membership check
// ---------------------------------------------------------------------------

describe('GET /api/chat/groups/:id/messages — membership check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 and messages when caller is a member of the group', async () => {
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: [MOCK_MESSAGE], error: null, count: 1 },
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.error).toBeNull()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBe(1)
  })

  it('returns 403 when caller is NOT a member of the group', async () => {
    mockRequireAuth.mockResolvedValue(MEMBER_NOT_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: null, error: null }, // no membership row
      messagesSelect: { data: [MOCK_MESSAGE], error: null, count: 1 },
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(403)
    expect(body.data).toBeNull()
    expect(body.error).toBeTruthy()
  })

  it('admin caller bypasses the membership check', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN_NOT_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: null, error: null }, // admin not in group
      messagesSelect: { data: [], error: null, count: 0 },
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
  })
})

describe('POST /api/chat/groups/:id/messages — membership check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 201 when caller is a member', async () => {
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
      messagesEnrich: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Ciao',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(201)
    expect(body.error).toBeNull()
    expect(body.data).toBeDefined()
  })

  it('returns 403 when caller is NOT a member', async () => {
    mockRequireAuth.mockResolvedValue(MEMBER_NOT_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: null, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Spam',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(403)
    expect(body.data).toBeNull()
    expect(body.error).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// POST validation (independent of membership; we keep caller as a member)
// ---------------------------------------------------------------------------

describe('POST /api/chat/groups/:id/messages — body validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
  })

  it('returns 400 when neither text nor media_url provided', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {})
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
    expect(body.data).toBeNull()
  })

  it('returns 400 when media_url provided without message_type', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      media_url: 'http://example.com/x.jpg',
      // no message_type → defaults to 'text', and text is missing → 400
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 201 with valid text', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
      messagesEnrich: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Buongiorno',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(201)
    expect(body.data).toBeDefined()
  })

  it('returns 201 with valid image (message_type=image + media_url)', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesInsert: {
        data: { ...MOCK_MESSAGE, message_type: 'image', media_url: 'http://example.com/x.jpg' },
        error: null,
      },
      messagesEnrich: {
        data: { ...MOCK_MESSAGE, message_type: 'image', media_url: 'http://example.com/x.jpg' },
        error: null,
      },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      message_type: 'image',
      media_url: 'http://example.com/x.jpg',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(201)
    expect(body.data).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Bug 2: PaginatedResponse shape
// ---------------------------------------------------------------------------

describe('GET /api/chat/groups/:id/messages — pagination shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
  })

  it('page=1 per_page=2 with 3 total returns has_more: true', async () => {
    const messages = [
      { ...MOCK_MESSAGE, id: 'msg-3', created_at: '2026-05-03T00:00:00Z' },
      { ...MOCK_MESSAGE, id: 'msg-2', created_at: '2026-05-02T00:00:00Z' },
    ]
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: messages, error: null, count: 3 },
    }))

    const req = makeRequest('GET', 'http://localhost/api/chat/groups/group-1/messages?page=1&per_page=2')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.error).toBeNull()
    expect(body.data.length).toBe(2)
    expect(body.page).toBe(1)
    expect(body.per_page).toBe(2)
    expect(body.total).toBe(3)
    expect(body.has_more).toBe(true)
  })

  it('page=2 per_page=2 with 3 total returns has_more: false', async () => {
    const messages = [
      { ...MOCK_MESSAGE, id: 'msg-1', created_at: '2026-05-01T00:00:00Z' },
    ]
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: messages, error: null, count: 3 },
    }))

    const req = makeRequest('GET', 'http://localhost/api/chat/groups/group-1/messages?page=2&per_page=2')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.data.length).toBe(1)
    expect(body.page).toBe(2)
    expect(body.per_page).toBe(2)
    expect(body.total).toBe(3)
    expect(body.has_more).toBe(false)
  })
})
