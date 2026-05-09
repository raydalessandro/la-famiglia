'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { uploadImage } from '@/lib/storage'
import {
  ChatGroupWithDetails,
  ChatMessageWithAuthor,
  ChatMessage,
  CreateChatGroupInput,
  MemberPublic,
  ApiResponse,
  PaginatedResponse,
} from '@/types/database'

const PER_PAGE = 30

// ─── useChatGroups ────────────────────────────────────────────────────────────

type UseChatGroupsReturn = {
  groups: ChatGroupWithDetails[]
  isLoading: boolean
  error: string | null
  createGroup: (input: CreateChatGroupInput) => Promise<string | null>
  refetch: () => Promise<void>
}

export function useChatGroups(): UseChatGroupsReturn {
  const [groups, setGroups] = useState<ChatGroupWithDetails[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchGroups = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/chat/groups')
      const result: ApiResponse<ChatGroupWithDetails[]> = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setGroups(result.data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch chat groups')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  // Any INSERT in chat_messages refreshes the group list (unread counts, last message)
  useRealtimeSubscription<ChatMessage>(
    'chat_messages',
    (event) => { if (event === 'INSERT') fetchGroups() },
    undefined,
    true
  )

  const createGroup = useCallback(async (input: CreateChatGroupInput): Promise<string | null> => {
    try {
      const res = await fetch('/api/chat/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) return null
      const result: ApiResponse<ChatGroupWithDetails> = await res.json()
      if (result.data) {
        await fetchGroups()
        return result.data.id
      }
      return null
    } catch {
      return null
    }
  }, [fetchGroups])

  return { groups, isLoading, error, createGroup, refetch: fetchGroups }
}

// ─── useChat ──────────────────────────────────────────────────────────────────

type UseChatReturn = {
  messages: ChatMessageWithAuthor[]
  isLoading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => Promise<void>
  sendMessage: (text: string) => Promise<boolean>
  sendMediaMessage: (file: File, messageType: 'image' | 'document') => Promise<boolean>
  markAsRead: () => Promise<void>
}

export function useChat(groupId: string, members: MemberPublic[]): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageWithAuthor[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<boolean>(false)
  const [page, setPage] = useState<number>(1)

  const buildUrl = (p: number) =>
    `/api/chat/groups/${groupId}/messages?page=${p}&per_page=${PER_PAGE}`

  const fetchMessages = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(buildUrl(1))
      const result: PaginatedResponse<ChatMessageWithAuthor> = await res.json()
      setMessages(result.data)
      setHasMore(result.has_more)
      setPage(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch messages')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  const markAsRead = useCallback(async () => {
    try {
      // Side effect: fetching page 1 updates the read status on the server
      await fetch(buildUrl(1))
    } catch {
      // Non-critical, ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // Auto mark-as-read on mount and window focus
  useEffect(() => {
    markAsRead()
    const onFocus = () => markAsRead()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [markAsRead])

  // Realtime: enrich INSERT payload with author and append
  useRealtimeSubscription<ChatMessage>(
    'chat_messages',
    (event, payload) => {
      if (event !== 'INSERT' || !payload.new) return
      const msg = payload.new
      if (msg.group_id !== groupId) return
      const author = members.find((m) => m.id === msg.author_id) ?? {
        id: msg.author_id,
        name: 'Unknown',
        avatar_emoji: null,
        avatar_url: null,
        family_role: '',
        bio: '',
        is_admin: false,
        is_active: true,
        color: '#000000',
      }
      const enriched: ChatMessageWithAuthor = { ...msg, author }
      setMessages((prev) => {
        // Dedup: avoid duplicates from realtime reconnects / backfills
        if (prev.some((m) => m.id === enriched.id)) return prev
        return [...prev, enriched]
      })
    },
    `group_id=eq.${groupId}`,
    true
  )

  const loadMore = useCallback(async () => {
    const nextPage = page + 1
    try {
      const res = await fetch(buildUrl(nextPage))
      const result: PaginatedResponse<ChatMessageWithAuthor> = await res.json()
      setMessages((prev) => [...result.data, ...prev])
      setHasMore(result.has_more)
      setPage(nextPage)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more messages')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, groupId])

  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/chat/groups/${groupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      return res.ok
      // Realtime subscription handles appending the new message
    } catch {
      return false
    }
  }, [groupId])

  const sendMediaMessage = useCallback(
    async (file: File, messageType: 'image' | 'document'): Promise<boolean> => {
      try {
        const ext = file.name.split('.').pop() ?? 'bin'
        const path = `${groupId}/${Date.now()}.${ext}`
        const mediaUrl = await uploadImage('chat', file, path)
        const res = await fetch(`/api/chat/groups/${groupId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_type: messageType, media_url: mediaUrl, text: '' }),
        })
        return res.ok
      } catch {
        return false
      }
    },
    [groupId]
  )

  return { messages, isLoading, error, hasMore, loadMore, sendMessage, sendMediaMessage, markAsRead }
}
