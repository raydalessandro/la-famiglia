/**
 * Tests for src/lib/offline-queue.ts
 * Phase 4A — written from spec only.
 *
 * Dependencies:
 *   fake-indexeddb   – drop-in IDBFactory for Node / Vitest (no browser needed)
 *   vitest           – test runner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// fake-indexeddb – must be installed before the module under test is imported
// so that `indexedDB` is already a global when offline-queue.ts runs.
// ---------------------------------------------------------------------------
import 'fake-indexeddb/auto'

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------
import {
  enqueueOperation,
  processQueue,
  getQueueSize,
  clearQueue,
  // @ts-expect-error – constants are exported from the implementation
  DB_NAME,
  // @ts-expect-error
  STORE_NAME,
  // @ts-expect-error
  MAX_RETRIES,
} from '../../src/lib/offline-queue'

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

/** Stable UUID returned by crypto.randomUUID() unless overridden per-test. */
const MOCK_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

/** Reset between tests so each test gets a clean IndexedDB state. */
beforeEach(async () => {
  // Wipe the database between tests by using clearQueue (clears all records),
  // which also exercises the helper — more importantly we delete + recreate the
  // IDB database so status-indexed counts are consistent.
  await clearQueue()

  // Reset all mocks.
  vi.restoreAllMocks()

  // Stable UUID.
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(MOCK_UUID as `${string}-${string}-${string}-${string}-${string}`)

  // Service-worker / Background Sync — silently succeed.
  const mockSync = { register: vi.fn().mockResolvedValue(undefined) }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(mockSync) },
    writable: true,
    configurable: true,
  })

  // fetch — default to a successful 200 response; override per-test as needed.
  global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
})

// ---------------------------------------------------------------------------
// Helper – peek directly into IDB to inspect a stored operation
// ---------------------------------------------------------------------------
function openRawDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getAllOperations(): Promise<Record<string, unknown>[]> {
  return openRawDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result as Record<string, unknown>[])
        req.onerror = () => reject(req.error)
      })
  )
}

// ===========================================================================
// 1. Interface
// ===========================================================================

describe('Interface', () => {
  it('exports enqueueOperation as a function', () => {
    expect(typeof enqueueOperation).toBe('function')
  })

  it('exports processQueue as a function', () => {
    expect(typeof processQueue).toBe('function')
  })

  it('exports getQueueSize as a function', () => {
    expect(typeof getQueueSize).toBe('function')
  })

  it('exports clearQueue as a function', () => {
    expect(typeof clearQueue).toBe('function')
  })

  it('enqueueOperation returns a Promise', () => {
    const result = enqueueOperation('toggle_like', { post_id: '1' })
    expect(result).toBeInstanceOf(Promise)
    return result // let Vitest await it
  })

  it('processQueue returns a Promise', () => {
    const result = processQueue()
    expect(result).toBeInstanceOf(Promise)
    return result
  })

  it('getQueueSize returns a Promise', () => {
    const result = getQueueSize()
    expect(result).toBeInstanceOf(Promise)
    return result
  })

  it('clearQueue returns a Promise', () => {
    const result = clearQueue()
    expect(result).toBeInstanceOf(Promise)
    return result
  })

  it('exports DB_NAME constant', () => {
    expect(DB_NAME).toBe('famiglia_offline')
  })

  it('exports STORE_NAME constant', () => {
    expect(STORE_NAME).toBe('operations')
  })

  it('exports MAX_RETRIES constant', () => {
    expect(MAX_RETRIES).toBe(3)
  })
})

// ===========================================================================
// 2. enqueueOperation
// ===========================================================================

