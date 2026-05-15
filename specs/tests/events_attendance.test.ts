// @vitest-environment node
/**
 * Test della route POST /api/events/:id/attendance introdotta dopo la
 * migration 015 (event_participants esteso con status/modified_notes).
 *
 * Modello: chiunque sia loggato puo` confermare/saltare/modificare la
 * presenza a un evento — stessa scelta gia` fatta per le attivita`
 * ricorrenti (vedi activities_attendance.test.ts). Niente roster
 * pre-selezionato: event_participants smette di essere "chi e` invitato"
 * e diventa "chi ha risposto". Le righe pre-015 con status=NULL
 * convivono come "associato ma senza risposta".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRequireAuth = vi.fn()

vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('@/lib/notifications', () => ({
  notifyMembers: vi.fn().mockResolvedValue(undefined),
}))

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

const { POST, DELETE } = await import('@/app/api/events/[id]/attendance/route')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/events/evt-1/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest(): Request {
  return new Request('http://localhost/api/events/evt-1/attendance', {
    method: 'DELETE',
  })
}

function makeContext() {
  return { params: Promise.resolve({ id: 'evt-1' }) }
}

const EVENT_ROW = {
  id: 'evt-1',
  title: 'Cena famiglia',
  event_date: '2026-05-20',
  created_by: 'papa',
}

const UPSERTED_ROW = {
  id: 'ep-1',
  event_id: 'evt-1',
  member_id: 'mamma',
  status: 'confirmed',
  modified_notes: null,
  created_at: '2026-05-15T00:00:00Z',
  updated_at: '2026-05-15T00:00:00Z',
}

// Mock builder. La route fa:
//   1. db.from('events').select(...).eq('id', x).single()
//   2. db.from('event_participants').select('member_id').eq('event_id', x).not('status', 'is', null)
//   3. db.from('event_participants').upsert(...).select().single()
// La DELETE fa:
//   1. db.from('event_participants').delete().eq('event_id', x).eq('member_id', y)
function setupSupabase(opts: {
  event?: { data: unknown; error: unknown } | null
  previousResponderIds?: string[]
  upsert?: { data: unknown; error: unknown }
  deleteError?: { message: string } | null
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'events') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                opts.event ?? { data: EVENT_ROW, error: null },
              ),
          }),
        }),
      }
    }
    if (table === 'event_participants') {
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.not = vi.fn(() => builder)
      ;(builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: (opts.previousResponderIds ?? []).map((id) => ({ member_id: id })),
          error: null,
        }).then(resolve)
      builder.upsert = vi.fn(() => ({
        select: () => ({
          single: () =>
            Promise.resolve(
              opts.upsert ?? { data: UPSERTED_ROW, error: null },
            ),
        }),
      }))
      builder.delete = vi.fn(() => ({
        eq: () => ({
          eq: () =>
            Promise.resolve({ error: opts.deleteError ?? null }),
        }),
      }))
      return builder
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

const MAMMA_NON_ADMIN = { id: 'mamma', name: 'Mamma', is_admin: false }
const PAPA_ADMIN = { id: 'papa', name: 'Papà', is_admin: true }

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Happy path: tutti possono rispondere
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/attendance — tutti i membri possono rispondere', () => {
  it('non-admin senza riga preesistente può confermare → 200', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({ previousResponderIds: [] })

    const res = await POST(
      makePostRequest({ status: 'confirmed' }) as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.data).toMatchObject({ status: 'confirmed', member_id: 'mamma' })
  })

  it('admin può saltare anche se non era nel "roster" originale', async () => {
    mockRequireAuth.mockResolvedValue(PAPA_ADMIN)
    setupSupabase({
      previousResponderIds: ['luca'],
      upsert: {
        data: { ...UPSERTED_ROW, member_id: 'papa', status: 'skipped' },
        error: null,
      },
    })

    const res = await POST(
      makePostRequest({ status: 'skipped' }) as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.status).toBe('skipped')
  })

  it('modificato con nota → la nota viene salvata', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({
      previousResponderIds: [],
      upsert: {
        data: { ...UPSERTED_ROW, status: 'modified', modified_notes: 'arrivo alle 21' },
        error: null,
      },
    })

    const res = await POST(
      makePostRequest({ status: 'modified', modified_notes: 'arrivo alle 21' }) as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.modified_notes).toBe('arrivo alle 21')
  })
})

// ---------------------------------------------------------------------------
// Auth wall + validation
// ---------------------------------------------------------------------------

describe('POST /api/events/:id/attendance — guardie', () => {
  it('respinge senza auth (requireAuth ritorna NextResponse)', async () => {
    const { NextResponse } = await import('next/server')
    const unauth = NextResponse.json({ error: 'auth' }, { status: 401 })
    mockRequireAuth.mockResolvedValue(unauth)

    const res = await POST(
      makePostRequest({ status: 'confirmed' }) as never,
      makeContext(),
    )
    expect(res.status).toBe(401)
  })

  it('400 se status non è confirmed/skipped/modified', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({})

    const res = await POST(
      makePostRequest({ status: 'wat' }) as never,
      makeContext(),
    )
    expect(res.status).toBe(400)
  })

  it('404 se l\'evento non esiste', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({
      event: { data: null, error: { message: 'not found' } },
    })

    const res = await POST(
      makePostRequest({ status: 'confirmed' }) as never,
      makeContext(),
    )
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// DELETE — clear own attendance
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:id/attendance', () => {
  it('cancella la mia riga → 200 con data null', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({})

    const res = await DELETE(
      makeDeleteRequest() as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.data).toBeNull()
  })

  it('respinge senza auth → 401', async () => {
    const { NextResponse } = await import('next/server')
    const unauth = NextResponse.json({ error: 'auth' }, { status: 401 })
    mockRequireAuth.mockResolvedValue(unauth)

    const res = await DELETE(
      makeDeleteRequest() as never,
      makeContext(),
    )
    expect(res.status).toBe(401)
  })

  it('idempotente: nessuna riga da cancellare → 200', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({ deleteError: null })

    const res = await DELETE(
      makeDeleteRequest() as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
  })

  it('500 se Supabase ritorna errore di cancellazione', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({ deleteError: { message: 'db down' } })

    const res = await DELETE(
      makeDeleteRequest() as never,
      makeContext(),
    )

    expect(res.status).toBe(500)
  })
})
