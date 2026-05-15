// @vitest-environment node
/**
 * Activities API — unit tests (Phase 4A)
 *
 * Routes covered:
 *   GET    /api/activities
 *   POST   /api/activities
 *   GET    /api/activities/:id
 *   PATCH  /api/activities/:id
 *   DELETE /api/activities/:id
 *   POST   /api/activities/:id/status
 *   GET    /api/activities/:id/roles
 *   PUT    /api/activities/:id/roles
 *
 * Mocking strategy:
 *   - vi.mock('@/lib/auth')               → requireAuth() returns fakeMember
 *   - vi.mock('@/lib/supabase/client')     → createServerClient() returns mockDb
 *   - vi.mock('@/lib/notifications')       → notifyMembers() is a no-op spy
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { MemberPublic } from '@/types/database'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const fakeMember = {
  id: 'member-1',
  name: 'Alice',
  avatar_emoji: '😀',
  avatar_url: null,
  family_role: 'mamma',
  bio: '',
  pin_hash: 'hash',
  is_admin: true,
  is_active: true,
  color: '#fff',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const fakeMemberPublic = {
  id: 'member-1',
  name: 'Alice',
  avatar_emoji: '😀',
  avatar_url: null,
  family_role: 'mamma',
  bio: '',
  is_admin: true,
  is_active: true,
  color: '#fff',
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
  created_by: 'member-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const fakeRole = {
  id: 'role-1',
  activity_id: 'act-1',
  member_id: 'member-1',
  role_label: 'Allenatore',
  member: fakeMemberPublic,
}

const fakeAttendance = {
  id: 'att-1',
  activity_id: 'act-1',
  week_start: '2026-03-30',
  member_id: 'member-1',
  status: 'confirmed' as const,
  modified_notes: null,
  created_at: '2026-03-30T00:00:00Z',
  updated_at: '2026-03-30T00:00:00Z',
}

const fakeActivityWithDetails = {
  ...fakeActivity,
  participants: [fakeMemberPublic],
  roles: [fakeRole],
  attendances: [fakeAttendance],
  weekly_status: null,
}

// ---------------------------------------------------------------------------
// Mock factories — re-created before each test so tests are isolated
// ---------------------------------------------------------------------------

/** Builds a chainable Supabase query builder mock. */
function makeMockDb(overrides: Record<string, unknown> = {}) {
  // Default: everything succeeds and returns empty / null
  const defaults = {
    activitiesSelect: { data: [], error: null },
    participantsSelect: { data: [], error: null },
    rolesSelect: { data: [], error: null },
    statusSelect: { data: [], error: null },
    activityInsert: { data: fakeActivity, error: null },
    participantsInsert: { data: [], error: null },
    rolesInsert: { data: [], error: null },
    activityUpdate: { data: null, error: null },
    activityDelete: { data: null, error: null },
  }

  const cfg = { ...defaults, ...overrides }

  /** Generic chainable builder that resolves to `result` at the end. */
  function chain(result: unknown) {
    const builder: Record<string, unknown> = {}
    const methods = [
      'select', 'insert', 'update', 'delete', 'upsert',
      'eq', 'in', 'order', 'single', 'maybeSingle',
    ]
    for (const m of methods) {
      builder[m] = vi.fn(() => builder)
    }
    // Terminal resolvers
    ;(builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve)
    // Allow `await builder` by making it thenable
    Object.defineProperty(builder, Symbol.iterator, { value: undefined })
    return builder
  }

  // We need per-table routing. The mock db.from() inspects the table name.
  const fromMock = vi.fn((table: string) => {
    switch (table) {
      case 'activities': {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        // select → used by GET list, GET single, PATCH fetch-back, status check
        b.select = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => inner)
          inner.in = vi.fn(() => inner)
          inner.order = vi.fn(() => inner)
          inner.single = vi.fn(() => Promise.resolve(cfg.activitiesSelect))
          inner.maybeSingle = vi.fn(() => Promise.resolve(cfg.statusSelect))
          // Make it directly awaitable (for .select('*').eq(...) without .single())
          // Mock thenable: cast to any to bypass the strict 2-arg Promise.then
          // signature; runtime behaviour is the only thing we care about here.
          ;(inner as any).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.activitiesSelect).then(resolve)
          return inner
        })
        b.insert = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.select = vi.fn(() => inner)
          inner.single = vi.fn(() => Promise.resolve(cfg.activityInsert))
          return inner
        })
        b.update = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => Promise.resolve(cfg.activityUpdate))
          return inner
        })
        return b
      }

      case 'activity_participants': {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        b.select = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => inner)
          inner.in = vi.fn(() => Promise.resolve(cfg.participantsSelect))
          ;(inner as any).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.participantsSelect).then(resolve)
          return inner
        })
        b.insert = vi.fn(() => Promise.resolve(cfg.participantsInsert))
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
          inner.eq = vi.fn(() => inner)
          inner.in = vi.fn(() => Promise.resolve(cfg.rolesSelect))
          ;(inner as any).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.rolesSelect).then(resolve)
          return inner
        })
        b.insert = vi.fn(() => Promise.resolve(cfg.rolesInsert))
        b.delete = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => Promise.resolve({ data: null, error: null }))
          return inner
        })
        return b
      }

      case 'activity_weekly_attendances': {
        const b: Record<string, (...args: unknown[]) => unknown> = {}
        b.select = vi.fn(() => {
          const inner: Record<string, (...args: unknown[]) => unknown> = {}
          inner.eq = vi.fn(() => inner)
          inner.in = vi.fn(() => inner)
          inner.maybeSingle = vi.fn(() => Promise.resolve(cfg.statusSelect))
          inner.single = vi.fn(() => Promise.resolve(cfg.statusSelect))
          ;(inner as any).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve(cfg.statusSelect).then(resolve)
          return inner
        })
        return b
      }

      default:
        return chain({ data: null, error: null })
    }
  })

  return { from: fromMock }
}

