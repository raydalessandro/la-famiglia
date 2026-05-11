/**
 * useChat hook — realtime dedup
 *
 * Bug 3: Realtime INSERT subscription appends without checking for duplicates.
 *   On reconnect / backfill / any double-delivery, the same message shows up
 *   twice in the UI. Dedup by `id` before appending.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture the realtime callback so the test can drive it.
type Callback = (
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: { new: Record<string, unknown> | null; old: Record<string, unknown> | null }
) => void

let capturedChatMessagesCallback: Callback | null = null

vi.mock('@/lib/realtime', () => ({
  useRealtimeSubscription: vi.fn(
    (
      table: string,
      callback: Callback,
      _filter?: string,
      _enabled?: boolean
    ) => {
      if (table === 'chat_messages') {
        capturedChatMessagesCallback = callback
      }
    }
  ),
}))

vi.mock('@/lib/storage', () => ({
  uploadImage: vi.fn(async () => 'http://example.com/file.jpg'),
}))

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { useChat } from '@/hooks/useChat'
import type { MemberPublic } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMBER: MemberPublic = {
  id: 'm-1',
  name: 'Mario',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  is_admin: false,
  is_active: true,
  color: '#ff0000',
}

const NEW_MESSAGE = {
  id: 'msg-100',
  group_id: 'group-1',
  author_id: 'm-1',
  text: 'Ciao a tutti',
  message_type: 'text' as const,
  media_url: null,
  created_at: '2026-05-10T12:00:00Z',
}

beforeEach(() => {
  capturedChatMessagesCallback = null

  // Initial GET /api/chat/groups/:id/messages → empty paginated response
  global.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({ data: [], total: 0, page: 1, per_page: 30, has_more: false, error: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  ) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChat — realtime dedup', () => {
  it('does not duplicate messages when the same INSERT payload arrives twice', async () => {
    const { result } = renderHook(() => useChat('group-1', [MEMBER]))

    // Wait for initial fetch to settle.
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(capturedChatMessagesCallback).not.toBeNull()

    // First INSERT — message should be appended once.
    act(() => {
      capturedChatMessagesCallback!('INSERT', { new: NEW_MESSAGE, old: null })
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBe(1)
    })

    // Same payload arrives again (e.g. realtime reconnect / backfill).
    act(() => {
      capturedChatMessagesCallback!('INSERT', { new: NEW_MESSAGE, old: null })
    })

    // Must remain a single message.
    expect(result.current.messages.length).toBe(1)
    expect(result.current.messages[0].id).toBe('msg-100')
  })

  it('appends two distinct messages normally', async () => {
    const { result } = renderHook(() => useChat('group-1', [MEMBER]))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      capturedChatMessagesCallback!('INSERT', { new: NEW_MESSAGE, old: null })
    })
    act(() => {
      capturedChatMessagesCallback!('INSERT', {
        new: { ...NEW_MESSAGE, id: 'msg-101', text: 'Secondo' },
        old: null,
      })
    })

    await waitFor(() => {
      expect(result.current.messages.length).toBe(2)
    })
    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-100', 'msg-101'])
  })
})

describe('useChat — message ordering', () => {
  it('renders messages in ASC order even though API returns DESC', async () => {
    // Server returns DESC (page 1 = most recent first). The hook must
    // flip the page so the UI can render older-on-top, newer-on-bottom.
    const serverDescPage = [
      { ...NEW_MESSAGE, id: 'msg-3', text: 'terzo',  created_at: '2026-05-10T12:00:03Z' },
      { ...NEW_MESSAGE, id: 'msg-2', text: 'secondo', created_at: '2026-05-10T12:00:02Z' },
      { ...NEW_MESSAGE, id: 'msg-1', text: 'primo',   created_at: '2026-05-10T12:00:01Z' },
    ]

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: serverDescPage, total: 3, page: 1, per_page: 30, has_more: false, error: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useChat('group-1', [MEMBER]))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3'])
  })
})
