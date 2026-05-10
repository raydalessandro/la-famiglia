import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { deleteImage } from '@/lib/storage'

type RouteContext = { params: Promise<{ id: string; photoId: string }> }

// DELETE /api/albums/:id/photos/:photoId → ApiResponse<null>
// Deletes image from storage, removes DB record, updates cover if needed
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()

  if (auth instanceof NextResponse) return auth

  const { id: albumId, photoId } = await params
  const db = createServerClient()

  // Fetch the photo to get storage path and url
  const { data: photo, error: fetchError } = await db
    .from('album_photos')
    .select('*')
    .eq('id', photoId)
    .eq('album_id', albumId)
    .single()

  if (fetchError || !photo) {
    return NextResponse.json({ data: null, error: 'Foto non trovata' }, { status: 404 })
  }

  // Delete from storage
  await deleteImage('albums', photo.storage_path)

  // Delete from DB
  const { error: deleteError } = await db.from('album_photos').delete().eq('id', photoId)

  if (deleteError) {
    return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
  }

  // Check if deleted photo was the cover; if so, update with the next photo
  const { data: album } = await db.from('albums').select('cover_url').eq('id', albumId).single()

  if (album?.cover_url === photo.url) {
    const { data: remaining } = await db
      .from('album_photos')
      .select('url')
      .eq('album_id', albumId)
      .order('created_at', { ascending: true })
      .limit(1)

    const newCover = remaining?.[0]?.url ?? null
    await db.from('albums').update({ cover_url: newCover }).eq('id', albumId)
  }

  return NextResponse.json({ data: null, error: null })
}
