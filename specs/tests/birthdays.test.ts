// @vitest-environment node
/**
 * Test della pipeline compleanni (Fase 6.5):
 *   - GET  /api/birthdays/today
 *   - GET  /api/cron/birthday-notifications (chiamato dal cron Vercel)
 *   - PATCH /api/members/:id accetta `birth_date`
 *   - catalog NOTIFICATION_EVENTS.birthday
 *
 * La migration 013 è già applicata su prod via MCP — qui testiamo
 * solo il pezzo API/UI/catalog.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks condivisi
// ---------------------------------------------------------------------------
const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return {
    ...actual,
    requireAuth: mockRequireAuth,
  }
})

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/notification-events', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notification-events')>('@/lib/notification-events')
  return {
    ...actual,
    emit: mockEmit,
  }
})

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function frozenDate(iso: string): void {
  vi.setSystemTime(new Date(iso))
}

function makeGet(url = 'http://localhost/api/birthdays/today'): Request {
  return new Request(url, { method: 'GET' })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mockEmit.mockResolvedValue(undefined)
})

const AUTH_USER = { id: 'me', name: 'Me', is_admin: false }

const MEMBER_TODAY_BIRTHDAY = {
  id: 'marco',
  name: 'Marco',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  pin_hash: 'h',
  is_admin: false,
  is_active: true,
  color: '#f00',
  notify_push: true,
  notify_telegram: false,
  telegram_chat_id: null,
  birth_date: '1980-05-15',
  created_at: '…',
  updated_at: '…',
}

const MEMBER_OTHER_DAY = {
  ...MEMBER_TODAY_BIRTHDAY,
  id: 'lucia',
  name: 'Lucia',
  birth_date: '1985-03-10', // marzo, non maggio
}

const MEMBER_NO_BIRTHDAY = {
  ...MEMBER_TODAY_BIRTHDAY,
  id: 'anon',
  name: 'Anon',
  birth_date: null,
}

// ---------------------------------------------------------------------------
// GET /api/birthdays/today
// ---------------------------------------------------------------------------
describe('GET /api/birthdays/today', () => {
  it('respinge senza auth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 }),
    )
    const { GET } = await import('@/app/api/birthdays/today/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('ritorna i membri con compleanno oggi (filtra mese+giorno, ignora anno)', async () => {
    frozenDate('2026-05-15T12:00:00Z')
    mockRequireAuth.mockResolvedValueOnce(AUTH_USER)
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({
            data: [MEMBER_TODAY_BIRTHDAY, MEMBER_OTHER_DAY],
            error: null,
          }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/birthdays/today/route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].id).toBe('marco')
    expect(json.data[0].age).toBe(46) // 2026 - 1980
    // Privacy: niente pin_hash, niente notify_*, niente updated_at
    expect(json.data[0]).not.toHaveProperty('pin_hash')
    expect(json.data[0]).not.toHaveProperty('notify_push')
  })

  it('ignora membri con birth_date null (caso difensivo: la query già escludeva, ma il filter in-JS lo riconferma)', async () => {
    frozenDate('2026-05-15T12:00:00Z')
    mockRequireAuth.mockResolvedValueOnce(AUTH_USER)
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({
            data: [MEMBER_NO_BIRTHDAY],
            error: null,
          }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/birthdays/today/route')
    const res = await GET()
    const json = await res.json()
    expect(json.data).toEqual([])
  })

  it('ritorna array vuoto se nessuno compie oggi (200, non 404)', async () => {
    frozenDate('2026-07-04T12:00:00Z') // nessun membro nasce il 4 luglio
    mockRequireAuth.mockResolvedValueOnce(AUTH_USER)
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({
            data: [MEMBER_TODAY_BIRTHDAY, MEMBER_OTHER_DAY],
            error: null,
          }),
        }),
      }),
    }))

    const { GET } = await import('@/app/api/birthdays/today/route')
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// GET /api/cron/birthday-notifications
// ---------------------------------------------------------------------------
describe('GET /api/cron/birthday-notifications', () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET
  })

  it('503 se CRON_SECRET non è configurato', async () => {
    const req = new Request('http://localhost/api/cron/birthday-notifications', {
      method: 'GET',
      headers: { authorization: 'Bearer anything' },
    })
    const { GET } = await import('@/app/api/cron/birthday-notifications/route')
    const res = await GET(req as never)
    expect(res.status).toBe(503)
  })

  it('401 se header Authorization manca o sbaglia', async () => {
    process.env.CRON_SECRET = 'secret-123'
    const req = new Request('http://localhost/api/cron/birthday-notifications', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong' },
    })
    const { GET } = await import('@/app/api/cron/birthday-notifications/route')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('emette evento birthday per ogni festeggiato di oggi', async () => {
    process.env.CRON_SECRET = 'secret-123'
    frozenDate('2026-05-15T06:00:00Z')

    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({
            data: [MEMBER_TODAY_BIRTHDAY, MEMBER_OTHER_DAY],
            error: null,
          }),
        }),
      }),
    }))

    const req = new Request('http://localhost/api/cron/birthday-notifications', {
      method: 'GET',
      headers: { authorization: 'Bearer secret-123' },
    })
    const { GET } = await import('@/app/api/cron/birthday-notifications/route')
    const res = await GET(req as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.processed).toBe(1)
    expect(json.data.failed).toBe(0)
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith('birthday', {
      member: { id: 'marco', name: 'Marco' },
      age: 46,
    })
  })

  it('200 con processed=0 se nessuno compie oggi', async () => {
    process.env.CRON_SECRET = 'secret-123'
    frozenDate('2026-12-25T06:00:00Z')
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          not: () => Promise.resolve({ data: [MEMBER_OTHER_DAY], error: null }),
        }),
      }),
    }))

    const req = new Request('http://localhost/api/cron/birthday-notifications', {
      method: 'GET',
      headers: { authorization: 'Bearer secret-123' },
    })
    const { GET } = await import('@/app/api/cron/birthday-notifications/route')
    const res = await GET(req as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.processed).toBe(0)
    expect(mockEmit).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// catalog: birthday event
// ---------------------------------------------------------------------------
describe('NOTIFICATION_EVENTS.birthday', () => {
  it('title + body in italiano, link al profilo del festeggiato', async () => {
    const { NOTIFICATION_EVENTS } = await vi.importActual<
      typeof import('@/lib/notification-events')
    >('@/lib/notification-events')

    const payload = { member: { id: 'marco', name: 'Marco' }, age: 46 }
    expect(NOTIFICATION_EVENTS.birthday.title(payload)).toContain('Buon compleanno')
    expect(NOTIFICATION_EVENTS.birthday.body(payload)).toBe('Oggi Marco compie 46 anni. Auguri!')
    expect(NOTIFICATION_EVENTS.birthday.link(payload)).toBe('/family/marco')
  })

  it('recipients esclude il festeggiato (niente push a se stesso)', async () => {
    const { NOTIFICATION_EVENTS } = await vi.importActual<
      typeof import('@/lib/notification-events')
    >('@/lib/notification-events')

    // Mock supabase per la query "membri attivi"
    const fakeDb = {
      from: () => ({
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [{ id: 'marco' }, { id: 'lucia' }, { id: 'anon' }],
              error: null,
            }),
        }),
      }),
    } as never

    const recipients = await NOTIFICATION_EVENTS.birthday.recipients(
      { member: { id: 'marco', name: 'Marco' }, age: 46 },
      fakeDb,
    )

    expect(recipients).toEqual(['lucia', 'anon'])
  })
})
