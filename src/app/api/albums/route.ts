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

  const enriched = await Promise.all(
    (albums ?? []).map(async (album) => {
      const { count } = await db
        .from('album_photos')
        .select('id', { count: 'exact', head: true })
        .eq('album_id', album.id)
      return { ...album, photo_count: count ?? 0 }
    })
  )

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
