// @vitest-environment node
/**
 * Test della route POST /api/activities/:id/attendance dopo la decisione
 * di prodotto del 11/05/2026: tutti i membri di famiglia loggati possono
 * confermare/saltare/modificare la presenza a qualsiasi attività, non
 * solo i `participant_ids` esplicitamente selezionati alla creazione.
 *
 * Prima del cambio, la route ritornava 403 "Non sei partecipante di
 * questa attività" per i non-admin non in activity_participants — e la
 * UI nascondeva i pulsanti per gli stessi utenti. Risultato: in
 * famiglia funzionava solo per il creator dell'attività (tipicamente
 * papà admin). Era un design troppo restrittivo per il contesto "app
 * di famiglia condivisa".
 *
 * activity_participants resta come metadata informativo ("chi
 * normalmente partecipa") e serve per calcolare i destinatari delle
 * push, ma non è più un gate d'accesso.
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

vi.mock('@/lib/dates', () => ({
  getWeekStart: (input: string | null) => input ?? '2026-05-11',
}))

const { POST } = await import('@/app/api/activities/[id]/attendance/route')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/activities/act-1/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext() {
  return { params: Promise.resolve({ id: 'act-1' }) }
}

const ACTIVITY_ROW = { id: 'act-1', title: 'Karate' }
const UPSERTED_ROW = {
  activity_id: 'act-1',
  week_start: '2026-05-11',
  member_id: 'mamma',
  status: 'confirmed',
  modified_notes: null,
  updated_at: '2026-05-11T00:00:00Z',
}

// Mock builder per attività + participants + upsert. La route fa:
//   1. db.from('activities').select(...).eq('id', x).single()
//   2. db.from('activity_participants').select('member_id').eq('activity_id', x)
//   3. db.from('activity_weekly_attendances').upsert(...).select().single()
function setupSupabase(opts: {
  activity?: { data: unknown; error: unknown } | null
  participantIds?: string[]
  upsert?: { data: unknown; error: unknown }
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'activities') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                opts.activity ?? { data: ACTIVITY_ROW, error: null },
              ),
          }),
        }),
      }
    }
    if (table === 'activity_participants') {
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      ;(builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: (opts.participantIds ?? []).map((id) => ({ member_id: id })),
          error: null,
        }).then(resolve)
      return builder
    }
    if (table === 'activity_weekly_attendances') {
      return {
        upsert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve(
                opts.upsert ?? { data: UPSERTED_ROW, error: null },
              ),
          }),
        }),
      }
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
// Comportamento nuovo: tutti i membri possono confermare
// ---------------------------------------------------------------------------

describe('POST /api/activities/:id/attendance — tutti i membri possono confermare', () => {
  it('non-admin, non-participant può confermare → 200 (regression del 403)', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({
      participantIds: ['luca', 'papa'], // Mamma NON è participant ufficiale
    })

    const res = await POST(
      makeRequest({ week_start: '2026-05-11', status: 'confirmed' }) as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.data).toMatchObject({ status: 'confirmed', member_id: 'mamma' })
  })

  it('admin può confermare anche se non participant', async () => {
    mockRequireAuth.mockResolvedValue(PAPA_ADMIN)
    setupSupabase({ participantIds: ['luca'] })

    const res = await POST(
      makeRequest({ week_start: '2026-05-11', status: 'confirmed' }) as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
  })

  it('participant può confermare (caso classico)', async () => {
    mockRequireAuth.mockResolvedValue({ id: 'luca', name: 'Luca', is_admin: false })
    setupSupabase({ participantIds: ['luca', 'papa'] })

    const res = await POST(
      makeRequest({ week_start: '2026-05-11', status: 'confirmed' }) as never,
      makeContext(),
    )

    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Auth wall + validation rimangono
// ---------------------------------------------------------------------------

describe('POST /api/activities/:id/attendance — guardie residue', () => {
  it('respinge senza auth (requireAuth ritorna NextResponse)', async () => {
    const { NextResponse } = await import('next/server')
    const unauth = NextResponse.json({ error: 'auth' }, { status: 401 })
    mockRequireAuth.mockResolvedValue(unauth)

    const res = await POST(
      makeRequest({ week_start: '2026-05-11', status: 'confirmed' }) as never,
      makeContext(),
    )
    expect(res.status).toBe(401)
  })

  it('400 se status non è confirmed/skipped/modified', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({ participantIds: [] })

    const res = await POST(
      makeRequest({ week_start: '2026-05-11', status: 'wat' }) as never,
      makeContext(),
    )
    expect(res.status).toBe(400)
  })

  it('404 se l\'attività non esiste', async () => {
    mockRequireAuth.mockResolvedValue(MAMMA_NON_ADMIN)
    setupSupabase({
      activity: { data: null, error: { message: 'not found' } },
      participantIds: [],
    })

    const res = await POST(
      makeRequest({ week_start: '2026-05-11', status: 'confirmed' }) as never,
      makeContext(),
    )
    expect(res.status).toBe(404)
  })
})
