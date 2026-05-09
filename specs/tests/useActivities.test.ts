/**
 * useActivities hook — unit tests
 *
 * Bug 1 (THE appointment bug):
 *   setWeeklyStatus / resetWeeklyStatus must include `week_start` (computed
 *   client-side via getWeekStart()) in the POST body. Without it, the route
 *   falls back to server time (UTC on Vercel), which is the wrong week for
 *   late-Sunday-night actions in Europe/Rome.
 *
 * These tests assert that the hook sends week_start in the JSON body.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Realtime hook is a no-op for these unit tests
vi.mock('@/lib/realtime', () => ({
  useRealtimeSubscription: vi.fn(),
}))

import { useActivities, getWeekStart } from '@/hooks/useActivities'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init?: RequestInit }

function makeFetchSpy() {
  const calls: FetchCall[] = []
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, init })
    return new Response(JSON.stringify({ data: [], error: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { fetchSpy, calls }
}

function findCall(calls: FetchCall[], substring: string): FetchCall | undefined {
  return calls.find((c) => c.url.includes(substring) && c.init?.method === 'POST')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useActivities — setWeeklyStatus body includes week_start', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('setWeeklyStatus posts a body containing week_start matching getWeekStart()', async () => {
    const { fetchSpy, calls } = makeFetchSpy()
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    const { result } = renderHook(() => useActivities())

    // Wait for the initial GET to settle
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.setWeeklyStatus('act-1', { status: 'confirmed' })
    })

    const statusCall = findCall(calls, '/api/activities/act-1/status')
    expect(statusCall).toBeDefined()
    expect(statusCall!.init?.body).toBeDefined()

    const body = JSON.parse(statusCall!.init!.body as string)

    // THE assertion: body must include week_start matching getWeekStart()
    expect(body.week_start).toBe(getWeekStart())
    expect(body.status).toBe('confirmed')
  })

  it('resetWeeklyStatus posts a body containing week_start matching getWeekStart()', async () => {
    const { fetchSpy, calls } = makeFetchSpy()
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    const { result } = renderHook(() => useActivities())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.resetWeeklyStatus('act-1')
    })

    const statusCall = findCall(calls, '/api/activities/act-1/status')
    expect(statusCall).toBeDefined()
    const body = JSON.parse(statusCall!.init!.body as string)

    expect(body.week_start).toBe(getWeekStart())
    expect(body.status).toBe('pending')
  })

  it('setWeeklyStatus preserves caller-provided modified_notes alongside week_start', async () => {
    const { fetchSpy, calls } = makeFetchSpy()
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    const { result } = renderHook(() => useActivities())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.setWeeklyStatus('act-2', {
        status: 'modified',
        modified_notes: 'Orario cambiato',
      })
    })

    const statusCall = findCall(calls, '/api/activities/act-2/status')
    expect(statusCall).toBeDefined()
    const body = JSON.parse(statusCall!.init!.body as string)

    expect(body.week_start).toBe(getWeekStart())
    expect(body.status).toBe('modified')
    expect(body.modified_notes).toBe('Orario cambiato')
  })
})
