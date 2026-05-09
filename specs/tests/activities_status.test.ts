/**
 * Activities — status route + authorization tests
 *
 * Bug 1: setWeeklyStatus must respect client-supplied week_start.
 *   - When body includes `week_start: '2026-05-04'` → upsert is called with
 *     week_start: '2026-05-04'
 *   - When body omits `week_start` → route falls back to server-side
 *     computation (documents the bad-but-current behavior; remains a
 *     fallback after the hook is fixed).
 *
 * Bug 2: Authorization on PATCH/DELETE/PUT roles/POST status.
 *   - PATCH/DELETE/PUT roles: only creator OR admin can modify.
 *   - POST status: only participants OR admin can change status.
 *
 * Mocking strategy mirrors specs/tests/activities.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const fakeCreator = {
  id: 'member-1', // creator of fakeActivity
  name: 'Alice',
  avatar_emoji: '😀',
  avatar_url: null,
  family_role: 'mamma',
  bio: '',
  pin_hash: 'hash',
  is_admin: false,
  is_active: true,
  color: '#fff',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const fakeAdmin = {
  ...fakeCreator,
  id: 'admin-1',
  name: 'Admin',
  is_admin: true,
}

const fakeOutsider = {
  ...fakeCreator,
  id: 'outsider-1',
  name: 'Outsider',
  is_admin: false,
}

const fakeParticipant = {
  ...fakeCreator,
  id: 'participant-1',
  name: 'Participant',
  is_admin: false,
}

const fakeActivity = {
  id: 'act-1',
  title: 'Nuoto',
  icon: '🏊',
  color: '#6366f1',
  day_of_week: 1,
  time: '09:00',
  location: 'Piscina',
  notes: '',
  is_active: true,
  created_by: 'member-1', // owned by fakeCreator
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const fakeWeeklyStatus = {
  id: 'ws-1',
  activity_id: 'act-1',
  week_start: '2026-05-04',
  status: 'confirmed' as const,
  confirmed_by: 'member-1',
  modified_notes: null,
  created_at: '2026-05-04T00:00:00Z',
  updated_at: '2026-05-04T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

type DbConfig = {
  // For activities.select().eq('id', id).single() — the row representing the activity.
  activityRow?: { data: unknown; error: unknown }
  // For activities.select().eq().single() in PATCH fetch-back / GET single
  activitiesSelect?: { data: unknown; error: unknown }
  // Update result
  activityUpdate?: { data: unknown; error: unknown }
  // Delete result
  activityDelete?: { data: unknown; error: unknown }
  // Participants
  participantsSelect?: { data: unknown; error: unknown }
  // Roles
  rolesSelect?: { data: unknown; error: unknown }
  // Weekly status
  statusSelect?: { data: unknown; error: unknown }
  weeklyStatusUpsert?: { data: unknown; error: unknown }
  weeklyStatusDelete?: { data: unknown; error: unknown }
  // Capture upsert payload
  onWeeklyStatusUpsert?: (payload: unknown) => void
}

function makeMockDb(cfg: DbConfig = {}) {
  const fromMock = vi.fn((table: string) => {
    switch (table) {
      case 'activities': {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        b.select = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => inner)
          inner.in = vi.fn(() => inner)
          inner.order = vi.fn(() => inner)
          inner.single = vi.fn(() =>
            Promise.resolve(cfg.activityRow ?? cfg.activitiesSelect ?? { data: null, error: null })
          )
          inner.maybeSingle = vi.fn(() => Promise.resolve(cfg.statusSelect ?? { data: null, error: null }))
          ;(inner as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.activitiesSelect ?? { data: [], error: null }).then(resolve)
          return inner
        })
        b.insert = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.select = vi.fn(() => inner)
          inner.single = vi.fn(() => Promise.resolve({ data: fakeActivity, error: null }))
          return inner
        })
        b.update = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() =>
            Promise.resolve(cfg.activityUpdate ?? { data: null, error: null })
          )
          return inner
        })
        b.delete = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() =>
            Promise.resolve(cfg.activityDelete ?? { data: null, error: null })
          )
          return inner
        })
        return b
      }

      case 'activity_participants': {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        b.select = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() =>
            Promise.resolve(cfg.participantsSelect ?? { data: [], error: null })
          )
          inner.in = vi.fn(() =>
            Promise.resolve(cfg.participantsSelect ?? { data: [], error: null })
          )
          ;(inner as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.participantsSelect ?? { data: [], error: null }).then(resolve)
          return inner
        })
        b.insert = vi.fn(() => Promise.resolve({ data: [], error: null }))
        b.delete = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => Promise.resolve({ data: null, error: null }))
          return inner
        })
        return b
      }

      case 'activity_roles': {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        b.select = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() =>
            Promise.resolve(cfg.rolesSelect ?? { data: [], error: null })
          )
          inner.in = vi.fn(() =>
            Promise.resolve(cfg.rolesSelect ?? { data: [], error: null })
          )
          ;(inner as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.rolesSelect ?? { data: [], error: null }).then(resolve)
          return inner
        })
        b.insert = vi.fn(() => Promise.resolve({ data: [], error: null }))
        b.delete = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => Promise.resolve({ data: null, error: null }))
          return inner
        })
        return b
      }

      case 'activity_weekly_status': {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        b.select = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => inner)
          inner.in = vi.fn(() => inner)
          inner.maybeSingle = vi.fn(() => Promise.resolve(cfg.statusSelect ?? { data: null, error: null }))
          inner.single = vi.fn(() => Promise.resolve(cfg.statusSelect ?? { data: null, error: null }))
          ;(inner as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.statusSelect ?? { data: null, error: null }).then(resolve)
          return inner
        })
        b.upsert = vi.fn((payload: unknown) => {
          if (cfg.onWeeklyStatusUpsert) cfg.onWeeklyStatusUpsert(payload)
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.select = vi.fn(() => inner)
          inner.single = vi.fn(() =>
            Promise.resolve(cfg.weeklyStatusUpsert ?? { data: fakeWeeklyStatus, error: null })
          )
          return inner
        })
        b.delete = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => inner)
          ;(inner as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.weeklyStatusDelete ?? { data: null, error: null }).then(resolve)
          return inner
        })
        return b
      }

      default: {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        b.select = vi.fn(() => b)
        b.eq = vi.fn(() => b)
        ;(b as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve)
        return b
      }
    }
  })

  return { from: fromMock }
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

vi.mock('@/lib/notifications', () => ({
  notifyMembers: vi.fn().mockResolvedValue(undefined),
}))

import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>
const mockCreateServerClient = createServerClient as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(url, init)
}

// ---------------------------------------------------------------------------
// Bug 1 — week_start propagation
// ---------------------------------------------------------------------------

describe('POST /api/activities/:id/status — week_start handling (Bug 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeCreator)
  })

  it('uses caller-supplied week_start in upsert when body includes week_start', async () => {
    let captured: { activity_id?: string; week_start?: string } | undefined
    const db = makeMockDb({
      activityRow: { data: fakeActivity, error: null },
      participantsSelect: { data: [{ member_id: 'member-1' }], error: null },
      onWeeklyStatusUpsert: (payload) => {
        captured = payload as typeof captured
      },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { POST } = await import('@/app/api/activities/[id]/status/route')
    const req = makeRequest('POST', 'http://localhost/api/activities/act-1/status', {
      status: 'confirmed',
      week_start: '2026-05-04',
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    expect(captured).toBeDefined()
    expect(captured!.week_start).toBe('2026-05-04')
    expect(captured!.activity_id).toBe('act-1')
  })

  it('falls back to server-side week computation when body omits week_start', async () => {
    let captured: { week_start?: string } | undefined
    const db = makeMockDb({
      activityRow: { data: fakeActivity, error: null },
      participantsSelect: { data: [{ member_id: 'member-1' }], error: null },
      onWeeklyStatusUpsert: (payload) => {
        captured = payload as typeof captured
      },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { POST } = await import('@/app/api/activities/[id]/status/route')
    const req = makeRequest('POST', 'http://localhost/api/activities/act-1/status', {
      status: 'confirmed',
      // no week_start
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    // Server fell back: week_start must be a YYYY-MM-DD string
    expect(captured).toBeDefined()
    expect(captured!.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// Bug 2 — authorization on PATCH /api/activities/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/activities/:id — authorization (Bug 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when caller is not creator and not admin', async () => {
    mockRequireAuth.mockResolvedValue(fakeOutsider)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activityRow: { data: fakeActivity, error: null } })
    )

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/act-1', {
      title: 'Hacked',
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })

  it('returns 200 when caller is the creator', async () => {
    mockRequireAuth.mockResolvedValue(fakeCreator)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        activityUpdate: { data: null, error: null },
        participantsSelect: { data: [], error: null },
        rolesSelect: { data: [], error: null },
        statusSelect: { data: null, error: null },
      })
    )

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/act-1', {
      title: 'Nuoto Avanzato',
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })

  it('returns 200 when caller is an admin (not creator)', async () => {
    mockRequireAuth.mockResolvedValue(fakeAdmin)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        activityUpdate: { data: null, error: null },
        participantsSelect: { data: [], error: null },
        rolesSelect: { data: [], error: null },
        statusSelect: { data: null, error: null },
      })
    )

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/act-1', {
      title: 'Admin update',
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Bug 2 — authorization on DELETE /api/activities/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/activities/:id — authorization (Bug 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when caller is not creator and not admin', async () => {
    mockRequireAuth.mockResolvedValue(fakeOutsider)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activityRow: { data: fakeActivity, error: null } })
    )

    const { DELETE } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/activities/act-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(403)
  })

  it('returns 200 when caller is the creator', async () => {
    mockRequireAuth.mockResolvedValue(fakeCreator)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        activityUpdate: { data: null, error: null },
      })
    )

    const { DELETE } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/activities/act-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })

  it('returns 200 when caller is an admin (not creator)', async () => {
    mockRequireAuth.mockResolvedValue(fakeAdmin)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        activityUpdate: { data: null, error: null },
      })
    )

    const { DELETE } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/activities/act-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Bug 2 — authorization on PUT /api/activities/:id/roles
// ---------------------------------------------------------------------------

describe('PUT /api/activities/:id/roles — authorization (Bug 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when caller is not creator and not admin', async () => {
    mockRequireAuth.mockResolvedValue(fakeOutsider)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activityRow: { data: fakeActivity, error: null } })
    )

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: [{ member_id: 'outsider-1', role_label: 'Capo' }],
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })

  it('returns 200 when caller is the creator', async () => {
    mockRequireAuth.mockResolvedValue(fakeCreator)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        rolesSelect: { data: [], error: null },
      })
    )

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: [],
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })

  it('returns 200 when caller is admin', async () => {
    mockRequireAuth.mockResolvedValue(fakeAdmin)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        rolesSelect: { data: [], error: null },
      })
    )

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: [],
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Bug 2 — authorization on POST /api/activities/:id/status
// ---------------------------------------------------------------------------

describe('POST /api/activities/:id/status — authorization (Bug 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when caller is neither participant nor admin', async () => {
    mockRequireAuth.mockResolvedValue(fakeOutsider)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        participantsSelect: {
          data: [{ member_id: 'member-1' }, { member_id: 'participant-1' }],
          error: null,
        },
      })
    )

    const { POST } = await import('@/app/api/activities/[id]/status/route')
    const req = makeRequest('POST', 'http://localhost/api/activities/act-1/status', {
      status: 'confirmed',
      week_start: '2026-05-04',
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })

  it('returns 200 when caller is a participant', async () => {
    mockRequireAuth.mockResolvedValue(fakeParticipant)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        participantsSelect: {
          data: [{ member_id: 'participant-1' }, { member_id: 'member-1' }],
          error: null,
        },
      })
    )

    const { POST } = await import('@/app/api/activities/[id]/status/route')
    const req = makeRequest('POST', 'http://localhost/api/activities/act-1/status', {
      status: 'confirmed',
      week_start: '2026-05-04',
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })

  it('returns 200 when caller is admin (even if not a participant)', async () => {
    mockRequireAuth.mockResolvedValue(fakeAdmin)
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityRow: { data: fakeActivity, error: null },
        participantsSelect: {
          data: [{ member_id: 'member-1' }],
          error: null,
        },
      })
    )

    const { POST } = await import('@/app/api/activities/[id]/status/route')
    const req = makeRequest('POST', 'http://localhost/api/activities/act-1/status', {
      status: 'confirmed',
      week_start: '2026-05-04',
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })
})
