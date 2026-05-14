'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRealtimeSubscription } from '@/lib/realtime'
import { compressImage } from '@/lib/storage'
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
  sendMessage: (text: string, replyToMessageId?: string | null) => Promise<boolean>
  sendMediaMessage: (file: File, messageType: 'image' | 'document') => Promise<boolean>
  editMessage: (id: string, text: string) => Promise<boolean>
  deleteMessage: (id: string) => Promise<boolean>
  markAsRead: () => Promise<void>
}

const DELETED_PLACEHOLDER = '[Messaggio eliminato]'

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
      // Server paginates DESC (page 1 = most recent). The chat UI renders
      // ASC (older on top, newer at the bottom — WhatsApp / Telegram
      // convention) so we reverse the page locally. Subsequent loadMore
      // pages get prepended after the same flip.
      setMessages([...result.data].reverse())
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

  // Realtime: INSERT → append; UPDATE → merge edited_at/deleted_at/text.
  // Il payload realtime contiene SOLO la riga raw (senza join), quindi
  // arricchiamo author dai members già caricati lato client e ricostruiamo
  // reply_to da `messages` locali (best-effort). Se il messaggio citato non
  // è nei messaggi caricati (es. cita un messaggio molto vecchio), reply_to
  // resta null per questo evento; al prossimo refresh la GET arricchirà
  // correttamente la citation.
  useRealtimeSubscription<ChatMessage>(
    'chat_messages',
    (event, payload) => {
      const incoming = payload.new ?? payload.old
      if (!incoming || incoming.group_id !== groupId) return

      if (event === 'INSERT' && payload.new) {
        const msg = payload.new
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
        setMessages((prev) => {
          // Dedup: il sender vede già il messaggio dal POST response, gli
          // altri lo ricevono qui.
          if (prev.some((m) => m.id === msg.id)) return prev
          const cited = msg.reply_to_message_id
            ? prev.find((m) => m.id === msg.reply_to_message_id)
            : null
          const replyRef = cited
            ? {
                id: cited.id,
                text: cited.deleted_at ? DELETED_PLACEHOLDER : cited.text,
                author: {
                  id: cited.author.id,
                  name: cited.author.name,
                  color: cited.author.color,
                },
              }
            : null
          const text = msg.deleted_at ? DELETED_PLACEHOLDER : msg.text
          const enriched: ChatMessageWithAuthor = {
            ...msg,
            text,
            author,
            reply_to: replyRef,
          }
          return [...prev, enriched]
        })
      } else if (event === 'UPDATE' && payload.new) {
        // Edit (edited_at, text) e soft-delete (deleted_at) arrivano qui.
        const msg = payload.new
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msg.id) return m
            const text = msg.deleted_at ? DELETED_PLACEHOLDER : msg.text
            return {
              ...m,
              text,
              edited_at: msg.edited_at,
              deleted_at: msg.deleted_at,
            }
          }),
        )
      }
    },
    `group_id=eq.${groupId}`,
    true
  )

  const loadMore = useCallback(async () => {
    const nextPage = page + 1
    try {
      const res = await fetch(buildUrl(nextPage))
      const result: PaginatedResponse<ChatMessageWithAuthor> = await res.json()
      // Same flip as fetchMessages: server gives us DESC, we keep state
      // ASC. Page N+1 contains messages older than page N, so its reversed
      // form goes at the TOP of the existing list.
      setMessages((prev) => [...[...result.data].reverse(), ...prev])
      setHasMore(result.has_more)
      setPage(nextPage)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more messages')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, groupId])

  const sendMessage = useCallback(
    async (text: string, replyToMessageId?: string | null): Promise<boolean> => {
      try {
        const body: { text: string; reply_to_message_id?: string } = { text }
        if (replyToMessageId) body.reply_to_message_id = replyToMessageId
        const res = await fetch(`/api/chat/groups/${groupId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        return res.ok
        // Realtime subscription handles appending the new message for other
        // clients; the sender's optimistic insertion arrives via realtime too.
      } catch {
        return false
      }
    },
    [groupId],
  )

  const editMessage = useCallback(async (id: string, text: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/chat/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        // Optimistic local update (in attesa che il realtime UPDATE arrivi
        // anche al sender stesso). Niente race: se l'UPDATE arriva dopo,
        // il merge in setMessages è idempotente.
        const editedAt = new Date().toISOString()
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text, edited_at: editedAt } : m)),
        )
      }
      return res.ok
    } catch {
      return false
    }
  }, [])

  const deleteMessage = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/chat/messages/${id}`, { method: 'DELETE' })
      if (res.ok) {
        const deletedAt = new Date().toISOString()
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, text: DELETED_PLACEHOLDER, deleted_at: deletedAt } : m,
          ),
        )
      }
      return res.ok
    } catch {
      return false
    }
  }, [])

  const sendMediaMessage = useCallback(
    async (file: File, messageType: 'image' | 'document'): Promise<boolean> => {
      try {
        // For images, compress client-side to webp (or jpeg fallback) before
        // upload to keep bandwidth low and dodge HEIC / unsupported MIME
        // types. If compression fails we still ship the original — the
        // server-side ALLOWED_TYPES validation will reject HEIC explicitly,
        // which is a better UX than a silent freeze.
        let toUpload = file
        if (messageType === 'image') {
          try {
            toUpload = await compressImage(file)
          } catch (err) {
            // Log per debug Eruda: vediamo l'errore reale al prossimo
            // problema invece di doverci tornare sopra.
            console.error('[sendMediaMessage] compression failed:', err)
          }
        }

        const formData = new FormData()
        formData.append('file', toUpload)
        formData.append('message_type', messageType)

        const res = await fetch(`/api/chat/groups/${groupId}/messages`, {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          console.error('[sendMediaMessage] upload failed:', res.status, await res.text().catch(() => ''))
        }
        return res.ok
      } catch (err) {
        console.error('[sendMediaMessage] unexpected error:', err)
        return false
      }
    },
    [groupId]
  )

  return {
    messages,
    isLoading,
    error,
    hasMore,
    loadMore,
    sendMessage,
    sendMediaMessage,
    editMessage,
    deleteMessage,
    markAsRead,
  }
}
