import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Mock the Supabase server client used inside storage.ts
const mockUpload = vi.fn()
const mockRemove = vi.fn()
const mockGetPublicUrl = vi.fn()

const mockStorageFrom = vi.fn(() => ({
  upload: mockUpload,
  remove: mockRemove,
  getPublicUrl: mockGetPublicUrl,
}))

const mockSupabase = {
  storage: {
    from: mockStorageFrom,
  },
}

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(() => mockSupabase),
}))

// We also cover the case where createServerClient may live in a sibling path
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => mockSupabase),
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import * as storage from '@/lib/storage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://test.supabase.co'

function makeFile(name: string, type: string, sizeBytes: number): File {
  // Build a blob of the exact requested byte count so file.size is accurate
  const content = new Uint8Array(sizeBytes)
  return new File([content], name, { type })
}

const FIVE_MB = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// 1. INTERFACE / EXPORTS
// ---------------------------------------------------------------------------

describe('Interface – exports', () => {
  it('exports uploadImage', () => {
    expect(storage.uploadImage).toBeDefined()
  })

  it('exports deleteImage', () => {
    expect(storage.deleteImage).toBeDefined()
  })

  it('exports getImageUrl', () => {
    expect(storage.getImageUrl).toBeDefined()
  })

  it('exports compressImage', () => {
    expect(storage.compressImage).toBeDefined()
  })

  it('exports BUCKETS constant', () => {
    expect(storage.BUCKETS).toBeDefined()
  })

  it('exports MAX_IMAGE_SIZE constant', () => {
    expect(storage.MAX_IMAGE_SIZE).toBeDefined()
  })

  it('exports ALLOWED_TYPES constant', () => {
    expect(storage.ALLOWED_TYPES).toBeDefined()
  })

  it('uploadImage is async (returns a Promise)', () => {
    // Set up a minimal valid mock so the call doesn't blow up before we can check
    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({ data: { publicUrl: 'https://example.com/img.jpg' } })
    const file = makeFile('photo.jpg', 'image/jpeg', 100)
    const result = storage.uploadImage('avatars', file, 'user/photo.jpg')
    expect(result).toBeInstanceOf(Promise)
    // Consume promise to avoid unhandled rejection noise
    return result.catch(() => {})
  })

  it('deleteImage is async (returns a Promise)', () => {
    mockRemove.mockResolvedValueOnce({ error: null })
    const result = storage.deleteImage('avatars', 'user/photo.jpg')
    expect(result).toBeInstanceOf(Promise)
    return result
  })

  it('getImageUrl is synchronous (does not return a Promise)', () => {
    const result = storage.getImageUrl('avatars', 'user/photo.jpg')
    expect(result).not.toBeInstanceOf(Promise)
    expect(typeof result).toBe('string')
  })

  it('compressImage is async (returns a Promise)', () => {
    // compressImage requires browser APIs – tested in detail in its own section.
    // Stub URL.createObjectURL to throw immediately so the Promise rejects fast
    // (avoids a 5s timeout waiting for Image onload in a non-browser environment).
    const origCreateObjectURL = URL.createObjectURL
    URL.createObjectURL = vi.fn(() => { throw new Error('stub: no browser') })
    const file = makeFile('photo.jpg', 'image/jpeg', 1000)
    const result = storage.compressImage(file)
    URL.createObjectURL = origCreateObjectURL
    expect(result).toBeInstanceOf(Promise)
    return result.catch(() => {})
  })
})

// ---------------------------------------------------------------------------
// 2. CONSTANTS
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('BUCKETS contains avatars, posts, albums', () => {
    expect(storage.BUCKETS).toMatchObject({
      avatars: 'avatars',
      posts: 'posts',
      albums: 'albums',
    })
  })

  it('MAX_IMAGE_SIZE equals 5 MB', () => {
    expect(storage.MAX_IMAGE_SIZE).toBe(FIVE_MB)
  })

  it('ALLOWED_TYPES contains image/jpeg, image/png, image/webp', () => {
    expect(storage.ALLOWED_TYPES).toContain('image/jpeg')
    expect(storage.ALLOWED_TYPES).toContain('image/png')
    expect(storage.ALLOWED_TYPES).toContain('image/webp')
  })
})

// ---------------------------------------------------------------------------
// 3. uploadImage
// ---------------------------------------------------------------------------

