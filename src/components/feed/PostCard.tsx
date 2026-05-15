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
 * Card di un singolo post — linguaggio "Soft Brutalism Elegante".
 *
 * Visuale:
 * - Bordo netto 1.5px ottone, angoli VIVI (no rounded). Padding interno 16px.
 * - Sfondo card uguale al pagina (ink burgundy) per le card text-only: la
 *   separazione visiva la fa il bordo. Per le foto, l'immagine va edge-to-edge
 *   contro il bordo della card (il bordo "incornicia" la foto).
 * - Ombra offset solida 4px 4px senza blur (shadow-brutal) — stile poster.
 * - Tipografia: autore in grotesque condensed bold UPPERCASE tracking-wider,
 *   body in serif raffinato 17px (legibility + contrast tipografico).
 *
 * Azioni: NIENTE icone. Etichette testuali uppercase tracking-wider, separate
 * da bullet "·". Toggle attivo cambia colore a rosso ruggine. Nessuna fill
 * animation, nessuna animazione di filling — solo colour swap + active:scale.
 *
 * Niente ReactionBar globale: render custom inline come chip rettangolari
 * brutalist (bordo ottone, niente rounded). Stesso onToggle / contract.
 *
 * Usata sia nella lista feed sia nella pagina post singolo: gli action
 * handler (like, react, delete) e onCommentsClick sono iniettati dal
 * caller. Nel feed (lista): onCommentsClick naviga a /feed/[id]. Nella
 * pagina post singolo: onCommentsClick undefined e il contatore commenti
 * diventa decorativo.
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
  const hasImages = post.images && post.images.length > 0

  return (
    // Bordo 1.5px brass, angoli vivi (rounded-none), ombra brutalist.
    // overflow-hidden: la foto edge-to-edge non spara fuori dal bordo.
    <article className="border-[1.5px] border-brass rounded-none shadow-brutal bg-ink overflow-hidden">
      {/* Header del post.
          Avatar `ringed` resta col color del membro (firma identitaria del
          progetto). Nome in grotesque UPPERCASE, data in grotesque regular
          tracking-wider 11px. */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
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
            <p className="font-grotesque font-bold uppercase text-ivory text-[14px] leading-tight tracking-[0.1em]">
              {post.author.name}
            </p>
            <p className="font-grotesque text-muted text-[11px] leading-tight mt-1 tracking-[0.14em] uppercase">
              {formatRelativeTime(post.created_at)}
            </p>
          </div>
        </MemberLink>
        {isOwn && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="font-grotesque font-bold uppercase text-[11px] tracking-[0.14em] text-muted hover:text-rust-bright min-h-touch px-2 -mr-2 transition-colors"
            aria-label="Elimina post"
          >
            Elimina
          </button>
        )}
      </div>

      {/* Poll prima del testo se presente (mantiene il visual flow:
          domanda → eventuale testo di contesto → immagini). Niente
          full-bleed `-mx-4`: il Poll è componente shared, lo lasciamo
          allineato col contenuto della card. */}
      {post.poll && onPollVote && onPollRetract && (
        <div className="px-4 pb-3">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Immagini edge-to-edge dentro la card: la foto tocca il bordo
          ottone su 4 lati. Gap 2px in multi (brief: "grid 2 colonne gap 2px").
          Angoli vivi (no rounded). */}
      {hasImages && (
        <div
          className={`grid gap-[2px] ${
            post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
              className={`relative overflow-hidden bg-ink-raised active:scale-[0.98] transition-transform ${
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
                <div className="absolute inset-0 bg-ink/70 flex items-center justify-center">
                  <span className="font-grotesque font-bold uppercase text-ivory text-xl tracking-[0.08em]">
                    +{post.images.length - 4}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Testo del post in serif 17px — il "body" del post. Sta SOPRA le
          azioni (a differenza del pattern Instagram precedente): nelle card
          text-only il testo è il contenuto principale, deve essere subito
          leggibile. Color ivory ~AAA su ink. */}
      {post.text && (
        <div className="px-4 pt-3 pb-4">
          <p className="font-serif text-ivory text-[17px] leading-[1.55] whitespace-pre-wrap">
            {members ? <MentionText text={post.text} members={members} /> : post.text}
          </p>
        </div>
      )}

      {/* Action bar — niente icone, etichette uppercase grotesque tracking-wider.
          Separator: bordo verticale 1px brass/40 fra ogni bottone.
          Tap target: min-h-touch (44px) garantito da min-h-[44px] sul button.
          Toggle attivo: testo rosso ruggine (rust). Nessuna animazione fill. */}
      <div className="flex items-stretch border-t-[1.5px] border-brass/60">
        <button
          onClick={() => onLike(post.id)}
          className={`flex-1 min-h-[44px] px-3 font-grotesque font-bold uppercase text-[12px] tracking-[0.14em] active:scale-95 transition-colors ${
            post.liked_by_me ? 'text-rust-bright' : 'text-ivory/80 hover:text-ivory'
          }`}
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          Mi piace{likeCount > 0 ? ` · ${likeCount}` : ''}
        </button>

        <div aria-hidden="true" className="w-px bg-brass/40" />

        {onCommentsClick ? (
          <button
            onClick={() => onCommentsClick(post.id)}
            className="flex-1 min-h-[44px] px-3 font-grotesque font-bold uppercase text-[12px] tracking-[0.14em] text-ivory/80 hover:text-ivory active:scale-95 transition-colors"
            aria-label="Vedi commenti"
          >
            Commenti{commentCount > 0 ? ` · ${commentCount}` : ''}
          </button>
        ) : (
          <div className="flex-1 min-h-[44px] px-3 flex items-center justify-center font-grotesque font-bold uppercase text-[12px] tracking-[0.14em] text-ivory/80">
            Commenti{commentCount > 0 ? ` · ${commentCount}` : ''}
          </div>
        )}

        {onBookmark && (
          <>
            <div aria-hidden="true" className="w-px bg-brass/40" />
            <button
              type="button"
              onClick={() => onBookmark(post.id)}
              className={`flex-1 min-h-[44px] px-3 font-grotesque font-bold uppercase text-[12px] tracking-[0.14em] active:scale-95 transition-colors ${
                post.bookmarked_by_me ? 'text-rust-bright' : 'text-ivory/80 hover:text-ivory'
              }`}
              aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
              aria-pressed={post.bookmarked_by_me}
            >
              {post.bookmarked_by_me ? 'Salvato' : 'Salva'}
            </button>
          </>
        )}
      </div>

      {/* Reaction row — render custom inline (ReactionBar globale non
          modificabile, ma possiamo NON renderizzarla). Chip rettangolari
          brutalist: bordo 1px brass/50, angoli vivi, etichetta emoji +
          count in grotesque. Picked-by-me: bordo brass pieno + tint soft.
          (Le emoji qui sono CONTENUTO della reaction, non chrome UI: sono
          i tre simboli ❤️ 😄 👏 scelti dalla famiglia per esprimersi.
          Restano per design — sono dati, non decorazione.) */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-brass/30">
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
              className={`min-h-[44px] px-3 flex items-center gap-1.5 border-[1.5px] active:scale-95 transition-colors ${
                pickedByMe
                  ? 'border-brass bg-brass-soft text-ivory'
                  : 'border-brass/50 text-ivory/80 hover:border-brass hover:text-ivory'
              }`}
            >
              <span aria-hidden="true" className="text-[15px] leading-none">{emoji}</span>
              {count > 0 && (
                <span className="font-grotesque font-bold text-[12px] tracking-[0.1em] leading-none">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Lightbox — opened from any of the image tiles above. */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete confirm — chip brutalist coerenti col linguaggio della card. */}
      {showDeleteConfirm && (
        <div className="flex gap-2 px-4 pb-4 pt-1">
          <button
            onClick={() => { onDelete(post.id); setShowDeleteConfirm(false) }}
            className="flex-1 min-h-touch px-3 border-[1.5px] border-rust bg-rust/20 text-ivory font-grotesque font-bold uppercase tracking-[0.14em] text-[12px] hover:bg-rust/30 active:scale-95 transition-all"
          >
            Elimina
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 min-h-touch px-3 border-[1.5px] border-brass/50 text-ivory/80 font-grotesque font-bold uppercase tracking-[0.14em] text-[12px] hover:border-brass hover:text-ivory active:scale-95 transition-all"
          >
            Annulla
          </button>
        </div>
      )}
    </article>
  )
}
