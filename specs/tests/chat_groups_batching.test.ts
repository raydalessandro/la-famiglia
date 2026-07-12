// @vitest-environment node
/**
 * GET /api/chat/groups — batching anti-N+1 (Affinamento A6.1).
 *
 * Prima: ~4 query PER gruppo (roster, last message, read status, unread
 * count) → con 8 gruppi ~34 round-trip sulla tab più aperta dell'app.
 * Ora: membership + groups + roster batch (.in) + UNA RPC
 * chat_group_summaries (DISTINCT ON + COUNT FILTER, migration 017).
 *
 * Verifiche:
 *  - numero di query COSTANTE (3 from + 1 rpc) qualunque sia N gruppi
 *  - roster/last_message/unread attribuiti al gruppo giusto
 *  - gruppo senza messaggi → last_message null, unread 0
 *  - la RPC riceve member id del caller + tutti i group id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const MEMBER = { id: 'me', name: 'Alessio', is_admin: false }

const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
}))

let fromCalls: string[] = []
let rosterInIds: unknown[] = []

const GROUPS = [
  { id: 'g1', name: 'Famiglia', is_direct: false, icon: '👥', created_at: '2026-01-02' },
  { id: 'g2', name: 'Chat diretta', is_direct: true, icon: '👥', created_at: '2026-01-01' },
]

const ROSTER_ROWS = [
  { group_id: 'g1', member_id: 'me', members: { id: 'me', name: 'Alessio' } },
  { group_id: 'g1', member_id: 'a', members: { id: 'a', name: 'Giovanna' } },
  { group_id: 'g2', member_id: 'me', members: { id: 'me', name: 'Alessio' } },
  { group_id: 'g2', member_id: 'b', members: { id: 'b', name: 'Franco' } },
]

const SUMMARIES = [
  {
    group_id: 'g1',
    last_message: { id: 'm9', group_id: 'g1', text: 'Ciao a tutti', author_id: 'a' },
    unread_count: 3,
  },
  // g2: nessuna riga con messaggio — la RPC ritorna last_message null.
  { group_id: 'g2', last_message: null, unread_count: 0 },
]

const mockRpc = vi.fn()
const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  if (table === 'chat_group_members') {
    return {
      select: (cols: string) => ({
        // membership del caller
        eq: () => Promise.resolve({ data: [{ group_id: 'g1' }, { group_id: 'g2' }], error: null }),
        // roster batch
        in: (_col: string, ids: unknown[]) => {
          if (cols.includes('members(')) rosterInIds = ids
          return Promise.resolve({ data: ROSTER_ROWS, error: null })
        },
      }),
    }
  }
  if (table === 'chat_groups') {
    return {
      select: () => ({
        in: () => ({
          order: () => Promise.resolve({ data: GROUPS, error: null }),
        }),
      }),
    }
  }
  throw new Error(`Tabella inattesa: ${table} — la route non deve più fare query per-gruppo`)
})

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

beforeEach(() => {
  fromCalls = []
  rosterInIds = []
  mockRequireAuth.mockResolvedValue(MEMBER)
  mockRpc.mockReset()
  mockRpc.mockResolvedValue({ data: SUMMARIES, error: null })
  mockFrom.mockClear()
})

describe('GET /api/chat/groups — batching', () => {
  it('numero di query costante: 3 from + 1 rpc, MAI query per-gruppo', async () => {
    const { GET } = await import('@/app/api/chat/groups/route')
    const res = await GET(new Request('http://localhost/api/chat/groups') as never)

    expect(res.status).toBe(200)
    // membership + groups + roster: se qualcuno reintroduce il loop
    // per-gruppo, mockFrom lancia su chat_messages/chat_read_status.
    expect(fromCalls).toEqual(['chat_group_members', 'chat_groups', 'chat_group_members'])
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('la RPC riceve il member del caller e tutti i group id', async () => {
    const { GET } = await import('@/app/api/chat/groups/route')
    await GET(new Request('http://localhost/api/chat/groups') as never)

    expect(mockRpc).toHaveBeenCalledWith('chat_group_summaries', {
      p_member_id: 'me',
      p_group_ids: ['g1', 'g2'],
    })
    expect(rosterInIds).toEqual(['g1', 'g2'])
  })

  it('assembla roster, last_message e unread per il gruppo giusto', async () => {
    const { GET } = await import('@/app/api/chat/groups/route')
    const res = await GET(new Request('http://localhost/api/chat/groups') as never)
    const json = await res.json()

    const g1 = json.data.find((g: { id: string }) => g.id === 'g1')
    const g2 = json.data.find((g: { id: string }) => g.id === 'g2')

    expect(g1.members.map((m: { name: string }) => m.name)).toEqual(['Alessio', 'Giovanna'])
    expect(g1.last_message.text).toBe('Ciao a tutti')
    expect(g1.unread_count).toBe(3)

    expect(g2.members.map((m: { name: string }) => m.name)).toEqual(['Alessio', 'Franco'])
    expect(g2.last_message).toBeNull()
    expect(g2.unread_count).toBe(0)
  })

  it('errore della RPC → 500 con messaggio (niente 200 con dati mutilati)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })

    const { GET } = await import('@/app/api/chat/groups/route')
    const res = await GET(new Request('http://localhost/api/chat/groups') as never)

    expect(res.status).toBe(500)
  })
})
