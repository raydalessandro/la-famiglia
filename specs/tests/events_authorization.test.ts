// @vitest-environment node
/**
 * Tests for PATCH/DELETE /api/events/:id — authorization & validation
 *
 * Authorization rule (matches posts/[id]/route.ts):
 *   PATCH/DELETE allowed only if member.id === event.created_by OR member.is_admin.
 *   Otherwise → 403.
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

const OTHER = { ...CREATOR, id: 'member-other', name: 'Luigi', is_admin: false }
const ADMIN = { ...CREATOR, id: 'member-admin', name: 'Admin', is_admin: true }

const MOCK_EVENT = {
  id: 'event-1',
  title: 'Compleanno',
  icon: '🎂',
  color: '#ff0000',
  event_date: '2026-06-01',
  event_time: '18:00',
  location: 'Casa',
  notes: '',
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
// Supabase builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a Supabase mock that:
 *   - on `events`:
 *       - .select(...).eq(...).single() → { data: MOCK_EVENT, error: null } (or override)
 *       - .update(...).eq(...).select(...).single() → { data: MOCK_EVENT, error: null }
 *       - .delete().eq(...) → { error: null }
 *   - on `event_participants`:
 *       - .select(...).eq(...) (thenable) → { data: [], error: null }
 *       - .delete().eq(...) → { error: null }
 *       - .insert(...) → { error: null }
 */
function makeEventDb(opts: {
  eventData?: unknown
  eventError?: unknown
  updateError?: unknown
  deleteError?: unknown
} = {}) {
  const event = opts.eventData === undefined ? MOCK_EVENT : opts.eventData
  const eventError = opts.eventError ?? null
  const updateError = opts.updateError ?? null
  const deleteError = opts.deleteError ?? null

  const fromMock = vi.fn((table: string) => {
    if (table === 'events') {
      const eqAfterUpdate: Record<string, unknown> = {}
      eqAfterUpdate.select = vi.fn(() => eqAfterUpdate)
      eqAfterUpdate.single = vi.fn(() =>
        Promise.resolve({ data: event, error: updateError })
      )

      const updateChain: Record<string, unknown> = {}
      updateChain.eq = vi.fn(() => eqAfterUpdate)

      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      selectChain.single = vi.fn(() => Promise.resolve({ data: event, error: eventError }))

      const deleteChain: Record<string, unknown> = {}
      deleteChain.eq = vi.fn(() => Promise.resolve({ error: deleteError }))

      return {
        select: vi.fn(() => selectChain),
        update: vi.fn(() => updateChain),
        delete: vi.fn(() => deleteChain),
      }
    }
    if (table === 'event_participants') {
      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      ;(selectChain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)

      const deleteChain: Record<string, unknown> = {}
      deleteChain.eq = vi.fn(() => Promise.resolve({ error: null }))

      return {
        select: vi.fn(() => selectChain),
        delete: vi.fn(() => deleteChain),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      }
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
  return new Request('http://localhost/api/events/event-1', {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const params = Promise.resolve({ id: 'event-1' })

// ---------------------------------------------------------------------------
// PATCH /api/events/:id — authorization
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:id — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when creator updates their own event', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(makeEventDb())

    const { PATCH } = await import('@/app/api/events/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Aggiornato' }) as any, { params })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
  })

  it('returns 200 when admin updates any event', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN)
    mockCreateServerClient.mockReturnValue(makeEventDb())

    const { PATCH } = await import('@/app/api/events/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Aggiornato' }) as any, { params })

    expect(res.status).toBe(200)
  })

  it('returns 403 when non-creator non-admin tries to update', async () => {
    mockRequireAuth.mockResolvedValue(OTHER)
    mockCreateServerClient.mockReturnValue(makeEventDb())

    const { PATCH } = await import('@/app/api/events/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Hijack' }) as any, { params })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  it('returns 404 when event does not exist', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(
      makeEventDb({ eventData: null, eventError: { message: 'not found' } })
    )

    const { PATCH } = await import('@/app/api/events/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: 'Test' }) as any, { params })

    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/events/:id — validation
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:id — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(makeEventDb())
  })

  it('returns 400 when title is empty after trim', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: '   ' }) as any, { params })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  it('returns 400 when title is empty string', async () => {
    const { PATCH } = await import('@/app/api/events/[id]/route')
    const res = await PATCH(makeRequest('PATCH', { title: '' }) as any, { params })

    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/events/:id — authorization
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:id — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when creator deletes their own event', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(makeEventDb())

    const { DELETE } = await import('@/app/api/events/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(200)
  })

  it('returns 200 when admin deletes any event', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN)
    mockCreateServerClient.mockReturnValue(makeEventDb())

    const { DELETE } = await import('@/app/api/events/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(200)
  })

  it('returns 403 when non-creator non-admin tries to delete', async () => {
    mockRequireAuth.mockResolvedValue(OTHER)
    mockCreateServerClient.mockReturnValue(makeEventDb())

    const { DELETE } = await import('@/app/api/events/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  it('returns 404 when event does not exist', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(
      makeEventDb({ eventData: null, eventError: { message: 'not found' } })
    )

    const { DELETE } = await import('@/app/api/events/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(404)
  })
})
