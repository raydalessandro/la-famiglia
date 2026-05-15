'use client'

import { useState } from 'react'
import { PostWithDetails, ReactionEmoji, REACTION_EMOJIS } from '@/types/database'
import { Avatar, MemberLink, ImageLightbox, MentionText } from '@/components/ui'
import { Poll } from './Poll'
import type { MemberPublic } from '@/types/database'

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
 * PostCard — palette navy, layout "FB-classico" riordinato:
 *
 *  1. Header: avatar + nome (NO timestamp inline col nome)
 *  2. Caption — subito sotto autore (no piu` "username text" inline)
 *  3. Poll (se c'e)
 *  4. Immagini full-bleed (se ci sono)
 *  5. Timestamp piccolo uppercase tracking
 *  6. Reactions chips inline (sostituisce `ReactionBar` globale per
 *     poter usare la palette del post senza toccare il componente UI)
 *  7. Action row: like, comment, share (decorative), bookmark (right)
 *  8. Count row: "X mi piace · Vedi tutti i N commenti"
 *
 * Hairline `border-b border-white/10` SOTTO ogni post: risolve il
 * problema "text-only spariva nello sfondo" segnalato sull'attuale
 * Instagram-minimal di main, senza tornare al box-card stile FB.
 *
 * NIENTE animazioni feedback click: cambi di stato solo via colore/
 * fill/border. `transition-colors` per hover OK.
 */
export function PostCard({
  post,
  currentMemberId,
  members,
  onLike,
  onBookmark,
  onReact,
  onDelete,
  onCommentsClick,
  onPollVote,
  onPollRetract,
}: {
  post: PostWithDetails
  currentMemberId: string | undefined
  members?: Pick<MemberPublic, 'id' | 'name'>[]
  onLike: (id: string) => void
  onBookmark?: (id: string) => void
  onReact: (id: string, emoji: ReactionEmoji) => void
  onDelete: (id: string) => void
  onCommentsClick?: (id: string) => void
  onPollVote?: (postId: string, optionId: string) => void
  onPollRetract?: (postId: string, optionId: string | null) => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [reactPickerOpen, setReactPickerOpen] = useState(false)
  const isOwn = post.author_id === currentMemberId
  const imageUrls = post.images?.map((i) => i.image_url) ?? []
  const likeCount = post.likes.length
  const commentCount = post.comments_count

  // Aggrega le reactions per emoji (count + se l'utente l'ha messa).
  const reactionGroups = post.reactions.reduce<
    Record<string, { count: number; mine: boolean }>
  >((acc, r) => {
    const key = r.emoji
    if (!acc[key]) acc[key] = { count: 0, mine: false }
    acc[key].count += 1
    if (r.member_id === currentMemberId) acc[key].mine = true
    return acc
  }, {})
  const reactionEntries = Object.entries(reactionGroups)

  return (
    <article className="border-b border-white/10 pt-3 pb-3 first:pt-1">
      {/* Header: avatar + nome (no timestamp inline) + delete */}
      <div className="flex items-center justify-between pb-2">
        <MemberLink
          memberId={post.author_id}
          ariaLabel={`Apri il profilo di ${post.author.name}`}
          className="flex items-center gap-3 min-w-0"
        >
          <Avatar
            emoji={post.author.avatar_emoji}
            url={post.author.avatar_url}
            name={post.author.name}
            size="sm"
            color={post.author.color}
            ringed
          />
          <span className="font-semibold text-white text-[15px] leading-tight truncate">
            {post.author.name}
          </span>
        </MemberLink>
        {isOwn && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-white/40 hover:text-red-400 transition-colors p-2 -mr-2 min-h-touch min-w-touch flex items-center justify-center"
            aria-label="Elimina post"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Caption — subito sotto autore (richiesta esplicita utente).
          Niente piu` "username caption" inline alla Instagram. */}
      {post.text && (
        <p className="text-white/90 text-body whitespace-pre-wrap pb-2 leading-snug">
          {members ? <MentionText text={post.text} members={members} /> : post.text}
        </p>
      )}

      {/* Poll */}
      {post.poll && onPollVote && onPollRetract && (
        <div className="pb-2">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Immagini — full-bleed via -mx-4. */}
      {post.images && post.images.length > 0 && (
        <div
          className={`-mx-4 grid gap-0.5 ${
            post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
              className={`relative overflow-hidden bg-white/5 ${
                post.images.length === 1 ? 'h-72' : 'h-40'
              } ${post.images.length === 3 && idx === 0 ? 'col-span-2' : ''}`}
            >
              <img
                src={img.image_url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {idx === 3 && post.images.length > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white font-bold text-xl">+{post.images.length - 4}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Timestamp piccolo — DOPO le foto come da richiesta utente.
          uppercase tracking-wider per dare peso da metadata. */}
      <p className="text-white/40 text-[11px] uppercase tracking-wider pt-2 pb-1">
        {formatRelativeTime(post.created_at)}
      </p>

      {/* Reactions chip inline — sostituisce ReactionBar globale per
          poter applicare palette navy localmente. Chip per ogni emoji
          esistente + bottone "+" che apre picker locale. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-1">
        {reactionEntries.map(([emoji, { count, mine }]) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(post.id, emoji as ReactionEmoji)}
            className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors ${
              mine
                ? 'border-[#E8A838]/40 bg-[#E8A838]/15 text-[#E8A838]'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
            aria-pressed={mine}
            aria-label={`${mine ? 'Rimuovi' : 'Aggiungi'} reazione ${emoji}`}
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="tabular-nums">{count}</span>
          </button>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => setReactPickerOpen((v) => !v)}
            className="flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 px-2 text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors"
            aria-label="Aggiungi reazione"
            aria-expanded={reactPickerOpen}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
            </svg>
          </button>
          {reactPickerOpen && (
            <div className="absolute bottom-full left-0 mb-2 flex gap-1 rounded-full border border-white/10 bg-[#1a1a2e] px-2 py-1.5 shadow-xl z-10">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onReact(post.id, e)
                    setReactPickerOpen(false)
                  }}
                  className="text-xl leading-none px-1"
                  aria-label={`Reagisci con ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action row — heart, comment, share (decorative), bookmark right */}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={() => onLike(post.id)}
          className="-ml-1 p-1 min-h-touch min-w-touch flex items-center justify-center"
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              post.liked_by_me ? 'text-[#E8A838] fill-[#E8A838]' : 'text-white/70 fill-none hover:text-[#E8A838]'
            }`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
        {onCommentsClick ? (
          <button
            type="button"
            onClick={() => onCommentsClick(post.id)}
            className="p-1 min-h-touch min-w-touch flex items-center justify-center"
            aria-label="Vedi commenti"
          >
            <svg className="w-6 h-6 text-white/70 hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        ) : (
          <div className="p-1 min-h-touch min-w-touch flex items-center justify-center">
            <svg className="w-6 h-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        )}
        {/* Share decorativa — paper-plane, lasciata per scelta utente
            (no-op aria-disabled, "al massimo lo togliamo dopo"). */}
        <button
          type="button"
          aria-label="Condividi (in arrivo)"
          aria-disabled="true"
          className="p-1 min-h-touch min-w-touch flex items-center justify-center text-white/40 cursor-default"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
        {onBookmark && (
          <button
            type="button"
            onClick={() => onBookmark(post.id)}
            className="ml-auto p-1 min-h-touch min-w-touch flex items-center justify-center"
            aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
            aria-pressed={post.bookmarked_by_me}
          >
            <svg
              className={`w-6 h-6 transition-colors ${
                post.bookmarked_by_me ? 'text-[#E8A838] fill-[#E8A838]' : 'text-white/70 fill-none hover:text-[#E8A838]'
              }`}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
            </svg>
          </button>
        )}
      </div>

      {/* Count row — visibile solo se c'e qualcosa da contare */}
      {(likeCount > 0 || commentCount > 0) && (
        <div className="text-white/60 text-xs pt-1">
          {likeCount > 0 && (
            <span>{likeCount} mi piace</span>
          )}
          {likeCount > 0 && commentCount > 0 && <span className="mx-1.5 text-white/30">·</span>}
          {commentCount > 0 && (
            onCommentsClick ? (
              <button
                type="button"
                onClick={() => onCommentsClick(post.id)}
                className="text-white/60 hover:text-white transition-colors"
              >
                Vedi {commentCount === 1 ? '1 commento' : `tutti i ${commentCount} commenti`}
              </button>
            ) : (
              <span>{commentCount} {commentCount === 1 ? 'commento' : 'commenti'}</span>
            )
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => { onDelete(post.id); setShowDeleteConfirm(false) }}
            className="flex-1 py-2 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium border border-red-500/30 hover:bg-red-500/30 transition-colors"
          >
            Elimina
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 py-2 rounded-xl bg-white/5 text-white/60 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Annulla
          </button>
        </div>
      )}
    </article>
  )
}
