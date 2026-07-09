import { toPublicMember } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import {
  Member,
  MemberPublic,
  PostWithDetails,
  PostReactionWithMember,
  PostPollOption,
  PostPollWithResults,
} from '@/types/database'

type PostRow = {
  id: string
  author_id: string
  text: string
  post_type: string
  created_at: string
  updated_at: string
}

/**
 * Build the full {@link PostWithDetails} payload for a BATCH of post rows
 * with un numero di query costante (~7), indipendente dal numero di post.
 *
 * Prima di questo refactor il feed chiamava `buildPostWithDetails` per
 * ogni post: 7 query × 10 post + count + data ≈ 72 round-trip
 * Vercel↔Supabase per UNA pagina di feed — la causa principale della
 * lentezza percepita. Ora: una query per tabella con `.in('post_id', ids)`
 * e assemblaggio in memoria.
 *
 * The `member` argument is the current authenticated user — used to set
 * `liked_by_me`, `bookmarked_by_me` and `voted_by_me` so the client
 * doesn't have to do a second pass.
 *
 * L'ordine dei post in output rispecchia l'ordine in input.
 */
export async function buildPostsWithDetails(
  posts: PostRow[],
  member: Member,
): Promise<PostWithDetails[]> {
  if (posts.length === 0) return []

  const db = createServerClient()
  const postIds = posts.map((p) => p.id)
  const authorIds = Array.from(new Set(posts.map((p) => p.author_id)))

  const [
    authorsResult,
    imagesResult,
    likesResult,
    commentsResult,
    reactionsResult,
    pollsResult,
    bookmarksResult,
  ] = await Promise.all([
    db.from('members').select('*').in('id', authorIds),
    db
      .from('post_images')
      .select('*')
      .in('post_id', postIds)
      .order('sort_order', { ascending: true }),
    db.from('post_likes').select('*').in('post_id', postIds),
    // PostgREST non fa GROUP BY: selezioniamo solo post_id (payload
    // leggero) e contiamo in JS. I commenti di una famiglia sono
    // nell'ordine delle decine per post, non un problema.
    db.from('post_comments').select('post_id').in('post_id', postIds),
    db.from('post_reactions').select('*, members(*)').in('post_id', postIds),
    db
      .from('post_polls')
      .select('*, options:post_poll_options(*), votes:post_poll_votes(option_id, member_id)')
      .in('post_id', postIds),
    // Bookmark privati del viewing member su questi post. La tabella
    // post_bookmarks ha RLS abilitata senza policy SELECT pubblica
    // (vedi migration 012): nessuno vede i bookmark degli altri, e
    // questa lookup ritorna solo le righe di `member.id` perché passa
    // dalle API server-side con service_role.
    db
      .from('post_bookmarks')
      .select('post_id')
      .in('post_id', postIds)
      .eq('member_id', member.id),
  ])

  // Indici per post_id — un solo passaggio per tabella.
  const authorsById = new Map<string, MemberPublic>()
  for (const raw of authorsResult.data ?? []) {
    const m = raw as unknown as Member
    authorsById.set(m.id, toPublicMember(m))
  }

  const imagesByPost = groupBy(imagesResult.data ?? [], (i) => i.post_id as string)
  const likesByPost = groupBy(likesResult.data ?? [], (l) => l.post_id as string)

  const commentCounts = new Map<string, number>()
  for (const c of (commentsResult.data ?? []) as { post_id: string }[]) {
    commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1)
  }

  const reactionsByPost = new Map<string, PostReactionWithMember[]>()
  for (const r of reactionsResult.data ?? []) {
    const { members: rawMember, ...reaction } = r as typeof r & { members: unknown }
    const shaped = {
      ...reaction,
      member: toPublicMember(rawMember as Member),
    } as PostReactionWithMember
    const list = reactionsByPost.get(shaped.post_id)
    if (list) list.push(shaped)
    else reactionsByPost.set(shaped.post_id, [shaped])
  }

  const pollByPost = new Map<string, RawPoll>()
  for (const p of (pollsResult.data ?? []) as unknown as RawPoll[]) {
    pollByPost.set(p.post_id, p)
  }

  const bookmarkedPostIds = new Set(
    ((bookmarksResult.data ?? []) as { post_id: string }[]).map((b) => b.post_id),
  )

  return posts.map((post) => {
    const likes = likesByPost.get(post.id) ?? []
    return {
      ...post,
      post_type: post.post_type as 'normal' | 'recipe' | 'story',
      author: authorsById.get(post.author_id) ?? null!,
      images: imagesByPost.get(post.id) ?? [],
      likes,
      comments_count: commentCounts.get(post.id) ?? 0,
      liked_by_me: likes.some((l) => l.member_id === member.id),
      bookmarked_by_me: bookmarkedPostIds.has(post.id),
      reactions: reactionsByPost.get(post.id) ?? [],
      poll: buildPoll(pollByPost.get(post.id) ?? null, member.id),
    }
  })
}

/**
 * Variante single-post: wrapper sulla batch con array di 1. Stessa shape
 * ovunque (feed list, post singolo, create). Aggiungi campi nuovi al
 * post in `buildPostsWithDetails`.
 */
export async function buildPostWithDetails(
  post: PostRow,
  member: Member,
): Promise<PostWithDetails> {
  const [detailed] = await buildPostsWithDetails([post], member)
  return detailed
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
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
