import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/posts/:id/bookmark → ApiResponse<{ bookmarked: boolean }>
 *
 * Toggle del bookmark privato dell'utente corrente sul post.
 * Idempotent: se la riga esiste la cancelliamo (200, bookmarked=false),
 * altrimenti la inseriamo (201, bookmarked=true). Senza intermediate
 * state.
 *
 * Privacy: nessun altro membro può sapere che hai salvato questo post.
 * La tabella `post_bookmarks` ha RLS abilitata senza policy SELECT
 * pubblica (vedi migration 012). Tutta la lettura/scrittura passa da
 * qui con service_role e filtra per `auth.id`.
 *
 * Pattern allineato a `POST /api/posts/:id/like`.
 */
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { id: post_id } = await params
  const db = createServerClient()

  const { data: existing, error: fetchError } = await db
    .from('post_bookmarks')
    .select('id')
    .eq('post_id', post_id)
    .eq('member_id', member.id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json(
      { data: null, error: fetchError.message },
      { status: 500 },
    )
  }

  if (existing) {
    const { error: deleteError } = await db
      .from('post_bookmarks')
      .delete()
      .eq('id', existing.id)

    if (deleteError) {
      return NextResponse.json(
        { data: null, error: deleteError.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ data: { bookmarked: false }, error: null })
  }

  const { error: insertError } = await db.from('post_bookmarks').insert({
    post_id,
    member_id: member.id,
  })

  if (insertError) {
    return NextResponse.json(
      { data: null, error: insertError.message },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { data: { bookmarked: true }, error: null },
    { status: 201 },
  )
}
