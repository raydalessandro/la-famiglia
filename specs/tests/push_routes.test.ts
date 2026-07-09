// @vitest-environment node
/**
 * Tests per le route /api/push/*:
 *   - GET    /api/push/public-key
 *   - POST   /api/push/subscribe
 *   - DELETE /api/push/subscribe
 *   - POST   /api/push/test
 *
 * Garantiscono il contratto wire-level che il client `usePushSubscription`
 * si aspetta. Una regressione qui rompe silenziosamente il toggle in
 * Settings — è successo già una volta perché la build production era
 * ferma e questi endpoint non esistevano nemmeno nel deploy live.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/push/x', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function unauthorized(): NextResponse {
  // Il route handler verifica `auth instanceof NextResponse`, quindi
  // dobbiamo restituire un vero NextResponse (Response normale non
  // matcha il check).
  return NextResponse.json({ data: null, error: 'Auth richiesta' }, { status: 401 })
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRequireAuth = vi.fn()
const mockSubscribePush = vi.fn()
const mockUnsubscribePush = vi.fn()
const mockSendPushNotification = vi.fn()

vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('@/lib/notifications', () => ({
  subscribePush: mockSubscribePush,
  unsubscribePush: mockUnsubscribePush,
  sendPushNotification: mockSendPushNotification,
}))

const AUTHED_MEMBER = {
  id: 'm-1',
  name: 'Mario',
  is_admin: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue(AUTHED_MEMBER)
})

// ---------------------------------------------------------------------------
// GET /api/push/public-key
// ---------------------------------------------------------------------------
describe('GET /api/push/public-key', () => {
  it('ritorna 500 se VAPID_PUBLIC_KEY non è configurata', async () => {
    const prev = process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PUBLIC_KEY
    try {
      vi.resetModules()
      const { GET } = await import('@/app/api/push/public-key/route')
      const res = await GET()

      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.data).toBeNull()
      expect(json.error).toMatch(/non configurate/i)
    } finally {
      if (prev !== undefined) process.env.VAPID_PUBLIC_KEY = prev
    }
  })

  it('ritorna la public key dall\'env quando configurata', async () => {
    process.env.VAPID_PUBLIC_KEY = 'BVAPID_PUBLIC_TEST_KEY'
    vi.resetModules()
    const { GET } = await import('@/app/api/push/public-key/route')
    const res = await GET()

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data).toEqual({ key: 'BVAPID_PUBLIC_TEST_KEY' })
    expect(json.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// POST /api/push/subscribe
// ---------------------------------------------------------------------------
describe('POST /api/push/subscribe', () => {
  it('respinge senza auth (passa attraverso il NextResponse di requireAuth)', async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthorized())

    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', {
        endpoint: 'https://x',
        keys: { p256dh: 'p', auth: 'a' },
      }) as never,
    )

    expect(res.status).toBe(401)
    expect(mockSubscribePush).not.toHaveBeenCalled()
  })

  it('400 se body non è JSON valido', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(makeRequest('POST', 'not-json-{{{') as never)

    expect(res.status).toBe(400)
  })

  it('400 se manca endpoint o una delle chiavi', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route')

    const noEndpoint = await POST(
      makeRequest('POST', { keys: { p256dh: 'p', auth: 'a' } }) as never,
    )
    expect(noEndpoint.status).toBe(400)

    const noP256 = await POST(
      makeRequest('POST', { endpoint: 'x', keys: { auth: 'a' } }) as never,
    )
    expect(noP256.status).toBe(400)

    const noAuth = await POST(
      makeRequest('POST', { endpoint: 'x', keys: { p256dh: 'p' } }) as never,
    )
    expect(noAuth.status).toBe(400)
  })

  it('201 + payload subscription quando va a buon fine', async () => {
    mockSubscribePush.mockResolvedValueOnce({
      member_id: 'm-1',
      endpoint: 'https://push.example/x',
      keys_p256dh: 'p',
      keys_auth: 'a',
    })

    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', {
        endpoint: 'https://push.example/x',
        keys: { p256dh: 'p', auth: 'a' },
      }) as never,
    )

    expect(res.status).toBe(201)
    expect(mockSubscribePush).toHaveBeenCalledWith('m-1', {
      endpoint: 'https://push.example/x',
      keys: { p256dh: 'p', auth: 'a' },
    })
    const json = await res.json()
    expect(json.data.member_id).toBe('m-1')
  })

  it('500 se subscribePush lancia', async () => {
    mockSubscribePush.mockRejectedValueOnce(new Error('DB down'))

    const { POST } = await import('@/app/api/push/subscribe/route')
    const res = await POST(
      makeRequest('POST', {
        endpoint: 'x',
        keys: { p256dh: 'p', auth: 'a' },
      }) as never,
    )

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('DB down')
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/push/subscribe
// ---------------------------------------------------------------------------
describe('DELETE /api/push/subscribe', () => {
  it('400 senza endpoint', async () => {
    const { DELETE } = await import('@/app/api/push/subscribe/route')
    const res = await DELETE(makeRequest('DELETE', {}) as never)
    expect(res.status).toBe(400)
  })

  it('cancella la subscription dell\'utente corrente', async () => {
    mockUnsubscribePush.mockResolvedValueOnce(undefined)

    const { DELETE } = await import('@/app/api/push/subscribe/route')
    const res = await DELETE(
      makeRequest('DELETE', { endpoint: 'https://push.example/x' }) as never,
    )

    expect(res.status).toBe(200)
    expect(mockUnsubscribePush).toHaveBeenCalledWith('m-1', 'https://push.example/x')
  })
})

// ---------------------------------------------------------------------------
// POST /api/push/test
// ---------------------------------------------------------------------------
describe('POST /api/push/test', () => {
  it('blocca senza auth', async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthorized())

    const { POST } = await import('@/app/api/push/test/route')
    const res = await POST()

    expect(res.status).toBe(401)
    expect(mockSendPushNotification).not.toHaveBeenCalled()
  })

  it('200 + sent:true quando la push parte', async () => {
    mockSendPushNotification.mockResolvedValueOnce({
      sent: true,
      skippedReason: null,
      attempts: [{ endpointHost: 'web.push.apple.com', createdAt: null, ok: true, statusCode: 201, cleanedUp: false, error: null }],
    })

    const { POST } = await import('@/app/api/push/test/route')
    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      'm-1',
      expect.any(String),
      expect.any(String),
      expect.any(String),
    )
    const json = await res.json()
    expect(json.data.sent).toBe(true)
    expect(json.data.attempts).toHaveLength(1)
  })

  it('200 + sent:false quando il member non ha subscription o notify_push=false', async () => {
    mockSendPushNotification.mockResolvedValueOnce({ sent: false, skippedReason: 'no_subscriptions', attempts: [] })

    const { POST } = await import('@/app/api/push/test/route')
    const res = await POST()

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.sent).toBe(false)
    expect(json.data.skippedReason).toBe('no_subscriptions')
  })

  it('500 se sendPushNotification lancia (VAPID rotte, web-push errore)', async () => {
    mockSendPushNotification.mockRejectedValueOnce(new Error('No key set for signer'))

    const { POST } = await import('@/app/api/push/test/route')
    const res = await POST()

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/No key set/)
  })
})