describe('enqueueOperation', () => {
  it('returns a string (UUID)', async () => {
    const id = await enqueueOperation('toggle_like', { post_id: 'p1' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('returns the UUID produced by crypto.randomUUID()', async () => {
    const id = await enqueueOperation('toggle_like', { post_id: 'p1' })
    expect(id).toBe(MOCK_UUID)
  })

  it('stores the operation in IndexedDB with status "pending"', async () => {
    await enqueueOperation('toggle_like', { post_id: 'p1' })
    const ops = await getAllOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].status).toBe('pending')
  })

  it('stores the operation with retries set to 0', async () => {
    await enqueueOperation('toggle_like', { post_id: 'p1' })
    const ops = await getAllOperations()
    expect(ops[0].retries).toBe(0)
  })

  it('stores the correct type in the operation', async () => {
    await enqueueOperation('create_post', { text: 'hello' })
    const ops = await getAllOperations()
    expect(ops[0].type).toBe('create_post')
  })

  it('stores the correct payload in the operation', async () => {
    const payload = { post_id: 'abc', text: 'nice' }
    await enqueueOperation('add_comment', payload)
    const ops = await getAllOperations()
    expect(ops[0].payload).toEqual(payload)
  })

  it('stores a created_at ISO string', async () => {
    await enqueueOperation('toggle_like', { post_id: 'p1' })
    const ops = await getAllOperations()
    expect(typeof ops[0].created_at).toBe('string')
    expect(() => new Date(ops[0].created_at as string)).not.toThrow()
  })

  it('stores the id returned by crypto.randomUUID()', async () => {
    const id = await enqueueOperation('toggle_like', { post_id: 'p1' })
    const ops = await getAllOperations()
    expect(ops[0].id).toBe(id)
  })

  it('does not throw when Background Sync is unavailable', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    await expect(
      enqueueOperation('toggle_like', { post_id: 'p1' })
    ).resolves.toBeDefined()
  })
})

// ===========================================================================
// 3. processQueue
// ===========================================================================

describe('processQueue', () => {
  it('returns { synced: 0, failed: 0 } when queue is empty', async () => {
    const result = await processQueue()
    expect(result).toEqual({ synced: 0, failed: 0 })
  })

  it('returns { synced: 1, failed: 0 } and removes the operation on 2xx', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    const result = await processQueue()

    expect(result).toEqual({ synced: 1, failed: 0 })
    const ops = await getAllOperations()
    expect(ops).toHaveLength(0)
  })

  it('returns { synced: 0, failed: 1 } and removes the operation on 400', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 }))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    const result = await processQueue()

    expect(result).toEqual({ synced: 0, failed: 1 })
    const ops = await getAllOperations()
    expect(ops).toHaveLength(0)
  })

  it('does not retry on any 4xx client error (removes the operation)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    await processQueue()

    const ops = await getAllOperations()
    expect(ops).toHaveLength(0)
  })

  it('increments retries and keeps status "pending" on 500 (retries < MAX_RETRIES)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    await processQueue()

    const ops = await getAllOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].retries).toBe(1)
    expect(ops[0].status).toBe('pending')
  })

  it('marks operation as "failed" when retries reach MAX_RETRIES on 500', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    // Run processQueue MAX_RETRIES times to exhaust retries.
    for (let i = 0; i < MAX_RETRIES; i++) {
      await processQueue()
    }

    const ops = await getAllOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].status).toBe('failed')
    expect(ops[0].retries).toBeGreaterThanOrEqual(MAX_RETRIES)
  })

  it('increments retries and keeps status "pending" on network error (retries < MAX_RETRIES)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network failure'))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    await processQueue()

    const ops = await getAllOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].retries).toBe(1)
    expect(ops[0].status).toBe('pending')
  })

  it('marks operation "failed" when retries reach MAX_RETRIES on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Network failure'))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    for (let i = 0; i < MAX_RETRIES; i++) {
      await processQueue()
    }

    const ops = await getAllOperations()
    expect(ops).toHaveLength(1)
    expect(ops[0].status).toBe('failed')
  })

  it('processes multiple operations in created_at ascending order', async () => {
    const callOrder: string[] = []
    global.fetch = vi.fn().mockImplementation((url: string) => {
      callOrder.push(url as string)
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    // Enqueue with distinct UUIDs and timestamps
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000001-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce('00000002-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce('00000003-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`)

    // Enqueue them sequentially so created_at timestamps are ordered.
    await enqueueOperation('toggle_like', { post_id: 'first' })
    await enqueueOperation('toggle_like', { post_id: 'second' })
    await enqueueOperation('toggle_like', { post_id: 'third' })

    await processQueue()

    // All three synced
    expect(callOrder).toHaveLength(3)
    // URLs must appear in chronological order of enqueue
    expect(callOrder[0]).toContain('first')
    expect(callOrder[1]).toContain('second')
    expect(callOrder[2]).toContain('third')
  })

  // --- API endpoint mapping ---

  it('calls POST /api/posts for create_post without images', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await enqueueOperation('create_post', { text: 'hello' })
    await processQueue()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/posts',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('calls POST /api/posts/${post_id}/like for toggle_like', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await enqueueOperation('toggle_like', { post_id: 'p42' })
    await processQueue()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/posts/p42/like',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('calls POST /api/posts/${post_id}/comments for add_comment', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await enqueueOperation('add_comment', { post_id: 'p7', text: 'nice!' })
    await processQueue()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/posts/p7/comments',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends JSON body for create_post without images', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await enqueueOperation('create_post', { text: 'hello' })
    await processQueue()

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((options as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(typeof (options as RequestInit).body).toBe('string')
  })

  it('sends FormData body for create_post with images', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    await enqueueOperation('create_post', { text: 'hello', images: file })
    await processQueue()

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((options as RequestInit).body).toBeInstanceOf(FormData)
  })
})

// ===========================================================================
// 4. getQueueSize
// ===========================================================================

describe('getQueueSize', () => {
  it('returns 0 when the queue is empty', async () => {
    expect(await getQueueSize()).toBe(0)
  })

  it('returns 1 after a single enqueue', async () => {
    await enqueueOperation('toggle_like', { post_id: 'p1' })
    expect(await getQueueSize()).toBe(1)
  })

  it('counts only "pending" operations, not "failed" ones', async () => {
    // Exhaust retries to produce a 'failed' operation
    global.fetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    for (let i = 0; i < MAX_RETRIES; i++) {
      await processQueue()
    }

    // The operation is now 'failed' — should not be counted by getQueueSize
    expect(await getQueueSize()).toBe(0)
  })

  it('increments correctly with multiple enqueues', async () => {
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as `${string}-${string}-${string}-${string}-${string}`
    )
    await enqueueOperation('add_comment', { post_id: 'p2', text: 'hi' })

    expect(await getQueueSize()).toBe(2)
  })
})

// ===========================================================================
// 5. clearQueue
// ===========================================================================

describe('clearQueue', () => {
  it('resolves without error on an already-empty queue', async () => {
    await expect(clearQueue()).resolves.toBeUndefined()
  })

  it('results in getQueueSize() returning 0 after clearing', async () => {
    await enqueueOperation('toggle_like', { post_id: 'p1' })
    expect(await getQueueSize()).toBe(1)

    await clearQueue()

    expect(await getQueueSize()).toBe(0)
  })

  it('removes all records including failed ones', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }))
    await enqueueOperation('toggle_like', { post_id: 'p1' })

    for (let i = 0; i < MAX_RETRIES; i++) {
      await processQueue()
    }

    // There is a 'failed' record in the store
    const opsBefore = await getAllOperations()
    expect(opsBefore).toHaveLength(1)

    await clearQueue()

    const opsAfter = await getAllOperations()
    expect(opsAfter).toHaveLength(0)
  })
})
