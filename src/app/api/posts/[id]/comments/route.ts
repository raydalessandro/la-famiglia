import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, toPublicMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { notifyMembers } from '@/lib/notifications'
import { Member, PostCommentWithAuthor } from '@/types/database'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/posts/:id/comments → ApiResponse<PostCommentWithAuthor[]>
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id: post_id } = await params

  const db = createServerClient()

  const { data: comments, error } = await db
    .from('post_comments')
    .select('*, members(*)')
    .eq('post_id', post_id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 })
  }

  const result: PostCommentWithAuthor[] = (comments ?? []).map((c) => {
    const { members: rawMember, ...comment } = c as typeof c & { members: unknown }
    return {
      ...comment,
      author: toPublicMember(rawMember as Member),
    }
  })

  return NextResponse.json({ data: result, error: null })
}

// POST /api/posts/:id/comments { text } → 201 ApiResponse<PostCommentWithAuthor>
// EFFECT: notify post author if commenter != author
export async function POST(req: NextRequest, { params }: RouteContext) {
  let member: Member
  try {
    member = await requireAuth()
  } catch (response) {
    return response as Response
  }

  const { id: post_id } = await params

  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const text = body.text?.trim() ?? ''
  if (!text) {
    return NextResponse.json({ data: null, error: 'Il testo è obbligatorio' }, { status: 400 })
  }

  const db = createServerClient()

  // Fetch the post to get its author_id
  const { data: post, error: postError } = await db
    .from('posts')
    .select('author_id')
    .eq('id', post_id)
    .single()

  if (postError || !post) {
    return NextResponse.json({ data: null, error: 'Post non trovato' }, { status: 404 })
  }

  // Insert comment
  const { data: comment, error: insertError } = await db
    .from('post_comments')
    .insert({
      post_id,
      author_id: member.id,
      text,
    })
    .select('*')
    .single()

  if (insertError || !comment) {
    return NextResponse.json(
      { data: null, error: insertError?.message ?? 'Errore creazione commento' },
      { status: 500 }
    )
  }

  // Fetch comment with author join
  const { data: commentWithAuthor, error: fetchError } = await db
    .from('post_comments')
    .select('*, members(*)')
    .eq('id', comment.id)
    .single()

  if (fetchError || !commentWithAuthor) {
    return NextResponse.json(
      { data: null, error: fetchError?.message ?? 'Errore recupero commento' },
      { status: 500 }
    )
  }

  const { members: rawMember, ...commentData } = commentWithAuthor as typeof commentWithAuthor & { members: unknown }

  const result: PostCommentWithAuthor = {
    ...commentData,
    author: toPublicMember(rawMember as Member),
  }

  // Notify post author if commenter is a different person
  if (post.author_id !== member.id) {
    notifyMembers(
      [post.author_id],
      'new_comment',
      'Nuovo commento',
      `${member.name} ha commentato il tuo post`,
      `/posts/${post_id}`
    ).catch((err) => console.error('notifyMembers failed:', err))
  }

  return NextResponse.json({ data: result, error: null }, { status: 201 })
}
