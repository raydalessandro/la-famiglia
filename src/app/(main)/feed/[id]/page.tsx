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
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/**
 * Riga commento — stile Threads light. Avatar 32px, username bold,
 * testo 15px, meta sotto (timestamp · piaceri · Rispondi).
 *
 * NIENTE bubble container intorno al testo: Threads renderizza i commenti
 * come testo libero allineato all'avatar, separati dai post da hairline.
 */
function CommentRow({
  comment,
  members,
}: {
  comment: PostCommentWithAuthor
  members: Pick<MemberPublic, 'id' | 'name'>[]
}) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-[#EAEAEA]">
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
        <div className="flex items-baseline gap-1.5">
          <MemberLink
            memberId={comment.author_id}
            ariaLabel={`Apri il profilo di ${comment.author.name}`}
          >
            <span className="text-[15px] font-semibold text-[#0F0F0F]">
              {comment.author.name}
            </span>
          </MemberLink>
          <span className="text-[13px] text-[#707070]">
            · {formatRelativeTime(comment.created_at)}
          </span>
        </div>
        <p className="text-[#0F0F0F] text-[15px] leading-snug whitespace-pre-wrap mt-0.5">
          <MentionText text={comment.text} members={members} />
        </p>
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

  const commentCount = comments.length

  return (
    // -mx-4 -my-2 cancella il wrapper main del layout per portare il
    // light bg edge-to-edge. min-h-dvh per occupare il viewport intero
    // anche su iOS dove il bottom nav bar dinamico altera l'altezza.
    <div className="-mx-4 -my-2 flex min-h-dvh flex-col bg-[#FAFAFA]">
      {/* Header sticky — back arrow + "Risposte" + count. NON usa il
          componente Header globale: quello e` dark+gold. Stile light
          minimal coerente con il feed. */}
      <div className="sticky top-0 z-20 bg-[#FAFAFA]/85 backdrop-blur-xl border-b border-[#EAEAEA]">
        <div className="flex items-center gap-2 px-2 py-2 min-h-[56px]">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#0F0F0F] hover:bg-[#EAEAEA] transition-colors"
            aria-label="Indietro"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="flex items-baseline gap-1.5">
            <h1 className="font-semibold text-[#0F0F0F] text-[17px] leading-none">
              Risposte
            </h1>
            {commentCount > 0 && (
              <span className="text-[#707070] text-[13px] leading-none">
                · {commentCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col">
        {isLoadingPost ? (
          <div className="px-4 pt-2">
            <PostCardSkeleton />
          </div>
        ) : notFound || !post ? (
          <EmptyState
            icon="🔍"
            title="Post non trovato"
            description="Forse è stato eliminato o il link non è valido."
            action={<Button onClick={() => router.push('/feed')}>Torna alla bacheca</Button>}
          />
        ) : (
          <>
            <div className="px-4">
              <PostCard
                post={post}
                currentMemberId={member?.id}
                members={members}
                onLike={handleLike}
                onBookmark={handleBookmark}
                onReact={handleReact}
                onDelete={handleDelete}
                // No onCommentsClick: siamo già nella pagina post singolo.
              />
            </div>

            {/* Lista commenti — stile Threads: hairline tra ogni riga,
                NO bubble container. Avatar 32px, username bold inline col
                timestamp. */}
            <div>
              {isLoadingComments ? (
                <div className="flex flex-col gap-3 px-4 py-3">
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-[#707070] text-[15px] text-center py-10 px-6">
                  Ancora nessuna risposta. Scrivi la prima.
                </p>
              ) : (
                <div className="flex flex-col">
                  {comments.map((c) => (
                    <CommentRow key={c.id} comment={c} members={members} />
                  ))}
                </div>
              )}
            </div>

            {/* Spacer per il composer fisso in fondo + bottom-nav globale +
                safe area. Il composer e` sticky bottom-0 quindi serve un
                padding-bottom sul contenuto altrimenti l'ultimo commento
                resta coperto. */}
            <div aria-hidden="true" className="h-24" />
          </>
        )}
      </main>

      {/* Composer fisso in fondo — avatar 32px + textarea hairline rounded
          + bottone "Pubblica" testo purple (NON solid). Stile Threads. */}
      {post && member && (
        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 bg-[#FAFAFA]/95 backdrop-blur-xl border-t border-[#EAEAEA] px-4 py-3 flex items-center gap-3"
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
            placeholder="Scrivi una risposta…"
            rows={1}
            className="flex-1 bg-white text-[#0F0F0F] text-[15px] placeholder:text-[#707070] border border-[#EAEAEA] rounded-2xl px-4 py-2.5 resize-none focus:outline-none focus:border-[#0F0F0F] min-h-touch"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            className="min-h-touch px-2 text-[15px] font-semibold text-[#5856D6] hover:text-[#4744B5] disabled:text-[#707070] disabled:opacity-50 transition-colors"
          >
            Pubblica
          </button>
        </form>
      )}
    </div>
  )
}
