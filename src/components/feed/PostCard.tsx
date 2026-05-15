'use client'

import { useState } from 'react'
import { PostWithDetails, ReactionEmoji } from '@/types/database'
import { Avatar, MemberLink, ImageLightbox, MentionText } from '@/components/ui'
import { Poll } from './Poll'
import type { MemberPublic } from '@/types/database'

/**
 * Formato Instagram-style: "2 ORE FA", "3 GIORNI FA", "ADESSO" — sempre
 * uppercase con tracking ampio (la classe Tailwind tracking-wider e`
 * applicata nel JSX, non qui). Intervalli "grossi" (ore intere, giorni
 * interi) coerenti con la grafica calma/silenziosa del footer Instagram.
 */
function formatPostTimestamp(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'adesso'
  if (mins < 60) return mins === 1 ? '1 minuto fa' : `${mins} minuti fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs === 1 ? '1 ora fa' : `${hrs} ore fa`
  const days = Math.floor(hrs / 24)
  if (days < 7) return days === 1 ? '1 giorno fa' : `${days} giorni fa`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return weeks === 1 ? '1 settimana fa' : `${weeks} settimane fa`
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
}

/**
 * Card di un singolo post nello stile **Instagram dark mobile**.
 *
 * Layout (top → bottom):
 *   1. header: avatar 32 + username bold + kebab menu (delete se proprietario)
 *   2. immagini full-bleed (gap 1px tra multi-foto)
 *   3. action row: heart / comment / send a sinistra, bookmark a destra
 *   4. "Piace a X e altre N persone" (o "X mi piace")
 *   5. caption inline: `username caption`
 *   6. "Visualizza tutti i N commenti" (link grey)
 *   7. timestamp uppercase muted "2 ORE FA"
 *
 * Vincoli rispettati:
 * - true black bg pagina, card senza chrome (no bg/border/rounded)
 * - touch target 44x44 garantito da `p-2` attorno alle icone 24x24
 * - NESSUNA animazione tap (no scale, no fade-on-tap, no transition-transform).
 *   Cambi di stato sono istantanei (filled vs outline, color swap).
 * - `transition-colors` per hover su desktop ammesso dal brief.
 *
 * NOTA architettura: la `ReactionBar` e` stata rimossa dal render del
 * PostCard — i reaction emoji non fanno parte del look Instagram. Il
 * prop `onReact` resta nell'interfaccia per non rompere i caller, ma
 * non viene piu` esposto in UI. Se in futuro vorremo riportare le
 * reazioni, si reintroduce qui (commento in fondo al file).
 */
export function PostCard({
  post,
  currentMemberId,
  members,
  onLike,
  onBookmark,
  // onReact resta nell'API ma non viene piu` renderizzato — vedi note
  // sopra. Lasciato per compatibilita` con i caller esistenti.
  onReact: _onReact,
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
  void _onReact
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const isOwn = post.author_id === currentMemberId
  const imageUrls = post.images?.map((i) => i.image_url) ?? []
  const likeCount = post.likes.length
  const commentCount = post.comments_count

  // Risolvi il nome del primo membro che ha messo like via la lista
  // `members` passata dal feed. Se manca (es. pagina post singolo senza
  // members) fallback a "X mi piace" semplice.
  const firstLikerName = (() => {
    if (likeCount === 0) return null
    const firstLike = post.likes[0]
    if (firstLike.member_id === currentMemberId) return 'Te'
    const m = members?.find((x) => x.id === firstLike.member_id)
    return m?.name ?? null
  })()

  return (
    <article>
      {/* Header del post — niente colour ring (Insta lo riserva alle
          stories non ai post normali). Avatar 32px tondo + username
          bold + kebab a destra. */}
      <div className="flex items-center justify-between px-4 py-2">
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
          <p className="font-semibold text-white text-sm leading-tight truncate">
            {post.author.name}
          </p>
        </MemberLink>
        {isOwn && (
          <button
            onClick={() => setShowDeleteConfirm((v) => !v)}
            className="flex h-11 w-11 -mr-2 items-center justify-center text-white hover:text-[#A8A8A8] transition-colors"
            aria-label="Opzioni post"
            aria-expanded={showDeleteConfirm}
          >
            {/* Kebab orizzontale stile Instagram (3 puntini) */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
        )}
      </div>

      {/* Poll prima delle immagini (mantiene domanda → contesto → foto). */}
      {post.poll && onPollVote && onPollRetract && (
        <div className="px-4">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Immagini full-bleed (nessun padding orizzontale). gap 1px tra
          tile multi-foto come fa Instagram. */}
      {post.images && post.images.length > 0 && (
        <div
          className={`grid gap-px ${
            post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
              className={`relative overflow-hidden bg-[#121212] ${
                post.images.length === 1 ? 'aspect-square' : 'aspect-square'
              } ${post.images.length === 3 && idx === 0 ? 'col-span-2 aspect-[2/1]' : ''}`}
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

      {/* Action row — 3 icone left-aligned (heart / comment / send) +
          bookmark right-aligned. Niente count inline (i conteggi vivono
          nella riga sotto). Touch target 44x44 garantito da h-11 w-11
          attorno all'icona 24x24.
          NIENTE animazioni: nessun active:scale, nessuna transizione di
          transform. Cambi solo color/fill al cambio di stato. */}
      <div className="flex items-center px-2 pt-2 pb-1">
        <button
          onClick={() => onLike(post.id)}
          className="flex h-11 w-11 items-center justify-center"
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          {post.liked_by_me ? (
            // Filled heart — rosso Instagram esatto
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="#ED4956"
              aria-hidden="true"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg
              className="w-6 h-6 text-white hover:text-[#A8A8A8] transition-colors"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          )}
        </button>
        {onCommentsClick ? (
          <button
            onClick={() => onCommentsClick(post.id)}
            className="flex h-11 w-11 items-center justify-center"
            aria-label="Vedi commenti"
          >
            {/* Chat bubble outline thin 2 stroke (Insta default) */}
            <svg
              className="w-6 h-6 text-white hover:text-[#A8A8A8] transition-colors"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
          </button>
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center"
            aria-hidden="true"
          >
            <svg
              className="w-6 h-6 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
          </div>
        )}
        {/* Paper-plane decorativo — Insta lo usa per "share". Qui non
            ha azione, ma e` parte del visual lexicon: senza l'icona la
            simmetria del footer Instagram si rompe. Lo rendiamo
            non-interattivo (cursor default, no aria-label clickable). */}
        <div
          className="flex h-11 w-11 items-center justify-center opacity-50"
          aria-hidden="true"
        >
          <svg
            className="w-6 h-6 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </div>
        {onBookmark && (
          <button
            type="button"
            onClick={() => onBookmark(post.id)}
            className="ml-auto flex h-11 w-11 items-center justify-center"
            aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
            aria-pressed={post.bookmarked_by_me}
          >
            <svg
              className="w-6 h-6 text-white hover:text-[#A8A8A8] transition-colors"
              viewBox="0 0 24 24"
              fill={post.bookmarked_by_me ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
            </svg>
          </button>
        )}
      </div>

      {/* "Piace a X e altre N persone" — pattern Instagram. Best-effort:
          se ho il nome del primo liker mostro la forma estesa, altrimenti
          fallback a "N mi piace". */}
      {likeCount > 0 && (
        <p className="px-4 text-white text-[13px] font-semibold leading-snug">
          {firstLikerName ? (
            likeCount === 1 ? (
              <>Piace a <span>{firstLikerName}</span></>
            ) : (
              <>
                Piace a <span>{firstLikerName}</span> e altre{' '}
                {likeCount - 1 === 1 ? '1 persona' : `${likeCount - 1} persone`}
              </>
            )
          ) : (
            <>{likeCount} {likeCount === 1 ? 'mi piace' : 'mi piace'}</>
          )}
        </p>
      )}

      {/* Caption inline "username caption" — pattern Instagram. */}
      {post.text && (
        <p className="px-4 pt-1 text-white text-[15px] leading-snug whitespace-pre-wrap">
          <span className="font-semibold mr-1.5">{post.author.name}</span>
          {members ? <MentionText text={post.text} members={members} /> : post.text}
        </p>
      )}

      {/* "Visualizza tutti i N commenti" — link grey muted. */}
      {commentCount > 0 && onCommentsClick && (
        <button
          onClick={() => onCommentsClick(post.id)}
          className="block w-full text-left px-4 pt-1 text-[14px] text-[#A8A8A8] hover:text-white transition-colors"
        >
          {commentCount === 1 ? 'Visualizza 1 commento' : `Visualizza tutti i ${commentCount} commenti`}
        </button>
      )}
      {commentCount > 0 && !onCommentsClick && (
        <p className="px-4 pt-1 text-[14px] text-[#A8A8A8]">
          {commentCount === 1 ? '1 commento' : `${commentCount} commenti`}
        </p>
      )}

      {/* Timestamp uppercase tracking-wider — il dettaglio piccolo che
          chiude il post a la` Instagram. */}
      <p className="px-4 pt-1 pb-2 text-[10px] uppercase tracking-wider text-[#A8A8A8]">
        {formatPostTimestamp(post.created_at)}
      </p>

      {/* Lightbox — opened from any of the image tiles above. */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete confirm — solo per l'autore. Stile coerente con dark IG:
          niente rounded esagerato, colori netti. */}
      {showDeleteConfirm && (
        <div className="flex gap-2 px-4 pb-2">
          <button
            onClick={() => { onDelete(post.id); setShowDeleteConfirm(false) }}
            className="flex-1 py-2.5 text-[#ED4956] text-sm font-semibold border border-[#262626] hover:bg-[#121212] transition-colors"
          >
            Elimina
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 py-2.5 text-white text-sm font-medium border border-[#262626] hover:bg-[#121212] transition-colors"
          >
            Annulla
          </button>
        </div>
      )}
    </article>
  )
}
