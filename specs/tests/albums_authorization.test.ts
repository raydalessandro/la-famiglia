/**
 * Tests for DELETE /api/albums/:id — authorization
 *
 * Authorization rule (matches posts/[id]/route.ts):
 *   DELETE allowed only if member.id === album.created_by OR member.is_admin.
 *   Otherwise → 403.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREATOR = {
  id: 'member-creator',
  name: 'Mario',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: '',
  pin_hash: 'h',
  is_admin: false,
  is_active: true,
  color: '#fff',
  notify_push: false,
  notify_telegram: false,
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const OTHER = { ...CREATOR, id: 'member-other', name: 'Luigi', is_admin: false }
const ADMIN = { ...CREATOR, id: 'member-admin', name: 'Admin', is_admin: true }

const MOCK_ALBUM = {
  id: 'album-1',
  name: 'Vacanze 2026',
  cover_image_url: null,
  created_by: 'member-creator',
  created_at: '2026-01-01T00:00:00Z',
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  deleteImage: vi.fn(() => Promise.resolve()),
}))

import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>
const mockCreateServerClient = createServerClient as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Supabase builder
// ---------------------------------------------------------------------------

function makeAlbumDb(opts: {
  albumData?: unknown
  albumError?: unknown
  deleteError?: unknown
} = {}) {
  const album = opts.albumData === undefined ? MOCK_ALBUM : opts.albumData
  const albumError = opts.albumError ?? null
  const deleteError = opts.deleteError ?? null

  const fromMock = vi.fn((table: string) => {
    if (table === 'albums') {
      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      selectChain.single = vi.fn(() =>
        Promise.resolve({ data: album, error: albumError })
      )

      const deleteChain: Record<string, unknown> = {}
      deleteChain.eq = vi.fn(() => Promise.resolve({ error: deleteError }))

      return {
        select: vi.fn(() => selectChain),
        delete: vi.fn(() => deleteChain),
      }
    }
    if (table === 'album_photos') {
      // GET storage_path list — awaitable directly after .eq()
      const selectChain: Record<string, unknown> = {}
      selectChain.eq = vi.fn(() => selectChain)
      ;(selectChain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
      return { select: vi.fn(() => selectChain) }
    }
    // default
    const builder: Record<string, unknown> = {}
    const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'order', 'single', 'maybeSingle']
    for (const m of methods) builder[m] = vi.fn(() => builder)
    ;(builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve)
    return builder
  })

  return { from: fromMock }
}

function makeRequest(method: string): Request {
  return new Request('http://localhost/api/albums/album-1', { method })
}

const params = Promise.resolve({ id: 'album-1' })

// ---------------------------------------------------------------------------
// DELETE /api/albums/:id — authorization
// ---------------------------------------------------------------------------

describe('DELETE /api/albums/:id — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when creator deletes their own album', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(makeAlbumDb())

    const { DELETE } = await import('@/app/api/albums/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBeNull()
  })

  it('returns 200 when admin deletes any album', async () => {
    mockRequireAuth.mockResolvedValue(ADMIN)
    mockCreateServerClient.mockReturnValue(makeAlbumDb())

    const { DELETE } = await import('@/app/api/albums/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(200)
  })

  it('returns 403 when non-creator non-admin tries to delete', async () => {
    mockRequireAuth.mockResolvedValue(OTHER)
    mockCreateServerClient.mockReturnValue(makeAlbumDb())

    const { DELETE } = await import('@/app/api/albums/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.data).toBeNull()
    expect(json.error).toBeTruthy()
  })

  it('returns 404 when album does not exist', async () => {
    mockRequireAuth.mockResolvedValue(CREATOR)
    mockCreateServerClient.mockReturnValue(
      makeAlbumDb({ albumData: null, albumError: { message: 'not found' } })
    )

    const { DELETE } = await import('@/app/api/albums/[id]/route')
    const res = await DELETE(makeRequest('DELETE') as any, { params })

    expect(res.status).toBe(404)
  })
})
