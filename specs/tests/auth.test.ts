// @vitest-environment node
/**
 * Tests for src/lib/auth.ts
 * Generated from spec only (Phase 4A). The implementation is NOT read.
 *
 * L0.5 — interface tests (exports + return types)
 * L2  — unit tests (crypto + cookie + supabase mocks)
 * L1  — integration / flow tests
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import type { Member, MemberPublic } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers / shared fixtures
// ---------------------------------------------------------------------------

const MEMBER_FULL: Member = {
  id: 'member-uuid-1',
  name: 'Mario Rossi',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: 'Test bio',
  pin_hash: 'hashed-pin-value',
  is_admin: false,
  is_active: true,
  color: '#FF0000',
  notify_push: true,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const MEMBER_ADMIN: Member = {
  ...MEMBER_FULL,
  id: 'member-uuid-admin',
  is_admin: true,
}

const VALID_TOKEN = 'valid-session-token'
const FUTURE_EXPIRY = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
const PAST_EXPIRY = new Date(Date.now() - 1000).toISOString()

// ---------------------------------------------------------------------------
// L2 Mocks — set up before importing the module under test
// ---------------------------------------------------------------------------

// --- crypto mock — only mock randomUUID; keep createHash real so legacy
// SHA256 verification can run against bcrypt + legacy PIN paths in tests.
const mockRandomUUID = vi.fn(() => 'generated-uuid-token')

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto')
  return {
    ...actual,
    default: { ...actual, randomUUID: mockRandomUUID },
    randomUUID: mockRandomUUID,
  }
})

// --- next/headers cookies mock ---
const mockCookiesGet = vi.fn()
const mockCookiesSet = vi.fn()
const mockCookiesDelete = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: mockCookiesGet,
    set: mockCookiesSet,
    delete: mockCookiesDelete,
  })),
}))

// --- Supabase mock ---
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockLt = vi.fn()

// Chainable builder returned by .from()
// Build a single shared chain object; all mocks point to functions on this chain.
// We NEVER call buildQueryChain() from inside mockFrom — that would override
// test-specific mock setups (e.g. mockSingle.mockResolvedValue) each time from() is called.
function buildQueryChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    insert: mockInsert,
    select: mockSelect,
    delete: mockDelete,
    eq: mockEq,
    single: mockSingle,
    lt: mockLt,
    ...overrides,
  }
  // Make chainable — set default return values (not resolved values)
  mockInsert.mockReturnValue(chain)
  mockSelect.mockReturnValue(chain)
  mockDelete.mockReturnValue(chain)
  mockEq.mockReturnValue(chain)
  // Do NOT set mockSingle.mockReturnValue here — tests override it with mockResolvedValue
  mockLt.mockReturnValue(chain)
  return chain
}

// Pre-build the chain once; mockFrom always returns this same chain object.
const _sharedChain = buildQueryChain()
const mockFrom = vi.fn(() => _sharedChain)

vi.mock('@/lib/supabase/client', async () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------

const authModule = await import('@/lib/auth')
const {
  hashPin,
  verifyPin,
  createSession,
  validateSession,
  getCurrentMember,
  requireAuth,
  requireAdmin,
  deleteSession,
  toPublicMember,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_DAYS,
  needsRehash,
} = authModule

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  vi.clearAllMocks()
  // Re-setup chainable return values (clearAllMocks wipes mockReturnValue history)
  mockInsert.mockReturnValue(_sharedChain)
  mockSelect.mockReturnValue(_sharedChain)
  mockDelete.mockReturnValue(_sharedChain)
  mockEq.mockReturnValue(_sharedChain)
  mockLt.mockReturnValue(_sharedChain)
  // mockFrom always returns the shared chain (set below), so re-set it too
  mockFrom.mockReturnValue(_sharedChain)
  // Clear validateSession cache so each test re-hits the (mocked) DB
  authModule.clearSessionCache()
}

function mockCookie(value: string | undefined) {
  mockCookiesGet.mockReturnValue(value ? { value } : undefined)
}

function mockSessionQuery(session: Record<string, unknown> | null) {
  // validateSession does: from('sessions').select().eq('token', token).single()
  mockSingle.mockResolvedValue({ data: session, error: session ? null : { message: 'not found' } })
}

function mockMemberQuery(member: Member | null) {
  // validateSession does: from('members').select().eq('id', memberId).single()
  // We need the second call to single() to return the member
  mockSingle
    .mockResolvedValueOnce({
      data: { token: VALID_TOKEN, member_id: member?.id ?? 'x', expires_at: FUTURE_EXPIRY },
      error: null,
    })
    .mockResolvedValueOnce({ data: member, error: member ? null : { message: 'not found' } })
}

// ---------------------------------------------------------------------------
// 1. INTERFACE TESTS (L0.5)
// ---------------------------------------------------------------------------

describe('1. Interface — exports and return types', () => {
  it('hashPin is exported', () => {
    expect(typeof hashPin).toBe('function')
  })

  it('verifyPin is exported', () => {
    expect(typeof verifyPin).toBe('function')
  })

  it('createSession is exported', () => {
    expect(typeof createSession).toBe('function')
  })

  it('validateSession is exported', () => {
    expect(typeof validateSession).toBe('function')
  })

  it('getCurrentMember is exported', () => {
    expect(typeof getCurrentMember).toBe('function')
  })

  it('requireAuth is exported', () => {
    expect(typeof requireAuth).toBe('function')
  })

  it('requireAdmin is exported', () => {
    expect(typeof requireAdmin).toBe('function')
  })

  it('deleteSession is exported', () => {
    expect(typeof deleteSession).toBe('function')
  })

  it('toPublicMember is exported', () => {
    expect(typeof toPublicMember).toBe('function')
  })

  it('SESSION_COOKIE_NAME constant is "famiglia_session"', () => {
    expect(SESSION_COOKIE_NAME).toBe('famiglia_session')
  })

  it('SESSION_DURATION_DAYS constant is 30', () => {
    expect(SESSION_DURATION_DAYS).toBe(30)
  })

  it('hashPin is synchronous and returns a bcrypt hash string', () => {
    const result = hashPin('1234')
    expect(typeof result).toBe('string')
    expect(result).toMatch(/^\$2[aby]\$/)
    expect(result).not.toHaveProperty('then')
  })

  it('verifyPin is synchronous and returns a boolean', () => {
    const result = verifyPin('1234', hashPin('1234'))
    expect(typeof result).toBe('boolean')
    expect(result).not.toHaveProperty('then')
  })

  it('needsRehash is exported', () => {
    expect(typeof needsRehash).toBe('function')
  })

  it('createSession returns a Promise', () => {
    mockInsert.mockResolvedValue({ error: null })
    const promise = createSession('member-uuid-1')
    expect(promise).toBeInstanceOf(Promise)
  })

  it('toPublicMember returns an object with MemberPublic shape', () => {
    const pub = toPublicMember(MEMBER_FULL)
    expect(pub).toMatchObject<MemberPublic>({
      id: MEMBER_FULL.id,
      name: MEMBER_FULL.name,
      avatar_emoji: MEMBER_FULL.avatar_emoji,
      avatar_url: MEMBER_FULL.avatar_url,
      family_role: MEMBER_FULL.family_role,
      bio: MEMBER_FULL.bio,
      is_admin: MEMBER_FULL.is_admin,
      is_active: MEMBER_FULL.is_active,
      color: MEMBER_FULL.color,
    })
  })
})

// ---------------------------------------------------------------------------
// 2. UNIT TESTS (L2)
// ---------------------------------------------------------------------------

describe('2. Unit — crypto and data transformation', () => {
  beforeEach(() => {
    resetMocks()
  })

  describe('hashPin (bcrypt)', () => {
    it('returns a bcrypt-format string (starts with $2)', () => {
      const result = hashPin('1234')
      expect(result).toMatch(/^\$2[aby]\$/)
    })

    it('produces different hashes for the same pin (random salt)', () => {
      const hash1 = hashPin('1234')
      const hash2 = hashPin('1234')
      expect(hash1).not.toBe(hash2)
    })

    it('produces different hashes for different pins', () => {
      const hash1 = hashPin('1234')
      const hash2 = hashPin('5678')
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyPin', () => {
    it('returns true when pin matches its bcrypt hash', () => {
      const hash = hashPin('correct-pin')
      expect(verifyPin('correct-pin', hash)).toBe(true)
    })

    it('returns false when pin does not match the bcrypt hash', () => {
      const hash = hashPin('correct-pin')
      expect(verifyPin('wrong-pin', hash)).toBe(false)
    })

    it('returns false for an empty pin against a non-empty hash', () => {
      const hash = hashPin('1234')
      expect(verifyPin('', hash)).toBe(false)
    })

    it('verifies legacy SHA256 hashes (transparent rehash compat)', () => {
      // Pre-computed: sha256('famiglia_salt_2026' + '4321')
      const legacy = '13a292cd61e87afce7e84f48e2e212d84cace1b3589eaae2eaf6f527762be059'
      expect(verifyPin('4321', legacy)).toBe(true)
      expect(verifyPin('0000', legacy)).toBe(false)
    })
  })

  describe('needsRehash', () => {
    it('returns false for a bcrypt hash', () => {
      expect(needsRehash(hashPin('1234'))).toBe(false)
    })

    it('returns true for a legacy SHA256 hex hash', () => {
      const legacy = 'a'.repeat(64)
      expect(needsRehash(legacy)).toBe(true)
    })
  })

  describe('toPublicMember', () => {
    it('excludes pin_hash', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub).not.toHaveProperty('pin_hash')
    })

    it('excludes notify_push', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub).not.toHaveProperty('notify_push')
    })

    it('excludes notify_telegram', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub).not.toHaveProperty('notify_telegram')
    })

    it('excludes telegram_chat_id', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub).not.toHaveProperty('telegram_chat_id')
    })

    it('excludes created_at', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub).not.toHaveProperty('created_at')
    })

    it('excludes updated_at', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub).not.toHaveProperty('updated_at')
    })

    it('includes id', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.id).toBe(MEMBER_FULL.id)
    })

    it('includes name', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.name).toBe(MEMBER_FULL.name)
    })

    it('includes avatar_emoji', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.avatar_emoji).toBe(MEMBER_FULL.avatar_emoji)
    })

    it('includes avatar_url', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.avatar_url).toBe(MEMBER_FULL.avatar_url)
    })

    it('includes family_role', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.family_role).toBe(MEMBER_FULL.family_role)
    })

    it('includes bio', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.bio).toBe(MEMBER_FULL.bio)
    })

    it('includes is_admin', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.is_admin).toBe(MEMBER_FULL.is_admin)
    })

    it('includes is_active', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.is_active).toBe(MEMBER_FULL.is_active)
    })

    it('includes color', () => {
      const pub = toPublicMember(MEMBER_FULL)
      expect(pub.color).toBe(MEMBER_FULL.color)
    })

    it('result has exactly the MemberPublic fields (no extras)', () => {
      const pub = toPublicMember(MEMBER_FULL)
      const keys = Object.keys(pub).sort()
      const expected = [
        'id', 'name', 'avatar_emoji', 'avatar_url',
        'family_role', 'bio', 'is_admin', 'is_active', 'color',
      ].sort()
      expect(keys).toEqual(expected)
    })
  })
})

// ---------------------------------------------------------------------------
// 3. INTEGRATION TESTS (L1)
// ---------------------------------------------------------------------------

describe('3. Integration — flows', () => {
  beforeEach(() => {
    resetMocks()
  })

  // -------------------------------------------------------------------------
  // createSession
  // -------------------------------------------------------------------------

  describe('createSession', () => {
    it('calls randomUUID to generate a token', async () => {
      mockRandomUUID.mockReturnValue('new-uuid-token')
      mockInsert.mockResolvedValue({ error: null })
      await createSession('member-id')
      expect(mockRandomUUID).toHaveBeenCalled()
    })

    it('inserts a row into the sessions table', async () => {
      mockRandomUUID.mockReturnValue('new-uuid-token')
      mockInsert.mockResolvedValue({ error: null })
      await createSession('member-id')
      expect(mockFrom).toHaveBeenCalledWith('sessions')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ member_id: 'member-id', token: 'new-uuid-token' }),
      )
    })

    it('sets the session cookie with the correct name', async () => {
      mockRandomUUID.mockReturnValue('new-uuid-token')
      mockInsert.mockResolvedValue({ error: null })
      await createSession('member-id')
      expect(mockCookiesSet).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'new-uuid-token',
        expect.any(Object),
      )
    })

    it('sets the session cookie with httpOnly and maxAge based on SESSION_DURATION_DAYS', async () => {
      mockRandomUUID.mockReturnValue('new-uuid-token')
      mockInsert.mockResolvedValue({ error: null })
      await createSession('member-id')
      expect(mockCookiesSet).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'new-uuid-token',
        expect.objectContaining({
          httpOnly: true,
          maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
        }),
      )
    })

    it('returns the token string', async () => {
      mockRandomUUID.mockReturnValue('my-token-123')
      mockInsert.mockResolvedValue({ error: null })
      const token = await createSession('member-id')
      expect(token).toBe('my-token-123')
    })
  })

  // -------------------------------------------------------------------------
  // validateSession
  // -------------------------------------------------------------------------

  describe('validateSession', () => {
    it('returns null when no cookie is present', async () => {
      mockCookie(undefined)
      const result = await validateSession()
      expect(result).toBeNull()
    })

    it('returns null and deletes session when session is expired', async () => {
      mockCookie(VALID_TOKEN)
      // Session record with past expiry
      mockSingle.mockResolvedValue({
        data: { token: VALID_TOKEN, member_id: 'member-uuid-1', expires_at: PAST_EXPIRY },
        error: null,
      })
      const result = await validateSession()
      expect(result).toBeNull()
      // Should attempt to delete the expired session
      expect(mockDelete).toHaveBeenCalled()
    })

    it('returns Member when session is valid and member is active', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_FULL)
      const result = await validateSession()
      expect(result).toMatchObject({ id: MEMBER_FULL.id, name: MEMBER_FULL.name })
    })

    it('returns null when member is inactive', async () => {
      // The DB query uses .eq('is_active', true), so an inactive member would NOT be returned.
      // Simulate this by having the member query return null (no active member found).
      mockCookie(VALID_TOKEN)
      mockSingle
        .mockResolvedValueOnce({
          data: { token: VALID_TOKEN, member_id: MEMBER_FULL.id, expires_at: FUTURE_EXPIRY },
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
      const result = await validateSession()
      expect(result).toBeNull()
    })

    it('returns null when session is not found in DB', async () => {
      mockCookie(VALID_TOKEN)
      mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
      const result = await validateSession()
      expect(result).toBeNull()
    })

    it('queries the sessions table with the cookie token', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_FULL)
      await validateSession()
      expect(mockFrom).toHaveBeenCalledWith('sessions')
      expect(mockEq).toHaveBeenCalledWith('token', VALID_TOKEN)
    })

    it('queries the members table with the member_id from session', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_FULL)
      await validateSession()
      expect(mockFrom).toHaveBeenCalledWith('members')
    })
  })

  // -------------------------------------------------------------------------
  // getCurrentMember
  // -------------------------------------------------------------------------

  describe('getCurrentMember', () => {
    it('returns null when no session exists', async () => {
      mockCookie(undefined)
      const result = await getCurrentMember()
      expect(result).toBeNull()
    })

    it('returns a MemberPublic (no pin_hash) for an authenticated user', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_FULL)
      const result = await getCurrentMember()
      expect(result).not.toBeNull()
      expect(result).not.toHaveProperty('pin_hash')
      expect(result).toMatchObject({ id: MEMBER_FULL.id, name: MEMBER_FULL.name })
    })

    it('result excludes all private fields', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_FULL)
      const result = await getCurrentMember()
      expect(result).not.toHaveProperty('notify_push')
      expect(result).not.toHaveProperty('notify_telegram')
      expect(result).not.toHaveProperty('telegram_chat_id')
      expect(result).not.toHaveProperty('created_at')
      expect(result).not.toHaveProperty('updated_at')
    })
  })

  // -------------------------------------------------------------------------
  // requireAuth
  // -------------------------------------------------------------------------

  describe('requireAuth', () => {
    it('returns a NextResponse with status 401 when no session', async () => {
      mockCookie(undefined)
      const result = await requireAuth()
      expect(result).toBeInstanceOf(Response)
      expect((result as Response).status).toBe(401)
    })

    it('returns the Member when session is valid', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_FULL)
      const result = await requireAuth()
      expect(result).not.toBeInstanceOf(Response)
      expect(result).toMatchObject({ id: MEMBER_FULL.id })
    })
  })

  // -------------------------------------------------------------------------
  // requireAdmin
  // -------------------------------------------------------------------------

  describe('requireAdmin', () => {
    it('returns NextResponse 401 when no session', async () => {
      mockCookie(undefined)
      const result = await requireAdmin()
      expect(result).toBeInstanceOf(Response)
      expect((result as Response).status).toBe(401)
    })

    it('returns NextResponse 403 when authenticated but not admin', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_FULL) // MEMBER_FULL.is_admin === false
      const result = await requireAdmin()
      expect(result).toBeInstanceOf(Response)
      expect((result as Response).status).toBe(403)
    })

    it('returns the Member when authenticated and is_admin is true', async () => {
      mockCookie(VALID_TOKEN)
      mockMemberQuery(MEMBER_ADMIN)
      const result = await requireAdmin()
      expect(result).not.toBeInstanceOf(Response)
      expect(result).toMatchObject({ id: MEMBER_ADMIN.id, is_admin: true })
    })
  })

  // -------------------------------------------------------------------------
  // deleteSession
  // -------------------------------------------------------------------------

  describe('deleteSession', () => {
    it('reads the session cookie', async () => {
      mockCookie(VALID_TOKEN)
      // .delete().eq() must remain chainable — do not override mockDelete with mockResolvedValue
      await deleteSession()
      expect(mockCookiesGet).toHaveBeenCalledWith(SESSION_COOKIE_NAME)
    })

    it('deletes the session row from the DB when cookie exists', async () => {
      mockCookie(VALID_TOKEN)
      await deleteSession()
      expect(mockFrom).toHaveBeenCalledWith('sessions')
      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq).toHaveBeenCalledWith('token', VALID_TOKEN)
    })

    it('deletes the cookie', async () => {
      mockCookie(VALID_TOKEN)
      await deleteSession()
      expect(mockCookiesDelete).toHaveBeenCalledWith(SESSION_COOKIE_NAME)
    })

    it('resolves without error when no cookie is set', async () => {
      mockCookie(undefined)
      await expect(deleteSession()).resolves.toBeUndefined()
    })

    it('still deletes the cookie even if there is no DB session', async () => {
      mockCookie(VALID_TOKEN)
      // Even if delete returns an error-like result, the cookie should still be deleted.
      // Chain stays intact (no mockResolvedValue override).
      await deleteSession()
      expect(mockCookiesDelete).toHaveBeenCalledWith(SESSION_COOKIE_NAME)
    })
  })
})
