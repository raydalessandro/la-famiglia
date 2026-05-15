'use client'

import { useState } from 'react'
import { PostWithDetails, ReactionEmoji, REACTION_EMOJIS } from '@/types/database'
import { Avatar, MemberLink, ImageLightbox, MentionText } from '@/components/ui'
import { Poll } from './Poll'
import type { MemberPublic } from '@/types/database'

/** Set di reazioni — stesso del componente globale ReactionBar (tipo
 * fortemente tipizzato dal DB). Nel feed light minimal lo renderizziamo
 * inline come chips hairline invece di usare ReactionBar.tsx, che è
 * styled per il vecchio look dark. */
const REACTION_CHOICES: readonly ReactionEmoji[] = REACTION_EMOJIS

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
 * PostCard — stile Threads / light minimal.
 *
 * Layout:
 *  - Header: avatar 36px · username "·" timestamp · (delete su own) a destra.
 *  - Media full-bleed con bordo morbido (rounded-lg = 8px).
 *  - Action row LEFT-aligned: heart, comment, share (decorative), bookmark.
 *  - Reactions: chip inline minimali (NO ReactionBar globale dark-themed).
 *  - Caption SOTTO le icone (NO inline-with-username, Threads non lo fa).
 *  - Count row: "12 piaceri · 5 risposte" subdued.
 *
 * Separatore: NIENTE bg / border esterno; hairline `border-b` di colore
 * #EAEAEA SOTTO ogni post — risolve il problema "text-only spariva nello
 * sfondo" e mantiene l'estetica Threads (post divisi da divider sottili).
 *
 * NIENTE animazioni feedback: solo cambi colore/fill/opacità su tap.
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

  // Aggrega le reactions per emoji (count + se l'utente corrente ha messo
  // quella reazione). Mantiene ordine stabile di inserimento.
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
    <article className="border-b border-[#EAEAEA] pb-3 pt-3 first:pt-1">
      {/* Header */}
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
          />
          <div className="min-w-0 flex items-baseline gap-1.5">
            <span className="font-semibold text-[#0F0F0F] text-[15px] leading-tight">
              {post.author.name}
            </span>
            <span className="text-[#707070] text-[13px] leading-tight">
              · {formatRelativeTime(post.created_at)}
            </span>
          </div>
        </MemberLink>
        {isOwn && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[#707070] hover:text-[#0F0F0F] transition-colors p-2 -mr-2 min-h-touch min-w-touch flex items-center justify-center"
            aria-label="Elimina post"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Poll */}
      {post.poll && onPollVote && onPollRetract && (
        <div className="pb-3">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Immagini — bordo morbido 8px, grid 2 col gap 2px se multi. */}
      {post.images && post.images.length > 0 && (
        <div
          className={`grid gap-0.5 overflow-hidden rounded-lg ${
            post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
              className={`relative overflow-hidden bg-[#EAEAEA] ${
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
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white font-semibold text-xl">+{post.images.length - 4}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Action row — left-aligned, thin-stroke 1.5, gap-5. */}
      <div className="flex items-center gap-5 pt-3">
        <button
          type="button"
          onClick={() => onLike(post.id)}
          className="-ml-1 min-h-touch min-w-touch flex items-center justify-center"
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          <svg
            className={`w-6 h-6 ${
              post.liked_by_me ? 'text-[#0F0F0F] fill-[#0F0F0F]' : 'text-[#0F0F0F] fill-none'
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
            className="min-h-touch min-w-touch flex items-center justify-center"
            aria-label="Vedi commenti"
          >
            <svg className="w-6 h-6 text-[#0F0F0F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </button>
        ) : (
          <div className="min-h-touch min-w-touch flex items-center justify-center" aria-hidden="true">
            <svg className="w-6 h-6 text-[#0F0F0F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
        )}
        {/* Share — decorativa: il "paper-plane" Threads non ha azione qui
            (per ora). Lasciata come affordance visiva, no-op tap. */}
        <div className="min-h-touch min-w-touch flex items-center justify-center" aria-hidden="true">
          <svg className="w-6 h-6 text-[#0F0F0F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
        {/* React picker trigger — discreto smiley col "+" implicito. */}
        <button
          type="button"
          onClick={() => setReactPickerOpen((v) => !v)}
          className="min-h-touch min-w-touch flex items-center justify-center"
          aria-label="Aggiungi reazione"
          aria-expanded={reactPickerOpen}
        >
          <svg className={`w-6 h-6 ${reactPickerOpen ? 'text-[#5856D6]' : 'text-[#0F0F0F]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
          </svg>
        </button>
        {onBookmark && (
          <button
            type="button"
            onClick={() => onBookmark(post.id)}
            className="ml-auto min-h-touch min-w-touch flex items-center justify-center -mr-1"
            aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
            aria-pressed={post.bookmarked_by_me}
          >
            <svg
              className={`w-6 h-6 ${
                post.bookmarked_by_me ? 'text-[#0F0F0F] fill-[#0F0F0F]' : 'text-[#0F0F0F] fill-none'
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

      {/* Picker reazioni — appare inline sotto le icone quando aperto.
          Hairline chip, niente bg pieno; minimal Threads-style. */}
      {reactPickerOpen && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {REACTION_CHOICES.map((e) => {
            const mine = reactionGroups[e]?.mine
            return (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onReact(post.id, e)
                  setReactPickerOpen(false)
                }}
                className={`min-h-touch px-3 rounded-full border text-base leading-none flex items-center justify-center transition-colors ${
                  mine
                    ? 'border-[#0F0F0F] bg-[#F2F2F2]'
                    : 'border-[#EAEAEA] hover:border-[#0F0F0F]'
                }`}
                aria-label={`Reagisci con ${e}`}
                aria-pressed={!!mine}
              >
                <span aria-hidden="true">{e}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Chip reazioni esistenti — visibili sempre se ci sono reazioni.
          Tap = toggla la propria reazione su quella emoji. */}
      {reactionEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {reactionEntries.map(([emoji, { count, mine }]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(post.id, emoji as ReactionEmoji)}
              className={`h-8 px-2.5 rounded-full border text-[13px] leading-none inline-flex items-center gap-1 transition-colors ${
                mine
                  ? 'border-[#0F0F0F] bg-[#F2F2F2] text-[#0F0F0F]'
                  : 'border-[#EAEAEA] text-[#0F0F0F] hover:border-[#0F0F0F]'
              }`}
              aria-label={`${emoji} ${count} reazioni${mine ? ', incluso te' : ''}`}
              aria-pressed={mine}
            >
              <span aria-hidden="true">{emoji}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Caption — Threads style: NON inline col username, DIRETTAMENTE
          sotto le icone. Font 15px, color quasi-nero, leading-snug. */}
      {post.text && (
        <p className="text-[#0F0F0F] text-[15px] leading-snug whitespace-pre-wrap pt-2">
          {members ? <MentionText text={post.text} members={members} /> : post.text}
        </p>
      )}

      {/* Count row — "12 piaceri · 5 risposte". Cliccabile la parte commenti. */}
      {(likeCount > 0 || commentCount > 0) && (
        <div className="text-[#707070] text-[13px] pt-2">
          {likeCount > 0 && (
            <span>{likeCount} {likeCount === 1 ? 'piace' : 'piaceri'}</span>
          )}
          {likeCount > 0 && commentCount > 0 && <span className="mx-1.5">·</span>}
          {commentCount > 0 && (
            onCommentsClick ? (
              <button
                type="button"
                onClick={() => onCommentsClick(post.id)}
                className="text-[#5856D6] hover:text-[#4744B5] transition-colors"
              >
                {commentCount === 1 ? '1 risposta' : `${commentCount} risposte`}
              </button>
            ) : (
              <span>{commentCount === 1 ? '1 risposta' : `${commentCount} risposte`}</span>
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

      {/* Delete confirm — inline, hairline, niente animazioni. */}
      {showDeleteConfirm && (
        <div className="flex gap-2 pt-3">
          <button
            type="button"
            onClick={() => { onDelete(post.id); setShowDeleteConfirm(false) }}
            className="flex-1 min-h-touch rounded-full bg-[#FF3040] text-white text-[15px] font-semibold hover:bg-[#E02B39] transition-colors"
          >
            Elimina
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 min-h-touch rounded-full border border-[#EAEAEA] text-[#0F0F0F] text-[15px] font-medium hover:border-[#0F0F0F] transition-colors"
          >
            Annulla
          </button>
        </div>
      )}
    </article>
  )
}