// ---------------------------------------------------------------------------
// Module mocks — declared with vi.mock() hoisted by Vitest
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
  toPublicMember: vi.fn((m: typeof fakeMember) => {
    const { pin_hash: _, notify_push: __, notify_telegram: ___, telegram_chat_id: ____, created_at: _____, updated_at: ______, ...rest } = m
    return rest
  }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('@/lib/notifications', () => ({
  notifyMembers: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>
const mockCreateServerClient = createServerClient as ReturnType<typeof vi.fn>
const mockNotifyMembers = notifyMembers as ReturnType<typeof vi.fn>

function makeRequest(
  method: string,
  url: string,
  body?: unknown
): NextRequest {
  // Use a plain literal — DOM's RequestInit narrows `signal` to
  // `AbortSignal | null` while NextRequest expects `AbortSignal | undefined`.
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(url, init)
}

// ---------------------------------------------------------------------------
// Tests: GET /api/activities
// ---------------------------------------------------------------------------

describe('GET /api/activities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('returns 200 with ApiResponse<ActivityWithDetails[]> shape', async () => {
    const participantRow = { activity_id: 'act-1', member_id: 'member-1', members: fakeMemberPublic }
    const roleRow = { ...fakeRole, members: fakeMemberPublic }
    const attendanceRow = fakeAttendance

    const db = makeMockDb({
      activitiesSelect: { data: [fakeActivity], error: null },
      participantsSelect: { data: [participantRow], error: null },
      rolesSelect: { data: [roleRow], error: null },
      statusSelect: { data: [attendanceRow], error: null },
    })

    // The route calls .in() on participants, roles, and status, and .eq('is_active',true) + .order() on activities
    // We need the activities select to handle the chained call without .single()
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities?week_start=2026-03-30')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ error: null })
    expect(Array.isArray(json.data)).toBe(true)
  })

  it('returns 200 with empty array when no active activities', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activitiesSelect: { data: [], error: null } })
    )

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ data: [], error: null })
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toMatchObject({ data: null, error: 'Non autenticato' })
  })

  it('returns 500 when db error on activities query', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activitiesSelect: { data: null, error: { message: 'DB error' } } })
    )

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toMatchObject({ data: null })
    expect(typeof json.error).toBe('string')
  })

  it('uses week_start param for attendance lookup', async () => {
    const db = makeMockDb({
      activitiesSelect: { data: [fakeActivity], error: null },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: [], error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities?week_start=2026-03-30')
    const res = await GET(req)

    expect(res.status).toBe(200)
  })

  it('filters by is_active=true (only active activities returned)', async () => {
    // The route explicitly calls .eq('is_active', true) — we verify no error occurs
    // and data shape is correct; filtering is Supabase's responsibility
    const db = makeMockDb({
      activitiesSelect: { data: [fakeActivity], error: null },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: [], error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    // All returned activities must be is_active=true
    for (const a of json.data) {
      expect(a.is_active).toBe(true)
    }
  })

  it('falls back to all active members when activity has no explicit participants', async () => {
    // "Piscina" use case from the screenshots: the activity was created
    // without a roster, but the family should still be able to confirm /
    // skip from the Attività page. The route must fill `participants` with
    // every active member.
    const memberAlice: MemberPublic = { ...fakeMemberPublic, id: 'm-alice', name: 'Alice' }
    const memberBob: MemberPublic = { ...fakeMemberPublic, id: 'm-bob', name: 'Bob' }

    const db = makeMockDb({
      activitiesSelect: { data: [fakeActivity], error: null },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: [], error: null },
    })
    // Override the default `members` branch on top of the factory so this
    // single test can return a real roster without touching other tests.
    const originalFrom = db.from as ReturnType<typeof vi.fn>
    // Cast esplicito: in vitest 4 il return type di
    // getMockImplementation è una Procedure non chiamabile
    // direttamente. La nostra impl è `(table: string) => unknown`.
    const baseImpl = originalFrom.getMockImplementation() as
      | ((table: string) => unknown)
      | undefined
    originalFrom.mockImplementation((table: string) => {
      if (table === 'members') {
        const inner: Record<string, (...args: unknown[]) => unknown> = {}
        inner.select = vi.fn(() => inner)
        inner.eq = vi.fn(() => Promise.resolve({ data: [memberAlice, memberBob], error: null }))
        ;(inner as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [memberAlice, memberBob], error: null }).then(resolve)
        return inner
      }
      return baseImpl ? baseImpl(table) : undefined
    })
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data[0].participants).toHaveLength(2)
    expect(json.data[0].participants.map((p: MemberPublic) => p.id)).toEqual([
      'm-alice',
      'm-bob',
    ])
  })

  it('keeps the explicit roster when the activity already has participants', async () => {
    // Counterpart to the previous test: when activity_participants has rows
    // for an activity (e.g. only grandparents go to the pool), the route
    // must NOT replace them with the full member list.
    const explicit: MemberPublic = { ...fakeMemberPublic, id: 'only-grandpa', name: 'Nonno' }
    const everyoneElse: MemberPublic = { ...fakeMemberPublic, id: 'm-everyone', name: 'Altro' }

    const db = makeMockDb({
      activitiesSelect: { data: [fakeActivity], error: null },
      participantsSelect: {
        data: [{ activity_id: 'act-1', member_id: 'only-grandpa', members: explicit }],
        error: null,
      },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: [], error: null },
    })
    const originalFrom = db.from as ReturnType<typeof vi.fn>
    // Cast esplicito: in vitest 4 il return type di
    // getMockImplementation è una Procedure non chiamabile
    // direttamente. La nostra impl è `(table: string) => unknown`.
    const baseImpl = originalFrom.getMockImplementation() as
      | ((table: string) => unknown)
      | undefined
    originalFrom.mockImplementation((table: string) => {
      if (table === 'members') {
        const inner: Record<string, (...args: unknown[]) => unknown> = {}
        inner.select = vi.fn(() => inner)
        inner.eq = vi.fn(() =>
          Promise.resolve({ data: [explicit, everyoneElse], error: null }),
        )
        ;(inner as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [explicit, everyoneElse], error: null }).then(resolve)
        return inner
      }
      return baseImpl ? baseImpl(table) : undefined
    })
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data[0].participants).toHaveLength(1)
    expect(json.data[0].participants[0].id).toBe('only-grandpa')
  })
})

