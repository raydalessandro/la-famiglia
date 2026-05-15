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

// emit() viene chiamato fire-and-forget dopo l'INSERT del messaggio.
// La route NON chiama più notifyMembers direttamente: tutto passa dal
// catalog (lib/notification-events.ts). Mockiamo emit per ispezionare
// che la route emetta l'evento corretto con il payload corretto —
// la logica "chi notificare / come formattare" è testata in
// notification_events.test.ts.
//
// vi.hoisted: vi.mock viene sollevato in cima al file, quindi non può
// referenziare variabili dichiarate dopo. Dichiarando mockEmit dentro
// vi.hoisted, anche la sua creazione viene sollevata.
const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/notification-events', () => ({
  emit: mockEmit,
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
  // chat_group_members: lista completa dei membri del gruppo (per notifiche
  // post-insert). Distinta da `membership` perché viene awaited senza
  // .maybeSingle() — è un select diretto su tutto.
  groupMemberList?: { data: { member_id: string }[] | null; error: unknown }
  // chat_messages: SELECT (paginated)
  messagesSelect?: { data: unknown[] | null; error: unknown; count?: number | null }
  // chat_messages: INSERT
  messagesInsert?: { data: unknown; error: unknown }
  // chat_messages: SELECT one (after insert, with author join)
  messagesEnrich?: { data: unknown; error: unknown }
  // chat_messages: parent reply lookup via .in('id', parentIds) — usato da
  // fetchReplyParents() per arricchire reply_to. Distinto da messagesSelect
  // perché la GET principale usa .range() (paginated), il lookup parents
  // usa .in(). Mantenerli separati ci permette di simulare risposte diverse
  // ai due path nello stesso test.
  parentLookup?: { data: unknown[] | null; error: unknown }
  // chat_messages: SELECT one con .eq('id', x).maybeSingle() — usato dalla
  // POST per validare reply_to_message_id appartiene allo stesso gruppo.
  replyValidate?: { data: unknown; error: unknown }
}

