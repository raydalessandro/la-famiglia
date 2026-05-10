/**
 * useActivities hook — unit tests
 *
 * Bug 1 (THE appointment bug):
 *   setMyAttendance / clearMyAttendance must include `week_start` (computed
 *   client-side via getWeekStart()) in the request. Without it, the route
 *   falls back to server time (UTC on Vercel), which is the wrong week for
 *   late-Sunday-night actions in Europe/Rome.
 *
 * These tests assert that the hook sends week_start in the JSON body / query.
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

function findCall(calls: FetchCall[], substring: string, method: string): FetchCall | undefined {
  return calls.find((c) => c.url.includes(substring) && c.init?.method === method)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useActivities — attendance requests include week_start', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('setMyAttendance posts a body containing week_start matching getWeekStart()', async () => {
    const { fetchSpy, calls } = makeFetchSpy()
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    const { result } = renderHook(() => useActivities())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.setMyAttendance('act-1', 'confirmed')
    })

    const call = findCall(calls, '/api/activities/act-1/attendance', 'POST')
    expect(call).toBeDefined()
    expect(call!.init?.body).toBeDefined()

    const body = JSON.parse(call!.init!.body as string)
    expect(body.week_start).toBe(getWeekStart())
    expect(body.status).toBe('confirmed')
  })

  it('clearMyAttendance sends DELETE with week_start in the query string', async () => {
    const { fetchSpy, calls } = makeFetchSpy()
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    const { result } = renderHook(() => useActivities())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.clearMyAttendance('act-1')
    })

    const call = findCall(calls, '/api/activities/act-1/attendance', 'DELETE')
    expect(call).toBeDefined()
    expect(call!.url).toContain(`week_start=${getWeekStart()}`)
  })

  it('setMyAttendance preserves caller-provided modified_notes alongside week_start', async () => {
    const { fetchSpy, calls } = makeFetchSpy()
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    const { result } = renderHook(() => useActivities())

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.setMyAttendance('act-2', 'modified', 'Orario cambiato')
    })

    const call = findCall(calls, '/api/activities/act-2/attendance', 'POST')
    expect(call).toBeDefined()
    const body = JSON.parse(call!.init!.body as string)

    expect(body.week_start).toBe(getWeekStart())
    expect(body.status).toBe('modified')
    expect(body.modified_notes).toBe('Orario cambiato')
  })
})
