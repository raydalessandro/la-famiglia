import { createServerClient } from './supabase/client'

// Constants
export const BUCKETS = {
  avatars: 'avatars',
  posts: 'posts',
  albums: 'albums',
  chat: 'chat',
} as const

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type Bucket = 'avatars' | 'posts' | 'albums' | 'chat'

/**
 * Uploads an image file to the specified Supabase storage bucket.
 * Validates file size and type before uploading.
 * Returns the public URL of the uploaded file.
 */
export async function uploadImage(
  bucket: Bucket,
  file: File,
  path: string
): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('File troppo grande. La dimensione massima consentita è 5MB.')
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Tipo file non supportato. Sono consentiti solo JPEG, PNG e WebP.')
  }

  const supabase = createServerClient()

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
  })

  if (error) {
    throw error
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)

  return data.publicUrl
}

/**
 * Deletes an image from the specified Supabase storage bucket.
 * Logs errors but does not throw.
 */
export async function deleteImage(bucket: Bucket, path: string): Promise<void> {
  const supabase = createServerClient()

  const { error } = await supabase.storage.from(bucket).remove([path])

  if (error) {
    console.error('Error deleting image from storage:', error)
  }
}

/**
 * Constructs the public URL for an image in the specified bucket.
 * Pure string construction — no Supabase client needed.
 */
export function getImageUrl(bucket: Bucket, path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Compresses an image file client-side using the Canvas API.
 *
 * Tries WebP first (smaller, supported by Chromium / Firefox / Safari
 * 14+) and falls back to JPEG if the browser can't encode WebP — older
 * iOS Safari returns `null` from `canvas.toBlob('image/webp', ...)`
 * instead of throwing, which used to break the entire upload pipeline.
 *
 * Errors are surfaced via thrown exceptions with a tag prefix so the
 * caller can decide whether to retry, fall back, or show a user-facing
 * message. When debugging via Eruda on iPhone, look for `[compressImage]`
 * in the console.
 *
 * Must only be called in browser environments.
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8
): Promise<File> {
  const objectUrl = URL.createObjectURL(file)

  let img: HTMLImageElement
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () =>
        reject(new Error(`[compressImage] decode failed for ${file.type || 'unknown type'}`))
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  let width: number
  let height: number

  if (img.naturalWidth <= maxWidth) {
    width = img.naturalWidth
    height = img.naturalHeight
  } else {
    width = maxWidth
    height = Math.round((img.naturalHeight * maxWidth) / img.naturalWidth)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('[compressImage] 2D context unavailable')
  }
  ctx.drawImage(img, 0, 0, width, height)

  // Try WebP, fall back to JPEG. We don't rely on feature detection
  // because Safari iOS historically *claimed* to support WebP encoding
  // and then quietly returned `null`. Safer to try and fall back on the
  // actual call.
  const tryEncode = (mime: 'image/webp' | 'image/jpeg') =>
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, quality)
    })

  let blob: Blob | null = await tryEncode('image/webp')
  let chosenMime: 'image/webp' | 'image/jpeg' = 'image/webp'
  if (!blob) {
    blob = await tryEncode('image/jpeg')
    chosenMime = 'image/jpeg'
  }

  if (!blob) {
    throw new Error('[compressImage] canvas.toBlob returned null for both webp and jpeg')
  }

  const extension = chosenMime === 'image/webp' ? '.webp' : '.jpg'
  const newName = file.name.replace(/\.[^.]+$/, extension)
  return new File([blob], newName, { type: chosenMime })
}
