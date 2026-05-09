/**
 * Tests for POST/DELETE/GET /api/auth and GET/POST /api/setup
 * Written from spec only (Phase 4A) — routes not read.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mock infrastructure
// ---------------------------------------------------------------------------

// Mock NextRequest factory
function makeRequest(
  method: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// Helper: parse a NextResponse-like Response body
async function parseResponse(res: Response): Promise<{ status: number; body: unknown }> {
  const body = await res.json()
  return { status: res.status, body }
}

// ---------------------------------------------------------------------------
// Canonical mock objects
// ---------------------------------------------------------------------------

const MOCK_MEMBER = {
  id: 'member-1',
  name: 'Mario Rossi',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  pin_hash: 'hashed-1234',
  is_admin: true,
  is_active: true,
  color: '#ff0000',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const MOCK_PUBLIC_MEMBER = {
  id: 'member-1',
  name: 'Mario Rossi',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  is_admin: true,
  is_active: true,
  color: '#ff0000',
}

const MOCK_TOKEN = 'uuid-session-token'

// ---------------------------------------------------------------------------
// Module mocks — declared before imports so vi.mock is hoisted correctly.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  requireAuth: vi.fn(),
  verifyPin: vi.fn(),
  hashPin: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  validateSession: vi.fn(),
  getCurrentMember: vi.fn(),
  toPublicMember: vi.fn(),
}))

vi.mock('../../src/lib/supabase/client', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))

// ---------------------------------------------------------------------------
// Late imports (after mocks are set up)
// ---------------------------------------------------------------------------

import * as authLib from '../../src/lib/auth'
import { createServerClient } from '../../src/lib/supabase/client'

// Route handlers — imported here so mocks apply
import { POST as authPOST, DELETE as authDELETE, GET as authGET } from '../../src/app/api/auth/route'
import { GET as setupGET, POST as setupPOST } from '../../src/app/api/setup/route'

// Typed references for mock functions
const mockRequireAuth = vi.mocked(authLib.requireAuth)
const mockVerifyPin = vi.mocked(authLib.verifyPin)
const mockHashPin = vi.mocked(authLib.hashPin)
const mockCreateSession = vi.mocked(authLib.createSession)
const mockDeleteSession = vi.mocked(authLib.deleteSession)
const mockValidateSession = vi.mocked(authLib.validateSession)
const mockGetCurrentMember = vi.mocked(authLib.getCurrentMember)
const mockToPublicMember = vi.mocked(authLib.toPublicMember)
const mockCreateServerClient = vi.mocked(createServerClient)

// ---------------------------------------------------------------------------
// Supabase builder helper
// ---------------------------------------------------------------------------

function makeSupabaseBuilder(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn().mockReturnValue(builder)
  builder.eq = vi.fn().mockReturnValue(builder)
  builder.single = vi.fn().mockResolvedValue({ data, error })
  builder.insert = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return builder
}

function makeSupabaseClient(data: unknown, error: unknown = null) {
  const builder = makeSupabaseBuilder(data, error)
  return { from: vi.fn(() => builder) } as unknown as ReturnType<typeof createServerClient>
}

// ---------------------------------------------------------------------------
// POST /api/auth — login
// ---------------------------------------------------------------------------

describe('POST /api/auth (login)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToPublicMember.mockReturnValue(MOCK_PUBLIC_MEMBER)
    mockCreateSession.mockResolvedValue(MOCK_TOKEN)
    mockVerifyPin.mockReturnValue(true)
  })

  it('returns 200 with member and token on valid login', async () => {
    // Supabase returns the member on lookup
    mockCreateServerClient.mockReturnValue(
      makeSupabaseClient(MOCK_MEMBER),
    )

    const req = makeRequest('POST', { member_id: 'member-1', pin: '1234' })
    const res = await authPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect((body as any).error).toBeNull()
    expect((body as any).data.token).toBe(MOCK_TOKEN)
    expect((body as any).data.member).toMatchObject(MOCK_PUBLIC_MEMBER)
  })

  it('returns 400 when member_id is missing', async () => {
    const req = makeRequest('POST', { pin: '1234' })
    const res = await authPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
    expect((body as any).data).toBeNull()
    expect((body as any).error).toBeTruthy()
  })

  it('returns 400 when member_id is an empty string', async () => {
    const req = makeRequest('POST', { member_id: '', pin: '1234' })
    const res = await authPOST(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 400 when pin is missing', async () => {
    const req = makeRequest('POST', { member_id: 'member-1' })
    const res = await authPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
    expect((body as any).data).toBeNull()
  })

  it('returns 400 when pin is not exactly 4 characters', async () => {
    const req = makeRequest('POST', { member_id: 'member-1', pin: '12' })
    const res = await authPOST(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 400 when pin is longer than 4 characters', async () => {
    const req = makeRequest('POST', { member_id: 'member-1', pin: '123456' })
    const res = await authPOST(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 401 when member is not found', async () => {
    // Supabase returns null (not found)
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(null))

    const req = makeRequest('POST', { member_id: 'ghost', pin: '1234' })
    const res = await authPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(401)
    expect((body as any).data).toBeNull()
  })

  it('returns 401 when PIN is wrong', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(MOCK_MEMBER))
    mockVerifyPin.mockReturnValue(false) // wrong PIN

    const req = makeRequest('POST', { member_id: 'member-1', pin: '9999' })
    const res = await authPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(401)
    expect((body as any).data).toBeNull()
  })

  it('response member does not include pin_hash', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(MOCK_MEMBER))

    const req = makeRequest('POST', { member_id: 'member-1', pin: '1234' })
    const res = await authPOST(req as any)
    const { body } = await parseResponse(res as unknown as Response)

    const member = (body as any).data?.member
    expect(member).toBeDefined()
    expect(member).not.toHaveProperty('pin_hash')
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/auth — logout
// ---------------------------------------------------------------------------

describe('DELETE /api/auth (logout)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeleteSession.mockResolvedValue(undefined)
  })

  it('always returns 200 with data: null and error: null', async () => {
    const req = makeRequest('DELETE')
    const res = await authDELETE(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect((body as any).data).toBeNull()
    expect((body as any).error).toBeNull()
  })

  it('returns 200 even when there is no active session', async () => {
    // deleteSession resolves silently when no session exists
    mockDeleteSession.mockResolvedValue(undefined)

    const req = makeRequest('DELETE')
    const res = await authDELETE(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth — check session
// ---------------------------------------------------------------------------

describe('GET /api/auth (check session)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToPublicMember.mockReturnValue(MOCK_PUBLIC_MEMBER)
  })

  it('returns 200 with member when session is valid', async () => {
    mockGetCurrentMember.mockResolvedValue(MOCK_PUBLIC_MEMBER as any)

    const req = makeRequest('GET')
    const res = await authGET(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect((body as any).error).toBeNull()
    expect((body as any).data.member).toMatchObject(MOCK_PUBLIC_MEMBER)
  })

  it('returns 401 when there is no valid session', async () => {
    // getCurrentMember returns null when unauthenticated
    mockGetCurrentMember.mockResolvedValue(null)

    const req = makeRequest('GET')
    const res = await authGET(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(401)
    expect((body as any).data).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// GET /api/setup
// ---------------------------------------------------------------------------

describe('GET /api/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns setup_completed: false when no admin member exists', async () => {
    // Supabase query for admin members returns null / empty
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(null))

    const req = makeRequest('GET')
    const res = await setupGET(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect((body as any).error).toBeNull()
    expect((body as any).data.setup_completed).toBe(false)
  })

  it('returns setup_completed: true when an admin member exists', async () => {
    // Supabase query returns an existing admin member
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(MOCK_MEMBER))

    const req = makeRequest('GET')
    const res = await setupGET(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect((body as any).error).toBeNull()
    expect((body as any).data.setup_completed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// POST /api/setup
// ---------------------------------------------------------------------------

describe('POST /api/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHashPin.mockReturnValue('hashed-pin')
    mockCreateSession.mockResolvedValue(MOCK_TOKEN)
    mockToPublicMember.mockReturnValue({ ...MOCK_PUBLIC_MEMBER, is_admin: true })
  })

  it('returns 200 with admin member on valid first-time setup', async () => {
    // Route uses a single db instance: first single() call returns null (no admin),
    // second single() call (after insert) returns the new member.
    const adminMember = { ...MOCK_MEMBER, is_admin: true }
    const builder = makeSupabaseBuilder(null)
    ;(builder.single as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: adminMember, error: null })
    mockCreateServerClient.mockReturnValue(
      { from: vi.fn(() => builder) } as unknown as ReturnType<typeof createServerClient>
    )

    const req = makeRequest('POST', {
      name: 'Mario Rossi',
      pin: '1234',
      avatar_emoji: '🍕',
      family_role: 'padre',
    })
    const res = await setupPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect((body as any).error).toBeNull()
    expect((body as any).data.member).toBeDefined()
    expect((body as any).data.member.is_admin).toBe(true)
  })

  it('returns 400 when setup is already done (admin already exists)', async () => {
    // Admin exists → reject
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(MOCK_MEMBER))

    const req = makeRequest('POST', { name: 'Secondo Admin', pin: '5678' })
    const res = await setupPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
    expect((body as any).data).toBeNull()
    expect((body as any).error).toBeTruthy()
  })

  it('returns 400 when name is empty', async () => {
    // No admin exists so setup check passes, but validation should fail
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(null))

    const req = makeRequest('POST', { name: '', pin: '1234' })
    const res = await setupPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
    expect((body as any).data).toBeNull()
  })

  it('returns 400 when name is missing', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(null))

    const req = makeRequest('POST', { pin: '1234' })
    const res = await setupPOST(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 400 when pin is not exactly 4 digits', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(null))

    const req = makeRequest('POST', { name: 'Mario', pin: '12' })
    const res = await setupPOST(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 400 when pin contains non-digit characters', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(null))

    const req = makeRequest('POST', { name: 'Mario', pin: 'abcd' })
    const res = await setupPOST(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('returns 400 when pin is missing', async () => {
    mockCreateServerClient.mockReturnValue(makeSupabaseClient(null))

    const req = makeRequest('POST', { name: 'Mario' })
    const res = await setupPOST(req as any)
    const { status } = await parseResponse(res as unknown as Response)

    expect(status).toBe(400)
  })

  it('created member has is_admin: true', async () => {
    const adminMember = { ...MOCK_MEMBER, is_admin: true }
    const builder = makeSupabaseBuilder(null)
    ;(builder.single as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: adminMember, error: null })
    mockCreateServerClient.mockReturnValue(
      { from: vi.fn(() => builder) } as unknown as ReturnType<typeof createServerClient>
    )

    const req = makeRequest('POST', { name: 'Mario Rossi', pin: '1234' })
    const res = await setupPOST(req as any)
    const { status, body } = await parseResponse(res as unknown as Response)

    expect(status).toBe(200)
    expect((body as any).data.member.is_admin).toBe(true)
  })

  it('response member does not include pin_hash', async () => {
    const adminMember = { ...MOCK_MEMBER, is_admin: true }
    const builder = makeSupabaseBuilder(null)
    ;(builder.single as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: adminMember, error: null })
    mockCreateServerClient.mockReturnValue(
      { from: vi.fn(() => builder) } as unknown as ReturnType<typeof createServerClient>
    )

    const req = makeRequest('POST', { name: 'Mario Rossi', pin: '1234' })
    const res = await setupPOST(req as any)
    const { body } = await parseResponse(res as unknown as Response)

    const member = (body as any).data?.member
    expect(member).toBeDefined()
    expect(member).not.toHaveProperty('pin_hash')
  })
})
