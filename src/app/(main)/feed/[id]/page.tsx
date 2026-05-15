'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import {
  Avatar,
  Button,
  EmptyState,
  MemberLink,
  MentionText,
  PostCardSkeleton,
  Skeleton,
  useToast,
} from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import { useRealtimeSubscription } from '@/lib/realtime'
import {
  ApiResponse,
  MemberPublic,
  PostCommentWithAuthor,
  PostWithDetails,
  ReactionEmoji,
} from '@/types/database'

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'adesso'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}g`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}sett`
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/**
 * Riga commento stile Instagram: avatar 32px tondo a sinistra, poi
 * `username comment_text` inline (username bold, testo regular),
 * sotto su una seconda riga: tempo + un eventuale "Mi piace". Heart
 * piccolo (12px) all'estrema destra come azione like sul singolo
 * commento — al momento decorativo (non c'e` API like per commenti),
 * lo lasciamo come affordance visiva coerente col linguaggio Insta.
 *
 * NIENTE bg/border attorno alla bolla del commento (a differenza del
 * design precedente): Instagram dark mode mette il testo direttamente
 * su nero, senza chrome. Lo username in bold + l'avatar bastano a
 * delimitare il messaggio.
 */
function CommentRow({
  comment,
  members,
}: {
  comment: PostCommentWithAuthor
  members: Pick<MemberPublic, 'id' | 'name'>[]
}) {
  return (
    <div className="flex gap-3 px-4 py-2">
      <MemberLink
        memberId={comment.author_id}
        ariaLabel={`Apri il profilo di ${comment.author.name}`}
      >
        <Avatar
          emoji={comment.author.avatar_emoji}
          url={comment.author.avatar_url}
          name={comment.author.name}
          color={comment.author.color}
          size="sm"
        />
      </MemberLink>
      <div className="flex-1 min-w-0">
        <p className="text-white text-[15px] leading-snug whitespace-pre-wrap">
          <MemberLink
            memberId={comment.author_id}
            ariaLabel={`Apri il profilo di ${comment.author.name}`}
          >
            <span className="font-semibold mr-1.5">{comment.author.name}</span>
          </MemberLink>
          <MentionText text={comment.text} members={members} />
        </p>
        <p className="text-[#A8A8A8] text-[12px] mt-1">
          {formatRelativeTime(comment.created_at)}
        </p>
      </div>
      {/* Like heart piccolino — decorativo, allineato alla riga del
          testo (mt-1 lo abbassa al centro del primo paragrafo). Non
          interattivo: il backend non ha ancora API per like-su-commento.
          aria-hidden cosi` lo screen reader non lo annuncia. */}
      <div
        className="flex h-8 w-8 items-center justify-center mt-1 opacity-50"
        aria-hidden="true"
      >
        <svg
          className="w-3 h-3 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </div>
    </div>
  )
}

