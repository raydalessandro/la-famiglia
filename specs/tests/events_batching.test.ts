// @vitest-environment node
/**
 * GET /api/events — batching anti-N+1 (Affinamento A6.2).
 *
 * Prima: 1 query su event_participants PER evento (il calendario
 * mensile ne ha 20-40). Ora: UNA query con .in('event_id', ids) e
 * groupBy in memoria — stesso modello di activities/route.ts.
 *
 * Verifiche:
 *  - query costanti (events + participants batch), MAI per-evento
 *  - participants/attendances attribuiti all'evento giusto
 *  - evento senza partecipanti → array vuoti
 *  - zero eventi nel range → nessuna query participants
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const MEMBER = { id: 'me', name: 'Alessio', is_admin: false }

const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('@/lib/notifications', () => ({
  notifyMembers: vi.fn(async () => {}),
}))

const EVENTS = [
  { id: 'e1', title: 'Cena dai nonni', event_date: '2026-07-10' },
  { id: 'e2', title: 'Piscina', event_date: '2026-07-12' },
]

const PARTICIPANT_ROWS = [
  {
    id: 'ep1', event_id: 'e1', member_id: 'a', status: 'confirmed',
    modified_notes: null, created_at: '…', updated_at: '…',
    members: { id: 'a', name: 'Giovanna' },
  },
  {
    id: 'ep2', event_id: 'e1', member_id: 'b', status: 'skipped',
    modified_notes: null, created_at: '…', updated_at: '…',
    members: { id: 'b', name: 'Franco' },
  },
]

let eventsData: unknown[] = []
let fromCalls: string[] = []
let participantsInIds: unknown[] | null = null

const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  if (table === 'events') {
    return {
      select: () => ({
        gte: () => ({
          lte: () => ({
            order: () => Promise.resolve({ data: eventsData, error: null }),
          }),
        }),
      }),
    }
  }
  if (table === 'event_participants') {
    return {
      select: () => ({
        in: (_col: string, ids: unknown[]) => {
          participantsInIds = ids
          return Promise.resolve({ data: PARTICIPANT_ROWS, error: null })
        },
        // Se la route regredisce al per-evento (.eq) il test fallisce qui.
        eq: () => {
          throw new Error('Regressione N+1: query per-evento su event_participants')
        },
      }),
    }
  }
  throw new Error(`Tabella inattesa: ${table}`)
})

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

beforeEach(() => {
  fromCalls = []
  participantsInIds = null
  eventsData = EVENTS
  mockRequireAuth.mockResolvedValue(MEMBER)
  mockFrom.mockClear()
})

function makeGet(url = 'http://localhost/api/events?month=7&year=2026') {
  return new Request(url) as never
}

describe('GET /api/events — batching', () => {
  it('due query costanti: events + participants batch con tutti gli id', async () => {
    const { GET } = await import('@/app/api/events/route')
    const res = await GET(makeGet())

    expect(res.status).toBe(200)
    expect(fromCalls).toEqual(['events', 'event_participants'])
    expect(participantsInIds).toEqual(['e1', 'e2'])
  })

  it('attribuisce participants e attendances all evento giusto', async () => {
    const { GET } = await import('@/app/api/events/route')
    const res = await GET(makeGet())
    const json = await res.json()

    const e1 = json.data.find((e: { id: string }) => e.id === 'e1')
    const e2 = json.data.find((e: { id: string }) => e.id === 'e2')

    expect(e1.participants.map((m: { name: string }) => m.name)).toEqual(['Giovanna', 'Franco'])
    expect(e1.attendances).toHaveLength(2)
    expect(e1.attendances[0]).toMatchObject({ member_id: 'a', status: 'confirmed' })
    expect(e1.attendances[0].member).toMatchObject({ name: 'Giovanna' })

    // e2 non ha righe → array vuoti, non undefined.
    expect(e2.participants).toEqual([])
    expect(e2.attendances).toEqual([])
  })

  it('zero eventi nel range → nessuna query su event_participants', async () => {
    eventsData = []
    const { GET } = await import('@/app/api/events/route')
    const res = await GET(makeGet())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toEqual([])
    expect(fromCalls).toEqual(['events'])
  })
})