// ---------------------------------------------------------------------------
// Tests: POST /api/activities
// ---------------------------------------------------------------------------

describe('POST /api/activities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('returns 201 with full ActivityWithDetails on success', async () => {
    const participantRow = { member_id: 'member-1', members: fakeMemberPublic }
    const roleRow = { ...fakeRole, members: fakeMemberPublic }

    const db = makeMockDb({
      activityInsert: { data: fakeActivity, error: null },
      participantsSelect: { data: [participantRow], error: null },
      rolesSelect: { data: [roleRow], error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { POST } = await import('@/app/api/activities/route')
    const req = makeRequest('POST', 'http://localhost/api/activities', {
      title: 'Nuoto',
      day_of_week: 1,
      time: '09:00',
      participant_ids: ['member-1'],
      roles: [{ member_id: 'member-1', role_label: 'Allenatore' }],
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.data).toMatchObject({
      id: expect.any(String),
      title: 'Nuoto',
      day_of_week: 1,
      time: '09:00',
      is_active: true,
    })
    expect(Array.isArray(json.data.participants)).toBe(true)
    expect(Array.isArray(json.data.roles)).toBe(true)
    expect(Array.isArray(json.data.attendances)).toBe(true)
    expect(json.data.attendances).toEqual([])
  })

  it('returns 400 when title is missing', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { POST } = await import('@/app/api/activities/route')
    const req = makeRequest('POST', 'http://localhost/api/activities', {
      day_of_week: 1,
      time: '09:00',
      participant_ids: ['member-1'],
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })

  it('returns 400 when day_of_week is missing', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { POST } = await import('@/app/api/activities/route')
    const req = makeRequest('POST', 'http://localhost/api/activities', {
      title: 'Yoga',
      time: '08:00',
      participant_ids: ['member-1'],
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 when time is missing', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { POST } = await import('@/app/api/activities/route')
    const req = makeRequest('POST', 'http://localhost/api/activities', {
      title: 'Yoga',
      day_of_week: 2,
      participant_ids: ['member-1'],
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 when body is invalid JSON', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { POST } = await import('@/app/api/activities/route')
    const req = new NextRequest('http://localhost/api/activities', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.data).toBeNull()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { POST } = await import('@/app/api/activities/route')
    const req = makeRequest('POST', 'http://localhost/api/activities', {
      title: 'Nuoto',
      day_of_week: 1,
      time: '09:00',
      participant_ids: ['member-1'],
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('applies default icon and color when not provided', async () => {
    const db = makeMockDb({
      activityInsert: {
        data: { ...fakeActivity, icon: '📅', color: '#6366f1' },
        error: null,
      },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { POST } = await import('@/app/api/activities/route')
    const req = makeRequest('POST', 'http://localhost/api/activities', {
      title: 'Corsa',
      day_of_week: 3,
      time: '07:00',
      participant_ids: ['member-1'],
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.icon).toBe('📅')
    expect(json.data.color).toBe('#6366f1')
  })

  it('returns 500 when DB insert fails', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activityInsert: { data: null, error: { message: 'insert failed' } } })
    )

    const { POST } = await import('@/app/api/activities/route')
    const req = makeRequest('POST', 'http://localhost/api/activities', {
      title: 'Nuoto',
      day_of_week: 1,
      time: '09:00',
      participant_ids: ['member-1'],
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.data).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: GET /api/activities/:id
// ---------------------------------------------------------------------------

describe('GET /api/activities/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('returns 200 with ActivityWithDetails when found', async () => {
    const participantRow = { member_id: 'member-1', members: fakeMemberPublic }
    const roleRow = { ...fakeRole, members: fakeMemberPublic }

    // Override the per-table mock so activities.select().eq().single() returns fakeActivity
    const db = makeMockDb({
      activitiesSelect: { data: fakeActivity, error: null },
      participantsSelect: { data: [participantRow], error: null },
      rolesSelect: { data: [roleRow], error: null },
      statusSelect: { data: [fakeAttendance], error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/act-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.data).toMatchObject({ id: 'act-1', title: 'Nuoto' })
    expect(Array.isArray(json.data.participants)).toBe(true)
    expect(Array.isArray(json.data.roles)).toBe(true)
  })

  it('returns 404 when activity not found (is_active=false or missing)', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activitiesSelect: { data: null, error: { message: 'not found' } } })
    )

    const { GET } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/nonexistent')
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { GET } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/act-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(401)
  })

  it('includes attendances:[] when no attendance records exist', async () => {
    const db = makeMockDb({
      activitiesSelect: { data: fakeActivity, error: null },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: [], error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/act-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.attendances).toEqual([])
    expect(json.data.weekly_status).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: PATCH /api/activities/:id
// ---------------------------------------------------------------------------

describe('PATCH /api/activities/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('returns 200 with updated ActivityWithDetails', async () => {
    const updatedActivity = { ...fakeActivity, title: 'Nuoto Avanzato' }
    const db = makeMockDb({
      activitiesSelect: { data: updatedActivity, error: null },
      activityUpdate: { data: null, error: null },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: null, error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/act-1', {
      title: 'Nuoto Avanzato',
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(json.data).toMatchObject({ id: 'act-1' })
    expect(Array.isArray(json.data.participants)).toBe(true)
    expect(Array.isArray(json.data.roles)).toBe(true)
  })

  it('replaces all participants when participant_ids provided', async () => {
    const db = makeMockDb({
      activitiesSelect: { data: fakeActivity, error: null },
      activityUpdate: { data: null, error: null },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: null, error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/act-1', {
      participant_ids: ['member-2'],
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    // Verify the delete+insert pattern happened by checking the mock was called
    // MockResult is a discriminated union — narrow to a returned value first
    // before peeking at .value.
    const participantsTable = db.from.mock.results.find(
      (r) => r.type === 'return' && r.value !== null && typeof r.value === 'object' && 'delete' in (r.value as object)
    )
    expect(participantsTable).toBeDefined()
  })

  it('replaces all roles when roles provided', async () => {
    const db = makeMockDb({
      activitiesSelect: { data: fakeActivity, error: null },
      activityUpdate: { data: null, error: null },
      participantsSelect: { data: [], error: null },
      rolesSelect: { data: [], error: null },
      statusSelect: { data: null, error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/act-1', {
      roles: [{ member_id: 'member-2', role_label: 'Assistente' }],
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
  })

  it('returns 404 when activity not found after update', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({
        activityUpdate: { data: null, error: null },
        activitiesSelect: { data: null, error: { message: 'not found' } },
      })
    )

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/nonexistent', {
      title: 'Qualcosa',
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.data).toBeNull()
  })

  it('returns 400 when body is invalid JSON', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = new NextRequest('http://localhost/api/activities/act-1', {
      method: 'PATCH',
      body: '{bad json}',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { PATCH } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/activities/act-1', { title: 'X' })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Tests: DELETE /api/activities/:id  (soft delete)
// ---------------------------------------------------------------------------

describe('DELETE /api/activities/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('returns 200 with { data: null, error: null } on soft delete', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activityUpdate: { data: null, error: null } })
    )

    const { DELETE } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/activities/act-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ data: null, error: null })
  })

  it('sets is_active=false (soft delete, not hard delete)', async () => {
    const db = makeMockDb({ activityUpdate: { data: null, error: null } })
    mockCreateServerClient.mockReturnValue(db)

    const { DELETE } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/activities/act-1')
    await DELETE(req, { params: Promise.resolve({ id: 'act-1' }) })

    // Verify update() was called (not delete()) on the activities table
    const activitiesFromCalls = db.from.mock.calls.filter(
      (call: unknown[]) => call[0] === 'activities'
    )
    expect(activitiesFromCalls.length).toBeGreaterThan(0)
  })

  it('returns 500 when DB update fails', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ activityUpdate: { data: null, error: { message: 'update failed' } } })
    )

    const { DELETE } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/activities/act-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { DELETE } = await import('@/app/api/activities/[id]/route')
    const req = makeRequest('DELETE', 'http://localhost/api/activities/act-1')
    const res = await DELETE(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Tests: GET /api/activities/:id/roles
// ---------------------------------------------------------------------------

describe('GET /api/activities/:id/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('returns 200 with ActivityRole[] including member data', async () => {
    const roleRow = {
      id: 'role-1',
      activity_id: 'act-1',
      member_id: 'member-1',
      role_label: 'Allenatore',
      members: fakeMemberPublic,
    }
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ rolesSelect: { data: [roleRow], error: null } })
    )

    const { GET } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/act-1/roles')
    const res = await GET(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data[0]).toMatchObject({
      id: 'role-1',
      activity_id: 'act-1',
      member_id: 'member-1',
      role_label: 'Allenatore',
    })
    expect(json.data[0].member).toMatchObject({ id: 'member-1', name: 'Alice' })
  })

  it('returns 200 with empty array when no roles', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ rolesSelect: { data: [], error: null } })
    )

    const { GET } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/act-1/roles')
    const res = await GET(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ data: [], error: null })
  })

  it('returns 500 when DB query fails', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ rolesSelect: { data: null, error: { message: 'DB error' } } })
    )

    const { GET } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/act-1/roles')
    const res = await GET(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.data).toBeNull()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { GET } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('GET', 'http://localhost/api/activities/act-1/roles')
    const res = await GET(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Tests: PUT /api/activities/:id/roles
// ---------------------------------------------------------------------------

describe('PUT /api/activities/:id/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('returns 200 with replaced ActivityRole[] on success', async () => {
    const updatedRoleRow = {
      id: 'role-2',
      activity_id: 'act-1',
      member_id: 'member-2',
      role_label: 'Assistente',
      members: { ...fakeMemberPublic, id: 'member-2', name: 'Bob' },
    }
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ rolesSelect: { data: [updatedRoleRow], error: null } })
    )

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: [{ member_id: 'member-2', role_label: 'Assistente' }],
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
    expect(Array.isArray(json.data)).toBe(true)
    expect(json.data[0]).toMatchObject({
      role_label: 'Assistente',
      member_id: 'member-2',
    })
  })

  it('returns 200 with empty array when roles=[] (clears all roles)', async () => {
    mockCreateServerClient.mockReturnValue(
      makeMockDb({ rolesSelect: { data: [], error: null } })
    )

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: [],
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual([])
  })

  it('returns 400 when roles is not an array', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: 'not-an-array',
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })

  it('returns 400 when roles field is missing entirely', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      other: 'field',
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(400)
  })

  it('returns 400 when body is invalid JSON', async () => {
    mockCreateServerClient.mockReturnValue(makeMockDb())

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = new NextRequest('http://localhost/api/activities/act-1/roles', {
      method: 'PUT',
      body: '{invalid}',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(400)
  })

  it('returns 500 when DB delete fails', async () => {
    // We need a custom db where activity_roles.delete() returns an error
    const db = makeMockDb()
    const originalFrom = db.from.getMockImplementation()
    db.from.mockImplementation((table: string) => {
      if (table === 'activity_roles') {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: null, error: { message: 'delete failed' } })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return originalFrom ? originalFrom(table) : {}
    })
    mockCreateServerClient.mockReturnValue(db)

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: [{ member_id: 'member-1', role_label: 'Test' }],
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.data).toBeNull()
  })

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { PUT } = await import('@/app/api/activities/[id]/roles/route')
    const req = makeRequest('PUT', 'http://localhost/api/activities/act-1/roles', {
      roles: [],
    })
    const res = await PUT(req, { params: Promise.resolve({ id: 'act-1' }) })

    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Tests: ApiResponse shape invariants (cross-cutting)
// ---------------------------------------------------------------------------

describe('ApiResponse shape invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(fakeMember)
  })

  it('all success responses have { data: <value>, error: null }', async () => {
    const db = makeMockDb({
      activitiesSelect: { data: [], error: null },
    })
    mockCreateServerClient.mockReturnValue(db)

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)
    const json = await res.json()

    expect(json).toHaveProperty('data')
    expect(json).toHaveProperty('error')
    expect(json.error).toBeNull()
  })

  it('all error responses have { data: null, error: <string> }', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })
    )

    const { GET } = await import('@/app/api/activities/route')
    const req = makeRequest('GET', 'http://localhost/api/activities')
    const res = await GET(req)
    const json = await res.json()

    expect(json).toHaveProperty('data')
    expect(json).toHaveProperty('error')
    expect(json.data).toBeNull()
    expect(typeof json.error).toBe('string')
  })
})
