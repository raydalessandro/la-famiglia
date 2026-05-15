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
  if (mins < 60) return `${mins}m fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h fa`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}g fa`
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/**
 * CommentRow — DARK WARM COFFEE iteration.
 *
 * Ogni commento ora vive in una card raised `bg-cocoa-raised` con hairline
 * `border-cocoa-border` rounded-xl. Niente più color-per-member sul nome
 * (mantiene il mood minimal del feed) — il colore membro vive solo
 * sull'avatar ringed. Timestamp warm-gray fuori card per leggerezza.
 */
function CommentRow({
  comment,
  members,
}: {
  comment: PostCommentWithAuthor
  // Per il rendering delle `@menzioni` come link al profilo. Pass-through
  // dal page-level useMembers().
  members: Pick<MemberPublic, 'id' | 'name'>[]
}) {
  return (
    <div className="flex gap-3 px-4">
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
        <div className="bg-cocoa-raised rounded-xl px-3 py-2 border border-cocoa-border">
          <MemberLink
            memberId={comment.author_id}
            ariaLabel={`Apri il profilo di ${comment.author.name}`}
          >
            <span className="text-[13px] font-semibold text-cream">
              {comment.author.name}
            </span>
          </MemberLink>
          <p className="text-cream text-[15px] leading-[1.5] whitespace-pre-wrap mt-0.5">
            <MentionText text={comment.text} members={members} />
          </p>
        </div>
        <p className="text-warm text-xs mt-1 ml-2">
          {formatRelativeTime(comment.created_at)}
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

  // Conta commenti per il sub-title nell'header. Mostriamo "1 commento" /
  // "5 commenti" coerente con la riga subdued del PostCard.
  const commentCountLabel = (() => {
    const n = comments.length
    if (n === 0) return null
    return n === 1 ? '1 commento' : `${n} commenti`
  })()

  return (
    <div className="flex min-h-dvh flex-col bg-cocoa">
      {/* Custom serif italic header — stessa identità del wordmark
          "La Famiglia" del feed (Lora 500 italic + cream). Sticky con
          backdrop-blur + bg cocoa/95. NON usiamo il componente
          <Header /> globale perché ha palette navy / chrome generico e
          rompe la coerenza con la palette feed. Back arrow thin-stroke
          1.5 cream, hover copper. */}
      <header className="sticky top-0 z-30 bg-cocoa/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-11 w-11 -ml-2 items-center justify-center rounded-full text-cream hover:text-copper transition-colors"
            aria-label="Indietro"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0 flex items-baseline gap-2">
            <h1 className="font-serif italic font-medium text-cream text-[24px] leading-none tracking-tight">
              Commenti
            </h1>
            {commentCountLabel && (
              <span className="text-warm text-[13px]">· {commentCountLabel}</span>
            )}
          </div>
        </div>
      </header>

      {/* pb-24 lascia spazio al composer sticky in fondo. */}
      <main className="flex-1 flex flex-col pb-24">
        {isLoadingPost ? (
          <div className="p-4">
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
            <div className="px-4 pt-3">
              <PostCard
                post={post}
                currentMemberId={member?.id}
                members={members}
                onLike={handleLike}
                onBookmark={handleBookmark}
                onReact={handleReact}
                onDelete={handleDelete}
                // No onCommentsClick: we're already here.
              />
            </div>

            {/* Commenti — gap-2 (8px) tra le card per densità ottimale
                della lista. Niente border-top separator: la separazione
                è semantica via spacing + il titolo serif sopra. */}
            <section className="mt-4 flex flex-col gap-2">
              <h2 className="px-4 text-warm text-[13px] font-semibold uppercase tracking-wide">
                Commenti
              </h2>
              {isLoadingComments ? (
                <div className="flex flex-col gap-2 px-4 py-1">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-warm text-[15px] text-center py-8 px-6">
                  Nessun commento. Sii il primo a rispondere.
                </p>
              ) : (
                <div className="flex flex-col gap-2 pb-2">
                  {comments.map((c) => (
                    <CommentRow key={c.id} comment={c} members={members} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Composer fisso in fondo — bg-cocoa/95 + backdrop-blur per non
          schiacciare visivamente il contenuto sottostante. Textarea
          cocoa-raised con bordo cocoa-border, focus copper. Bottone
          solid copper con testo dark cocoa: contrasto ~10:1, AA solid.
          Niente active:scale — disabled state via opacità + cursor. */}
      {post && member && (
        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 bg-cocoa/95 backdrop-blur border-t border-cocoa-border px-3 py-2 pb-safe flex items-end gap-2"
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
            placeholder="Scrivi un commento…"
            rows={1}
            className="flex-1 bg-cocoa-raised border border-cocoa-border text-cream text-[15px] placeholder:text-warm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-copper min-h-touch"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            className="min-h-touch px-4 rounded-xl bg-copper text-cocoa font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-copper-hover transition-colors"
            aria-label="Pubblica commento"
          >
            Pubblica
          </button>
        </form>
      )}
    </div>
  )
}
