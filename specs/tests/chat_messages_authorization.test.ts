// @vitest-environment node
/**
 * Authorization test per le route dei messaggi chat (B1 — security audit
 * follow-up).
 *
 * Regole implementate:
 *  - /api/chat/groups/:id/messages (GET/POST):
 *      401 senza auth; 403 se il caller NON è membro del gruppo
 *      (ensureMembership); gli admin bypassano il check di membership.
 *  - /api/chat/messages/:id (PATCH/DELETE):
 *      401 senza auth; solo l'AUTORE può modificare/eliminare (403 per
 *      chiunque altro, admin inclusi — regola implementata così di
 *      proposito). La PATCH è inoltre limitata alla finestra di 2 minuti
 *      da created_at (EDIT_WINDOW_MS).
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
  uploadImage: vi.fn(() => Promise.resolve('https://cdn/test.jpg')),
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
  color: '#fff',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const OUTSIDER = { ...MEMBER_IN_GROUP, id: 'outsider-9', name: 'Outsider', is_admin: false }
const ADMIN_NOT_IN_GROUP = { ...MEMBER_IN_GROUP, id: 'admin-7', name: 'BigBoss', is_admin: true }

const MOCK_MESSAGE = {
  id: 'msg-1',
  group_id: 'group-1',
  author_id: 'member-1',
  text: 'Ciao',
  message_type: 'text',
  media_url: null,
  reply_to_message_id: null,
  deleted_at: null,
  edited_at: null,
  created_at: '2026-05-01T00:00:00Z',
  author: { id: 'member-1', name: 'Mario', avatar_emoji: '🍕', color: '#fff' },
}

const UNAUTHENTICATED = () =>
  NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * DB per la route /api/chat/groups/:id/messages.
 * `membership` — riga di chat_group_members per (group, caller) o null.
 */
function setupGroupMessagesDb(opts: { membership?: unknown } = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'chat_group_members') {
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: opts.membership ?? null, error: null })
      )
      ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    }
    if (table === 'chat_messages') {
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => {
        const inner: Record<string, unknown> = {}
        inner.eq = vi.fn(() => inner)
        inner.order = vi.fn(() => inner)
        inner.range = vi.fn(() => Promise.resolve({ data: [], error: null }))
        inner.single = vi.fn(() => Promise.resolve({ data: MOCK_MESSAGE, error: null }))
        inner.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
        inner.in = vi.fn(() => {
          const innerIn: Record<string, unknown> = {}
          ;(innerIn as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve)
          return innerIn
        })
        ;(inner as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: 0 }).then(resolve)
        return inner
      })
      builder.insert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: MOCK_MESSAGE, error: null })),
        })),
      }))
      return builder
    }
    if (table === 'chat_read_status') {
      return { upsert: vi.fn(() => Promise.resolve({ error: null })) }
    }
    // default chainable (es. members per il mention pipeline fire-and-forget)
    const noop: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'range', 'single', 'maybeSingle']
    for (const m of methods) noop[m] = vi.fn(() => noop)
    ;(noop as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve)
    return noop
  })
}

/**
 * DB per la route /api/chat/messages/:id (edit/delete).
 * `message` — la riga restituita dal lookup iniziale, o null (404).
 */
function setupSingleMessageDb(opts: { message?: unknown } = {}) {
  const updateCalls: Array<Record<string, unknown>> = []
  mockFrom.mockImplementation((table: string) => {
    if (table === 'chat_messages') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: opts.message ?? null, error: null })
            ),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updateCalls.push(payload)
          return { eq: vi.fn(() => Promise.resolve({ error: null })) }
        }),
      }
    }
    throw new Error(`Tabella inattesa: ${table}`)
  })
  return { updateCalls }
}

function makeMessagesRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/chat/groups/group-1/messages', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeMessageRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/chat/messages/msg-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const groupParams = { params: Promise.resolve({ id: 'group-1' }) }
const messageParams = { params: Promise.resolve({ id: 'msg-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET /api/chat/groups/:id/messages
// ---------------------------------------------------------------------------
describe('GET /api/chat/groups/:id/messages — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { GET } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await GET(makeMessagesRequest('GET') as never, groupParams)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('403 se il caller NON è membro del gruppo (ensureMembership)', async () => {
    mockRequireAuth.mockResolvedValueOnce(OUTSIDER)
    setupGroupMessagesDb({ membership: null })

    const { GET } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await GET(makeMessagesRequest('GET') as never, groupParams)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBeTruthy()
  })

  it('200 se il caller è membro del gruppo', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_IN_GROUP)
    setupGroupMessagesDb({ membership: { id: 'gm-1' } })

    const { GET } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await GET(makeMessagesRequest('GET') as never, groupParams)

    expect(res.status).toBe(200)
  })

  it('un admin NON membro bypassa il check di membership (200)', async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_NOT_IN_GROUP)
    setupGroupMessagesDb({ membership: null })

    const { GET } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await GET(makeMessagesRequest('GET') as never, groupParams)

    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// POST /api/chat/groups/:id/messages
