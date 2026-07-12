// @vitest-environment node
/**
 * Authorization test per PATCH /api/members/:id (B1 — security audit
 * follow-up).
 *
 * Regole implementate (src/app/api/members/[id]/route.ts):
 *  - 401 senza auth.
 *  - Un non-admin NON può modificare un ALTRO membro → 403.
 *  - Un non-admin può modificare SE STESSO solo nei campi in
 *    NON_ADMIN_ALLOWED_FIELDS (bio, avatar_emoji, avatar_url, color,
 *    notify_*, telegram_chat_id, birth_date, new_pin). I campi
 *    privilegiati (is_admin, name, is_active, ...) vengono STRIPPATI
 *    dal payload — se il body contiene SOLO campi privilegiati la
 *    route risponde 400 "Nessun campo da aggiornare".
 *  - Un admin può modificare qualsiasi membro e qualsiasi campo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRequireAuth = vi.fn()
const mockRequireAdmin = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
  requireAdmin: mockRequireAdmin,
  hashPin: vi.fn((pin: string) => `hashed:${pin}`),
  verifyPin: vi.fn(() => true),
  toPublicMember: vi.fn((m: Record<string, unknown>) => m),
  toSelfMember: vi.fn((m: Record<string, unknown>) => m),
}))

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SELF = {
  id: 'member-self',
  name: 'Mario',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  pin_hash: 'hashed:1234',
  is_admin: false,
  is_active: true,
  color: '#fff',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const ADMIN = { ...SELF, id: 'member-admin', name: 'Admin', is_admin: true }

/**
 * DB che cattura il payload passato a .update() — è il cuore del test:
 * verifichiamo COSA arriva davvero all'UPDATE dopo lo stripping.
 */
function setupMembersDb() {
  const updatePayloads: Array<Record<string, unknown>> = []
  mockFrom.mockImplementation((table: string) => {
    if (table === 'members') {
      return {
        update: (payload: Record<string, unknown>) => {
          updatePayloads.push(payload)
          return {
            eq: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { ...SELF, ...payload }, error: null }),
              }),
            }),
          }
        },
      }
    }
    throw new Error(`Tabella inattesa: ${table}`)
  })
  return { updatePayloads }
}

function makeRequest(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/members/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const UNAUTHENTICATED = () =>
  NextResponse.json({ data: null, error: 'Non autenticato' }, { status: 401 })

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// PATCH /api/members/:id — authorization
// ---------------------------------------------------------------------------
describe('PATCH /api/members/:id — authorization', () => {
  it('blocca senza auth (401)', async () => {
    mockRequireAuth.mockResolvedValueOnce(UNAUTHENTICATED())

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('member-self', { bio: 'x' }) as never,
      makeParams('member-self')
    )

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('403 se un non-admin prova a modificare un ALTRO membro', async () => {
    mockRequireAuth.mockResolvedValueOnce(SELF)
    const { updatePayloads } = setupMembersDb()

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('member-other', { bio: 'hijack' }) as never,
      makeParams('member-other')
    )
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBeTruthy()
    expect(updatePayloads).toEqual([]) // nessun UPDATE eseguito
  })

  it('un non-admin può modificare se stesso nei campi consentiti (bio)', async () => {
    mockRequireAuth.mockResolvedValueOnce(SELF)
    const { updatePayloads } = setupMembersDb()

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('member-self', { bio: 'Nuova bio' }) as never,
      makeParams('member-self')
    )

    expect(res.status).toBe(200)
    expect(updatePayloads).toEqual([{ bio: 'Nuova bio' }])
  })

  it('escalation negata: is_admin viene strippato dal payload di un non-admin', async () => {
    // Il body mescola un campo consentito (bio) e campi privilegiati
    // (is_admin, name, is_active): all'UPDATE deve arrivare SOLO bio.
    mockRequireAuth.mockResolvedValueOnce(SELF)
    const { updatePayloads } = setupMembersDb()

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('member-self', {
        bio: 'Innocua',
        is_admin: true,
        name: 'SuperMario',
        is_active: false,
      }) as never,
      makeParams('member-self')
    )

    expect(res.status).toBe(200)
    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0]).toEqual({ bio: 'Innocua' })
    expect(updatePayloads[0]).not.toHaveProperty('is_admin')
    expect(updatePayloads[0]).not.toHaveProperty('name')
    expect(updatePayloads[0]).not.toHaveProperty('is_active')
  })

  it('400 se un non-admin manda SOLO campi privilegiati (payload vuoto dopo strip)', async () => {
    mockRequireAuth.mockResolvedValueOnce(SELF)
    const { updatePayloads } = setupMembersDb()

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('member-self', { is_admin: true }) as never,
      makeParams('member-self')
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBeTruthy()
    expect(updatePayloads).toEqual([]) // is_admin non arriva MAI al DB
  })

  it('un admin può modificare un altro membro (inclusi campi privilegiati)', async () => {
    mockRequireAuth.mockResolvedValueOnce(ADMIN)
    const { updatePayloads } = setupMembersDb()

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('member-self', { name: 'Rinominato', is_admin: true }) as never,
      makeParams('member-self')
    )

    expect(res.status).toBe(200)
    expect(updatePayloads).toEqual([{ name: 'Rinominato', is_admin: true }])
  })

  it('il cambio PIN self richiede il PIN attuale (400 se manca current_pin)', async () => {
    mockRequireAuth.mockResolvedValueOnce(SELF)
    setupMembersDb()

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('member-self', { new_pin: '5678' }) as never,
      makeParams('member-self')
    )

    expect(res.status).toBe(400)
  })
})
