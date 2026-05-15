'use client'

import { useState } from 'react'
import { PostWithDetails, ReactionEmoji, REACTION_EMOJIS } from '@/types/database'
import { Avatar, MemberLink, ImageLightbox, MentionText } from '@/components/ui'
import { Poll } from './Poll'
import type { MemberPublic } from '@/types/database'

/**
 * Editorial-magazine post card. Nessun bordo, nessuna card colorata: la
 * distinzione viene da hairline divider + tipografia serif italic display
 * per il nome autore + whitespace generoso. I post text-only NON spariscono
 * più nello sfondo come succedeva sulla navy uniforme, perché il nome serif
 * grande + la riga MONO della data + il body serif a 17px hanno peso visivo
 * sufficiente da leggersi come l'incipit di un articolo (vedi Cabinet/Kinfolk).
 *
 * Palette (cfr. tailwind.config — paper/ink/terra/terracotta):
 *   - paper   sfondo
 *   - ink     testo
 *   - terra   hairline + icone spente (1px line, thin)
 *   - terracotta accent attivo (like, link, mention)
 *
 * Constraint per famiglia con nonni: touch target min 44px su tutti i
 * bottoni, body 17px, contrasto 12.4:1 ink/paper (AAA). Niente emoji
 * nell'UI chrome — solo dentro reactions (che SONO user-data: l'utente
 * sceglie quale emoji usare, è il valore stesso) e dentro post.text.
 */

