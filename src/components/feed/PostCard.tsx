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
 * Card di un singolo post nello stile "lettera manoscritta / diario vintage".
 *
 * Visual language:
 * - NESSUN bordo, nessuna card. Lo sfondo carta della pagina E` il foglio.
 * - Nome autore in italica calligrafica (Cormorant/EB Garamond) ~22px,
 *   peso visivo da solo anche su post text-only.
 * - Timestamp in serif italic piccolo seppia chiaro.
 * - Body post in serif libro 17px.
 * - Foto montate come polaroid: cornice bianca 10px, ombra morbida, rotazione
 *   subliminale ≤1deg.
 * - Azioni come parole (NON icone): "12 cuori", "5 risposte", "salva".
 * - Reactions: chip di testo seppia/oro discrete, niente bottoni-emoji-pillola.
 *
 * Usata sia nella lista feed sia nella pagina post singolo. La pagina /feed
 * inserisce un ornamento ✻ tra un PostCard e l'altro (vedi feed/page.tsx);
 * la card di per se` non disegna il proprio divider — e` responsabilita`
 * del layout chi conosce la sequenza.
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

  // Rotazioni "polaroid" stabili per post — deterministic dall'id, cosi`
  // ogni post ha sempre la stessa inclinazione (non danza tra render) e
  // l'effetto resta sublime, sotto la soglia di percezione consapevole.
  const polaroidTilt = (idx: number) => {
    // hash semplice id+idx → -0.8..+0.8 deg
    const s = `${post.id}-${idx}`
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    const v = ((h % 16) - 8) / 10 // -0.8 .. 0.7
    return v
  }

  return (
    <article className="text-ink">
      {/* Header del post. Niente avatar pesante: nome autore in italica
          calligrafica grande = identita` tipografica. L'avatar resta piccolo
          come "timbro" laterale, senza ring colorato (troppo moderno). */}
      <div className="flex items-start justify-between gap-3 pt-1 pb-3">
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
          <div className="min-w-0">
            <p
              className="font-serif italic text-ink leading-tight"
              style={{ fontSize: '22px', letterSpacing: '0.005em' }}
            >
              {post.author.name}
            </p>
            <p
              className="font-serif italic text-sepia leading-tight mt-0.5"
              style={{ fontSize: '12px' }}
            >
              {formatRelativeTime(post.created_at)}
            </p>
          </div>
        </MemberLink>
        {isOwn && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="font-serif italic text-sepia hover:text-ink active:scale-95 transition-all min-h-touch px-2 -mr-2"
            style={{ fontSize: '14px' }}
            aria-label="Elimina post"
          >
            elimina
          </button>
        )}
      </div>

      {/* Poll prima del testo se presente. Reso full-bleed per coerenza con
          le immagini sotto (esce dai padding del wrapper feed). */}
      {post.poll && onPollVote && onPollRetract && (
        <div className="-mx-4 my-2">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Testo del post — serif libro 17px, sopra le foto (pattern lettera:
          prima si scrive, poi si "incolla" la fotografia). Niente prefisso
          nome autore: l'italica grande in alto e` gia` la firma. */}
      {post.text && (
        <p
          className="font-serif text-ink whitespace-pre-wrap pb-3"
          style={{ fontSize: '17px', lineHeight: '1.65' }}
        >
          {members ? <MentionText text={post.text} members={members} /> : post.text}
        </p>
      )}

      {/* Foto montate come polaroid. Singola → grande 4:5. Multiple → grid
          stretto con rotazioni alternate. Cornice bianca + ombra morbida. */}
      {post.images && post.images.length > 0 && (
        <div
          className={`my-2 ${
            post.images.length === 1
              ? 'flex justify-center'
              : 'grid grid-cols-2 gap-4'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => {
            const tilt = polaroidTilt(idx)
            const isSingle = post.images.length === 1
            return (
              <button
                type="button"
                key={img.id}
                onClick={() => setLightboxIndex(idx)}
                aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
                className="relative active:scale-[0.98] transition-transform"
                style={{
                  transform: `rotate(${tilt}deg)`,
                  // Cornice bianca = "polaroid". Ombra morbida color seppia
                  // per integrarsi con la palette carta.
                  padding: isSingle ? '10px 10px 14px' : '8px 8px 10px',
                  background: '#FFFFFF',
                  boxShadow: '0 2px 10px rgba(58,40,24,0.18)',
                }}
              >
                <div
                  className="relative overflow-hidden bg-paper"
                  style={{ aspectRatio: isSingle ? '4 / 5' : '1 / 1' }}
                >
                  <img
                    src={img.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {idx === 3 && post.images.length > 4 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(58,40,24,0.6)' }}
                    >
                      <span
                        className="font-serif italic text-paper"
                        style={{ fontSize: '24px' }}
                      >
                        +{post.images.length - 4}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Riga azioni — solo parole, niente icone fillate.
          Touch target 44x44px garantito da py-2.5 + min-h-touch.
          Like attivo → oro tenue. Salva attivo → italic + oro tenue. */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-3 font-serif"
        style={{ fontSize: '15px' }}
      >
        <button
          onClick={() => onLike(post.id)}
          className={`min-h-touch py-2.5 active:scale-95 transition-all ${
            post.liked_by_me ? 'text-gold-old italic' : 'text-sepia hover:text-ink'
          }`}
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          {likeCount === 0
            ? post.liked_by_me
              ? 'un cuore'
              : 'un cuore?'
            : `${likeCount} ${likeCount === 1 ? 'cuore' : 'cuori'}`}
        </button>

        {onCommentsClick ? (
          <button
            onClick={() => onCommentsClick(post.id)}
            className="min-h-touch py-2.5 text-sepia hover:text-ink active:scale-95 transition-all italic"
            aria-label="Vedi commenti"
          >
            {commentCount === 0
              ? 'rispondi'
              : `${commentCount} ${commentCount === 1 ? 'risposta' : 'risposte'}`}
          </button>
        ) : (
          commentCount > 0 && (
            <span className="min-h-touch py-2.5 text-sepia italic">
              {commentCount === 1 ? '1 risposta' : `${commentCount} risposte`}
            </span>
          )
        )}

        {onBookmark && (
          <button
            type="button"
            onClick={() => onBookmark(post.id)}
            className={`min-h-touch py-2.5 active:scale-95 transition-all italic ${
              post.bookmarked_by_me
                ? 'text-gold-old'
                : 'text-sepia hover:text-ink'
            }`}
            aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
            aria-pressed={post.bookmarked_by_me}
          >
            {post.bookmarked_by_me ? 'salvato' : 'salva'}
          </button>
        )}

        {/* Reactions custom — chip testuale piccola, niente bottone-pillola
            colorato. Emoji renderizzato come carattere inline, con conteggio
            in seppia. Active → oro tenue. */}
        <span className="ml-auto inline-flex items-center gap-3">
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
                className={`min-h-touch py-2.5 px-1 inline-flex items-baseline gap-1 active:scale-95 transition-all ${
                  pickedByMe ? 'text-gold-old' : 'text-sepia hover:text-ink'
                }`}
              >
                <span
                  aria-hidden="true"
                  style={{
                    // Emoji color reset: applichiamo opacita` per ammorbidirne
                    // i toni cromatici e farlo sentire piu` "stampa" che
                    // "icona-app". Conserva pero` la leggibilita`.
                    fontSize: '14px',
                    filter: pickedByMe ? 'none' : 'saturate(0.55)',
                    opacity: pickedByMe ? 1 : 0.85,
                  }}
                >
                  {emoji}
                </span>
                {count > 0 && (
                  <span className="font-serif italic" style={{ fontSize: '13px' }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </span>
      </div>

      {/* Lightbox — opened from any of the image tiles above. */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete confirm — coerente con il resto: pulsanti testo serif, niente
          chip rossa. La conferma e` deliberatamente lenta, "pensaci due volte". */}
      {showDeleteConfirm && (
        <div className="flex items-center gap-4 pt-3 font-serif italic" style={{ fontSize: '15px' }}>
          <button
            onClick={() => {
              onDelete(post.id)
              setShowDeleteConfirm(false)
            }}
            className="min-h-touch py-2.5 px-2 text-gold-old hover:text-ink active:scale-95 transition-all"
          >
            sì, strappa la pagina
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="min-h-touch py-2.5 px-2 text-sepia hover:text-ink active:scale-95 transition-all"
          >
            annulla
          </button>
        </div>
      )}
    </article>
  )
}
