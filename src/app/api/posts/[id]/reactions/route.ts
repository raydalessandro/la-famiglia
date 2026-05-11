import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'
import { REACTION_EMOJIS, ReactionEmoji } from '@/types/database'

type RouteContext = { params: Promise<{ id: string }> }

const ALLOWED = new Set<string>(REACTION_EMOJIS as readonly string[])

function isAllowedEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === 'string' && ALLOWED.has(value)
}

// POST /api/posts/:id/reactions { emoji } → 201 created or 200 idempotent
// EFFECT: notify post author if reactor is a different member
export async function POST(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { id: post_id } = await params

  let body: { emoji?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const emoji = body.emoji
  if (!emoji) {
    return NextResponse.json({ data: null, error: 'Emoji obbligatorio' }, { status: 400 })
  }
  if (!isAllowedEmoji(emoji)) {
    return NextResponse.json(
      { data: null, error: 'Emoji non permesso' },
      { status: 400 },
    )
  }

  const db = createServerClient()

  const { data: post, error: postError } = await db
    .from('posts')
    .select('id, author_id')
    .eq('id', post_id)
    .single()

  if (postError || !post) {
    return NextResponse.json({ data: null, error: 'Post non trovato' }, { status: 404 })
  }

  // Idempotent POST: same (post, member, emoji) returns the existing row.
  const { data: existing } = await db
    .from('post_reactions')
    .select('*')
    .eq('post_id', post_id)
    .eq('member_id', member.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ data: { reaction: existing }, error: null }, { status: 200 })
  }

  const { data: reaction, error: insertError } = await db
    .from('post_reactions')
    .insert({ post_id, member_id: member.id, emoji })
    .select('*')
    .single()

  if (insertError || !reaction) {
    return NextResponse.json(
      { data: null, error: insertError?.message ?? 'Errore creazione reazione' },
      { status: 500 },
    )
  }

  if (post.author_id !== member.id) {
    notifyMembers(
      [post.author_id],
      'new_reaction',
      'Nuova reazione',
      `${member.name} ha reagito ${emoji} al tuo post`,
      `/posts/${post_id}`,
    ).catch((err) => console.error('notifyMembers failed:', err))
  }

  return NextResponse.json({ data: { reaction }, error: null }, { status: 201 })
}

// DELETE /api/posts/:id/reactions?emoji=... → 200 { removed: boolean }
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { id: post_id } = await params

  const { searchParams } = new URL(req.url)
  const emoji = searchParams.get('emoji')

  if (!emoji) {
    return NextResponse.json({ data: null, error: 'Emoji obbligatorio' }, { status: 400 })
  }
  if (!isAllowedEmoji(emoji)) {
    return NextResponse.json({ data: null, error: 'Emoji non permesso' }, { status: 400 })
  }

  const db = createServerClient()

  const { count, error: deleteError } = await db
    .from('post_reactions')
    .delete({ count: 'exact' })
    .eq('post_id', post_id)
    .eq('member_id', member.id)
    .eq('emoji', emoji)

  if (deleteError) {
    return NextResponse.json(
      { data: null, error: deleteError.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ data: { removed: (count ?? 0) > 0 }, error: null })
}
