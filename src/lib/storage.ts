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
 * Scales down to maxWidth if necessary, then encodes as WebP.
 * Must only be called in browser environments.
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8
): Promise<File> {
  const objectUrl = URL.createObjectURL(file)

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = (err) => {
      URL.revokeObjectURL(objectUrl)
      reject(err)
    }
    image.src = objectUrl
  })

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

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b)
        } else {
          reject(new Error('Canvas toBlob failed'))
        }
      },
      'image/webp',
      quality
    )
  })

  const newName = file.name.replace(/\.[^.]+$/, '.webp')

  return new File([blob], newName, { type: 'image/webp' })
}
