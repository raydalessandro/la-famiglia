'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useChat, useChatGroups } from '@/hooks/useChat'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import {
  Avatar,
  BottomSheet,
  Header,
  useToast,
  EmptyState,
  MemberLink,
  MentionText,
} from '@/components/ui'
import { ChatMessageWithAuthor } from '@/types/database'

const FAMILY_EMOJIS = ['❤️', '😂', '😍', '🎉', '👏', '🙏', '😊', '🥰', '😘', '👋', '😎', '🤣', '😢', '🤔', '💪', '✨']

// Finestra entro cui l'autore può modificare il proprio messaggio. Stessa
// costante del server (/api/chat/messages/[id]/route.ts) — duplicata per
// evitare di mostrare l'azione "Modifica" lato client quando il server la
// rifiuterebbe già. Server resta source of truth.
const EDIT_WINDOW_MS = 2 * 60 * 1000

const LONG_PRESS_MS = 500

const DELETED_PLACEHOLDER = '[Messaggio eliminato]'

export default function ChatRoomPage() {
  const params = useParams()
  const groupId = params.id as string

  const { member } = useAuth()
  const { members } = useMembers()
  const { groups } = useChatGroups()
  const {
    messages,
    isLoading,
    hasMore,
    loadMore,
    sendMessage,
    sendMediaMessage,
    editMessage,
    deleteMessage,
  } = useChat(groupId, members)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  // Reply: quando non-null, il composer è in modalità "rispondi a" e mostra
  // la sticky bar di citazione sopra. L'invio successivo include
  // `reply_to_message_id` poi resetta a null.
  const [replyingTo, setReplyingTo] = useState<ChatMessageWithAuthor | null>(null)
  // Long-press menu: il messaggio bersaglio dell'attuale gesto long-press;
  // null = menu chiuso.
  const [actionMenuFor, setActionMenuFor] = useState<ChatMessageWithAuthor | null>(null)
  // Edit inline: id del messaggio in modifica + buffer del testo modificato.
  // Mutualmente esclusivo con `replyingTo`.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Highlight transitorio quando si naviga a un messaggio citato via tap
  // sulla preview embedded. Si autopulisce dopo 1.2s.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const toast = useToast()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const prevScrollHeight = useRef(0)
  const hasScrolledToBottom = useRef(false)

  // Refs per ogni bubble messaggio: ci servono per scrollare al messaggio
  // citato quando si tappa la preview embedded.
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Timer del long-press (touch + mouse) — un timer per gesto, riazzerato
  // al touchend/mouseup/move.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const group = groups.find((g) => g.id === groupId)

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

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
    const replyId = replyingTo?.id ?? null
    setReplyingTo(null)
    const ok = await sendMessage(trimmed, replyId)
    if (!ok) toast.error("Errore nell'invio. Riprova.")
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
    e.target.value = ''
    setUploadingMedia(true)
    const ok = await sendMediaMessage(file, 'image')
    setUploadingMedia(false)
    if (!ok) {
      toast.error("Errore nell'invio dell'immagine. Riprova.")
    }
  }

  /** Apre il menu azioni sul messaggio target. Chiamato dal long-press
   * handler dopo LONG_PRESS_MS. Niente menu sui bubble eliminati (non c'è
   * azione possibile) e niente menu mentre si sta editando un altro
   * messaggio (focus mode). */
  const openActionMenu = (msg: ChatMessageWithAuthor) => {
    if (msg.deleted_at) return
    if (editingId) return
    setActionMenuFor(msg)
  }

  const startLongPress = (msg: ChatMessageWithAuthor) => {
    clearLongPress()
    longPressTimer.current = setTimeout(() => openActionMenu(msg), LONG_PRESS_MS)
  }

  /** Tap sulla card embedded di citazione → scroll al messaggio originale
   * + highlight 1.2s. Se l'originale non è caricato (scrollato oltre la
   * pagina iniziale o hard-deleted) silenziamo. */
  const scrollToMessage = (id: string) => {
    const el = messageRefs.current.get(id)
    if (!el) {
      toast.info('Il messaggio citato non è più disponibile.')
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(id)
    setTimeout(() => setHighlightId((curr) => (curr === id ? null : curr)), 1200)
  }

  const handleReply = (msg: ChatMessageWithAuthor) => {
    setReplyingTo(msg)
    setActionMenuFor(null)
    textareaRef.current?.focus()
  }

  const handleStartEdit = (msg: ChatMessageWithAuthor) => {
    setEditingId(msg.id)
    setEditText(msg.text)
    setActionMenuFor(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const trimmed = editText.trim()
    if (!trimmed) return
    const ok = await editMessage(editingId, trimmed)
    if (ok) {
      setEditingId(null)
      setEditText('')
    } else {
      toast.error('Non riesco a modificare il messaggio. Probabilmente il tempo è scaduto (2 minuti).')
    }
  }

  const handleDelete = async (msg: ChatMessageWithAuthor) => {
    setActionMenuFor(null)
    const ok = await deleteMessage(msg.id)
    if (!ok) toast.error('Non riesco a eliminare il messaggio.')
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

  /** Lato client mostriamo "Modifica" solo se il messaggio è del current
   * member, non è deleted, ed è ancora dentro la finestra di edit. Il
   * server ricontrolla comunque (source of truth). */
  const canEdit = (msg: ChatMessageWithAuthor): boolean => {
    if (!member || msg.author_id !== member.id) return false
    if (msg.deleted_at) return false
    return Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS
  }

  const canDelete = (msg: ChatMessageWithAuthor): boolean => {
    if (!member || msg.author_id !== member.id) return false
    if (msg.deleted_at) return false
    return true
  }

  return (
    <div className="flex h-dvh flex-col bg-[#1a1a2e]">
      <Header title={group?.name ?? 'Chat'} showBack />

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

                const isDeleted = !!msg.deleted_at
                const isEdited = !!msg.edited_at && !isDeleted
                const isEditing = editingId === msg.id
                const isHighlighted = highlightId === msg.id

                return (
                  <div
                    key={msg.id}
                    ref={(el) => {
                      if (el) messageRefs.current.set(msg.id, el)
                      else messageRefs.current.delete(msg.id)
                    }}
                    className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${
                      isFirstOfGroup ? 'mt-3' : 'mt-0.5'
                    } ${isHighlighted ? 'animate-pulse' : ''} transition-all`}
                  >
                    {/* Avatar — solo sul primo bubble del cluster incoming */}
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
                      {/* Nome autore */}
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

                      {/* Embedded reply — card piccola sopra il bubble con
                       *   bar verticale colore membro citato + nome + text
                       *   troncato. Tap → scroll al messaggio originale. */}
                      {msg.reply_to && (
                        <button
                          type="button"
                          onClick={() => scrollToMessage(msg.reply_to!.id)}
                          aria-label={`Vai al messaggio di ${msg.reply_to.author.name}`}
                          className={`mb-1 max-w-full text-left rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition-colors border-l-[3px] ${
                            isOwn ? 'mr-1' : 'ml-1'
                          }`}
                          style={{ borderLeftColor: msg.reply_to.author.color || '#E8A838' }}
                        >
                          <div className="px-2.5 py-1.5">
                            <p
                              className="text-[12px] font-semibold leading-tight"
                              style={{ color: msg.reply_to.author.color || '#E8A838' }}
                            >
                              {msg.reply_to.author.name}
                            </p>
                            <p className="text-[12px] text-white/70 truncate leading-tight">
                              {msg.reply_to.text}
                            </p>
                          </div>
                        </button>
                      )}

                      {/* Bubble */}
                      <div
                        onContextMenu={(e) => {
                          e.preventDefault()
                          openActionMenu(msg)
                        }}
                        onTouchStart={() => !isEditing && startLongPress(msg)}
                        onTouchEnd={clearLongPress}
                        onTouchMove={clearLongPress}
                        onTouchCancel={clearLongPress}
                        onMouseDown={(e) => {
                          // Solo tasto sinistro, e niente long-press in editing
                          if (e.button === 0 && !isEditing) startLongPress(msg)
                        }}
                        onMouseUp={clearLongPress}
                        onMouseLeave={clearLongPress}
                        className={`rounded-bubble text-body break-words overflow-hidden select-none ${
                          isOwn
                            ? `bg-accent text-surface font-medium ${isLastOfGroup ? 'rounded-br-md' : ''}`
                            : `bg-surface-raised text-white ${isLastOfGroup ? 'rounded-bl-md' : ''}`
                        } ${isDeleted ? 'italic opacity-60' : ''} ${
                          isHighlighted ? 'ring-2 ring-[#E8A838]' : ''
                        }`}
                      >
                        {isEditing ? (
                          <div className="px-3 py-2 flex flex-col gap-2 min-w-[200px]">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              autoFocus
                              rows={2}
                              className={`w-full resize-none bg-transparent outline-none ${
                                isOwn ? 'text-surface placeholder-surface/50' : 'text-white placeholder-white/40'
                              }`}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSaveEdit()
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit()
                                }
                              }}
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={handleCancelEdit}
                                className={`text-[12px] font-medium px-2 py-1 rounded-md ${
                                  isOwn ? 'text-surface/70 hover:text-surface' : 'text-white/60 hover:text-white'
                                }`}
                              >
                                Annulla
                              </button>
                              <button
                                onClick={handleSaveEdit}
                                disabled={!editText.trim() || editText.trim() === msg.text}
                                className={`text-[12px] font-semibold px-2 py-1 rounded-md disabled:opacity-40 ${
                                  isOwn ? 'text-surface' : 'text-[#E8A838]'
                                }`}
                              >
                                Salva
                              </button>
                            </div>
                          </div>
                        ) : msg.message_type === 'image' && msg.media_url && !isDeleted ? (
                          <div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={msg.media_url}
                              alt="immagine"
                              className="max-h-72 w-auto object-cover cursor-pointer rounded-bubble"
                              onClick={() => window.open(msg.media_url ?? '', '_blank')}
                            />
                            {msg.text && (
                              <p className="px-3.5 pb-2 pt-1">
                                <MentionText text={msg.text} members={members} />
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="px-3.5 py-2">
                            <MentionText text={msg.text} members={members} />
                          </div>
                        )}
                      </div>

                      {/* Timestamp + badge "modificato" — solo sull'ultimo
                       *   bubble del cluster. */}
                      {isLastOfGroup && !isEditing && (
                        <span className="text-[11px] text-white/40 mt-1 px-1 flex items-center gap-1">
                          <span>{formatTime(msg.created_at)}</span>
                          {isEdited && (
                            <span className="text-white/30" aria-label="Messaggio modificato">
                              · modificato
                            </span>
                          )}
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

      {/* Sticky reply bar — appare sopra il composer quando si sta
       *   rispondendo a un messaggio. Mostra autore + preview testo + X
       *   per annullare. Il send successivo include reply_to_message_id. */}
      {replyingTo && (
        <div
          className="shrink-0 border-t border-white/10 bg-[#1a1a2e] px-3 py-2 flex items-center gap-2"
          style={{ borderLeft: `3px solid ${replyingTo.author.color || '#E8A838'}` }}
        >
          <div className="flex-1 min-w-0">
            <p
              className="text-[12px] font-semibold leading-tight"
              style={{ color: replyingTo.author.color || '#E8A838' }}
            >
              Rispondi a {replyingTo.author.name}
            </p>
            <p className="text-[12px] text-white/60 truncate leading-tight">
              {replyingTo.text}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="shrink-0 w-8 h-8 rounded-full hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
            aria-label="Annulla risposta"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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
          <button
            onClick={() => setShowEmojiPicker((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20 transition-colors active:scale-95"
            aria-label="Emoji"
          >
            😊
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />

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
            placeholder={replyingTo ? `Rispondi a ${replyingTo.author.name}…` : 'Scrivi un messaggio…'}
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

      {/* Action menu — long-press / right-click su un bubble apre questa
       *   bottom sheet. Le voci sono condizionali a ownership + finestra
       *   di edit. Niente menu sui bubble eliminati (già filtrato sopra). */}
      <BottomSheet
        isOpen={actionMenuFor !== null}
        onClose={() => setActionMenuFor(null)}
        title="Azioni messaggio"
      >
        {actionMenuFor && (
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => handleReply(actionMenuFor)}
              className="flex items-center gap-3 min-h-touch px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-body font-medium text-left transition-colors"
            >
              <span className="text-xl" aria-hidden="true">↩️</span>
              Rispondi
            </button>
            {canEdit(actionMenuFor) && (
              <button
                onClick={() => handleStartEdit(actionMenuFor)}
                className="flex items-center gap-3 min-h-touch px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-body font-medium text-left transition-colors"
              >
                <span className="text-xl" aria-hidden="true">✏️</span>
                Modifica
              </button>
            )}
            {canDelete(actionMenuFor) && (
              <button
                onClick={() => handleDelete(actionMenuFor)}
                className="flex items-center gap-3 min-h-touch px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-body font-medium text-left transition-colors"
              >
                <span className="text-xl" aria-hidden="true">🗑️</span>
                Elimina
              </button>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