function makeDb(cfg: TableConfig = {}) {
  const fromMock = vi.fn((table: string) => {
    if (table === 'chat_group_members') {
      // Due use case:
      //   1. Membership check: .select('id').eq('group_id', x).eq('member_id', y).maybeSingle()
      //   2. Recipient lookup per notifyMembers: .select('member_id').eq('group_id', x)
      //      → awaited direttamente sull'oggetto builder (è thenable).
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(() => Promise.resolve(
        cfg.membership ?? { data: null, error: null }
      ))
      builder.single = vi.fn(() => Promise.resolve(
        cfg.membership ?? { data: null, error: null }
      ))
      ;(builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(cfg.groupMemberList ?? { data: [], error: null }).then(resolve)
      return builder
    }

    if (table === 'chat_messages') {
      const builder: Record<string, unknown> = {}

      // SELECT pathway — supports:
      //   1. head:true (count) — `.select('*', {count, head:true}).eq(...)`
      //   2. paginated data — `.select(...).eq(...).order(...).range(...)`
      //   3. enriched single — `.select(...).eq('id', x).single()` (POST flow)
      //   4. parent reply lookup — `.select(...).in('id', ids)` (fetchReplyParents)
      //   5. reply validation — `.select('id, group_id').eq('id', x).maybeSingle()` (POST flow)
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
        inner.maybeSingle = vi.fn(() => Promise.resolve(
          cfg.replyValidate ?? { data: null, error: null }
        ))
        // Parent reply lookup: .in('id', [...]) ritorna direttamente
        // (thenable). Usato da fetchReplyParents nella GET messages.
        inner.in = vi.fn(() => {
          const innerIn: Record<string, unknown> = {}
          ;(innerIn as any).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              cfg.parentLookup ?? { data: [], error: null }
            ).then(resolve)
          return innerIn
        })

        // For count(*, { head: true }): the chain is .select(...).eq(...) and the
        // result is awaited directly (no .range). Make `inner` thenable too.
        if (isHeadCount) {
          ;(inner as any).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              cfg.messagesSelect ?? { data: null, error: null, count: 0 }
            ).then(resolve)
        } else {
          // Allow `await db.from('chat_messages').select(...).eq(...)` (no .range)
          ;(inner as any).then = (resolve: (v: unknown) => unknown) =>
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
    ;(noop as any).then = (resolve: (v: unknown) => unknown) =>
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

// ---------------------------------------------------------------------------
// Bug 3: chat non notifica gli altri membri del gruppo
//
// Storia: 11/05/2026 — il toggle "Notifiche push" funzionava, la push di
// prova arrivava sia su Android sia iPhone, ma mandando un messaggio in
// chat l'altro membro non riceveva nulla. Root cause: la route POST chat
// messages non chiamava `notifyMembers` (lo facevano già i POST di
// posts/comments/reactions/events/tasks/attendance, ma la chat era
// rimasta fuori dal cablaggio iniziale).
// ---------------------------------------------------------------------------

describe('POST chat messages — emette evento chat_message', () => {
  // Da quando la route usa il catalog `notification-events`, qui
  // verifichiamo SOLO che la route emetta l'evento con il payload
  // corretto. La logica "chi notificare / come formattare" è testata
  // in notification_events.test.ts (vicino alla definition).

  beforeEach(() => {
    vi.clearAllMocks()
    mockEmit.mockResolvedValue(undefined)
  })

  it('emette chat_message con sender + message dopo l\'INSERT', async () => {
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
      messagesEnrich: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Ciao a tutti',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    expect(res.status).toBe(201)

    expect(mockEmit).toHaveBeenCalledTimes(1)
    const [eventKey, payload] = mockEmit.mock.calls[0]
    expect(eventKey).toBe('chat_message')
    expect(payload).toMatchObject({
      sender: { id: 'member-1', name: 'Mario' },
      message: {
        group_id: 'group-1',
        text: 'Ciao a tutti',
        message_type: 'text',
      },
    })
  })

  it('propaga message_type="image" all\'evento per gli allegati', async () => {
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
      messagesEnrich: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      message_type: 'image',
      media_url: 'https://x/img.jpg',
    })
    await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })

    const [, payload] = mockEmit.mock.calls[0]
    expect(payload.message.message_type).toBe('image')
  })

  it('non blocca la risposta 201 se emit fallisce (fire-and-forget)', async () => {
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
      messagesEnrich: { data: MOCK_MESSAGE, error: null },
    }))
    mockEmit.mockRejectedValueOnce(new Error('catalog fallito'))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Test',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    // L'utente vede il messaggio inviato anche se la pipeline notifiche
    // è giù: la push è un nice-to-have, non un blocco del POST.
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// Bug 4: regressione self-join PostgREST (PR #32 → fix branch corrente)
//
// Storia: il commit 57ad7ac aveva sostituito `author:members(...)` con
// `members!chat_messages_author_id_fkey(...)` + self-join
// `reply_to:chat_messages!chat_messages_reply_to_message_id_fkey(...)`. In
// produzione PostgREST risponde PGRST200 "Could not find a relationship
// between 'chat_messages' and 'chat_messages' in the schema cache" — la
// query fallisce, la GET ritorna 500 con data=[], i bubble spariscono.
//
// Fix: il self-join PostgREST è stato smontato. Ora la GET fa due query
// separate (messaggi + parent batch via .in). Questi test bloccano la
// regressione: garantiscono che reply_to embedded venga arricchito senza
// dipendere dallo schema cache di PostgREST.
// ---------------------------------------------------------------------------

const MSG_PARENT = {
  id: 'msg-parent',
  group_id: 'group-1',
  author_id: 'member-2',
  text: 'Quel messaggio',
  message_type: 'text',
  media_url: null,
  reply_to_message_id: null,
  edited_at: null,
  deleted_at: null,
  created_at: '2026-05-01T10:00:00Z',
  author: { id: 'member-2', name: 'Anna', color: '#00ff00' },
}

const MSG_REPLY = {
  ...MOCK_MESSAGE,
  id: 'msg-reply',
  text: 'Concordo',
  reply_to_message_id: 'msg-parent',
  edited_at: null,
  deleted_at: null,
  created_at: '2026-05-01T10:05:00Z',
}

describe('GET messages — reply_to embedded via fetchReplyParents (no self-join)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
  })

  it('messaggio senza reply_to_message_id → reply_to: null (no parent lookup)', async () => {
    const message = {
      ...MOCK_MESSAGE,
      reply_to_message_id: null,
      edited_at: null,
      deleted_at: null,
    }
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: [message], error: null, count: 1 },
      // parentLookup intentionally not set: se la GET facesse comunque
      // la query parent quando non serve, .in() ritornerebbe { data: [] }.
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.data.length).toBe(1)
    expect(body.data[0].reply_to).toBeNull()
  })

  it('reply_to_message_id valorizzato + parent presente → reply_to embedded con author', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: [MSG_REPLY], error: null, count: 1 },
      parentLookup: { data: [MSG_PARENT], error: null },
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect(body.data.length).toBe(1)
    expect(body.data[0].reply_to).toMatchObject({
      id: 'msg-parent',
      text: 'Quel messaggio',
      author: { id: 'member-2', name: 'Anna', color: '#00ff00' },
    })
  })

  it('parent soft-deleted → reply_to.text = "[Messaggio eliminato]" (tombstone server-side)', async () => {
    const deletedParent = { ...MSG_PARENT, deleted_at: '2026-05-01T11:00:00Z' }
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: [MSG_REPLY], error: null, count: 1 },
      parentLookup: { data: [deletedParent], error: null },
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { body } = await parseResponse(res as unknown as Response)

    expect(body.data[0].reply_to.text).toBe('[Messaggio eliminato]')
    // Il testo originale "Quel messaggio" NON deve lasciare il server.
    expect(body.data[0].reply_to.text).not.toContain('Quel messaggio')
  })

  it('messaggio principale soft-deleted → text = "[Messaggio eliminato]" (tombstone)', async () => {
    const deletedMsg = {
      ...MOCK_MESSAGE,
      text: 'Segreto compromettente',
      reply_to_message_id: null,
      edited_at: null,
      deleted_at: '2026-05-01T11:00:00Z',
    }
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: [deletedMsg], error: null, count: 1 },
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { body } = await parseResponse(res as unknown as Response)

    expect(body.data[0].text).toBe('[Messaggio eliminato]')
    expect(body.data[0].text).not.toContain('Segreto')
  })

  it('reply_to_message_id valorizzato ma parent introvabile → reply_to: null (FK ON DELETE SET NULL safe path)', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: [MSG_REPLY], error: null, count: 1 },
      // parentLookup ritorna [] — il parent è stato hard-deleted o non c'è.
      parentLookup: { data: [], error: null },
    }))

    const req = makeRequest('GET')
    const res = await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { body } = await parseResponse(res as unknown as Response)

    expect(body.data[0].reply_to).toBeNull()
  })

  it('GET non usa il self-join con FK constraint name esplicito (regressione PGRST200)', async () => {
    // Sentinel: questo test fissa il contratto della query principale. Se
    // qualcuno reintroduce il pattern `chat_messages!chat_messages_<...>_fkey`
    // dentro la select string, la query in produzione fallirà con PGRST200.
    // Verifichiamo che la stringa passata a .select() NON contenga il
    // self-join PostgREST.
    let capturedSelectArg: string | undefined
    const db = makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      messagesSelect: { data: [], error: null, count: 0 },
    })
    const originalFrom = db.from
    ;(db as any).from = vi.fn((table: string) => {
      const result = (originalFrom as any)(table)
      if (table === 'chat_messages') {
        const originalSelect = result.select
        result.select = vi.fn((cols?: string, opts?: any) => {
          if (typeof cols === 'string' && opts?.head !== true) {
            capturedSelectArg = cols
          }
          return originalSelect(cols, opts)
        })
      }
      return result
    })
    mockCreateServerClient.mockReturnValue(db)

    const req = makeRequest('GET')
    await messagesGET(req as any, { params: Promise.resolve({ id: 'group-1' }) })

    expect(capturedSelectArg).toBeDefined()
    // L'antipattern: self-join PostgREST via nome FK esplicito.
    expect(capturedSelectArg).not.toMatch(/chat_messages_reply_to_message_id_fkey/)
    expect(capturedSelectArg).not.toMatch(/reply_to:chat_messages!/)
  })
})

