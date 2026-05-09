import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { uploadImage } from '@/lib/storage'
import { randomUUID } from 'crypto'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/albums/:id/photos → ApiResponse<AlbumPhoto[]>
// Returns photos for the album ordered by created_at
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id: albumId } = await params
  const db = createServerClient()

  const { data: photos, error } = await db
    .from('album_photos')
    .select('*')
    .eq('album_id', albumId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: photos ?? [], error: null })
}

// POST /api/albums/:id/photos (FormData: image, caption?) → 201 ApiResponse<AlbumPhoto>
// Uploads image to storage, inserts photo record, updates cover if first photo
export async function POST(req: NextRequest, { params }: RouteContext) {
  let member
  try {
    member = await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id: albumId } = await params

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ data: null, error: 'FormData non valido' }, { status: 400 })
  }

  const file = formData.get('image') as File | null
  if (!file || typeof file === 'string') {
    return NextResponse.json({ data: null, error: 'Immagine obbligatoria' }, { status: 400 })
  }

  const caption = (formData.get('caption') as string | null) ?? null

  const storagePath = `${albumId}/${randomUUID()}`

  let url: string
  try {
    url = await uploadImage('albums', file, storagePath)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload fallito'
    return NextResponse.json({ data: null, error: message }, { status: 400 })
  }

  const db = createServerClient()

  const { data: photo, error } = await db
    .from('album_photos')
    .insert({
      album_id: albumId,
      url,
      storage_path: storagePath,
      caption,
      uploaded_by: member.id,
    })
    .select('*')
    .single()

  if (error || !photo) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Inserimento fallito' }, { status: 500 })
  }

  // If this is the first photo, set it as album cover
  const { count } = await db
    .from('album_photos')
    .select('id', { count: 'exact', head: true })
    .eq('album_id', albumId)

  if (count === 1) {
    await db.from('albums').update({ cover_url: url }).eq('id', albumId)
  }

  return NextResponse.json({ data: photo, error: null }, { status: 201 })
}
