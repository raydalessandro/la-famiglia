// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Re-export shims — the real module is NOT loaded; we test from the spec only.
// The import below will resolve once middleware.ts is written at src/middleware.ts
// ---------------------------------------------------------------------------
import { middleware, config } from '../../src/middleware'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal NextRequest with or without the session cookie.
 * The cookie value is a non-empty string so that a simple truthy check
 * suffices as the "has session" signal.
 */
function createMockRequest(pathname: string, hasCookie: boolean): NextRequest {
  const url = `http://localhost:3000${pathname}`
  const request = new NextRequest(url)
  if (hasCookie) {
    request.cookies.set('famiglia_session', 'mock-token')
  }
  return request
}

// ---------------------------------------------------------------------------
// Spy helpers — capture what NextResponse.redirect / NextResponse.next return
// ---------------------------------------------------------------------------

// We keep track of calls through vitest spies so we can inspect them
// without depending on any specific internal implementation.

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('middleware', () => {

  // ── Interface tests ───────────────────────────────────────────────────────

  describe('exports', () => {
    it('exports middleware as a named function', () => {
      expect(typeof middleware).toBe('function')
    })

    it('exports config with the correct matcher pattern', () => {
      expect(config).toBeDefined()
      expect(config).toHaveProperty('matcher')
      expect(Array.isArray(config.matcher)).toBe(true)
      // Must contain a pattern that excludes _next/static, _next/image,
      // favicon.ico, sw.js, manifest.webmanifest
      const pattern = config.matcher[0]
      expect(pattern).toBe('/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)')
    })
  })

  // ── Unit tests ────────────────────────────────────────────────────────────

  describe('no session cookie', () => {
    it('redirects to /login when accessing a protected page (/feed)', () => {
      const req = createMockRequest('/feed', false)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      // A redirect response carries a Location header pointing to /login
      const location = res.headers.get('location')
      expect(location).toBeTruthy()
      expect(location).toContain('/login')
      // Must NOT be a 401 — it is a redirect (3xx)
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.status).toBeLessThan(400)
    })

    it('returns 401 JSON with { data: null, error: "Non autenticato" } for /api/members', () => {
      const req = createMockRequest('/api/members', false)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      expect(res.status).toBe(401)

      // The Content-Type should indicate JSON
      const contentType = res.headers.get('content-type')
      expect(contentType).toMatch(/application\/json/)
    })

    it('returns the correct JSON body { data: null, error: "Non autenticato" } for /api/members', async () => {
      const req = createMockRequest('/api/members', false)
      const res = middleware(req)

      const body = await res.json()
      expect(body).toEqual({ data: null, error: 'Non autenticato' })
    })

    it('passes through (next) for /login (public path)', () => {
      const req = createMockRequest('/login', false)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      // next() produces a 200 with no Location header
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    })

    it('passes through (next) for /setup (public path)', () => {
      const req = createMockRequest('/setup', false)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    })

    it('passes through (next) for /api/auth (public path)', () => {
      const req = createMockRequest('/api/auth', false)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    })
  })

  describe('with a valid session cookie', () => {
    it('passes through (next) for a protected page (/feed)', () => {
      const req = createMockRequest('/feed', true)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    })

    it('redirects to /feed when accessing /login (already authenticated)', () => {
      const req = createMockRequest('/login', true)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      const location = res.headers.get('location')
      expect(location).toBeTruthy()
      expect(location).toContain('/feed')
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.status).toBeLessThan(400)
    })

    it('passes through (next) for /setup (public but not /login)', () => {
      const req = createMockRequest('/setup', true)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    })

    it('passes through (next) for /api/members (protected API)', () => {
      const req = createMockRequest('/api/members', true)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('treats an empty cookie value as "no session" (redirect to /login for /feed)', () => {
      const url = 'http://localhost:3000/feed'
      const req = new NextRequest(url)
      // Explicitly set the session cookie to an empty string
      req.cookies.set('famiglia_session', '')

      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      // Should behave the same as having no session: redirect to /login
      const location = res.headers.get('location')
      expect(location).toBeTruthy()
      expect(location).toContain('/login')
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.status).toBeLessThan(400)
    })

    it('treats /api/auth/something as public (startsWith match) — no session passes through', () => {
      const req = createMockRequest('/api/auth/callback', false)
      const res = middleware(req)

      expect(res).toBeInstanceOf(NextResponse)
      // /api/auth/callback starts with /api/auth which is a PUBLIC_PATH
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    })

    it('treats /api/auth/something as public (startsWith match) — no session, not 401', () => {
      const req = createMockRequest('/api/auth/signin', false)
      const res = middleware(req)

      // Must NOT return 401 even though it starts with /api
      expect(res.status).not.toBe(401)
    })
  })
})
