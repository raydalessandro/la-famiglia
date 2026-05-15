'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button, EmptyState, PostCardSkeleton } from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import {
  ApiResponse,
  PaginatedResponse,
  PostWithDetails,
  ReactionEmoji,
} from '@/types/database'

const PER_PAGE = 10

/**
 * Pagina "I miei post salvati". Lista paginata dei post che l'utente
 * corrente ha bookmark-ato. Riusa `<PostCard>` per uniformità con il
 * feed: like, reaction, commenti tappabili — tutto funziona come là,
 * con un'unica differenza UX: l'icona bookmark serve a RIMUOVERE dal
 * salvato (un tap → il post sparisce dalla lista).
 *
 * Privacy: nessun altro membro può vedere questa pagina o sapere
 * cosa contiene. La lookup passa da `/api/posts/bookmarked` che
 * filtra rigorosamente per `auth.id` lato server.
 */
export default function SavedPage() {
  const router = useRouter()
  const { member } = useAuth()
  const [posts, setPosts] = useState<PostWithDetails[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const fetchSaved = useCallback(async (p: number) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/posts/bookmarked?page=${p}&per_page=${PER_PAGE}`)
      const json = (await res.json()) as PaginatedResponse<PostWithDetails>
      if (res.ok) {
        setPosts((prev) => (p === 1 ? json.data : [...prev, ...json.data]))
        setHasMore(json.has_more)
        setPage(p)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSaved(1)
  }, [fetchSaved])

  // Toggle del bookmark direttamente da questa pagina. Quando l'utente
  // rimuove un post dai salvati, lo togliamo subito dalla lista
  // (filter) — niente refetch totale, l'azione è sua, locale.
  const handleBookmark = useCallback(async (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id))
    try {
      await fetch(`/api/posts/${id}/bookmark`, { method: 'POST' })
    } catch {
      // Rollback se la rete fallisce: rifetchiamo per essere certi
      // dello stato server.
      void fetchSaved(1)
    }
  }, [fetchSaved])

  // Like + reactions: stesso flusso del feed ma per-item (qui non
  // usiamo `usePosts` perché quel hook è scoped al GET /api/posts).
  const handleLike = useCallback(async (id: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const liked = p.liked_by_me
        return {
          ...p,
          liked_by_me: !liked,
          likes: liked
            ? p.likes.filter((l) => l.member_id !== member?.id)
            : [...p.likes, { id: 'temp', post_id: id, member_id: member?.id ?? '', created_at: new Date().toISOString() }],
        }
      }),
    )
    try {
      await fetch(`/api/posts/${id}/like`, { method: 'POST' })
    } catch {
      void fetchSaved(page)
    }
  }, [member, fetchSaved, page])

  const handleReact = useCallback(async (id: string, emoji: ReactionEmoji) => {
    // Reactions sulla pagina salvati: facciamo la chiamata e rifetchiamo.
    // Non duplichiamo qui la logica ottimistica di usePosts.toggleReaction
    // perché in /saved l'utente di solito non sta interagendo socialmente
    // — sta consultando i propri salvati. Una latency lieve è accettabile.
    try {
      const res = await fetch(`/api/posts/${id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      const json = (await res.json()) as ApiResponse<unknown>
      if (res.ok || json.error) void fetchSaved(page)
    } catch {
      void fetchSaved(page)
    }
  }, [fetchSaved, page])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/posts/${id}`, { method: 'DELETE' })
      setPosts((prev) => prev.filter((p) => p.id !== id))
    } catch {
      void fetchSaved(page)
    }
  }, [fetchSaved, page])

  return (
    <div className="min-h-screen bg-[#1a1a2e] pb-24">
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/90 backdrop-blur border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 transition-colors"
            aria-label="Indietro"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-white">Salvati</h1>
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        {isLoading && posts.length === 0 ? (
          Array.from({ length: 2 }).map((_, i) => <PostCardSkeleton key={i} />)
        ) : posts.length === 0 ? (
          <EmptyState
            icon="🔖"
            title="Nessun post salvato"
            description="Tocca l'icona segnalibro su un post del feed per salvarlo qui."
            action={<Button onClick={() => router.push('/feed')}>Vai alla bacheca</Button>}
          />
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentMemberId={member?.id}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onReact={handleReact}
              onDelete={handleDelete}
              onCommentsClick={(id) => router.push(`/feed/${id}`)}
            />
          ))
        )}

        {hasMore && (
          <div className="flex justify-center py-4">
            <Button onClick={() => fetchSaved(page + 1)} disabled={isLoading}>
              {isLoading ? 'Carico…' : 'Carica altri'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
