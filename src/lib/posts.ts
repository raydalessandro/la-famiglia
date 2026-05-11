import { toPublicMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { Member, PostWithDetails, PostReactionWithMember } from '@/types/database'

/**
 * Build the full {@link PostWithDetails} payload for a single post row.
 * Shared between the feed list endpoint, the single-post endpoint and the
 * create-post endpoint so they all return the exact same shape.
 *
 * The `member` argument is the current authenticated user — used to set
 * `liked_by_me` so the client doesn't have to do a second pass.
 */
export async function buildPostWithDetails(
  post: {
    id: string
    author_id: string
    text: string
    post_type: string
    created_at: string
    updated_at: string
  },
  member: Member,
): Promise<PostWithDetails> {
  const db = createServerClient()

  const [authorResult, imagesResult, likesResult, commentsResult, reactionsResult] = await Promise.all([
    db.from('members').select('*').eq('id', post.author_id).single(),
    db.from('post_images').select('*').eq('post_id', post.id).order('sort_order', { ascending: true }),
    db.from('post_likes').select('*').eq('post_id', post.id),
    db.from('post_comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
    db.from('post_reactions').select('*, members(*)').eq('post_id', post.id),
  ])

  const author = authorResult.data ? toPublicMember(authorResult.data as unknown as Member) : null
  const images = imagesResult.data ?? []
  const likes = likesResult.data ?? []
  const comments_count = commentsResult.count ?? 0

  const reactions: PostReactionWithMember[] = (reactionsResult.data ?? []).map((r) => {
    const { members: rawMember, ...reaction } = r as typeof r & { members: unknown }
    return {
      ...reaction,
      member: toPublicMember(rawMember as Member),
    }
  })

  return {
    ...post,
    post_type: post.post_type as 'normal' | 'recipe' | 'story',
    author: author!,
    images,
    likes,
    comments_count,
    liked_by_me: likes.some((l) => l.member_id === member.id),
    reactions,
  }
}
