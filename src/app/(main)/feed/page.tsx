'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, BottomSheet, Button, PostCardSkeleton, EmptyState, ReactionBar } from '@/components/ui'
import { compressImage } from '@/lib/storage'
import { PostWithDetails, ReactionEmoji, MemberPublic } from '@/types/database'

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

function PostCard({
  post,
  currentMemberId,
  onLike,
  onReact,
  onDelete,
}: {
  post: PostWithDetails
  currentMemberId: string | undefined
  onLike: (id: string) => void
  onReact: (id: string, emoji: ReactionEmoji) => void
  onDelete: (id: string) => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const isOwn = post.author_id === currentMemberId
  const typeLabel = POST_TYPE_LABELS[post.post_type]

  return (
    <article
      className="bg-surface-raised rounded-card overflow-hidden border border-white/5"
      style={{ borderLeft: `3px solid ${post.author.color || '#E8A838'}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
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
        </div>
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
        <p className="px-4 pb-3 text-white/90 text-body whitespace-pre-wrap">{post.text}</p>
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
            <div
              key={img.id}
              className={`relative overflow-hidden bg-white/5 ${
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
            </div>
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
        <div className="flex items-center gap-1.5 text-white/40">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm font-medium">{post.comments_count}</span>
        </div>
        <div className="ml-auto">
          <ReactionBar
            postId={post.id}
            reactions={post.reactions}
            currentMemberId={currentMemberId}
            onToggle={(emoji) => onReact(post.id, emoji)}
          />
        </div>
      </div>

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

export default function FeedPage() {
  const { member } = useAuth()
  const { posts, isLoading, hasMore, loadMore, createPost, toggleLike, toggleReaction, deletePost } = usePosts()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [formText, setFormText] = useState('')
  const [formType, setFormType] = useState<'normal' | 'recipe' | 'story'>('normal')
  const [formImages, setFormImages] = useState<File[]>()
  const [formPreviews, setFormPreviews] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const loadingMore = useRef(false)

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!hasMore || loadingMore.current) return
    const el = bottomRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight + 200) {
      loadingMore.current = true
      loadMore().finally(() => { loadingMore.current = false })
    }
  }, [hasMore, loadMore])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const compressed: File[] = []
    const previews: string[] = []
    for (const file of files) {
      const comp = await compressImage(file)
      compressed.push(comp)
      previews.push(URL.createObjectURL(comp))
    }
    setFormImages((prev) => [...(prev ?? []), ...compressed])
    setFormPreviews((prev) => [...prev, ...previews])
    e.target.value = ''
  }

  const handleRemoveImage = (idx: number) => {
    setFormImages((prev) => prev?.filter((_, i) => i !== idx))
    setFormPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    if (!formText.trim() && !formImages?.length) return
    setIsSubmitting(true)
    const ok = await createPost({ text: formText.trim(), post_type: formType, images: formImages })
    setIsSubmitting(false)
    if (ok) {
      setSheetOpen(false)
      setFormText('')
      setFormType('normal')
      setFormImages(undefined)
      setFormPreviews([])
    }
  }

  const handleClose = () => {
    setSheetOpen(false)
    setFormText('')
    setFormType('normal')
    setFormImages(undefined)
    setFormPreviews([])
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#1a1a2e]/90 backdrop-blur border-b border-white/5">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-white">Feed</h1>
          <span className="text-2xl">🏡</span>
        </div>
      </div>

      {/* Posts */}
      <div className="px-4 py-4 flex flex-col gap-4">
        {isLoading && posts.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
        ) : posts.length === 0 ? (
          <EmptyState
            icon="📝"
            title="La bacheca è vuota"
            description="Condividi una foto, una storia o una ricetta — sarà visibile solo alla famiglia."
            action={
              <Button onClick={() => setSheetOpen(true)}>
                Scrivi il primo post
              </Button>
            }
          />
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentMemberId={member?.id}
              onLike={toggleLike}
              onReact={(id, emoji) => {
                if (member) toggleReaction(id, emoji, member as MemberPublic)
              }}
              onDelete={deletePost}
            />
          ))
        )}

        {hasMore && (
          <div ref={bottomRef} className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-[#E8A838]/40 border-t-[#E8A838] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-[#E8A838] shadow-lg shadow-[#E8A838]/30 flex items-center justify-center text-[#1a1a2e] text-2xl font-bold hover:bg-[#E8A838]/90 active:scale-95 transition-all"
        aria-label="Crea post"
      >
        +
      </button>

      {/* Create Post BottomSheet */}
      <BottomSheet isOpen={sheetOpen} onClose={handleClose} title="Nuovo post">
        <div className="flex flex-col gap-4 pt-2">
          {/* Author */}
          {member && (
            <div className="flex items-center gap-3">
              <Avatar
                emoji={member.avatar_emoji}
                url={member.avatar_url}
                name={member.name}
                size="sm"
                color={member.color}
              />
              <span className="text-white font-medium text-sm">{member.name}</span>
            </div>
          )}

          {/* Post type selector */}
          <div className="flex gap-2">
            {(['normal', 'recipe', 'story'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFormType(type)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  formType === type
                    ? 'bg-[#E8A838] text-[#1a1a2e] border-[#E8A838]'
                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                }`}
              >
                {type === 'normal' ? 'Normale' : type === 'recipe' ? '🍳 Ricetta' : '📖 Racconto'}
              </button>
            ))}
          </div>

          {/* Text */}
          <textarea
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            placeholder="Scrivi qualcosa..."
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-body resize-none focus:outline-none focus:border-[#E8A838]/60"
          />

          {/* Image previews */}
          {formPreviews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {formPreviews.map((src, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleRemoveImage(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Image upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImagePick}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 text-white/50 text-sm hover:border-[#E8A838]/50 hover:text-[#E8A838] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Aggiungi foto
          </button>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!formText.trim() && !formImages?.length}
            loading={isSubmitting}
            fullWidth
          >
            {isSubmitting ? 'Pubblicando...' : 'Pubblica'}
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
