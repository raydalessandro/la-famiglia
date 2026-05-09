import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { Member } from '@/types/database'

type RouteContext = { params: Promise<{ id: string }> }

// POST /api/posts/:id/like → ApiResponse<{ liked: boolean }> (toggle)
export async function POST(_req: NextRequest, { params }: RouteContext) {
  let member: Member
  try {
    member = await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id: post_id } = await params

  const db = createServerClient()

  // Check if like already exists
  const { data: existingLike, error: fetchError } = await db
    .from('post_likes')
    .select('id')
    .eq('post_id', post_id)
    .eq('member_id', member.id)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = no rows found — not an error in our case
    return NextResponse.json({ data: null, error: fetchError.message }, { status: 500 })
  }

  if (existingLike) {
    // Unlike: remove the existing like
    const { error: deleteError } = await db
      .from('post_likes')
      .delete()
      .eq('id', existingLike.id)

    if (deleteError) {
      return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ data: { liked: false }, error: null })
  }

  // Like: insert new like
  const { error: insertError } = await db.from('post_likes').insert({
    post_id,
    member_id: member.id,
  })

  if (insertError) {
    return NextResponse.json({ data: null, error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { liked: true }, error: null })
}