export default function PostPage() {
  const params = useParams<{ id: string }>()
  const postId = params?.id ?? ''
  const router = useRouter()
  const { member } = useAuth()
  const { members } = useMembers()
  const toast = useToast()

  const [post, setPost] = useState<PostWithDetails | null>(null)
  const [isLoadingPost, setIsLoadingPost] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [comments, setComments] = useState<PostCommentWithAuthor[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(true)

  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)

  const fetchPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}`)
      if (res.status === 404) {
        setNotFound(true)
        return
      }
      const json: ApiResponse<PostWithDetails> = await res.json()
      if (json.data) setPost(json.data)
    } catch {
      // network errors surface via the not-found state; toast feels too loud
    } finally {
      setIsLoadingPost(false)
    }
  }, [postId])

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`)
      const json: ApiResponse<PostCommentWithAuthor[]> = await res.json()
      if (json.data) setComments(json.data)
    } catch {
      // silently ignore — comments stay empty
    } finally {
      setIsLoadingComments(false)
    }
  }, [postId])

  useEffect(() => {
    if (!postId) return
    fetchPost()
    fetchComments()
  }, [postId, fetchPost, fetchComments])

  // Realtime: refetch when anything changes on this post so likes /
  // reactions / new comments stay live without manual reload.
  useRealtimeSubscription('post_comments', () => fetchComments(), `post_id=eq.${postId}`, true)
  useRealtimeSubscription('post_likes', () => fetchPost(), `post_id=eq.${postId}`, true)
  useRealtimeSubscription('post_reactions', () => fetchPost(), `post_id=eq.${postId}`, true)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const text = draft.trim()
      if (!text || isSending) return
      setIsSending(true)
      try {
        const res = await fetch(`/api/posts/${postId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!res.ok) throw new Error('failed')
        setDraft('')
        // Optimistic refresh — realtime will catch up too.
        fetchComments()
      } catch {
        toast.error('Non riesco a pubblicare il commento. Riprova.')
      } finally {
        setIsSending(false)
      }
    },
    [draft, isSending, postId, fetchComments, toast],
  )

  const handleLike = useCallback(
    async (id: string) => {
      if (!post) return
      // Optimistic: flip locally, refetch on settle
      const wasLiked = post.liked_by_me
      setPost({
        ...post,
        liked_by_me: !wasLiked,
        likes: wasLiked
          ? post.likes.filter((l) => l.member_id !== member?.id)
          : [...post.likes, { id: 'temp', post_id: id, member_id: member?.id ?? '', created_at: new Date().toISOString() }],
      })
      try {
        await fetch(`/api/posts/${id}/like`, { method: wasLiked ? 'DELETE' : 'POST' })
      } finally {
        fetchPost()
      }
    },
    [post, member, fetchPost],
  )

  const handleBookmark = useCallback(
    async (id: string) => {
      if (!post) return
      const wasBookmarked = post.bookmarked_by_me
      setPost({ ...post, bookmarked_by_me: !wasBookmarked })
      try {
        await fetch(`/api/posts/${id}/bookmark`, { method: 'POST' })
      } catch {
        setPost({ ...post, bookmarked_by_me: wasBookmarked })
      }
    },
    [post],
  )

  const handleReact = useCallback(
    async (id: string, emoji: ReactionEmoji) => {
      if (!post || !member) return
      const hadIt = post.reactions.some(
        (r) => r.member_id === member.id && r.emoji === emoji,
      )
      try {
        if (hadIt) {
          await fetch(
            `/api/posts/${id}/reactions?emoji=${encodeURIComponent(emoji)}`,
            { method: 'DELETE' },
          )
        } else {
          await fetch(`/api/posts/${id}/reactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji }),
          })
        }
      } finally {
        fetchPost()
      }
    },
    [post, member, fetchPost],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('failed')
        toast.success('Post eliminato.')
        router.push('/feed')
      } catch {
        toast.error('Non riesco a eliminare il post.')
      }
    },
    [router, toast],
  )

  return (
    <div className="flex min-h-dvh flex-col bg-black">
      {/* Header pagina — minimal, opaco nero, sticky. "← Commenti" +
          count post title implicito (mostriamo solo "Commenti" perche`
          il PostCard sotto contiene gia` titolo/avatar dell'autore: un
          double-titling sarebbe rumore visivo). */}
      <header className="sticky top-0 z-30 bg-black border-b border-[#262626]">
        <div className="relative flex h-12 items-center px-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 items-center justify-center text-white hover:text-[#A8A8A8] transition-colors"
            aria-label="Indietro"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-white font-semibold text-base">
            Commenti
            {!isLoadingPost && post && post.comments_count > 0 && (
              <span className="ml-1.5 text-[#A8A8A8] font-normal">
                {post.comments_count}
              </span>
            )}
          </h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col pb-4">
        {isLoadingPost ? (
          <div className="px-4 pt-4">
            <PostCardSkeleton />
          </div>
        ) : notFound || !post ? (
          <div className="px-4 pt-8">
            <EmptyState
              icon="🔍"
              title="Post non trovato"
              description="Forse è stato eliminato o il link non è valido."
              action={<Button onClick={() => router.push('/feed')}>Torna alla bacheca</Button>}
            />
          </div>
        ) : (
          <>
            <PostCard
              post={post}
              currentMemberId={member?.id}
              members={members}
              onLike={handleLike}
              onBookmark={handleBookmark}
              onReact={handleReact}
              onDelete={handleDelete}
              // No onCommentsClick: we're already here. La riga
              // "Visualizza tutti i N commenti" diventa decorativa.
            />

            {/* Hairline separator + lista commenti — niente label
                "Commenti" qui (gia` nell'header). Pattern Instagram. */}
            <div className="border-t border-[#262626] mt-1 pt-2">
              {isLoadingComments ? (
                <div className="flex flex-col gap-3 px-4 py-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-[#A8A8A8] text-[15px] text-center py-10 px-6">
                  Nessun commento. Sii il primo a rispondere.
                </p>
              ) : (
                <div className="flex flex-col">
                  {comments.map((c) => (
                    <CommentRow key={c.id} comment={c} members={members} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Composer fisso in fondo — stile Instagram: avatar + textarea
          trasparente (no bg, no border, solo padding) + bottone "Pubblica"
          TESTO blu IG `#0095F6`, niente bottone solid. Quando il draft
          e` vuoto il bottone e` muted (#0095F6 a opacita` 30%).
          Niente backdrop-blur — Instagram non lo usa neanche nei composer.
          NIENTE active:scale: il bottone testuale non ha feedback di
          movimento, solo cambio di opacita` al disable. */}
      {post && member && (
        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 bg-black border-t border-[#262626] px-3 py-2 flex items-center gap-3"
          style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <Avatar
            emoji={member.avatar_emoji}
            url={member.avatar_url}
            name={member.name}
            color={(member as MemberPublic).color}
            size="sm"
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Aggiungi un commento..."
            rows={1}
            className="flex-1 bg-transparent text-white text-[15px] placeholder:text-[#A8A8A8] px-1 py-2 resize-none focus:outline-none min-h-touch"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            className="min-h-touch px-2 text-[15px] font-semibold text-[#0095F6] disabled:text-[#0095F6]/40 transition-colors"
            aria-label="Pubblica commento"
          >
            {isSending ? 'Invio…' : 'Pubblica'}
          </button>
        </form>
      )}
    </div>
  )
}
