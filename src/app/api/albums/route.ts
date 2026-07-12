import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

// GET /api/albums → ApiResponse<Album[]>
// Returns albums with photo_count and creator info
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()

  if (auth instanceof NextResponse) return auth

  const db = createServerClient()

  const { data: albums, error } = await db
    .from('albums')
    .select('*, creator:members(id, name, avatar_emoji, color)')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  // Batch anti-N+1 (Affinamento A6.4): prima 1 count query PER album.
  // PostgREST non fa GROUP BY → una sola select leggera di album_id e
  // conteggio in JS, come comments_count in buildPostsWithDetails.
  const albumIds = (albums ?? []).map((a) => a.id)
  const photoCounts = new Map<string, number>()
  if (albumIds.length > 0) {
    const { data: photoRows, error: photosError } = await db
      .from('album_photos')
      .select('album_id')
      .in('album_id', albumIds)
    if (photosError) {
      return NextResponse.json({ data: null, error: photosError.message }, { status: 500 })
    }
    for (const row of (photoRows ?? []) as { album_id: string }[]) {
      photoCounts.set(row.album_id, (photoCounts.get(row.album_id) ?? 0) + 1)
    }
  }

  const enriched = (albums ?? []).map((album) => ({
    ...album,
    photo_count: photoCounts.get(album.id) ?? 0,
  }))

  return NextResponse.json({ data: enriched, error: null })
}

// POST /api/albums → 201 ApiResponse<Album>
// Body: { name }
export async function POST(req: NextRequest) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  let body: { name: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const { name } = body
  if (!name || name.trim() === '') {
    return NextResponse.json({ data: null, error: 'Il nome è obbligatorio' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: album, error } = await db
    .from('albums')
    .insert({ name: name.trim(), created_by: member.id })
    .select('*')
    .single()

  if (error || !album) {
    return NextResponse.json({ data: null, error: error?.message ?? 'Creazione fallita' }, { status: 500 })
  }

  return NextResponse.json({ data: album, error: null }, { status: 201 })
}
