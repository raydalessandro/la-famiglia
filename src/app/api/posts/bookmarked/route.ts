import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'
import { buildPostWithDetails } from '@/lib/posts'

/**
 * GET /api/posts/bookmarked?page=1&per_page=10 → PaginatedResponse<PostWithDetails>
 *
 * Lista dei post salvati (bookmarked) dall'utente corrente, ordinati
 * per data del bookmark (più recente prima — quando hai salvato, non
 * quando il post è stato pubblicato). Stessa shape `PaginatedResponse`
 * di `GET /api/posts` così la pagina `/saved` può riusare i componenti
 * del feed senza adattatori.
 *
 * Privacy: filtra rigorosamente per `member.id`. Non esiste un modo per
 * un utente di vedere i bookmark di un altro tramite questo endpoint
 * (anche admin: i bookmark sono privati per disegno di prodotto).
 */
export async function GET(req: NextRequest) {
  const member = await requireAuth()
  if (member instanceof NextResponse) return member

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const per_page = Math.max(1, parseInt(searchParams.get('per_page') ?? '10', 10))

  const db = createServerClient()

  // Count totale dei bookmark dell'utente. Usato per `has_more` + `total`.
  const { count, error: countError } = await db
    .from('post_bookmarks')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', member.id)

  if (countError) {
    return NextResponse.json(
      { data: [], total: 0, page, per_page, has_more: false, error: countError.message },
      { status: 500 },
    )
  }

  const total = count ?? 0
  const from = (page - 1) * per_page
  const to = from + per_page - 1

  // Page query: bookmark dell'utente con join sul post.
  // Ordino per post_bookmarks.created_at (quando ho salvato) — più
  // intuitivo per la pagina "I miei salvati" che mostra le ultime
  // aggiunte in cima.
  const { data: rows, error: dataError } = await db
    .from('post_bookmarks')
    .select('post_id, created_at, posts(*)')
    .eq('member_id', member.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (dataError) {
    return NextResponse.json(
      { data: [], total: 0, page, per_page, has_more: false, error: dataError.message },
      { status: 500 },
    )
  }

  // Estrazione del post dalla join + filter via di righe orfane (post
  // eliminato ma bookmark non ancora cancellato dal CASCADE — non dovrebbe
  // accadere data la FK ON DELETE CASCADE, ma teniamo il check difensivo).
  const posts = (rows ?? [])
    .map((row) => row.posts as unknown as Parameters<typeof buildPostWithDetails>[0] | null)
    .filter((p): p is Parameters<typeof buildPostWithDetails>[0] => p !== null)

  const postsWithDetails = await Promise.all(
    posts.map((post) => buildPostWithDetails(post, member)),
  )

  return NextResponse.json({
    data: postsWithDetails,
    total,
    page,
    per_page,
    has_more: from + posts.length < total,
    error: null,
  })
}
