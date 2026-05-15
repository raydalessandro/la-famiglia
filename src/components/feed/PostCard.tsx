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
 * PostCard — DARK WARM COFFEE iteration.
 *
 * Differenze rispetto alla versione "Instagram-minimal" precedente:
 * - Container raised (`bg-cocoa-raised` + hairline `border-cocoa-border`)
 *   in modo che i post text-only NON spariscano nello sfondo cocoa: la
 *   delta di luminosità raised vs page è solo ~+6%, l'1px di bordo è il
 *   trick che li tiene leggibili senza diventare "chrome".
 * - Avatar 32px (`size="sm"`) — manteniamo il sizing precedente; il
 *   brief chiedeva 36px ma il componente Avatar globale offre solo
 *   sm(32)/md(48)/lg/xl e md è troppo invadente in una card 16px padding.
 *   Una variante custom toccherebbe Avatar.tsx che è fuori scope.
 * - ZERO animazioni di feedback: niente `active:scale-*`,
 *   `transition-transform`, `animate-*` sul tap. Solo `transition-colors`
 *   per stati hover di colore. Cambi di stato (like, bookmark) istantanei.
 * - Palette: cream `#F5EBE0` testo, warm `#A89B8E` secondario, terracotta
 *   `#E8654E` per like attivo, copper `#D08B5C` per bookmark attivo.
 * - Render reazioni inline custom (sostituisce <ReactionBar/>) per
 *   condividere la palette feed senza toccare il componente globale.
 *
 * Usata sia nella lista feed sia nella pagina post singolo: gli action
 * handler (like, react, delete) e onCommentsClick sono iniettati dal
 * caller in modo che lo stesso componente serva entrambi i contesti.
 *
 * - Nel feed (lista): onCommentsClick naviga a /feed/[id].
 * - Nella pagina post singolo: onCommentsClick può essere undefined
 *   e il contatore commenti diventa decorativo (i commenti sono già
 *   visibili sotto).
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
  const isOwn = post.author_id === currentMemberId
  const imageUrls = post.images?.map((i) => i.image_url) ?? []
  const likeCount = post.likes.length
  const commentCount = post.comments_count

  return (
    <article className="bg-cocoa-raised border border-cocoa-border rounded-xl px-4 pt-3 pb-3 overflow-hidden">
      {/* Header del post. Avatar 36px (size="md") — un filo più grande
          della versione precedente per comodità target anziani. */}
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
          <div className="min-w-0">
            <p className="font-semibold text-cream text-[15px] leading-tight">{post.author.name}</p>
            <p className="text-warm text-xs leading-tight mt-0.5">{formatRelativeTime(post.created_at)}</p>
          </div>
        </MemberLink>
        {isOwn && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-warm hover:text-terracotta transition-colors p-2 -mr-2 rounded-lg min-w-touch min-h-touch flex items-center justify-center"
            aria-label="Elimina post"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Poll prima del testo se presente (mantiene il visual flow:
          domanda → eventuale testo di contesto → immagini). */}
      {post.poll && onPollVote && onPollRetract && (
        <div className="-mx-4 mb-1">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Immagini full-bleed: -mx-4 cancella il padding card. Bordo
          inferiore arrotondato in coerenza con il card-radius. */}
      {post.images && post.images.length > 0 && (
        <div
          className={`-mx-4 grid gap-0.5 overflow-hidden ${
            post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
              className={`relative overflow-hidden bg-cocoa ${
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
                  <span className="text-cream font-bold text-xl">+{post.images.length - 4}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Action row — icone thin-stroke 1.5 cream, niente count inline.
          Nessuna animazione: cambio stato solo via colore/fill. */}
      <div className="flex items-center gap-4 pt-3 pb-1">
        <button
          onClick={() => onLike(post.id)}
          className="min-w-touch min-h-touch -ml-2 flex items-center justify-start"
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              post.liked_by_me
                ? 'text-terracotta fill-terracotta'
                : 'text-cream fill-none hover:text-terracotta'
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
            onClick={() => onCommentsClick(post.id)}
            className="min-w-touch min-h-touch flex items-center justify-center"
            aria-label="Vedi commenti"
          >
            <svg className="w-6 h-6 text-cream hover:text-copper transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        ) : (
          <div className="min-w-touch min-h-touch flex items-center justify-center" aria-hidden="true">
            <svg className="w-6 h-6 text-cream" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* ReactionBar custom-render inline. NON usiamo il componente
              <ReactionBar/> globale per mantenere la palette feed
              (terracotta/copper/cream) senza toccare il componente UI
              condiviso. Touch target 44px garantito. */}
          {REACTION_EMOJIS.map((emoji) => {
            const forEmoji = post.reactions.filter((r) => r.emoji === emoji)
            const count = forEmoji.length
            const pickedByMe =
              currentMemberId !== undefined &&
              forEmoji.some((r) => r.member_id === currentMemberId)
            const names = forEmoji.map((r) => r.member.name).join(', ')
            const baseLabel = pickedByMe ? `Togli ${emoji}` : `Reagisci con ${emoji}`
            const label = names ? `${baseLabel} — reagito da ${names}` : baseLabel
            return (
              <button
                key={emoji}
                type="button"
                aria-pressed={pickedByMe}
                aria-label={label}
                onClick={() => onReact(post.id, emoji)}
                className={`min-h-touch min-w-touch px-2 rounded-full flex items-center gap-1 transition-colors ${
                  pickedByMe
                    ? 'bg-copper/15 ring-1 ring-copper/40 text-cream'
                    : 'hover:bg-cocoa text-warm'
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {emoji}
                </span>
                {count > 0 && (
                  <span className="text-[13px] font-medium">{count}</span>
                )}
              </button>
            )
          })}
          {onBookmark && (
            <button
              type="button"
              onClick={() => onBookmark(post.id)}
              className="min-w-touch min-h-touch flex items-center justify-center"
              aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
              aria-pressed={post.bookmarked_by_me}
            >
              <svg
                className={`w-6 h-6 transition-colors ${
                  post.bookmarked_by_me
                    ? 'text-copper fill-copper'
                    : 'text-cream fill-none hover:text-copper'
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
      </div>

      {/* Riga count subdued — pattern Instagram. Visibile solo se c'è
          qualcosa da contare. "Mi piace" / "commenti" separati da middot. */}
      {(likeCount > 0 || commentCount > 0) && (
        <div className="text-warm text-[13px] pb-1">
          {likeCount > 0 && (
            <span>{likeCount} {likeCount === 1 ? 'mi piace' : 'mi piace'}</span>
          )}
          {likeCount > 0 && commentCount > 0 && <span className="mx-1.5 text-warm/60">·</span>}
          {commentCount > 0 && (
            onCommentsClick ? (
              <button
                onClick={() => onCommentsClick(post.id)}
                className="text-warm hover:text-copper transition-colors"
              >
                Vedi {commentCount === 1 ? '1 commento' : `tutti i ${commentCount} commenti`}
              </button>
            ) : (
              <span>{commentCount} {commentCount === 1 ? 'commento' : 'commenti'}</span>
            )
          )}
        </div>
      )}

      {/* Testo del post DOPO le azioni (pattern Instagram: "username caption").
          Lo prefissa il nome dell'autore in grassetto per leggibilita`. */}
      {post.text && (
        <p className="text-cream text-[15px] leading-[1.5] whitespace-pre-wrap pt-1">
          <span className="font-semibold mr-1.5">{post.author.name}</span>
          {members ? <MentionText text={post.text} members={members} /> : post.text}
        </p>
      )}

      {/* Lightbox — opened from any of the image tiles above. */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="flex gap-2 pt-3">
          <button
            onClick={() => { onDelete(post.id); setShowDeleteConfirm(false) }}
            className="flex-1 py-2 rounded-xl bg-terracotta/15 text-terracotta text-sm font-medium border border-terracotta/40 hover:bg-terracotta/25 transition-colors min-h-touch"
          >
            Elimina
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 py-2 rounded-xl bg-cocoa text-warm text-sm font-medium border border-cocoa-border hover:text-cream transition-colors min-h-touch"
          >
            Annulla
          </button>
        </div>
      )}
    </article>
  )
}
