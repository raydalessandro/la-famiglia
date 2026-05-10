import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { deleteImage } from '@/lib/storage'

type RouteContext = { params: Promise<{ id: string }> }

// DELETE /api/posts/:id → ApiResponse<null> (author or admin only)
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const member = await requireAuth()

  if (member instanceof NextResponse) return member

  const { id } = await params

  const db = createServerClient()

  // Fetch post
  const { data: post, error: postError } = await db
    .from('posts')
    .select('*')
    .eq('id', id)
    .single()

  if (postError || !post) {
    return NextResponse.json({ data: null, error: 'Post non trovato' }, { status: 404 })
  }

  // Check authorization: must be author or admin
  if (post.author_id !== member.id && !member.is_admin) {
    return NextResponse.json({ data: null, error: 'Accesso negato' }, { status: 403 })
  }

  // Fetch post images for storage cleanup
  const { data: images } = await db
    .from('post_images')
    .select('*')
    .eq('post_id', id)

  // Delete images from storage
  if (images && images.length > 0) {
    await Promise.allSettled(
      images.map((img) => {
        // Extract the path from the URL: everything after /posts/
        const url: string = img.image_url
        const marker = '/posts/'
        const markerIndex = url.indexOf(marker)
        if (markerIndex !== -1) {
          const path = url.slice(markerIndex + marker.length)
          return deleteImage('posts', path)
        }
        return Promise.resolve()
      })
    )
  }

  // Delete post (cascade handles post_images, post_likes, post_comments)
  const { error: deleteError } = await db.from('posts').delete().eq('id', id)

  if (deleteError) {
    return NextResponse.json({ data: null, error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ data: null, error: null })
}
