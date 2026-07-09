'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { useOptionalAuth } from '@/hooks/useAuth'
import { cacheKey, readCache, writeCache } from '@/lib/swr-cache'
import { enqueueOperation } from '@/lib/offline-queue'
import {
  PostWithDetails,
  CreatePostInput,
  PaginatedResponse,
  ReactionEmoji,
  MemberPublic,
  PostReactionWithMember,
} from '@/types/database'

const PER_PAGE = 10

type UsePostsReturn = {
  posts: PostWithDetails[]
  /** Total posts in the queried set (server-side count, not just the loaded
   * page). Used for profile stats — server already returns this so we just
   * surface it. */
  total: number
  isLoading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => Promise<void>
  createPost: (input: CreatePostInput) => Promise<boolean>
  toggleLike: (postId: string) => Promise<void>
  toggleBookmark: (postId: string) => Promise<void>
  toggleReaction: (
    postId: string,
    emoji: ReactionEmoji,
    currentMember: MemberPublic,
  ) => Promise<void>
  addComment: (postId: string, text: string) => Promise<boolean>
  deletePost: (postId: string) => Promise<boolean>
  votePoll: (postId: string, optionId: string) => Promise<void>
  retractPollVote: (postId: string, optionId?: string | null) => Promise<void>
  refetch: () => Promise<void>
}

// Snapshot della prima pagina persistito in cache SWR. Solo pagina 1:
// le pagine successive dello scroll infinito non vengono cacheate (al
// remount si riparte dall'alto, come Instagram).
type CachedFeedPage = {
  posts: PostWithDetails[]
  total: number
  hasMore: boolean
}

