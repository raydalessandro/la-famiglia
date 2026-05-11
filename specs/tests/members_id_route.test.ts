// @vitest-environment node
/**
 * Regression test del bug 11/05/2026: il toggle "Notifiche push" in
 * Settings tornava OFF dopo "Salva modifiche" perché la GET di
 * /api/members/:id ritornava sempre toPublicMember (che strippa
 * notify_push / notify_telegram / telegram_chat_id), anche al
 * proprietario del record. Il client leggeva `undefined` e re-settava
 * il flag a false.
 *
 * Contratto garantito da questi test:
 *  - GET self → payload contiene notify_push, notify_telegram,
 *    telegram_chat_id (MemberSelf).
 *  - GET other (non-admin) → payload NON contiene quei campi
 *    (MemberPublic). Sono dati privati: telegram_chat_id è il chat ID
 *    Telegram personale, non va esposto al resto della famiglia.
 *  - GET other (admin) → payload contiene i flag (admin può vedere).
 *  - PATCH self con notify_push → ritorna il valore aggiornato.
 *  - Nessun payload espone mai pin_hash.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRequireAuth = vi.fn()

vi.mock('@/lib/auth', async () => {
  // Importiamo le funzioni reali toPublicMember/toSelfMember dal modulo
  // mockato per riusarle nel route handler: i test verificano il payload
  // come lo riceve il client, quindi quelle funzioni devono comportarsi
  // davvero. Solo requireAuth viene swappato con un mock.
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth')
  return {
    ...actual,
    requireAuth: mockRequireAuth,
    requireAdmin: vi.fn(),
  }
})

// Supabase mock
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()
const mockFrom = vi.fn()

function setupSupabaseChain() {
  const chain = {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    update: mockUpdate,
  }
  mockSelect.mockReturnValue(chain)
  mockEq.mockReturnValue(chain)
  mockUpdate.mockReturnValue(chain)
  mockFrom.mockReturnValue(chain)
  return chain
}

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/members/some-id', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) }
}

const ALICE_DB_ROW = {
  id: 'alice',
  name: 'Alice',
  avatar_emoji: '🥐',
  avatar_url: null,
  family_role: 'figlia',
  bio: 'ciao',
  pin_hash: 'bcrypt-hash-secret',
  is_admin: false,
  is_active: true,
  color: '#FFAA00',
  notify_push: true,
  notify_telegram: false,
  telegram_chat_id: '999888',
  created_at: '2026-01-01',
  updated_at: '2026-05-11',
}

const BOB_AUTH = {
  id: 'bob',
  is_admin: false,
}

const ADMIN_AUTH = {
  id: 'admin-1',
  is_admin: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  setupSupabaseChain()
})

// ---------------------------------------------------------------------------
// GET /api/members/:id
// ---------------------------------------------------------------------------
describe('GET /api/members/:id', () => {
  it('self → ritorna MemberSelf con notify_* e telegram_chat_id (regression toggle Settings)', async () => {
    mockRequireAuth.mockResolvedValue({ ...BOB_AUTH, id: 'alice' }) // self
    mockSingle.mockResolvedValue({ data: ALICE_DB_ROW, error: null })

    const { GET } = await import('@/app/api/members/[id]/route')
    const res = await GET(makeRequest('GET') as never, makeContext('alice'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toMatchObject({
      id: 'alice',
      notify_push: true,
      notify_telegram: false,
      telegram_chat_id: '999888',
    })
    // Mai esporre pin_hash, neanche al proprietario
    expect(json.data).not.toHaveProperty('pin_hash')
  })

  it('other non-admin → ritorna MemberPublic SENZA notify_* né telegram_chat_id', async () => {
    mockRequireAuth.mockResolvedValue(BOB_AUTH) // bob chiede di alice
    mockSingle.mockResolvedValue({ data: ALICE_DB_ROW, error: null })

    const { GET } = await import('@/app/api/members/[id]/route')
    const res = await GET(makeRequest('GET') as never, makeContext('alice'))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).not.toHaveProperty('notify_push')
    expect(json.data).not.toHaveProperty('notify_telegram')
    expect(json.data).not.toHaveProperty('telegram_chat_id')
    expect(json.data).not.toHaveProperty('pin_hash')
    // Ma i campi pubblici ci sono
    expect(json.data).toMatchObject({
      id: 'alice',
      name: 'Alice',
      color: '#FFAA00',
    })
  })

  it('other ma admin → ritorna MemberSelf (admin può leggere preferences di tutti)', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN_AUTH)
    mockSingle.mockResolvedValue({ data: ALICE_DB_ROW, error: null })

    const { GET } = await import('@/app/api/members/[id]/route')
    const res = await GET(makeRequest('GET') as never, makeContext('alice'))

    const json = await res.json()
    expect(json.data).toHaveProperty('notify_push', true)
    expect(json.data).toHaveProperty('telegram_chat_id', '999888')
  })

  it('404 se il member non esiste', async () => {
    mockRequireAuth.mockResolvedValue(BOB_AUTH)
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const { GET } = await import('@/app/api/members/[id]/route')
    const res = await GET(makeRequest('GET') as never, makeContext('ghost'))

    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/members/:id
// ---------------------------------------------------------------------------
describe('PATCH /api/members/:id', () => {
  it('self può aggiornare notify_push e riceve indietro MemberSelf', async () => {
    mockRequireAuth.mockResolvedValue({ id: 'alice', is_admin: false, pin_hash: 'h' })
    mockSingle.mockResolvedValue({
      data: { ...ALICE_DB_ROW, notify_push: true },
      error: null,
    })

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('PATCH', { notify_push: true }) as never,
      makeContext('alice'),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    // Critico per il bug: il client legge questo payload nel toggle.
    // Senza notify_push qui dentro il flag si spegnerebbe a ogni refetch.
    expect(json.data).toHaveProperty('notify_push', true)
    expect(json.data).not.toHaveProperty('pin_hash')
  })

  it('non-self non-admin → 403', async () => {
    mockRequireAuth.mockResolvedValue(BOB_AUTH) // bob prova a modificare alice

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('PATCH', { notify_push: false }) as never,
      makeContext('alice'),
    )

    expect(res.status).toBe(403)
  })

  it('strippa silenziosamente i campi non consentiti per non-admin self (es. is_admin)', async () => {
    // Un member non-admin che tenta di promuoversi: il PATCH deve
    // ignorare is_admin e applicare solo i campi della whitelist.
    mockRequireAuth.mockResolvedValue({ id: 'alice', is_admin: false, pin_hash: 'h' })
    mockSingle.mockResolvedValue({
      data: { ...ALICE_DB_ROW, is_admin: false },
      error: null,
    })

    const { PATCH } = await import('@/app/api/members/[id]/route')
    const res = await PATCH(
      makeRequest('PATCH', { is_admin: true, notify_push: false }) as never,
      makeContext('alice'),
    )

    expect(res.status).toBe(200)
    // mockUpdate è stato chiamato con il payload sanificato
    const updateArgs = mockUpdate.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
    expect(updateArgs).toBeDefined()
    expect(updateArgs).not.toHaveProperty('is_admin')
    expect(updateArgs).toHaveProperty('notify_push', false)
  })
})
