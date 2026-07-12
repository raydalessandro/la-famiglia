// @vitest-environment node
/**
 * GET /api/tasks — batching anti-N+1 (Affinamento A6.3).
 *
 * Prima: 2 query PER task (assignees + lookup singola del creator —
 * particolarmente sprecona: i creator sono pochi e ripetuti). Con 30
 * task ≈ 60 round-trip. Ora: assignees di tutti i task con .in() + UNA
 * lookup dei creator deduplicati = 2 query costanti.
 *
 * Verifiche:
 *  - query costanti, MAI per-task (guardia che lancia su .eq)
 *  - creator deduplicati nella lookup
 *  - assignees/creator attribuiti al task giusto, shape invariata
 *  - created_by null → creator null senza query inutili
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

const TASKS = [
  { id: 't1', title: 'Spesa', created_by: 'a', is_completed: false },
  { id: 't2', title: 'Farmacia', created_by: 'a', is_completed: false },
  { id: 't3', title: 'Bolletta', created_by: null, is_completed: false },
]

const ASSIGNEE_ROWS = [
  { task_id: 't1', member_id: 'b', members: { id: 'b', name: 'Franco' } },
  { task_id: 't1', member_id: 'c', members: { id: 'c', name: 'Titti' } },
  { task_id: 't2', member_id: 'b', members: { id: 'b', name: 'Franco' } },
]

const CREATOR_ROWS = [{ id: 'a', name: 'Giovanna', avatar_emoji: null, color: '#f00' }]

let fromCalls: string[] = []
let assigneesInIds: unknown[] | null = null
let creatorsInIds: unknown[] | null = null

const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  if (table === 'tasks') {
    return {
      select: () => {
        const builder = {
          in: () => builder,
          eq: () => builder,
          order: () => Promise.resolve({ data: TASKS, error: null }),
        }
        return builder
      },
    }
  }
  if (table === 'task_assignees') {
    return {
      select: () => ({
        in: (_col: string, ids: unknown[]) => {
          assigneesInIds = ids
          return Promise.resolve({ data: ASSIGNEE_ROWS, error: null })
        },
        eq: () => {
          throw new Error('Regressione N+1: query per-task su task_assignees')
        },
      }),
    }
  }
  if (table === 'members') {
    return {
      select: () => ({
        in: (_col: string, ids: unknown[]) => {
          creatorsInIds = ids
          return Promise.resolve({ data: CREATOR_ROWS, error: null })
        },
        eq: () => {
          throw new Error('Regressione N+1: lookup creator per-task')
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
  assigneesInIds = null
  creatorsInIds = null
  mockRequireAuth.mockResolvedValue(MEMBER)
  mockFrom.mockClear()
})

function makeGet() {
  return new Request('http://localhost/api/tasks') as never
}

describe('GET /api/tasks — batching', () => {
  it('tre query costanti: tasks + assignees batch + creator dedup', async () => {
    const { GET } = await import('@/app/api/tasks/route')
    const res = await GET(makeGet())

    expect(res.status).toBe(200)
    expect(fromCalls).toEqual(['tasks', 'task_assignees', 'members'])
    expect(assigneesInIds).toEqual(['t1', 't2', 't3'])
    // 2 task di 'a' + 1 senza creator → UNA lookup con ['a'] deduplicato.
    expect(creatorsInIds).toEqual(['a'])
  })

  it('attribuisce assignees e creator al task giusto, shape invariata', async () => {
    const { GET } = await import('@/app/api/tasks/route')
    const res = await GET(makeGet())
    const json = await res.json()

    const t1 = json.data.find((t: { id: string }) => t.id === 't1')
    const t2 = json.data.find((t: { id: string }) => t.id === 't2')
    const t3 = json.data.find((t: { id: string }) => t.id === 't3')

    // Shape storica delle righe assignee: {member_id, members} senza task_id.
    expect(t1.assignees).toEqual([
      { member_id: 'b', members: { id: 'b', name: 'Franco' } },
      { member_id: 'c', members: { id: 'c', name: 'Titti' } },
    ])
    expect(t2.assignees).toHaveLength(1)
    expect(t3.assignees).toEqual([])

    expect(t1.creator).toMatchObject({ id: 'a', name: 'Giovanna' })
    expect(t2.creator).toMatchObject({ id: 'a' })
    // created_by null → creator null.
    expect(t3.creator).toBeNull()
  })
})
