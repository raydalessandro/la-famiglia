// @vitest-environment node
/**
 * Authorization test per /api/chat/groups (B1 — security audit follow-up).
 *
 * Regole implementate (src/app/api/chat/groups/route.ts):
 *  - GET: solo autenticati (401 senza sessione). SELF-SCOPING: la lista
 *    parte dalle membership del caller (.eq('member_id', caller.id)) —
 *    un membro vede SOLO i gruppi di cui fa parte.
 *  - POST: solo autenticati (401 senza sessione). Qualsiasi membro può
 *    creare un gruppo; il creatore viene sempre incluso nei membri.
 *    Non c'è (per design) un requisito admin.
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
const mockRpc = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom, rpc: mockRpc }),
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

const MOCK_GROUP = {
  id: 'group-1',
  name: 'Famiglia',
  is_direct: false,
  icon: '👥',
  created_by: 'member-1',
  created_at: '2026-01-01T00:00:00Z',
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/chat/groups', {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const UNAUTHENTICATED = () =>
  NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET /api/chat/groups
// ---------------------------------------------------------------------------
describe('GET /api/chat/groups — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { GET } = await import('@/app/api/chat/groups/route')
    const res = await GET(makeRequest('GET') as never)

    expect(res.status).toBe(401)
    // Il DB non deve nemmeno essere interrogato
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('SELF-SCOPING: la query membership filtra per member_id del caller', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)

    const filterCalls: Array<[string, unknown]> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chat_group_members') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              filterCalls.push([col, val])
              // Nessuna membership → la route ritorna subito []
              return Promise.resolve({ data: [], error: null })
            },
          }),
        }
      }
      throw new Error(`Tabella inattesa: ${table}`)
    })

    const { GET } = await import('@/app/api/chat/groups/route')
    const res = await GET(makeRequest('GET') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toEqual([])
    // ← critico: la lista parte dalle membership del caller, non è globale
    expect(filterCalls).toEqual([['member_id', 'member-1']])
  })

  it('ritorna solo i gruppi in cui il caller è membro', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)

    // Dal batching A6.1 la route fa: membership (.eq), groups (.in),
    // roster batch (.in) e RPC chat_group_summaries — niente più query
    // per-gruppo su chat_messages / chat_read_status.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chat_group_members') {
        return {
          select: (cols: string) => ({
            eq: () => {
              // membership del caller: solo group-1
              if (cols === 'group_id') {
                return Promise.resolve({ data: [{ group_id: 'group-1' }], error: null })
              }
              return Promise.resolve({ data: [], error: null })
            },
            // roster batch di tutti i gruppi
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        }
      }
      if (table === 'chat_groups') {
        const inIds: unknown[] = []
        return {
          select: () => ({
            in: (_col: string, ids: unknown[]) => {
              inIds.push(...ids)
              return {
                order: () =>
                  Promise.resolve({
                    data: inIds.includes('group-1') ? [MOCK_GROUP] : [],
                    error: null,
                  }),
              }
            },
          }),
        }
      }
      throw new Error(`Tabella inattesa: ${table}`)
    })
    mockRpc.mockResolvedValue({ data: [], error: null })

    const { GET } = await import('@/app/api/chat/groups/route')
    const res = await GET(makeRequest('GET') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].id).toBe('group-1')
  })
})

// ---------------------------------------------------------------------------
// POST /api/chat/groups
// ---------------------------------------------------------------------------
describe('POST /api/chat/groups — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { POST } = await import('@/app/api/chat/groups/route')
    const res = await POST(
      makeRequest('POST', { name: 'Nuovo', member_ids: ['member-2'] }) as never
    )

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('un membro autenticato può creare un gruppo; il creatore è sempre incluso', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)

    let insertedMembers: Array<{ group_id: string; member_id: string }> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chat_groups') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: MOCK_GROUP, error: null }),
            }),
          }),
        }
      }
      if (table === 'chat_group_members') {
        return {
          insert: (rows: Array<{ group_id: string; member_id: string }>) => {
            insertedMembers = rows
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table === 'chat_read_status') {
        return { insert: () => Promise.resolve({ error: null }) }
      }
      throw new Error(`Tabella inattesa: ${table}`)
    })

    const { POST } = await import('@/app/api/chat/groups/route')
    const res = await POST(
      makeRequest('POST', { name: 'Nuovo', member_ids: ['member-2'] }) as never
    )

    expect(res.status).toBe(201)
    // Il creatore viene sempre incluso tra i membri del gruppo
    expect(insertedMembers.map((r) => r.member_id)).toContain('member-1')
    expect(insertedMembers.map((r) => r.member_id)).toContain('member-2')
  })

  it('400 se manca il nome per un gruppo non-direct', async () => {
    mockRequireAuth.mockResolvedValueOnce(MEMBER)

    const { POST } = await import('@/app/api/chat/groups/route')
    const res = await POST(makeRequest('POST', { name: '', member_ids: ['member-2'] }) as never)

    expect(res.status).toBe(400)
  })
})
