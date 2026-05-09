/**
 * Tests for PATCH/DELETE /api/tasks/:id — authorization & validation
 *
 * Authorization rules:
 *   PATCH allowed if creator OR assignee OR admin (assignees can mark themselves done).
 *     - non-creator/non-admin assignees can only update is_completed
 *     - creator/admin can update any field
 *   DELETE allowed only by creator OR admin.
 *
 * Validation:
 *   PATCH with title that becomes empty after trim → 400.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREATOR = {
  id: 'member-creator',
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

const ASSIGNEE = { ...CREATOR, id: 'member-assignee', name: 'Luigi', is_admin: false }
const STRANGER = { ...CREATOR, id: 'member-stranger', name: 'Wario', is_admin: false }
const ADMIN = { ...CREATOR, id: 'member-admin', name: 'Admin', is_admin: true }

const MOCK_TASK = {
  id: 'task-1',
  title: 'Pagare bolletta',
  description: '',
  due_date: '2026-06-01',
  is_completed: false,
  completed_by: null,
  completed_at: null,
  created_by: 'member-creator',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(),
}))

import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>
const mockCreateServerClient = createServerClient as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Supabase builder
// ---------------------------------------------------------------------------

/**
 * `assigneeIds` — list of member ids that are assigned to the task. The route
 * must look these up to determine if the caller is an assignee.
 */
function makeTaskDb(opts: {
  taskData?: unknown
  taskError?: unknown
  assigneeIds?: string[]
  updateError?: unknown
  deleteError?: unknown
} = {}) {
  const task = opts.taskData === undefined ? MOCK_TASK : opts.taskData
  const taskError = opts.taskError ?? null
  const assigneeIds = opts.assigneeIds ?? []
  const updateError = opts.updateError ?? null
  const deleteError = opts.deleteError ?? null

  const fromMock = vi.fn((table: string) => {
    if (table === 'tasks') {
      const eqAfterUpdate: Record<string, unknown> = {}
      eqAfterUpdate.select = vi.fn(() => eqAfterUpdate)
      eqAfterUpdate.single = vi.fn(() =>
        Promise.resolve({ data: task, error: updateError })
      )

      const updateChain: Record<string, unknown> = {}
      updateChain.eq = vi.fn(() => eqAfterUpdate)

      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      selectChain.single = vi.fn(() => Promise.resolve({ data: task, error: taskError }))

      const deleteChain: Record<string, unknown> = {}
      deleteChain.eq = vi.fn(() => Promise.resolve({ error: deleteError }))

      return {
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
        delete: vi.fn(() => deleteChain),
      }
    }
    if (table === 'task_assignees') {
      // Two select shapes:
      //   .select('member_id').eq('task_id', id)            → list assignees (await)
      //   .select('member_id, members(...)').eq('task_id') → final response (await)
      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      const rows = assigneeIds.map((mid) => ({
        member_id: mid,
        members: { id: mid, name: mid, avatar_emoji: '🙂', color: '#000' },
      }))
      ;(selectChain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve)

      const deleteChain: Record<string, unknown> = {}
      deleteChain.eq = vi.fn(() => Promise.resolve({ error: null }))

      return {
        select: vi.fn(() => selectChain),
        delete: vi.fn(() => deleteChain),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      }
    }
    if (table === 'members') {
      // creator lookup at end of PATCH
      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      selectChain.single = vi.fn(() =>
        Promise.resolve({
          data: { id: 'member-creator', name: 'Mario', avatar_emoji: '🍕', color: '#fff' },
          error: null,
        })
      )
      return { select: vi.fn(() => selectChain) }
    }
    // default
    const builder: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'single', 'maybeSingle']
    for (const m of methods) builder[m] = vi.fn(() => builder)
    ;(builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve)
    return builder
  })

  return { from: fromMock }
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/tasks/task-1', {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const params = Promise.resolve({ id: 'task-1' })

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id — authorization
// ---------------------------------------------------------------------------

describe('PATCH /api/tasks/:id — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when creator updates their own task', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Aggiornato' }) as any, { params })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
  })

  it('returns 200 when admin updates any task', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Aggiornato' }) as any, { params })

    expect(res.status).toBe(200)
  })

  it('returns 200 when assignee marks task as completed', async () => {
    mockRequireAuth.mockResolvedValue(ASSIGNEE)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { is_completed: true }) as any, { params })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
  })

  it('returns 403 when non-creator non-admin non-assignee tries to update', async () => {
    mockRequireAuth.mockResolvedValue(STRANGER)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { is_completed: true }) as any, { params })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  it('returns 403 when assignee tries to change title (not is_completed)', async () => {
    // Assignees may only update is_completed; changing title requires creator/admin
    mockRequireAuth.mockResolvedValue(ASSIGNEE)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Hijacked' }) as any, { params })

    expect(res.status).toBe(403)
  })

  it('returns 404 when task does not exist', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(
      makeTaskDb({ taskData: null, taskError: { message: 'not found' } })
    )

    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Test' }) as any, { params })

    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id — validation
// ---------------------------------------------------------------------------

describe('PATCH /api/tasks/:id — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: [] }))
  })

  it('returns 400 when title is empty after trim', async () => {
    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: '   ' }) as any, { params })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  it('returns 400 when title is empty string', async () => {
    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: '' }) as any, { params })

    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id — authorization
// ---------------------------------------------------------------------------

describe('DELETE /api/tasks/:id — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when creator deletes their own task', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { DELETE } = await import('@/app/api/tasks/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(200)
  })

  it('returns 200 when admin deletes any task', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { DELETE } = await import('@/app/api/tasks/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(200)
  })

  it('returns 403 when assignee (non-creator, non-admin) tries to delete', async () => {
    mockRequireAuth.mockResolvedValue(ASSIGNEE)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { DELETE } = await import('@/app/api/tasks/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  it('returns 403 when stranger tries to delete', async () => {
    mockRequireAuth.mockResolvedValue(STRANGER)
    mockCreateServerClient.mockReturnValue(makeTaskDb({ assigneeIds: ['member-assignee'] }))

    const { DELETE } = await import('@/app/api/tasks/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(403)
  })

  it('returns 404 when task does not exist', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(
      makeTaskDb({ taskData: null, taskError: { message: 'not found' } })
    )

    const { DELETE } = await import('@/app/api/tasks/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(404)
  })
})
