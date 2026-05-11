'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useChat, useChatGroups } from '@/hooks/useChat'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, Header, useToast, EmptyState, MemberLink } from '@/components/ui'

const FAMILY_EMOJIS = ['❤️', '😂', '😍', '🎉', '👏', '🙏', '😊', '🥰', '😘', '👋', '😎', '🤣', '😢', '🤔', '💪', '✨']

export default function ChatRoomPage() {
  const params = useParams()
  const groupId = params.id as string

  const { member } = useAuth()
  const { members } = useMembers()
  const { groups } = useChatGroups()
  const { messages, isLoading, hasMore, loadMore, sendMessage, sendMediaMessage } = useChat(groupId, members)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const toast = useToast()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const prevScrollHeight = useRef(0)
  const hasScrolledToBottom = useRef(false)

  const group = groups.find((g) => g.id === groupId)

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showEmojiPicker])

  // Auto-scroll to bottom on new messages (but not when loading older ones).
  // First time: jump immediately so the freshest message lines up against the
  // input bar (smooth scroll on mount races with layout and can leave the
  // view stuck mid-page, which looks like the messages are "cut off").
  useEffect(() => {
    if (loadingMore || messages.length === 0) return
    if (!listRef.current) return
    if (!hasScrolledToBottom.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
      hasScrolledToBottom.current = true
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loadingMore])

  // Preserve scroll position when prepending old messages
  useEffect(() => {
    if (loadingMore && listRef.current) {
      const newScrollHeight = listRef.current.scrollHeight
      listRef.current.scrollTop = newScrollHeight - prevScrollHeight.current
      setLoadingMore(false)
    }
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = async () => {
    if (!listRef.current || loadingMore || !hasMore) return
    if (listRef.current.scrollTop < 60) {
      prevScrollHeight.current = listRef.current.scrollHeight
      setLoadingMore(true)
      await loadMore()
    }
  }

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    await sendMessage(trimmed)
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleEmojiClick = (emoji: string) => {
    setText((prev) => prev + emoji)
    setShowEmojiPicker(false)
    textareaRef.current?.focus()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be selected again
    e.target.value = ''
    setUploadingMedia(true)
    const ok = await sendMediaMessage(file, 'image')
    setUploadingMedia(false)
    if (!ok) {
      toast.error("Errore nell'invio dell'immagine. Riprova.")
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Oggi'
    if (d.toDateString() === yesterday.toDateString()) return 'Ieri'
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  }

  // Group messages by date
  const grouped: { date: string; msgs: typeof messages }[] = []
  messages.forEach((msg) => {
    const date = formatDate(msg.created_at)
    const last = grouped[grouped.length - 1]
    if (last && last.date === date) {
      last.msgs.push(msg)
    } else {
      grouped.push({ date, msgs: [msg] })
    }
  })

  return (
    <div className="flex h-dvh flex-col bg-[#1a1a2e]">
      <Header
        title={group?.name ?? 'Chat'}
        showBack
      />

      {/* Message list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-1"
      >
        {/* Load more indicator */}
        {hasMore && (
          <div className="flex justify-center py-2">
            {loadingMore ? (
              <div className="h-5 w-5 rounded-full border-2 border-[#E8A838] border-t-transparent animate-spin" />
            ) : (
              <button
                onClick={async () => {
                  if (!listRef.current) return
                  prevScrollHeight.current = listRef.current.scrollHeight
                  setLoadingMore(true)
                  await loadMore()
                }}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Carica messaggi precedenti
              </button>
            )}
          </div>
        )}

        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 rounded-full border-2 border-[#E8A838] border-t-transparent animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon="💬"
            title="Nessun messaggio"
            description="Scrivi il primo messaggio per iniziare la conversazione."
          />
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date}>
              {/* Date separator */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs text-white/40 font-medium px-2">{date}</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {msgs.map((msg, i) => {
                const isOwn = msg.author_id === member?.id
                const prevMsg = i > 0 ? msgs[i - 1] : null
                const nextMsg = i < msgs.length - 1 ? msgs[i + 1] : null

                // WhatsApp-style grouping: consecutive messages from the same
                // author within 5 minutes are one cluster. The first bubble
                // of an incoming cluster shows author name; the last bubble
                // of any cluster shows the timestamp. Everything in between
                // is just bubble bubble bubble.
                const FIVE_MIN = 5 * 60 * 1000
                const sameAuthorAsPrev = prevMsg?.author_id === msg.author_id
                const sameAuthorAsNext = nextMsg?.author_id === msg.author_id
                const closeToPrev =
                  prevMsg &&
                  new Date(msg.created_at).getTime() -
                    new Date(prevMsg.created_at).getTime() <
                    FIVE_MIN
                const closeToNext =
                  nextMsg &&
                  new Date(nextMsg.created_at).getTime() -
                    new Date(msg.created_at).getTime() <
                    FIVE_MIN

                const isFirstOfGroup = !sameAuthorAsPrev || !closeToPrev
                const isLastOfGroup = !sameAuthorAsNext || !closeToNext

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${
                      isFirstOfGroup ? 'mt-3' : 'mt-0.5'
                    }`}
                  >
                    {/* Avatar shown on the FIRST bubble of an incoming cluster.
                     * Placeholder keeps the alignment for following bubbles. */}
                    {!isOwn && (
                      <div className="w-8 shrink-0">
                        {isFirstOfGroup && (
                          <MemberLink
                            memberId={msg.author_id}
                            ariaLabel={`Apri il profilo di ${msg.author.name}`}
                          >
                            <Avatar
                              emoji={msg.author.avatar_emoji}
                              url={msg.author.avatar_url}
                              name={msg.author.name}
                              size="sm"
                              color={msg.author.color}
                            />
                          </MemberLink>
                        )}
                      </div>
                    )}

                    <div className={`max-w-[78%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                      {/* Sender name — only on the first incoming bubble of a
                       * cluster, coloured by the author's identity colour so
                       * older readers track who said what at a glance. */}
                      {isFirstOfGroup && !isOwn && (
                        <MemberLink
                          memberId={msg.author_id}
                          ariaLabel={`Apri il profilo di ${msg.author.name}`}
                          className="mb-0.5 ml-1"
                        >
                          <span
                            className="text-[13px] font-semibold"
                            style={{ color: msg.author.color || '#E8A838' }}
                          >
                            {msg.author.name}
                          </span>
                        </MemberLink>
                      )}

                      {/* Bubble — radius pinned at the corner closest to the
                       * speaker (WhatsApp 2024 redesign): outgoing tucks at
                       * bottom-right, incoming at bottom-left. Only the LAST
                       * bubble in a cluster gets the corner — intermediate
                       * bubbles stay fully rounded, which visually welds the
                       * cluster together. */}
                      <div
                        className={`rounded-bubble text-body break-words overflow-hidden ${
                          isOwn
                            ? `bg-accent text-surface font-medium ${isLastOfGroup ? 'rounded-br-md' : ''}`
                            : `bg-surface-raised text-white ${isLastOfGroup ? 'rounded-bl-md' : ''}`
                        }`}
                      >
                        {msg.message_type === 'image' && msg.media_url ? (
                          <div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={msg.media_url}
                              alt="immagine"
                              className="max-h-72 w-auto object-cover cursor-pointer rounded-bubble"
                              onClick={() => window.open(msg.media_url ?? '', '_blank')}
                            />
                            {msg.text && (
                              <p className="px-3.5 pb-2 pt-1">{msg.text}</p>
                            )}
                          </div>
                        ) : (
                          <div className="px-3.5 py-2">{msg.text}</div>
                        )}
                      </div>

                      {/* Timestamp only on the last bubble of each cluster. */}
                      {isLastOfGroup && (
                        <span className="text-[11px] text-white/40 mt-1 px-1">
                          {formatTime(msg.created_at)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/10 bg-[#1a1a2e] px-3 py-3 pb-safe">
        {/* Emoji picker overlay */}
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className="mb-2 grid grid-cols-8 gap-1 rounded-2xl bg-white/10 p-2"
          >
            {FAMILY_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-xl hover:bg-white/20 active:scale-90 transition-transform"
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Emoji toggle button */}
          <button
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20 transition-colors active:scale-95"
            aria-label="Emoji"
          >
            😊
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Image attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingMedia}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20 transition-colors active:scale-95 disabled:opacity-40"
            aria-label="Allega immagine"
          >
            {uploadingMedia ? (
              <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              '📎'
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi un messaggio…"
            rows={1}
            className="flex-1 resize-none rounded-2xl bg-white/10 px-4 py-2.5 text-body text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-[#E8A838] max-h-32"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8A838] text-[#1a1a2e] disabled:opacity-40 transition-opacity active:scale-95"
            aria-label="Invia"
          >
            {sending ? (
              <div className="h-4 w-4 rounded-full border-2 border-[#1a1a2e] border-t-transparent animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