function formatRelativeTimeUpper(dateStr: string): string {
  // Mono uppercase tracking-widest pattern editoriale (es. "2 ORE FA").
  // Versione un po' più lunga di formatRelativeTime, leggibile come timestamp
  // di magazine. Italian-friendly: "ADESSO", "2 MIN FA", "2 ORE FA", "3 GIORNI FA".
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ADESSO'
  if (mins < 60) return `${mins} MIN FA`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs === 1 ? '1 ORA FA' : `${hrs} ORE FA`
  const days = Math.floor(hrs / 24)
  if (days < 7) return days === 1 ? '1 GIORNO FA' : `${days} GIORNI FA`
  return new Date(dateStr)
    .toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
    .toUpperCase()
}

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

  // Singola foto verticale stile magazine (aspect 4:5). Più foto: griglia 2-col
  // con gap 4px (terra hairline-feel tramite gap visibile su sfondo carta).
  const singleImage = post.images && post.images.length === 1

  // Le font-family Playfair/Cormorant sono caricate via next/font/google nella
  // page.tsx genitore e esposte come CSS variables (--font-playfair,
  // --font-cormorant) sul wrapper della pagina. Le usiamo qui via inline
  // `style` su elementi specifici, così il PostCard non dipende dal font
  // setup quando viene usato in pagine diverse (graceful fallback su system
  // serif se le variabili non esistono).
  const playfairStack = 'var(--font-playfair), Georgia, "Times New Roman", serif'
  const cormorantStack = 'var(--font-cormorant), Georgia, "Times New Roman", serif'

  return (
    <article>
      {/* Header — autore in serif italic display, data in mono uppercase
          tracking-widest. Niente avatar grande: avatar piccolo a fianco,
          per non rubare gerarchia al nome. */}
      <header className="flex items-start justify-between gap-3 pb-5">
        <MemberLink
          memberId={post.author_id}
          ariaLabel={`Apri il profilo di ${post.author.name}`}
          className="flex items-center gap-3 min-w-0 min-h-touch"
        >
          <Avatar
            emoji={post.author.avatar_emoji}
            url={post.author.avatar_url}
            name={post.author.name}
            size="sm"
            color={post.author.color}
          />
          <div className="min-w-0 flex flex-col gap-1">
            <p
              className="italic text-ink text-[20px] leading-none tracking-tight"
              style={{ fontFamily: playfairStack }}
            >
              {post.author.name}
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft leading-none">
              {formatRelativeTimeUpper(post.created_at)}
            </p>
          </div>
        </MemberLink>
        {isOwn && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex h-touch w-touch items-center justify-center -mr-2 text-terra hover:text-terracotta transition-colors"
            aria-label="Elimina post"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </header>

      {/* Body: testo del post PRIMA delle foto, stile articolo. Font serif
          libro 17px (Cormorant), line-height ariosa. Nessuna prefix con autore
          (pattern Instagram) perché il nome è già nel header dominante. */}
      {post.text && (
        <div className="pb-5">
          <p
            className="text-ink text-[17px] leading-[1.65] whitespace-pre-wrap"
            style={{ fontFamily: cormorantStack }}
          >
            {members ? (
              <MentionText
                text={post.text}
                members={members}
                className="[&_a]:text-terracotta [&_a]:font-medium [&_a]:no-underline hover:[&_a]:underline"
              />
            ) : (
              post.text
            )}
          </p>
        </div>
      )}

      {/* Poll. Lasciato il componente Poll com'è (don't-touch globale) ma
          gli togliamo il margine orizzontale di default (mx-4) avvolgendolo
          in un wrapper -mx-4 + mx-4 = 0 netto. */}
      {post.poll && onPollVote && onPollRetract && (
        <div className="-mx-4 pb-5">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Foto — angoli vivi (no rounded), full-bleed sul wrapper. Singola
          foto in aspect 4:5 verticale (formato magazine, non quadrato
          social). Multi-foto: griglia 2-col, gap 4px (linee sottilissime
          color carta-deep). */}
      {post.images && post.images.length > 0 && (
        <div
          className={`-mx-4 pb-5 grid gap-1 ${
            singleImage ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
              className={`relative overflow-hidden bg-paper-deep active:scale-[0.99] transition-transform ${
                singleImage ? 'aspect-[4/5]' : 'aspect-square'
              } ${post.images.length === 3 && idx === 0 ? 'col-span-2 aspect-[4/3]' : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.image_url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {idx === 3 && post.images.length > 4 && (
                <div className="absolute inset-0 bg-ink/70 flex items-center justify-center">
                  <span
                    className="italic text-paper text-3xl"
                    style={{ fontFamily: playfairStack }}
                  >
                    +{post.images.length - 4}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Footer azioni — riga in font-mono uppercase tracking-widest, niente
          bottoni cerchio: testo + counter. Icone thin-stroke 1px terra,
          terracotta quando attive. Touch target garantito da min-h-touch. */}
      <div className="flex items-center gap-1 pt-1">
        <button
          onClick={() => onLike(post.id)}
          className="group flex min-h-touch items-center gap-2 pr-3 -ml-1 pl-1 active:scale-95 transition-transform"
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          <svg
            className={`h-5 w-5 transition-colors ${
              post.liked_by_me
                ? 'text-terracotta fill-terracotta'
                : 'text-terra fill-none group-hover:text-terracotta'
            }`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.18em] leading-none ${
              post.liked_by_me ? 'text-terracotta' : 'text-ink-soft'
            }`}
          >
            {likeCount > 0 ? `${likeCount} ${likeCount === 1 ? 'mi piace' : 'mi piace'}` : 'mi piace'}
          </span>
        </button>

        {onCommentsClick ? (
          <button
            onClick={() => onCommentsClick(post.id)}
            className="group flex min-h-touch items-center gap-2 px-3 active:scale-95 transition-transform"
            aria-label="Vedi commenti"
          >
            <svg
              className="h-5 w-5 text-terra group-hover:text-ink-soft transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
              />
            </svg>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft leading-none">
              {commentCount > 0
                ? `${commentCount} ${commentCount === 1 ? 'commento' : 'commenti'}`
                : 'commenta'}
            </span>
          </button>
        ) : (
          <div className="flex min-h-touch items-center gap-2 px-3">
            <svg
              className="h-5 w-5 text-terra"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
              />
            </svg>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft leading-none">
              {commentCount} {commentCount === 1 ? 'commento' : 'commenti'}
            </span>
          </div>
        )}

        {onBookmark && (
          <button
            type="button"
            onClick={() => onBookmark(post.id)}
            className="group ml-auto flex h-touch w-touch items-center justify-center active:scale-95 transition-transform"
            aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
            aria-pressed={post.bookmarked_by_me}
          >
            <svg
              className={`h-5 w-5 transition-colors ${
                post.bookmarked_by_me
                  ? 'text-terracotta fill-terracotta'
                  : 'text-terra fill-none group-hover:text-terracotta'
              }`}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Reactions — render editoriale custom (NON usiamo ReactionBar che
          ha look "pill scura"). Le emoji qui SONO user-data: l'utente
          sceglie quale emoji è la sua reazione, quindi è contenuto, non
          chrome. Piccole, allineate, con count discreto. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2">
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
              className={`flex min-h-touch min-w-touch items-center gap-1.5 px-3 transition-colors border ${
                pickedByMe
                  ? 'border-terracotta/60 bg-terracotta/10 text-terracotta'
                  : 'border-terra/40 hover:border-ink-soft/60 text-ink-soft'
              }`}
            >
              <span aria-hidden="true" className="text-[15px] leading-none">
                {emoji}
              </span>
              {count > 0 && (
                <span className="font-mono text-[11px] tabular-nums leading-none">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Lightbox — opens from any image tile above. Don't-touch globale. */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete confirm — bottoni editoriali, font-mono uppercase, niente
          rounded. Touch target ok. */}
      {showDeleteConfirm && (
        <div className="flex gap-2 pt-4">
          <button
            onClick={() => {
              onDelete(post.id)
              setShowDeleteConfirm(false)
            }}
            className="flex-1 min-h-touch font-mono text-[12px] uppercase tracking-[0.18em] text-paper bg-terracotta hover:bg-terracotta-deep transition-colors px-4"
          >
            Elimina
          </button>
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 min-h-touch font-mono text-[12px] uppercase tracking-[0.18em] text-ink border border-terra hover:border-ink transition-colors px-4"
          >
            Annulla
          </button>
        </div>
      )}
    </article>
  )
}
