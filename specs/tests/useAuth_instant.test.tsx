/**
 * AuthProvider — auth istantanea (Fase A5).
 *
 * Il contratto: l'identità dell'ultima sessione valida vive in
 * localStorage ('auth:member:v1').
 *  - member cached → l'app parte GIÀ autenticata (isLoading=false al
 *    primo render, niente spinner globale), GET /api/auth conferma in
 *    background
 *  - revalidation 401 / senza data → member null (AuthGuard → /login)
 *    e cache pulita
 *  - errore di RETE → identità cached mantenuta (PWA offline)
 *  - logout → cache pulita
 *  - login → cache scritta col nuovo member
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/hooks/useAuth'

const CACHED_MEMBER = { id: 'me', name: 'Alessio', is_admin: false }
const AUTH_CACHE_KEY = 'auth:member:v1'

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

function stubAuthFetch(response: () => Promise<Response>) {
  const spy = vi.fn(response)
  vi.stubGlobal('fetch', spy)
  return spy
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthProvider — identità cached', () => {
  it('senza cache: isLoading=true finché /api/auth non risponde (storico)', async () => {
    stubAuthFetch(async () => okJson({ data: { member: CACHED_MEMBER }, error: null }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.member).toBeNull()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.member).toEqual(CACHED_MEMBER)
    // La sessione confermata è stata scritta in cache.
    expect(JSON.parse(window.localStorage.getItem(AUTH_CACHE_KEY)!)).toEqual(CACHED_MEMBER)
  })

  it('con cache: autenticato al PRIMO render, revalidation in background', async () => {
    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(CACHED_MEMBER))
    const updated = { ...CACHED_MEMBER, name: 'Alessio Aggiornato' }
    const spy = stubAuthFetch(async () => okJson({ data: { member: updated }, error: null }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    // Primo render: niente spinner, identità cached.
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.member).toEqual(CACHED_MEMBER)

    // La revalidation aggiorna identità e cache.
    await waitFor(() => expect(result.current.member).toEqual(updated))
    expect(spy).toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem(AUTH_CACHE_KEY)!)).toEqual(updated)
  })

  it('sessione scaduta (401): member null e cache pulita', async () => {
    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(CACHED_MEMBER))
    stubAuthFetch(async () => new Response(JSON.stringify({ data: null, error: 'Non autenticato' }), { status: 401 }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAuthenticated).toBe(true) // ottimista al primo frame

    await waitFor(() => expect(result.current.member).toBeNull())
    expect(window.localStorage.getItem(AUTH_CACHE_KEY)).toBeNull()
  })

  it('errore di rete: identità cached MANTENUTA (PWA offline)', async () => {
    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(CACHED_MEMBER))
    stubAuthFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.member).toEqual(CACHED_MEMBER)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('logout: cache identità pulita', async () => {
    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(CACHED_MEMBER))
    stubAuthFetch(async () => okJson({ data: { member: CACHED_MEMBER }, error: null }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.member).toBeNull()
    expect(window.localStorage.getItem(AUTH_CACHE_KEY)).toBeNull()
  })

  it('login: cache scritta col nuovo member', async () => {
    const fresh = { id: 'other', name: 'Giovanna', is_admin: true }
    stubAuthFetch(async (...args: unknown[]) => {
      const init = args[1] as RequestInit | undefined
      if (init?.method === 'POST') {
        return okJson({ data: { member: fresh, token: 't' }, error: null })
      }
      // GET iniziale: nessuna sessione.
      return okJson({ data: null, error: null })
    })

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      const ok = await result.current.login('other', '1234')
      expect(ok).toBe(true)
    })

    expect(result.current.member).toEqual(fresh)
    expect(JSON.parse(window.localStorage.getItem(AUTH_CACHE_KEY)!)).toEqual(fresh)
  })
})
