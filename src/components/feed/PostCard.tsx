'use client'

import { useState } from 'react'
import { PostWithDetails, ReactionEmoji } from '@/types/database'
import { Avatar, ReactionBar, MemberLink, ImageLightbox, MentionText } from '@/components/ui'
import { Poll } from './Poll'
import type { MemberPublic } from '@/types/database'

const POST_TYPE_LABELS: Record<string, string> = {
  recipe: 'Ricetta',
  story: 'Racconto',
  normal: '',
}

const POST_TYPE_COLORS: Record<string, string> = {
  recipe: 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  story: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
}

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
 * Card di un singolo post. Usata sia nella lista feed sia nella pagina
 * post singolo: gli action handler (like, react, delete) e
 * onCommentsClick sono iniettati dal caller in modo che lo stesso
 * componente serva entrambi i contesti.
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
  // Lista membri della famiglia. Se passata, il testo del post viene
  // renderizzato con `@nome` come link cliccabili al profilo (vedi
  // <MentionText>). Opzionale per backward-compat con caller che non
  // l'hanno wired — in quel caso il testo resta plain con la `@`
  // letterale.
  members?: Pick<MemberPublic, 'id' | 'name'>[]
  onLike: (id: string) => void
  // Opzionale per non rompere i caller esistenti che non l'hanno wired
  // (es. test). Se assente, l'icona bookmark non viene mostrata.
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
  const typeLabel = POST_TYPE_LABELS[post.post_type]
  const imageUrls = post.images?.map((i) => i.image_url) ?? []
  const commentsButton = (
    <>
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <span className="text-sm font-medium">{post.comments_count}</span>
    </>
  )

  return (
    <article
      className="bg-surface-raised rounded-card overflow-hidden border border-white/5"
      style={{ borderLeft: `3px solid ${post.author.color || '#E8A838'}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
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
            <p className="font-semibold text-white text-[15px] leading-tight">{post.author.name}</p>
            <p className="text-white/40 text-xs">{formatRelativeTime(post.created_at)}</p>
          </div>
        </MemberLink>
        <div className="flex items-center gap-2 shrink-0">
          {typeLabel && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${POST_TYPE_COLORS[post.post_type]}`}>
              {typeLabel}
            </span>
          )}
          {isOwn && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-white/30 hover:text-red-400 transition-colors p-1 rounded-lg"
              aria-label="Elimina post"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Text */}
      {post.text && (
        <p className="px-4 pb-3 text-white/90 text-body whitespace-pre-wrap">
          {members ? <MentionText text={post.text} members={members} /> : post.text}
        </p>
      )}

      {/* Poll */}
      {post.poll && onPollVote && onPollRetract && (
        <Poll
          poll={post.poll}
          onVote={(optId) => onPollVote(post.id, optId)}
          onRetract={(optId) => onPollRetract(post.id, optId)}
        />
      )}

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <div
          className={`grid gap-0.5 ${
            post.images.length === 1
              ? 'grid-cols-1'
              : post.images.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-2'
          }`}
        >
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              type="button"
              key={img.id}
              onClick={() => setLightboxIndex(idx)}
              aria-label={`Apri foto ${idx + 1} di ${post.images.length}`}
              className={`relative overflow-hidden bg-white/5 active:scale-[0.98] transition-transform ${
                post.images.length === 1 ? 'h-64' : 'h-40'
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

      {/* Actions */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-white/5">
        <button
          onClick={() => onLike(post.id)}
          className="flex items-center gap-1.5 group"
          aria-label={post.liked_by_me ? 'Rimuovi like' : 'Metti like'}
        >
          <svg
            className={`w-5 h-5 transition-all duration-200 ${
              post.liked_by_me
                ? 'text-red-400 fill-red-400 scale-110'
                : 'text-white/40 fill-none group-hover:text-red-400'
            }`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className={`text-sm font-medium ${post.liked_by_me ? 'text-red-400' : 'text-white/40'}`}>
            {post.likes.length}
          </span>
        </button>
        {onCommentsClick ? (
          <button
            onClick={() => onCommentsClick(post.id)}
            className="flex items-center gap-1.5 text-white/40 hover:text-white/70 active:scale-95 transition-all"
            aria-label="Vedi commenti"
          >
            {commentsButton}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-white/40">{commentsButton}</div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Bookmark privato — visibile solo se il caller ha wired l'handler.
           * Oro tenue quando attivo per coerenza con l'accento del tema.
           * Niente conteggio: i bookmark sono privati, nessun altro sa
           * quanti membri hanno salvato un post. */}
          {onBookmark && (
            <button
              type="button"
              onClick={() => onBookmark(post.id)}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-90"
              aria-label={post.bookmarked_by_me ? 'Rimuovi dai salvati' : 'Salva post'}
              aria-pressed={post.bookmarked_by_me}
            >
              <svg
                className={`h-5 w-5 transition-colors ${
                  post.bookmarked_by_me
                    ? 'text-[#E8A838] fill-[#E8A838]'
                    : 'text-white/40 fill-none hover:text-[#E8A838]'
                }`}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
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

      {/* Lightbox — opened from any of the image tiles above. Mounted at
       * the article level (not inside the grid) so the overlay covers the
       * full viewport regardless of the post's vertical position. */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="px-4 pb-4 flex gap-2">
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
