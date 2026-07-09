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

  // Try WebP, fall back to JPEG. ATTENZIONE Safari/iOS: quando il browser
  // non sa encodare il MIME richiesto, per spec HTML canvas.toBlob NON
  // ritorna null — ritorna silenziosamente un PNG (blob.type =
  // 'image/png'). Su iPhone questo produceva PNG fotografici da 4-8MB
  // etichettati come .webp: sopra il limite body di Vercel (4.5MB) e del
  // server (5MB) → "errore caricamento foto" solo su iOS. Quindi il
  // fallback va deciso sul type REALE del blob, mai sul null.
  const tryEncode = (mime: 'image/webp' | 'image/jpeg', q: number) =>
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, q)
    })

  let blob: Blob | null = await tryEncode('image/webp', quality)
  if (!blob || blob.type !== 'image/webp') {
    blob = await tryEncode('image/jpeg', quality)
    if (blob && blob.type !== 'image/jpeg') blob = null
  }

  // Rete di sicurezza sulla dimensione: il body delle serverless Vercel è
  // cappato a 4.5MB, quindi il file DEVE stare sotto ~4MB. Foto molto
  // dettagliate a quality 0.8 possono sforare: riproviamo in JPEG a
  // quality decrescente prima di arrenderci.
  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
  for (const q of [0.7, 0.5, 0.35]) {
    if (blob && blob.size <= MAX_UPLOAD_BYTES) break
    const retry = await tryEncode('image/jpeg', q)
    if (retry && retry.type === 'image/jpeg') blob = retry
  }

  if (!blob) {
    throw new Error('[compressImage] canvas.toBlob returned no usable blob (webp+jpeg)')
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`[compressImage] compressed image still too large (${blob.size} bytes)`)
  }

  const extension = blob.type === 'image/webp' ? '.webp' : '.jpg'
  const newName = file.name.replace(/\.[^.]+$/, '') + extension
  return new File([blob], newName, { type: blob.type })
}
