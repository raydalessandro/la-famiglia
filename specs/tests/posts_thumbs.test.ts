// @vitest-environment node
/**
 * Test: POST /api/posts — thumbnail a due taglie (Affinamento A3).
 *
 * Il client genera per ogni foto due versioni (full ~1920px + thumb
 * ~480px) e le manda come campi FormData paralleli `images` / `thumbs`
 * (stesso indice). Il server:
 *  - salva la full su `{post_id}/{i}` e la thumb su `{post_id}/{i}_thumb`
 *  - scrive thumb_url sulla riga post_images
 *  - thumb ASSENTE (client vecchio) → thumb_url null, post valido
 *  - upload della thumb FALLITO → thumb_url null, post comunque valido
 *    (la thumb è un'ottimizzazione, mai un requisito)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const MEMBER = { id: 'me', name: 'Alessio', is_admin: false }

const mockRequireAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  requireAuth: mockRequireAuth,
}))

const mockUploadImage = vi.fn()
vi.mock('@/lib/storage', () => ({
  uploadImage: mockUploadImage,
}))

vi.mock('@/lib/posts', () => ({
  buildPostWithDetails: vi.fn(async (post: { id: string }) => ({ ...post, images: [] })),
  buildPostsWithDetails: vi.fn(async () => []),
}))

vi.mock('@/lib/notification-events', () => ({
  emit: vi.fn(async () => {}),
}))

vi.mock('@/lib/mentions', () => ({
  parseMentions: vi.fn(() => []),
  insertMentions: vi.fn(async () => []),
}))

// DB: registriamo le righe inserite in post_images per le assertion.
let insertedImages: Record<string, unknown>[] = []

const mockFrom = vi.fn((table: string) => {
  if (table === 'posts') {
    return {
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: {
              id: 'post-1',
              author_id: MEMBER.id,
              text: '',
              post_type: 'normal',
              created_at: '2026-07-09T10:00:00Z',
              updated_at: '2026-07-09T10:00:00Z',
            },
            error: null,
          }),
        }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }
  }
  if (table === 'post_images') {
    return {
      insert: async (row: Record<string, unknown>) => {
        insertedImages.push(row)
        return { error: null }
      },
    }
  }
  if (table === 'members') {
    return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
  }
  throw new Error(`Unexpected table ${table}`)
})

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImage(name: string): File {
  return new File(['contenuto-immagine'], name, { type: 'image/jpeg' })
}

function makePostRequest(fd: FormData): Request {
  return new Request('http://localhost/api/posts', { method: 'POST', body: fd })
}

beforeEach(() => {
  insertedImages = []
  mockRequireAuth.mockResolvedValue(MEMBER)
  mockUploadImage.mockImplementation(
    async (_bucket: string, _file: File, path: string) => `https://storage/${path}`,
  )
  mockUploadImage.mockClear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/posts — thumbs paralleli', () => {
  it('salva full + thumb e scrive thumb_url sulla riga', async () => {
    const fd = new FormData()
    fd.append('text', 'Foto con thumb')
    fd.append('images', makeImage('a.jpg'))
    fd.append('thumbs', makeImage('a_thumb.jpg'))

    const { POST } = await import('@/app/api/posts/route')
    const res = await POST(makePostRequest(fd) as never)

    expect(res.status).toBe(201)
    // Due upload: full su post-1/0, thumb su post-1/0_thumb.
    const paths = mockUploadImage.mock.calls.map((c) => c[2])
    expect(paths).toEqual(['post-1/0', 'post-1/0_thumb'])

    expect(insertedImages).toHaveLength(1)
    expect(insertedImages[0]).toMatchObject({
      post_id: 'post-1',
      image_url: 'https://storage/post-1/0',
      thumb_url: 'https://storage/post-1/0_thumb',
      sort_order: 0,
    })
  })

  it('senza thumbs (client vecchio): thumb_url null, post valido', async () => {
    const fd = new FormData()
    fd.append('text', 'Solo full')
    fd.append('images', makeImage('a.jpg'))

    const { POST } = await import('@/app/api/posts/route')
    const res = await POST(makePostRequest(fd) as never)

    expect(res.status).toBe(201)
    expect(mockUploadImage).toHaveBeenCalledTimes(1)
    expect(insertedImages[0]).toMatchObject({ thumb_url: null })
  })

  it('più foto: thumbs abbinate per indice', async () => {
    const fd = new FormData()
    fd.append('text', 'Due foto')
    fd.append('images', makeImage('a.jpg'))
    fd.append('images', makeImage('b.jpg'))
    fd.append('thumbs', makeImage('a_t.jpg'))
    fd.append('thumbs', makeImage('b_t.jpg'))

    const { POST } = await import('@/app/api/posts/route')
    await POST(makePostRequest(fd) as never)

    expect(insertedImages).toHaveLength(2)
    expect(insertedImages[0]).toMatchObject({
      image_url: 'https://storage/post-1/0',
      thumb_url: 'https://storage/post-1/0_thumb',
      sort_order: 0,
    })
    expect(insertedImages[1]).toMatchObject({
      image_url: 'https://storage/post-1/1',
      thumb_url: 'https://storage/post-1/1_thumb',
      sort_order: 1,
    })
  })

  it('thumb fallita: post creato comunque con thumb_url null (best-effort)', async () => {
    mockUploadImage.mockImplementation(
      async (_bucket: string, _file: File, path: string) => {
        if (path.endsWith('_thumb')) throw new Error('storage 500')
        return `https://storage/${path}`
      },
    )

    const fd = new FormData()
    fd.append('text', 'Thumb rotta')
    fd.append('images', makeImage('a.jpg'))
    fd.append('thumbs', makeImage('a_t.jpg'))

    const { POST } = await import('@/app/api/posts/route')
    const res = await POST(makePostRequest(fd) as never)

    expect(res.status).toBe(201)
    expect(insertedImages).toHaveLength(1)
    expect(insertedImages[0]).toMatchObject({
      image_url: 'https://storage/post-1/0',
      thumb_url: null,
    })
  })
})
