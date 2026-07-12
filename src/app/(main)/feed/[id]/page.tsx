'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import {
  Avatar,
  Button,
  EmptyState,
  Header,
  MemberLink,
  MentionText,
  PostCardSkeleton,
  Skeleton,
  useToast,
} from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import { useRealtimeSubscription } from '@/lib/realtime'
import { cacheKey, readCache, writeCache } from '@/lib/swr-cache'
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
    <div className="flex gap-3 px-4 py-3">
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
        <div className="bg-surface-raised rounded-card px-3 py-2 border border-white/5">
          <MemberLink
            memberId={comment.author_id}
            ariaLabel={`Apri il profilo di ${comment.author.name}`}
          >
            <span
              className="text-[13px] font-semibold"
              style={{ color: comment.author.color || '#E8A838' }}
            >
              {comment.author.name}
            </span>
          </MemberLink>
          <p className="text-white/90 text-body whitespace-pre-wrap mt-0.5">
            <MentionText text={comment.text} members={members} />
          </p>
        </div>
        <p className="text-white/40 text-xs mt-1 ml-2">
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

  // Cache SWR (A6.5): post e commenti cached appaiono subito (niente
  // skeleton), la revalidation parte comunque al mount.
  const postKey = cacheKey(member?.id, `post:${postId}`)
  const commentsKey = cacheKey(member?.id, `post-comments:${postId}`)

  const [post, setPost] = useState<PostWithDetails | null>(
    () => readCache<PostWithDetails>(postKey),
  )
  const [isLoadingPost, setIsLoadingPost] = useState(() => readCache(postKey) === null)
  const [notFound, setNotFound] = useState(false)

  const [comments, setComments] = useState<PostCommentWithAuthor[]>(
    () => readCache<PostCommentWithAuthor[]>(commentsKey) ?? [],
  )
  const [isLoadingComments, setIsLoadingComments] = useState(
    () => readCache(commentsKey) === null,
  )

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
      if (json.data) {
        setPost(json.data)
        writeCache(postKey, json.data)
      }
    } catch {
      // network errors surface via the not-found state; toast feels too loud
    } finally {
      setIsLoadingPost(false)
    }
  }, [postId, postKey])

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/comments`)
      const json: ApiResponse<PostCommentWithAuthor[]> = await res.json()
      if (json.data) {
        setComments(json.data)
        writeCache(commentsKey, json.data)
      }
    } catch {
      // silently ignore — comments stay empty
    } finally {
      setIsLoadingComments(false)
    }
  }, [postId, commentsKey])

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
    <div className="flex min-h-dvh flex-col bg-surface">
      <Header title="Post" showBack />

      <main className="flex-1 flex flex-col">
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
            <div className="p-4">
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

            {/* Comments */}
            <div className="border-t border-white/5 mt-2">
              <h2 className="px-4 pt-3 pb-2 text-white/60 text-caption font-semibold uppercase tracking-wide">
                Commenti
              </h2>
              {isLoadingComments ? (
                <div className="flex flex-col gap-3 px-4 py-2">
                  <Skeleton className="h-16 rounded-card" />
                  <Skeleton className="h-16 rounded-card" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-white/40 text-body text-center py-8 px-6">
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

      {/* Comment composer fixed at the bottom — only when post exists */}
      {post && member && (
        <form
          onSubmit={handleSubmit}
          className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-white/10 px-3 py-2 flex items-end gap-2"
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
            className="flex-1 bg-surface-sunken text-white text-body placeholder:text-white/30 rounded-bubble px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 min-h-touch"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            className="min-h-touch min-w-touch rounded-full bg-accent text-surface font-semibold flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all"
            aria-label="Invia commento"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14-7-7 14-2-5-5-2z" />
            </svg>
          </button>
        </form>
      )}
    </div>
  )
}
