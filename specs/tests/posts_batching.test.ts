// @vitest-environment node
/**
 * Test: buildPostsWithDetails — assemblaggio batch del feed (Fase A1).
 *
 * Il refactor: prima il feed chiamava buildPostWithDetails per ogni post
 * (7 query × N post ≈ 72 round-trip per pagina — la causa principale
 * della lentezza). Ora UNA query per tabella con .in('post_id', ids) e
 * assemblaggio in memoria.
 *
 * Questi test verificano:
 * - numero di query COSTANTE (7) indipendente dal numero di post
 *   (guardia anti-regressione: se qualcuno reintroduce il per-post
 *   loop, il conteggio esplode e il test fallisce)
 * - attribuzione corretta di immagini/likes/reactions/poll al post giusto
 * - liked_by_me / bookmarked_by_me / voted_by_me calcolati per il viewer
 * - ordine di output = ordine di input
 * - array vuoto → nessuna query
 * - buildPostWithDetails (singolo) delega alla batch con shape identica
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock del client Supabase: query builder chainable che risolve con i
// dati della tabella richiesta. Registriamo ogni chiamata per contare
// le query e ispezionare i filtri.
// ---------------------------------------------------------------------------

type TableData = Record<string, unknown[]>

let tableData: TableData = {}
let fromCalls: string[] = []
let inFilters: Record<string, unknown[]> = {}

const mockFrom = vi.fn((table: string) => {
  fromCalls.push(table)
  const result = Promise.resolve({ data: tableData[table] ?? [], error: null })
  const builder = {
    select: () => builder,
    in: (_col: string, values: unknown[]) => {
      inFilters[table] = values
      return builder
    },
    eq: () => builder,
    order: () => builder,
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
  }
  return builder
})

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { buildPostsWithDetails, buildPostWithDetails } from '@/lib/posts'
import type { Member } from '@/types/database'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VIEWER = { id: 'me', name: 'Alessio', is_admin: false } as unknown as Member

const POST_A = {
  id: 'post-a',
  author_id: 'author-1',
  text: 'Primo post',
  post_type: 'normal',
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
}
const POST_B = {
  id: 'post-b',
  author_id: 'author-2',
  text: 'Secondo post',
  post_type: 'recipe',
  created_at: '2026-07-02T10:00:00Z',
  updated_at: '2026-07-02T10:00:00Z',
}

function seedTables() {
  tableData = {
    members: [
      { id: 'author-1', name: 'Giovanna', pin_hash: 'x', color: '#f00' },
      { id: 'author-2', name: 'Franco', pin_hash: 'y', color: '#0f0' },
    ],
    post_images: [
      { id: 'img-1', post_id: 'post-a', image_url: 'https://x/a0', sort_order: 0 },
      { id: 'img-2', post_id: 'post-a', image_url: 'https://x/a1', sort_order: 1 },
    ],
    post_likes: [
      { id: 'like-1', post_id: 'post-a', member_id: 'me', created_at: '…' },
      { id: 'like-2', post_id: 'post-b', member_id: 'author-1', created_at: '…' },
    ],
    post_comments: [
      { post_id: 'post-a' },
      { post_id: 'post-a' },
      { post_id: 'post-b' },
    ],
    post_reactions: [
      {
        id: 'r-1',
        post_id: 'post-b',
        member_id: 'author-1',
        emoji: '❤️',
        created_at: '…',
        members: { id: 'author-1', name: 'Giovanna', pin_hash: 'x' },
      },
    ],
    post_polls: [
      {
        id: 'poll-1',
        post_id: 'post-b',
        question: 'Dove andiamo?',
        multi_choice: false,
        closes_at: null,
        created_at: '…',
        options: [
          { id: 'opt-1', poll_id: 'poll-1', label: 'Mare', sort_order: 0 },
          { id: 'opt-2', poll_id: 'poll-1', label: 'Monti', sort_order: 1 },
        ],
        votes: [
          { option_id: 'opt-1', member_id: 'me' },
          { option_id: 'opt-1', member_id: 'author-1' },
        ],
      },
    ],
    post_bookmarks: [{ post_id: 'post-b' }],
  }
}

beforeEach(() => {
  fromCalls = []
  inFilters = {}
  seedTables()
  mockFrom.mockClear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildPostsWithDetails — batching', () => {
  it('fa un numero COSTANTE di query (7) indipendente dal numero di post', async () => {
    await buildPostsWithDetails([POST_A, POST_B], VIEWER)
    expect(mockFrom).toHaveBeenCalledTimes(7)

    // Raddoppiare i post NON deve aumentare le query. Con il vecchio
    // per-post loop sarebbero 7 × N.
    mockFrom.mockClear()
    const many = Array.from({ length: 10 }, (_, i) => ({ ...POST_A, id: `p-${i}` }))
    await buildPostsWithDetails(many, VIEWER)
    expect(mockFrom).toHaveBeenCalledTimes(7)
  })

  it('non fa NESSUNA query con input vuoto', async () => {
    const result = await buildPostsWithDetails([], VIEWER)
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('filtra ogni tabella con gli id dei post richiesti', async () => {
    await buildPostsWithDetails([POST_A, POST_B], VIEWER)
    expect(inFilters['post_images']).toEqual(['post-a', 'post-b'])
    expect(inFilters['post_likes']).toEqual(['post-a', 'post-b'])
    expect(inFilters['post_bookmarks']).toEqual(['post-a', 'post-b'])
    // Gli author sono deduplicati
    expect(inFilters['members']).toEqual(['author-1', 'author-2'])
  })

  it('attribuisce immagini, likes, reazioni e poll al post giusto', async () => {
    const [a, b] = await buildPostsWithDetails([POST_A, POST_B], VIEWER)

    expect(a.images.map((i) => i.id)).toEqual(['img-1', 'img-2'])
    expect(b.images).toEqual([])

    expect(a.likes).toHaveLength(1)
    expect(b.likes).toHaveLength(1)

    expect(a.reactions).toEqual([])
    expect(b.reactions).toHaveLength(1)
    expect(b.reactions[0].emoji).toBe('❤️')
    // Il member della reaction è in shape public (niente pin_hash)
    expect(b.reactions[0].member).not.toHaveProperty('pin_hash')

    expect(a.poll).toBeNull()
    expect(b.poll?.question).toBe('Dove andiamo?')
  })

  it('calcola i campi per-viewer: liked_by_me, bookmarked_by_me, voted_by_me', async () => {
    const [a, b] = await buildPostsWithDetails([POST_A, POST_B], VIEWER)

    expect(a.liked_by_me).toBe(true)   // like-1 è di 'me'
    expect(b.liked_by_me).toBe(false)  // like-2 è di author-1

    expect(a.bookmarked_by_me).toBe(false)
    expect(b.bookmarked_by_me).toBe(true)

    const mare = b.poll!.options.find((o) => o.label === 'Mare')!
    const monti = b.poll!.options.find((o) => o.label === 'Monti')!
    expect(mare.vote_count).toBe(2)
    expect(mare.voted_by_me).toBe(true)
    expect(monti.vote_count).toBe(0)
    expect(b.poll!.total_votes).toBe(2)
  })

  it('conta i commenti per post', async () => {
    const [a, b] = await buildPostsWithDetails([POST_A, POST_B], VIEWER)
    expect(a.comments_count).toBe(2)
    expect(b.comments_count).toBe(1)
  })

  it('risolve gli author in shape public', async () => {
    const [a, b] = await buildPostsWithDetails([POST_A, POST_B], VIEWER)
    expect(a.author.name).toBe('Giovanna')
    expect(b.author.name).toBe('Franco')
    expect(a.author).not.toHaveProperty('pin_hash')
  })

  it("preserva l'ordine di input nell'output", async () => {
    const [first, second] = await buildPostsWithDetails([POST_B, POST_A], VIEWER)
    expect(first.id).toBe('post-b')
    expect(second.id).toBe('post-a')
  })
})

describe('buildPostWithDetails — wrapper single-post', () => {
  it('ritorna la stessa shape della batch per un singolo post', async () => {
    const single = await buildPostWithDetails(POST_A, VIEWER)
    const [batched] = await buildPostsWithDetails([POST_A], VIEWER)
    expect(single).toEqual(batched)
  })
})
