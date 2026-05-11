'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import { Avatar, BottomSheet, Button, PostCardSkeleton, EmptyState, useToast } from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import { compressImage } from '@/lib/storage'
import { ReactionEmoji, MemberPublic } from '@/types/database'


export default function FeedPage() {
  const router = useRouter()
  const toast = useToast()
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
    // Reset early so the same picker can be reopened even if a file fails.
    e.target.value = ''
    const compressed: File[] = []
    const previews: string[] = []
    const failed: string[] = []
    for (const file of files) {
      try {
        const comp = await compressImage(file)
        compressed.push(comp)
        previews.push(URL.createObjectURL(comp))
      } catch (err) {
        // Per debug: l'errore arriva con prefisso [compressImage]. Su iPhone
        // si vede con Eruda. Mai silenziare un fallimento utente.
        console.error(err)
        failed.push(file.name)
      }
    }
    if (compressed.length > 0) {
      setFormImages((prev) => [...(prev ?? []), ...compressed])
      setFormPreviews((prev) => [...prev, ...previews])
    }
    if (failed.length > 0) {
      toast.error(
        failed.length === files.length
          ? 'Non riesco a leggere questa foto. Prova con un\'altra.'
          : `${failed.length} foto su ${files.length} non sono state caricate.`,
      )
    }
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
              onCommentsClick={(id) => router.push(`/feed/${id}`)}
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
            // Esplicitiamo i MIME invece di image/* per forzare iOS Safari a
            // convertire HEIC del rullino iPhone in JPEG alla selezione.
            // image/* lascia passare HEIC, che il canvas Safari non sa
            // decodificare → compressImage falliva e l'upload si bloccava.
            accept="image/jpeg,image/png,image/webp"
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
