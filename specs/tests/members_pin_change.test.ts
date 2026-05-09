/**
 * Test: PATCH /api/members/:id — PIN change flow
 * Phase 4A — Written from spec only (L0.5 + L1_L2_members.md)
 *
 * Tests the current_pin / new_pin validation logic:
 * - Non-admin MUST provide current_pin to change PIN
 * - Non-admin with wrong current_pin → 403
 * - Admin can change anyone's PIN without current_pin
 * - new_pin must be 4 digits
 * - current_pin and new_pin are NEVER sent to DB update
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockMemberAdmin = {
  id: 'admin-1',
  name: 'Admin',
  pin_hash: 'hashed_1234',
  is_admin: true,
  is_active: true,
  avatar_emoji: null,
  avatar_url: null,
  family_role: 'Admin',
  bio: '',
  color: '#E8A838',
  notify_push: true,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockMemberUser = {
  ...mockMemberAdmin,
  id: 'user-1',
  name: 'User',
  pin_hash: 'hashed_5678',
  is_admin: false,
}

let currentAuthMember = mockMemberUser

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => currentAuthMember),
  requireAdmin: vi.fn(async () => {
    if (!currentAuthMember.is_admin) {
      throw new Response(JSON.stringify({ data: null, error: 'Accesso negato' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return currentAuthMember
  }),
  hashPin: vi.fn((pin: string) => `hashed_${pin}`),
  verifyPin: vi.fn((pin: string, hash: string) => `hashed_${pin}` === hash),
  toPublicMember: vi.fn((m: Record<string, unknown>) => {
    const { pin_hash, notify_push, notify_telegram, telegram_chat_id, created_at, updated_at, ...pub } = m
    return pub
  }),
}))

const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args)
        return {
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs)
            return {
              select: (...selArgs: unknown[]) => {
                mockSelect(...selArgs)
                return {
                  single: () => {
                    mockSingle()
                    return {
                      data: { ...currentAuthMember, ...mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1]?.[0] },
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      },
    })),
  })),
}))

// Import after mocks
import { PATCH } from '../../src/app/api/members/[id]/route'

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/members/user-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeRouteContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  currentAuthMember = mockMemberUser
})

// --- Tests ---

describe('PATCH /api/members/:id — PIN change', () => {
  describe('Non-admin changing own PIN', () => {
    it('succeeds with valid current_pin and new_pin', async () => {
      const req = makeRequest({ current_pin: '5678', new_pin: '9999' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.error).toBeNull()
      // Verify hashPin was called with new PIN
      const { hashPin } = await import('@/lib/auth')
      expect(hashPin).toHaveBeenCalledWith('9999')
    })

    it('rejects when current_pin is missing', async () => {
      const req = makeRequest({ new_pin: '9999' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('PIN attuale')
    })

    it('rejects when current_pin is wrong', async () => {
      const req = makeRequest({ current_pin: '0000', new_pin: '9999' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(res.status).toBe(403)
      expect(body.error).toContain('PIN attuale')
    })

    it('rejects when new_pin is not 4 digits', async () => {
      const req = makeRequest({ current_pin: '5678', new_pin: '12' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('4 cifre')
    })

    it('rejects when new_pin contains letters', async () => {
      const req = makeRequest({ current_pin: '5678', new_pin: 'abcd' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(res.status).toBe(400)
    })

    it('never sends current_pin to DB', async () => {
      const req = makeRequest({ current_pin: '5678', new_pin: '9999', bio: 'test' })
      await PATCH(req as any, makeRouteContext('user-1'))

      // Check what was passed to supabase.update()
      const updatePayload = mockUpdate.mock.calls[0]?.[0]
      expect(updatePayload).not.toHaveProperty('current_pin')
      expect(updatePayload).not.toHaveProperty('new_pin')
      expect(updatePayload).toHaveProperty('pin_hash')
    })
  })

  describe('Admin changing another member PIN', () => {
    beforeEach(() => {
      currentAuthMember = mockMemberAdmin
    })

    it('succeeds without current_pin', async () => {
      const req = makeRequest({ new_pin: '4321' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.error).toBeNull()
    })

    it('never sends current_pin or new_pin to DB', async () => {
      const req = makeRequest({ current_pin: 'whatever', new_pin: '4321', bio: 'admin edit' })
      await PATCH(req as any, makeRouteContext('user-1'))

      const updatePayload = mockUpdate.mock.calls[0]?.[0]
      expect(updatePayload).not.toHaveProperty('current_pin')
      expect(updatePayload).not.toHaveProperty('new_pin')
      expect(updatePayload).toHaveProperty('pin_hash')
      expect(updatePayload).toHaveProperty('bio', 'admin edit')
    })

    it('rejects invalid new_pin format even for admin', async () => {
      const req = makeRequest({ new_pin: '12' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toContain('4 cifre')
    })
  })

  describe('Response shape (L0.5)', () => {
    it('returns MemberPublic without pin_hash', async () => {
      const req = makeRequest({ bio: 'updated' })
      const res = await PATCH(req as any, makeRouteContext('user-1'))
      const body = await res.json()

      expect(body.data).not.toHaveProperty('pin_hash')
      expect(body.data).not.toHaveProperty('notify_push')
      expect(body.data).not.toHaveProperty('telegram_chat_id')
      expect(body.data).toHaveProperty('name')
      expect(body.data).toHaveProperty('id')
    })
  })
})
