import { toPublicMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import {
  Member,
  PostWithDetails,
  PostReactionWithMember,
  PostPollOption,
  PostPollWithResults,
} from '@/types/database'

/**
 * Build the full {@link PostWithDetails} payload for a single post row.
 * Shared between the feed list endpoint, the single-post endpoint and the
 * create-post endpoint so they all return the exact same shape.
 *
 * The `member` argument is the current authenticated user — used to set
 * `liked_by_me` and `voted_by_me` so the client doesn't have to do a second pass.
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

  const [
    authorResult,
    imagesResult,
    likesResult,
    commentsResult,
    reactionsResult,
    pollResult,
    bookmarkResult,
  ] = await Promise.all([
    db.from('members').select('*').eq('id', post.author_id).single(),
    db.from('post_images').select('*').eq('post_id', post.id).order('sort_order', { ascending: true }),
    db.from('post_likes').select('*').eq('post_id', post.id),
    db.from('post_comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
    db.from('post_reactions').select('*, members(*)').eq('post_id', post.id),
    db
      .from('post_polls')
      .select('*, options:post_poll_options(*), votes:post_poll_votes(option_id, member_id)')
      .eq('post_id', post.id)
      .maybeSingle(),
    // Bookmark privato del viewing member su questo post. La tabella
    // post_bookmarks ha RLS abilitata senza policy SELECT pubblica
    // (vedi migration 012): nessuno vede i bookmark degli altri, e
    // questa stessa lookup ritorna sempre solo le righe di `member.id`
    // perché passa dalle API server-side con service_role.
    db
      .from('post_bookmarks')
      .select('id')
      .eq('post_id', post.id)
      .eq('member_id', member.id)
      .maybeSingle(),
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

  const poll = buildPoll(pollResult.data, member.id)

  return {
    ...post,
    post_type: post.post_type as 'normal' | 'recipe' | 'story',
    author: author!,
    images,
    likes,
    comments_count,
    liked_by_me: likes.some((l) => l.member_id === member.id),
    bookmarked_by_me: !!bookmarkResult.data,
    reactions,
    poll,
  }
}

type RawPoll = {
  id: string
  post_id: string
  question: string
  multi_choice: boolean
  closes_at: string | null
  created_at: string
  options: PostPollOption[] | null
  votes: { option_id: string; member_id: string }[] | null
}

function buildPoll(raw: RawPoll | null, memberId: string): PostPollWithResults | null {
  if (!raw) return null

  const votes = raw.votes ?? []
  const optionsWithResults = (raw.options ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((opt) => {
      const votesForOption = votes.filter((v) => v.option_id === opt.id)
      return {
        ...opt,
        vote_count: votesForOption.length,
        voted_by_me: votesForOption.some((v) => v.member_id === memberId),
      }
    })

  return {
    id: raw.id,
    post_id: raw.post_id,
    question: raw.question,
    multi_choice: raw.multi_choice,
    closes_at: raw.closes_at,
    created_at: raw.created_at,
    options: optionsWithResults,
    total_votes: votes.length,
    is_closed: raw.closes_at !== null && new Date(raw.closes_at).getTime() < Date.now(),
  }
}