// ---------------------------------------------------------------------------
describe('POST /api/chat/groups/:id/messages — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { POST } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await POST(makeMessagesRequest('POST', { text: 'Ciao' }) as never, groupParams)

    expect(res.status).toBe(401)
  })

  it('403 se il caller NON è membro del gruppo (ensureMembership)', async () => {
    mockRequireAuth.mockResolvedValueOnce(OUTSIDER)
    setupGroupMessagesDb({ membership: null })

    const { POST } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await POST(makeMessagesRequest('POST', { text: 'Intruso!' }) as never, groupParams)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBeTruthy()
  })

  it('201 se il caller è membro del gruppo', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_IN_GROUP)
    setupGroupMessagesDb({ membership: { id: 'gm-1' } })

    const { POST } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await POST(makeMessagesRequest('POST', { text: 'Ciao' }) as never, groupParams)

    expect(res.status).toBe(201)
  })

  it('un admin NON membro bypassa il check di membership (201)', async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN_NOT_IN_GROUP)
    setupGroupMessagesDb({ membership: null })

    const { POST } = await import('@/app/api/chat/groups/[id]/messages/route')
    const res = await POST(makeMessagesRequest('POST', { text: 'Ciao' }) as never, groupParams)

    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/chat/messages/:id — solo autore, entro finestra
// ---------------------------------------------------------------------------
describe('PATCH /api/chat/messages/:id — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const res = await PATCH(makeMessageRequest('PATCH', { text: 'Fix' }) as never, messageParams)

    expect(res.status).toBe(401)
  })

  it('403 se il caller NON è l\'autore del messaggio', async () => {
    mockRequireAuth.mockResolvedValueOnce(OUTSIDER)
    const { updateCalls } = setupSingleMessageDb({
      message: {
        id: 'msg-1',
        author_id: 'member-1', // autore diverso dal caller
        created_at: new Date().toISOString(),
        deleted_at: null,
        message_type: 'text',
      },
    })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const res = await PATCH(makeMessageRequest('PATCH', { text: 'Hijack' }) as never, messageParams)

    expect(res.status).toBe(403)
    expect(updateCalls).toEqual([]) // nessun UPDATE eseguito
  })

  it('200 se l\'autore modifica entro la finestra di edit', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_IN_GROUP)
    setupSingleMessageDb({
      message: {
        id: 'msg-1',
        author_id: 'member-1',
        created_at: new Date().toISOString(), // appena creato → in finestra
        deleted_at: null,
        message_type: 'text',
      },
    })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const res = await PATCH(makeMessageRequest('PATCH', { text: 'Typo fixato' }) as never, messageParams)

    expect(res.status).toBe(200)
  })

  it('403 se l\'autore prova a modificare oltre la finestra di 2 minuti', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_IN_GROUP)
    setupSingleMessageDb({
      message: {
        id: 'msg-1',
        author_id: 'member-1',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min fa
        deleted_at: null,
        message_type: 'text',
      },
    })

    const { PATCH } = await import('@/app/api/chat/messages/[id]/route')
    const res = await PATCH(makeMessageRequest('PATCH', { text: 'Troppo tardi' }) as never, messageParams)

    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/chat/messages/:id — solo autore
// ---------------------------------------------------------------------------
describe('DELETE /api/chat/messages/:id — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { DELETE } = await import('@/app/api/chat/messages/[id]/route')
    const res = await DELETE(makeMessageRequest('DELETE') as never, messageParams)

    expect(res.status).toBe(401)
  })

  it('403 se il caller NON è l\'autore del messaggio', async () => {
    mockRequireAuth.mockResolvedValueOnce(OUTSIDER)
    const { updateCalls } = setupSingleMessageDb({
      message: { id: 'msg-1', author_id: 'member-1', deleted_at: null },
    })

    const { DELETE } = await import('@/app/api/chat/messages/[id]/route')
    const res = await DELETE(makeMessageRequest('DELETE') as never, messageParams)

    expect(res.status).toBe(403)
    expect(updateCalls).toEqual([]) // nessun soft-delete eseguito
  })

  it('200 se l\'autore elimina il proprio messaggio (soft-delete)', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER_IN_GROUP)
    const { updateCalls } = setupSingleMessageDb({
      message: { id: 'msg-1', author_id: 'member-1', deleted_at: null },
    })

    const { DELETE } = await import('@/app/api/chat/messages/[id]/route')
    const res = await DELETE(makeMessageRequest('DELETE') as never, messageParams)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.deleted_at).toBeTruthy()
    // Tombstone: UPDATE di deleted_at, non DELETE fisico
    expect(updateCalls).toHaveLength(1)
    expect(Object.keys(updateCalls[0])).toEqual(['deleted_at'])
  })
})