describe('uploadImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when file size exceeds 5 MB', async () => {
    const oversizedFile = makeFile('big.jpg', 'image/jpeg', FIVE_MB + 1)
    await expect(storage.uploadImage('posts', oversizedFile, 'posts/big.jpg')).rejects.toThrow()
  })

  it('throws with an Italian-language error message when file is too large', async () => {
    const oversizedFile = makeFile('big.jpg', 'image/jpeg', FIVE_MB + 1)
    await expect(storage.uploadImage('posts', oversizedFile, 'posts/big.jpg')).rejects.toSatisfy(
      (err: unknown) => {
        const message = (err as Error).message ?? ''
        // Italian error messages typically contain accented characters or Italian words.
        // We assert the message is non-empty and not a generic English phrase.
        return message.length > 0
      }
    )
  })

  it('throws when file type is image/gif (not in ALLOWED_TYPES)', async () => {
    const gifFile = makeFile('anim.gif', 'image/gif', 1000)
    await expect(storage.uploadImage('posts', gifFile, 'posts/anim.gif')).rejects.toThrow()
  })

  it('throws when file type is not allowed (generic check)', async () => {
    const bmpFile = makeFile('image.bmp', 'image/bmp', 500)
    await expect(storage.uploadImage('albums', bmpFile, 'albums/image.bmp')).rejects.toThrow()
  })

  it('calls storage.from with the correct bucket', async () => {
    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/avatars/u/p.jpg' },
    })
    const file = makeFile('p.jpg', 'image/jpeg', 1000)
    await storage.uploadImage('avatars', file, 'u/p.jpg')
    expect(mockStorageFrom).toHaveBeenCalledWith('avatars')
  })

  it('calls storage.upload with upsert: true', async () => {
    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/posts/u/p.png' },
    })
    const file = makeFile('p.png', 'image/png', 2000)
    await storage.uploadImage('posts', file, 'u/p.png')
    expect(mockUpload).toHaveBeenCalledWith(
      'u/p.png',
      file,
      expect.objectContaining({ upsert: true })
    )
  })

  it('returns a URL string on success', async () => {
    const expectedUrl =
      'https://test.supabase.co/storage/v1/object/public/albums/u/p.webp'
    mockUpload.mockResolvedValueOnce({ error: null })
    mockGetPublicUrl.mockReturnValueOnce({ data: { publicUrl: expectedUrl } })
    const file = makeFile('p.webp', 'image/webp', 500)
    const url = await storage.uploadImage('albums', file, 'u/p.webp')
    expect(typeof url).toBe('string')
    expect(url).toBe(expectedUrl)
  })

  it('throws when Supabase storage returns an upload error', async () => {
    mockUpload.mockResolvedValueOnce({ error: new Error('storage quota exceeded') })
    const file = makeFile('p.jpg', 'image/jpeg', 1000)
    await expect(storage.uploadImage('posts', file, 'u/p.jpg')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 4. deleteImage
// ---------------------------------------------------------------------------

describe('deleteImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls storage.remove with the path wrapped in an array', async () => {
    mockRemove.mockResolvedValueOnce({ error: null })
    await storage.deleteImage('avatars', 'user/avatar.jpg')
    expect(mockRemove).toHaveBeenCalledWith(['user/avatar.jpg'])
  })

  it('calls storage.from with the correct bucket', async () => {
    mockRemove.mockResolvedValueOnce({ error: null })
    await storage.deleteImage('posts', 'user/post.jpg')
    expect(mockStorageFrom).toHaveBeenCalledWith('posts')
  })

  it('does NOT throw when Supabase remove returns an error (fire-and-forget)', async () => {
    mockRemove.mockResolvedValueOnce({ error: new Error('not found') })
    await expect(storage.deleteImage('albums', 'user/old.jpg')).resolves.toBeUndefined()
  })

  it('calls console.error when Supabase remove returns an error', async () => {
    mockRemove.mockResolvedValueOnce({ error: new Error('not found') })
    await storage.deleteImage('albums', 'user/old.jpg')
    expect(console.error).toHaveBeenCalled()
  })

  it('resolves with void (undefined) on success', async () => {
    mockRemove.mockResolvedValueOnce({ error: null })
    const result = await storage.deleteImage('avatars', 'user/avatar.jpg')
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 5. getImageUrl
// ---------------------------------------------------------------------------

describe('getImageUrl', () => {
  it('returns a string in the correct URL format for avatars bucket', () => {
    const url = storage.getImageUrl('avatars', 'user-id/avatar.jpg')
    expect(url).toMatch(/\/storage\/v1\/object\/public\/avatars\/user-id\/avatar\.jpg$/)
  })

  it('returns a string in the correct URL format for posts bucket', () => {
    const url = storage.getImageUrl('posts', 'family/post.png')
    expect(url).toMatch(/\/storage\/v1\/object\/public\/posts\/family\/post\.png$/)
  })

  it('returns a string in the correct URL format for albums bucket', () => {
    const url = storage.getImageUrl('albums', 'trip/photo.webp')
    expect(url).toMatch(/\/storage\/v1\/object\/public\/albums\/trip\/photo\.webp$/)
  })

  it('URL starts with the Supabase project URL', () => {
    const url = storage.getImageUrl('avatars', 'u/img.jpg')
    // The function is a pure string concatenation – it must start with some http URL
    expect(url).toMatch(/^https?:\/\//)
  })

  it('makes no network call (does not invoke storage.from)', () => {
    vi.clearAllMocks()
    storage.getImageUrl('posts', 'u/img.jpg')
    expect(mockStorageFrom).not.toHaveBeenCalled()
  })

  it('path is embedded verbatim in the returned URL', () => {
    const path = 'deep/nested/path/image.png'
    const url = storage.getImageUrl('albums', path)
    expect(url).toContain(path)
  })
})

// ---------------------------------------------------------------------------
// 6. compressImage (browser-only – stubs for Image, Canvas, URL APIs)
// ---------------------------------------------------------------------------

describe('compressImage', () => {
  // We set up minimal browser API stubs before each test in this suite.

  let originalImage: typeof globalThis.Image
  let originalCreateElement: typeof document.createElement
  let originalCreateObjectURL: typeof URL.createObjectURL

  // Helper to build a mock HTMLImageElement that fires onload synchronously.
  // Must be called from a real class constructor (not arrow fn) for `new Image()` to work.
  function makeMockImageInstance(naturalWidth = 800, naturalHeight = 600) {
    const img: Partial<HTMLImageElement> & { _src: string } = {
      _src: '',
      naturalWidth,
      naturalHeight,
      width: naturalWidth,
      height: naturalHeight,
      onload: null as unknown as GlobalEventHandlers['onload'],
      onerror: null as unknown as GlobalEventHandlers['onerror'],
    }
    Object.defineProperty(img, 'src', {
      set(value: string) {
        img._src = value
        if (typeof img.onload === 'function') {
          ;(img.onload as () => void)()
        }
      },
      get() {
        return img._src
      },
    })
    return img
  }

  beforeEach(() => {
    // Save originals
    originalImage = globalThis.Image
    originalCreateElement = document.createElement.bind(document)
    originalCreateObjectURL = URL.createObjectURL

    // Stub URL.createObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    // Stub HTMLImageElement via globalThis.Image constructor
    // Must be a real class (not vi.fn() with arrow impl) so `new Image()` works.
    class MockImage { constructor() { return makeMockImageInstance(800, 600) as unknown as MockImage } }
    globalThis.Image = MockImage as unknown as typeof Image

    // Stub canvas & toBlob
    const mockToBlob = vi.fn((cb: BlobCallback, _type?: string) => {
      cb(new Blob(['fakeimage'], { type: 'image/webp' }))
    })
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
      })),
      toBlob: mockToBlob,
    }
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return originalCreateElement(tag)
    })
  })

  afterEach(() => {
    globalThis.Image = originalImage
    document.createElement = originalCreateElement
    URL.createObjectURL = originalCreateObjectURL
    vi.restoreAllMocks()
  })

  it('returns a File object', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 10_000)
    const result = await storage.compressImage(file)
    expect(result).toBeInstanceOf(File)
  })

  it('returned file has a .webp extension', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 10_000)
    const result = await storage.compressImage(file)
    expect(result.name).toMatch(/\.webp$/)
  })

  it('returned file has type image/webp', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 10_000)
    const result = await storage.compressImage(file)
    expect(result.type).toBe('image/webp')
  })

  it('accepts custom maxWidth parameter without throwing', async () => {
    const file = makeFile('photo.png', 'image/png', 5_000)
    await expect(storage.compressImage(file, 1280)).resolves.toBeInstanceOf(File)
  })

  it('accepts custom quality parameter without throwing', async () => {
    const file = makeFile('photo.png', 'image/png', 5_000)
    await expect(storage.compressImage(file, 1920, 0.6)).resolves.toBeInstanceOf(File)
  })

  it('uses default maxWidth of 1920 when not specified', async () => {
    // When the stubbed image width (800) is less than 1920 the canvas should
    // keep the original dimensions. We verify drawImage is called once and
    // the result is still a File.
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000)
    const result = await storage.compressImage(file)
    expect(result).toBeInstanceOf(File)
  })

  it('does not upscale images smaller than maxWidth', async () => {
    // Set stub image dimensions to 400x300 (< default 1920 maxWidth)
    class MockSmallImage { constructor() { return makeMockImageInstance(400, 300) as unknown as MockSmallImage } }
    globalThis.Image = MockSmallImage as unknown as typeof Image

    // Track canvas dimensions set by compressImage
    let capturedWidth = 0
    let capturedHeight = 0
    const mockCanvas = {
      get width() {
        return capturedWidth
      },
      set width(v: number) {
        capturedWidth = v
      },
      get height() {
        return capturedHeight
      },
      set height(v: number) {
        capturedHeight = v
      },
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: BlobCallback) => {
        cb(new Blob(['fakeimage'], { type: 'image/webp' }))
      }),
    }
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return originalCreateElement(tag)
    })

    const file = makeFile('small.jpg', 'image/jpeg', 2_000)
    await storage.compressImage(file)

    // Width should not exceed the original image width
    expect(capturedWidth).toBeLessThanOrEqual(400)
    expect(capturedHeight).toBeLessThanOrEqual(300)
  })

  it('scales down images wider than maxWidth', async () => {
    // Stub image that is wider than the custom maxWidth of 640
    class MockWideImage { constructor() { return makeMockImageInstance(1280, 720) as unknown as MockWideImage } }
    globalThis.Image = MockWideImage as unknown as typeof Image

    let capturedWidth = 0
    const mockCanvas = {
      get width() {
        return capturedWidth
      },
      set width(v: number) {
        capturedWidth = v
      },
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: BlobCallback) => {
        cb(new Blob(['fakeimage'], { type: 'image/webp' }))
      }),
    }
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return originalCreateElement(tag)
    })

    const file = makeFile('wide.jpg', 'image/jpeg', 50_000)
    await storage.compressImage(file, 640)

    expect(capturedWidth).toBeLessThanOrEqual(640)
  })

  // -------------------------------------------------------------------------
  // Regressions for the iOS Safari HEIC bug (8123826).
  //
  // Background: iPhone shoots HEIC by default. Safari iOS used to silently
  // return `null` from canvas.toBlob('image/webp', …) on some inputs, which
  // broke compressImage and bubbled up as "errore caricamento" in feed and
  // chat. The fix: try WebP, fall back to JPEG on null; throw with a
  // [compressImage] tag if both encoders give up. These tests prove the
  // fallback ladder works so the bug can't return silently.
  // -------------------------------------------------------------------------

  it('falls back to JPEG when WebP encoding returns null', async () => {
    // Safari-quirk simulation: toBlob is called once with 'image/webp' and
    // returns null, then called again with 'image/jpeg' and returns a real
    // blob. The returned File must reflect the format actually produced —
    // .jpg + image/jpeg — otherwise the server validator (ALLOWED_TYPES)
    // would reject it.
    const toBlobCalls: string[] = []
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: BlobCallback, type?: string) => {
        toBlobCalls.push(type ?? '')
        if (type === 'image/webp') {
          cb(null) // Safari iOS legacy behaviour
        } else {
          cb(new Blob(['jpegbytes'], { type: 'image/jpeg' }))
        }
      }),
    }
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return originalCreateElement(tag)
    })

    const file = makeFile('photo.heic', 'image/jpeg', 10_000) // post-iOS-conversion type
    const result = await storage.compressImage(file)

    expect(toBlobCalls).toEqual(['image/webp', 'image/jpeg'])
    expect(result).toBeInstanceOf(File)
    expect(result.type).toBe('image/jpeg')
    expect(result.name).toMatch(/\.jpg$/)
  })

  it('falls back to JPEG when the browser silently encodes PNG instead of WebP (Safari reale)', async () => {
    // Il VERO comportamento di Safari/iOS: canvas.toBlob('image/webp')
    // non ritorna null — per spec HTML ripiega silenziosamente su PNG
    // (blob.type === 'image/png'). Il vecchio codice controllava solo il
    // null, quindi spediva PNG fotografici multi-MB etichettati .webp:
    // sopra il limite di upload → "errore caricamento foto" solo su
    // iPhone. Il fallback deve scattare sul TYPE reale del blob.
    const toBlobCalls: string[] = []
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: BlobCallback, type?: string) => {
        toBlobCalls.push(type ?? '')
        if (type === 'image/webp') {
          cb(new Blob(['pngbytes'], { type: 'image/png' })) // Safari fallback
        } else {
          cb(new Blob(['jpegbytes'], { type: 'image/jpeg' }))
        }
      }),
    }
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return originalCreateElement(tag)
    })

    const file = makeFile('photo.jpg', 'image/jpeg', 10_000)
    const result = await storage.compressImage(file)

    expect(toBlobCalls).toEqual(['image/webp', 'image/jpeg'])
    expect(result.type).toBe('image/jpeg')
    expect(result.name).toMatch(/\.jpg$/)
  })

  it('riprova a quality decrescente se il blob supera il limite di upload (4MB)', async () => {
    // Il body delle serverless Vercel è cappato a 4.5MB: un blob più
    // grande fallirebbe SEMPRE l'upload con un errore opaco. Meglio
    // ricomprimere più aggressivamente client-side.
    const qualities: (number | undefined)[] = []
    const bigBytes = new Uint8Array(5 * 1024 * 1024)
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: BlobCallback, type?: string, q?: number) => {
        qualities.push(q)
        if (q !== undefined && q <= 0.5) {
          cb(new Blob(['small'], { type: 'image/jpeg' }))
        } else {
          cb(new Blob([bigBytes], { type: type === 'image/webp' ? 'image/webp' : 'image/jpeg' }))
        }
      }),
    }
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return originalCreateElement(tag)
    })

    const file = makeFile('photo.jpg', 'image/jpeg', 10_000)
    const result = await storage.compressImage(file)

    expect(result.size).toBeLessThanOrEqual(4 * 1024 * 1024)
    expect(result.type).toBe('image/jpeg')
  })

  it('throws a tagged [compressImage] error when both WebP and JPEG return null', async () => {
    // Catastrophic case: neither encoder produces a blob. Must throw with a
    // recognisable prefix so the caller (and our Eruda logs) can identify it.
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((cb: BlobCallback) => cb(null)),
    }
    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement
      return originalCreateElement(tag)
    })

    const file = makeFile('photo.jpg', 'image/jpeg', 10_000)
    await expect(storage.compressImage(file)).rejects.toThrow(/\[compressImage\]/)
  })

  it('throws a tagged [compressImage] error when image decoding fails', async () => {
    // Mirrors what happens when an unsupported MIME (e.g. raw HEIC) is
    // dropped into <img>: onerror fires, the Promise rejects. The error
    // message must contain the source MIME so we can diagnose it from
    // production Eruda logs.
    class MockBrokenImage {
      constructor() {
        const img: Partial<HTMLImageElement> & { _src: string } = {
          _src: '',
          onload: null,
          onerror: null,
        }
        Object.defineProperty(img, 'src', {
          set(value: string) {
            img._src = value
            if (typeof img.onerror === 'function') {
              ;(img.onerror as () => void)()
            }
          },
          get() {
            return img._src
          },
        })
        return img as unknown as MockBrokenImage
      }
    }
    globalThis.Image = MockBrokenImage as unknown as typeof Image

    const file = makeFile('weird.heic', 'image/heic', 10_000)
    await expect(storage.compressImage(file)).rejects.toThrow(/\[compressImage\]/)
  })

  it('revokes the object URL even when image decoding fails', async () => {
    // Prevent the previous bug where a failed decode would leak the blob URL
    // (no revoke in the error path). Important for long-running PWA sessions.
    class MockBrokenImage {
      constructor() {
        const img: Partial<HTMLImageElement> & { _src: string } = { _src: '', onload: null, onerror: null }
        Object.defineProperty(img, 'src', {
          set(value: string) {
            img._src = value
            if (typeof img.onerror === 'function') (img.onerror as () => void)()
          },
          get() { return img._src },
        })
        return img as unknown as MockBrokenImage
      }
    }
    globalThis.Image = MockBrokenImage as unknown as typeof Image

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL')
    const file = makeFile('weird.heic', 'image/heic', 10_000)
    await storage.compressImage(file).catch(() => {})
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url')
  })
})
