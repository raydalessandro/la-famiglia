import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { deleteImage } from '@/lib/storage'

type RouteContext = { params: Promise<{ id: string }> }

// DELETE /api/albums/:id → ApiResponse<null>
// Fetches all photos, deletes their images from storage, then deletes the album (cascade)
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id } = await params
  const db = createServerClient()

  // Fetch all photos so we can delete their storage objects
  const { data: photos, error: photosError } = await db
    .from('album_photos')
    .select('storage_path')
    .eq('album_id', id)

  if (photosError) {
    return NextResponse.json({ data: null, error: photosError.message }, { status: 500 })
  }

  // Delete each image from storage (best-effort)
  await Promise.allSettled(
    (photos ?? []).map((photo: { storage_path: string }) =>
      deleteImage('albums', photo.storage_path)
    )
  )

  // Delete the album (cascades to album_photos in DB)
  const { error } = await db.from('albums').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
