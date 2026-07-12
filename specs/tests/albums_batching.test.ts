// @vitest-environment node
/**
 * GET /api/albums — batching anti-N+1 (Affinamento A6.4).
 *
 * Prima: 1 count query PER album. Ora: una select leggera di album_id
 * con .in() e conteggio in JS (PostgREST non fa GROUP BY) — stesso
 * approccio di comments_count in buildPostsWithDetails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const MEMBER = { id: 'me', name: 'Alessio', is_admin: false }

const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
}))

const ALBUMS = [
  { id: 'a1', name: 'Vacanze', creator: { id: 'x', name: 'Giovanna' } },
  { id: 'a2', name: 'Natale', creator: { id: 'x', name: 'Giovanna' } },
  { id: 'a3', name: 'Vuoto', creator: null },
]

const PHOTO_ROWS = [
  { album_id: 'a1' },
  { album_id: 'a1' },
  { album_id: 'a1' },
  { album_id: 'a2' },
]

let fromCalls: string[] = []
let albumsData: unknown[] = []
let photosInIds: unknown[] | null = null

const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  if (table === 'albums') {
    return {
      select: () => ({
        order: () => Promise.resolve({ data: albumsData, error: null }),
      }),
    }
  }
  if (table === 'album_photos') {
    return {
      select: () => ({
        in: (_col: string, ids: unknown[]) => {
          photosInIds = ids
          return Promise.resolve({ data: PHOTO_ROWS, error: null })
        },
        eq: () => {
          throw new Error('Regressione N+1: count per-album su album_photos')
        },
      }),
    }
  }
  throw new Error(`Tabella inattesa: ${table}`)
})

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

beforeEach(() => {
  fromCalls = []
  photosInIds = null
  albumsData = ALBUMS
  mockRequireAuth.mockResolvedValue(MEMBER)
  mockFrom.mockClear()
})

describe('GET /api/albums — batching', () => {
  it('due query costanti: albums + una select di album_id', async () => {
    const { GET } = await import('@/app/api/albums/route')
    const res = await GET(new Request('http://localhost/api/albums') as never)

    expect(res.status).toBe(200)
    expect(fromCalls).toEqual(['albums', 'album_photos'])
    expect(photosInIds).toEqual(['a1', 'a2', 'a3'])
  })

  it('conta le foto per album; album vuoto → 0', async () => {
    const { GET } = await import('@/app/api/albums/route')
    const res = await GET(new Request('http://localhost/api/albums') as never)
    const json = await res.json()

    const counts = Object.fromEntries(
      json.data.map((a: { id: string; photo_count: number }) => [a.id, a.photo_count]),
    )
    expect(counts).toEqual({ a1: 3, a2: 1, a3: 0 })
  })

  it('zero album → nessuna query su album_photos', async () => {
    albumsData = []
    const { GET } = await import('@/app/api/albums/route')
    const res = await GET(new Request('http://localhost/api/albums') as never)
    const json = await res.json()

    expect(json.data).toEqual([])
    expect(fromCalls).toEqual(['albums'])
  })
})
