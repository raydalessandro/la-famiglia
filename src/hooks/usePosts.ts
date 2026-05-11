'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
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
  isLoading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => Promise<void>
  createPost: (input: CreatePostInput) => Promise<boolean>
  toggleLike: (postId: string) => Promise<void>
  toggleReaction: (
    postId: string,
    emoji: ReactionEmoji,
    currentMember: MemberPublic,
  ) => Promise<void>
  addComment: (postId: string, text: string) => Promise<boolean>
  deletePost: (postId: string) => Promise<boolean>
  refetch: () => Promise<void>
}

export function usePosts(authorId?: string): UsePostsReturn {
  const [posts, setPosts] = useState<PostWithDetails[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<boolean>(false)
  const [page, setPage] = useState<number>(1)

  const buildUrl = (p: number) => {
    const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE) })
    if (authorId) params.set('author_id', authorId)
    return `/api/posts?${params.toString()}`
  }

  const fetchPosts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(buildUrl(1))
      const result: PaginatedResponse<PostWithDetails> = await res.json()
      setPosts(result.data)
      setHasMore(result.has_more)
      setPage(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch posts')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorId])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  useRealtimeSubscription('posts', () => fetchPosts(), undefined, true)
  useRealtimeSubscription('post_reactions', () => fetchPosts(), undefined, true)

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
    if (offline && input.images?.length) return false
    if (offline) {
      await enqueueOperation('create_post', { text: input.text, post_type: input.post_type ?? 'normal' })
      return true
    }
    try {
      const formData = new FormData()
      formData.append('text', input.text)
      if (input.post_type) formData.append('post_type', input.post_type)
      input.images?.forEach((img) => formData.append('images', img))
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
        // Refetch to pick up the real reaction id from server
        fetchPosts()
      } catch {
        // Rollback by refetching server truth
        fetchPosts()
      }
    },
    [posts, fetchPosts],
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
    isLoading,
    error,
    hasMore,
    loadMore,
    createPost,
    toggleLike,
    toggleReaction,
    addComment,
    deletePost,
    refetch: fetchPosts,
  }
}