export function usePosts(authorId?: string): UsePostsReturn {
  // Cache SWR (Fase A2): il feed cached appare SUBITO (niente skeleton),
  // la revalidation parte comunque in background a ogni mount. La chiave
  // è scoped per viewer perché liked_by_me/bookmarked_by_me dipendono
  // da chi guarda.
  const auth = useOptionalAuth()
  const key = cacheKey(auth?.member?.id, `posts:${authorId ?? 'feed'}`)
  const [posts, setPosts] = useState<PostWithDetails[]>(
    () => readCache<CachedFeedPage>(key)?.posts ?? [],
  )
  const [total, setTotal] = useState<number>(() => readCache<CachedFeedPage>(key)?.total ?? 0)
  const [isLoading, setIsLoading] = useState<boolean>(() => readCache(key) === null)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<boolean>(
    () => readCache<CachedFeedPage>(key)?.hasMore ?? false,
  )
  const [page, setPage] = useState<number>(1)

  const buildUrl = (p: number) => {
    const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
    if (authorId) params.set('author_id', authorId)
    return `/api/posts?${params.toString()}`
  }

  const fetchPosts = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(buildUrl(1))
      const result: PaginatedResponse<PostWithDetails> = await res.json()
      setPosts(result.data)
      setTotal(result.total)
      setHasMore(result.has_more)
      setPage(1)
      writeCache<CachedFeedPage>(key, {
        posts: result.data,
        total: result.total,
        hasMore: result.has_more,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch posts')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId, key])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  // Refetch debounced — i canali realtime su posts/post_reactions/
  // post_poll_votes notificano TUTTI i client (incluso quello che ha
  // fatto l'action). Senza debounce un tap rapido su piu` reazioni
  // genera molti fetchPosts concorrenti che si sovrascrivono e
  // producono "compare/scompare/riappare" visivo (flicker reactions
  // segnalato). 600ms collassa il burst in un solo refetch.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null
      fetchPosts()
    }, 600)
  }, [fetchPosts])

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    }
  }, [])

  useRealtimeSubscription('posts', scheduleRefetch, undefined, true)
  useRealtimeSubscription('post_reactions', scheduleRefetch, undefined, true)
  useRealtimeSubscription('post_poll_votes', scheduleRefetch, undefined, true)

  const loadMore = useCallback(async () => {
    const nextPage = page + 1
    try {
      const res = await fetch(buildUrl(nextPage))
      const result: PaginatedResponse<PostWithDetails> = await res.json()
      setPosts((prev) => [...prev, ...result.data])
      setHasMore(result.has_more)
      setPage(nextPage)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more posts')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, authorId])

  const createPost = useCallback(async (input: CreatePostInput): Promise<boolean> => {
    const offline = !navigator.onLine
    if (offline && (input.images?.length || input.poll)) return false
    if (offline) {
      await enqueueOperation('create_post', { text: input.text, post_type: input.post_type ?? 'normal' })
      return true
    }
    try {
      const formData = new FormData()
      formData.append('text', input.text)
      if (input.post_type) formData.append('post_type', input.post_type)
      input.images?.forEach((img) => formData.append('images', img))
      // Thumbnail parallele alle immagini (stesso indice) — vedi A3.
      input.thumbs?.forEach((t) => formData.append('thumbs', t))
      if (input.poll) formData.append('poll', JSON.stringify(input.poll))
      const res = await fetch('/api/posts', { method: 'POST', body: formData })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const toggleLike = useCallback(async (postId: string): Promise<void> => {
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p
        const liked = p.liked_by_me
        return {
          ...p,
          liked_by_me: !liked,
          likes: liked
            ? p.likes.filter((l) => l.post_id !== postId)
            : [...p.likes, { id: 'temp', post_id: postId, member_id: '', created_at: '' }],
        }
      })
    )
    try {
      const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('Like failed')
    } catch {
      // Rollback
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p
          const liked = p.liked_by_me
          return {
            ...p,
            liked_by_me: !liked,
            likes: liked
              ? p.likes.filter((l) => l.post_id !== postId)
              : [...p.likes, { id: 'temp', post_id: postId, member_id: '', created_at: '' }],
          }
        })
      )
    }
  }, [])

  const toggleBookmark = useCallback(async (postId: string): Promise<void> => {
    // Optimistic flip: il bookmark non ha conteggi visibili (è privato),
    // quindi basta flippare il flag. Niente lista da aggiornare.
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, bookmarked_by_me: !p.bookmarked_by_me } : p,
      ),
    )
    try {
      const res = await fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' })
      if (!res.ok) throw new Error('Bookmark failed')
    } catch {
      // Rollback: stesso flip inverso.
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, bookmarked_by_me: !p.bookmarked_by_me } : p,
        ),
      )
    }
  }, [])

  const toggleReaction = useCallback(
    async (
      postId: string,
      emoji: ReactionEmoji,
      currentMember: MemberPublic,
    ): Promise<void> => {
      const hadIt = posts
        .find((p) => p.id === postId)
        ?.reactions.some(
          (r) => r.member_id === currentMember.id && r.emoji === emoji,
        )

      // Optimistic update
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p
          if (hadIt) {
            return {
              ...p,
              reactions: p.reactions.filter(
                (r) =>
                  !(r.member_id === currentMember.id && r.emoji === emoji),
              ),
            }
          }
          const optimistic: PostReactionWithMember = {
            id: `temp-${Date.now()}`,
            post_id: postId,
            member_id: currentMember.id,
            emoji,
            created_at: new Date().toISOString(),
            member: currentMember,
          }
          return { ...p, reactions: [...p.reactions, optimistic] }
        }),
      )

      try {
        const res = hadIt
          ? await fetch(
              `/api/posts/${postId}/reactions?emoji=${encodeURIComponent(emoji)}`,
              { method: 'DELETE' },
            )
          : await fetch(`/api/posts/${postId}/reactions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ emoji }),
            })
        if (!res.ok) throw new Error('Reaction failed')
        // No refetch esplicito qui — l'optimistic update e` gia` accurato
        // (member_id + emoji corretti, solo l'id e` temp ma non lo usiamo
        // per altre op). Il realtime channel sincronizzera` con debounce
        // entro 600ms se serve. Refetch esplicito qui causava il flicker
        // perche` la response del POST arrivava prima del realtime e
        // sovrascriveva lo state ottimistico con dati non ancora indicizzati
        // server-side → reaction sparisce → poi realtime refetch → riappare.
      } catch {
        // Rollback by resync server-truth (debounced)
        scheduleRefetch()
      }
    },
    [posts, scheduleRefetch],
  )

  const addComment = useCallback(async (postId: string, text: string): Promise<boolean> => {
    if (!navigator.onLine) {
      await enqueueOperation('add_comment', { post_id: postId, text })
      return true
    }
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const votePoll = useCallback(async (postId: string, optionId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/posts/${postId}/poll/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: optionId }),
      })
      if (!res.ok) throw new Error('Vote failed')
      fetchPosts()
    } catch {
      fetchPosts()
    }
  }, [fetchPosts])

  const retractPollVote = useCallback(async (postId: string, optionId?: string | null): Promise<void> => {
    try {
      const url = optionId
        ? `/api/posts/${postId}/poll/vote?option_id=${encodeURIComponent(optionId)}`
        : `/api/posts/${postId}/poll/vote`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Retract failed')
      fetchPosts()
    } catch {
      fetchPosts()
    }
  }, [fetchPosts])

  const deletePost = useCallback(async (postId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  return {
    posts,
    total,
    isLoading,
    error,
    hasMore,
    loadMore,
    createPost,
    toggleLike,
    toggleBookmark,
    toggleReaction,
    addComment,
    deletePost,
    votePoll,
    retractPollVote,
    refetch: fetchPosts,
  }
}
