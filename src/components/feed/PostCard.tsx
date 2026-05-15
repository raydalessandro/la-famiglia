'use client'

import { useState } from 'react'
import { PostWithDetails, ReactionEmoji } from '@/types/database'
import { Avatar, ReactionBar, MemberLink, ImageLightbox, MentionText } from '@/components/ui'
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
 * Card di un singolo post nello stile minimal Instagram-like. Niente
 * border / background / rounded esterno: i post nel feed sono separati
 * solo dal gap del wrapper. Immagini full-bleed via -mx-4 (override del
 * padding del wrapper feed). Icone footer thin-stroke (1.5) senza count
 * inline — i numeri vivono in una riga subdued sotto le azioni
 * (pattern Instagram: "12 mi piace · Vedi 5 commenti").
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
    <article>
      {/* Header del post. Padding orizzontale 0 perche` il wrapper del
          feed da gia px-4. Avatar `ringed` col color del membro: e` la
          firma di colour-per-member del progetto, NON template feel. */}
      <div className="flex items-center justify-between py-2">
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
            <p className="font-semibold text-white text-sm leading-tight">{post.author.name}</p>
            <p className="text-white/40 text-[11px] leading-tight mt-0.5">{formatRelativeTime(post.created_at)}</p>
          </div>
        </MemberLink>
        {isOwn && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-white/30 hover:text-red-400 transition-colors p-2 -mr-2 rounded-lg"
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
        <div className="-mx-4">
          <Poll
            poll={post.poll}
            onVote={(optId) => onPollVote(post.id, optId)}
            onRetract={(optId) => onPollRetract(post.id, optId)}
          />
        </div>
      )}

      {/* Immagini full-bleed: -mx-4 cancella il padding del wrapper feed.
          gap-0.5 per stile Instagram-grid (linee sottilissime fra tile). */}
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
              className={`relative overflow-hidden bg-white/5 active:scale-[0.98] transition-transform ${
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

      {/* Actions row — icone thin-stroke 1.5, niente count inline. I
          numeri vivono nella riga subdued sotto. */}
      <div className="flex items-center gap-3 pt-2 pb-1">
        <button
          onClick={() => onLike(post.id)}
          className="p-1 -ml-1 active:scale-90 transition-transform"
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
          aria-pressed={post.liked_by_me}
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              post.liked_by_me ? 'text-red-400 fill-red-400' : 'text-white/70 fill-none hover:text-red-400'
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
            className="p-1 active:scale-90 transition-transform"
            aria-label="Vedi commenti"
          >
            <svg className="w-6 h-6 text-white/70 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        ) : (
          <div className="p-1">
            <svg className="w-6 h-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onBookmark && (
            <button
              type="button"
              onClick={() => onBookmark(post.id)}
              className="p-1 active:scale-90 transition-transform"
              aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
              aria-pressed={post.bookmarked_by_me}
            >
              <svg
                className={`w-6 h-6 transition-colors ${
                  post.bookmarked_by_me
                    ? 'text-[#E8A838] fill-[#E8A838]'
                    : 'text-white/70 fill-none hover:text-[#E8A838]'
                }`}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
              </svg>
            </button>
          )}
          <ReactionBar
            postId={post.id}
            reactions={post.reactions}
            currentMemberId={currentMemberId}
            onToggle={(emoji) => onReact(post.id, emoji)}
          />
        </div>
      </div>

      {/* Riga count subdued — pattern Instagram. Visibile solo se c'e
          qualcosa da contare. "Mi piace" / "commenti" separati da middot. */}
      {(likeCount > 0 || commentCount > 0) && (
        <div className="text-white/60 text-xs pb-1">
          {likeCount > 0 && (
            <span>{likeCount} {likeCount === 1 ? 'mi piace' : 'mi piace'}</span>
          )}
          {likeCount > 0 && commentCount > 0 && <span className="mx-1.5 text-white/30">·</span>}
          {commentCount > 0 && (
            onCommentsClick ? (
              <button
                onClick={() => onCommentsClick(post.id)}
                className="text-white/60 hover:text-white"
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
        <p className="text-white/90 text-body whitespace-pre-wrap pb-2">
          <span className="font-semibold text-white mr-1.5">{post.author.name}</span>
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
        <div className="flex gap-2 pb-2">
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