describe('POST message — reply validation e propagazione reply_to_message_id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmit.mockResolvedValue(undefined)
    mockRequireAuth.mockResolvedValue(MEMBER_IN_GROUP as any)
  })

  it('POST con reply_to_message_id valido (stesso gruppo) → 201', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      replyValidate: { data: { id: 'msg-parent', group_id: 'group-1' }, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
      messagesEnrich: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Concordo',
      reply_to_message_id: 'msg-parent',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(201)
  })

  it('POST con reply_to_message_id di un altro gruppo → 400 (no cross-group citation)', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      // Il parent esiste ma è in group-99.
      replyValidate: { data: { id: 'msg-parent', group_id: 'group-99' }, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
      messagesEnrich: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Hack',
      reply_to_message_id: 'msg-parent',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it('POST con reply_to_message_id inesistente → 400', async () => {
    mockCreateServerClient.mockReturnValue(makeDb({
      membership: { data: { group_id: 'group-1', member_id: 'member-1' }, error: null },
      replyValidate: { data: null, error: null },
      messagesInsert: { data: MOCK_MESSAGE, error: null },
    }))

    const req = makeRequest('POST', 'http://localhost/api/chat/groups/group-1/messages', {
      text: 'Mah',
      reply_to_message_id: 'missing-id',
    })
    const res = await messagesPOST(req as any, { params: Promise.resolve({ id: 'group-1' }) })
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })
})
