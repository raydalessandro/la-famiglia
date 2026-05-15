'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, BottomSheet, Button, PostCardSkeleton, EmptyState, useToast } from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import { compressImage } from '@/lib/storage'
import { MemberPublic, CreatePollInput, BirthdayToday, ApiResponse } from '@/types/database'

const MAX_POLL_OPTIONS = 4
const MIN_POLL_OPTIONS = 2

function emptyPollOptions(): string[] {
  return ['', '']
}


export default function FeedPage() {
  const router = useRouter()
  const toast = useToast()
  const { member } = useAuth()
  // Lista dei membri per risolvere `@nome` nei post in link al profilo.
  const { members } = useMembers()
  const {
    posts,
    isLoading,
    hasMore,
    loadMore,
    createPost,
    toggleLike,
    toggleBookmark,
    toggleReaction,
    deletePost,
    votePoll,
    retractPollVote,
  } = usePosts()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [formText, setFormText] = useState('')
  const [formType, setFormType] = useState<'normal' | 'recipe' | 'story'>('normal')
  const [formImages, setFormImages] = useState<File[]>()
  const [formPreviews, setFormPreviews] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Poll composer state. `pollEnabled` toggla la sezione sondaggio sotto.
  // Il sondaggio è opzionale e indipendente da text/images — un post può
  // avere testo + foto + sondaggio.
  const [pollEnabled, setPollEnabled] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(emptyPollOptions)

  // Compleanni di oggi (Fase 6.5). Fetch al mount, niente refetch
  // periodico: il banner cambia tra UN giorno e l'altro, e tanto basta
  // riaprire l'app il giorno dopo. Errore di rete → array vuoto, niente
  // banner (degradato silente).
  const [birthdaysToday, setBirthdaysToday] = useState<BirthdayToday[]>([])
  useEffect(() => {
    let cancelled = false
    void fetch('/api/birthdays/today')
      .then((r) => r.json())
      .then((json: ApiResponse<BirthdayToday[]>) => {
        if (!cancelled && json.data) setBirthdaysToday(json.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  const [pollMultiChoice, setPollMultiChoice] = useState(false)
  const [pollClosesAt, setPollClosesAt] = useState('')
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

  const resetForm = () => {
    setFormText('')
    setFormType('normal')
    setFormImages(undefined)
    setFormPreviews([])
    setPollEnabled(false)
    setPollQuestion('')
    setPollOptions(emptyPollOptions())
    setPollMultiChoice(false)
    setPollClosesAt('')
  }

  const buildPollInput = (): CreatePollInput | null => {
    if (!pollEnabled) return null
    const question = pollQuestion.trim()
    const options = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0)
    if (!question) {
      toast.error('Scrivi la domanda del sondaggio.')
      return null
    }
    if (options.length < MIN_POLL_OPTIONS) {
      toast.error(`Servono almeno ${MIN_POLL_OPTIONS} opzioni nel sondaggio.`)
      return null
    }
    const lowered = options.map((o) => o.toLowerCase())
    if (new Set(lowered).size !== lowered.length) {
      toast.error('Le opzioni del sondaggio devono essere diverse.')
      return null
    }
    let closes_at: string | null = null
    if (pollClosesAt) {
      const t = Date.parse(pollClosesAt)
      if (Number.isNaN(t) || t <= Date.now()) {
        toast.error('La data di chiusura deve essere nel futuro.')
        return null
      }
      closes_at = new Date(t).toISOString()
    }
    return {
      question,
      options,
      multi_choice: pollMultiChoice,
      closes_at,
    }
  }

  const handleSubmit = async () => {
    if (!formText.trim() && !formImages?.length && !pollEnabled) return
    let poll: CreatePollInput | null = null
    if (pollEnabled) {
      poll = buildPollInput()
      if (!poll) return // toast già mostrato in buildPollInput
    }
    setIsSubmitting(true)
    const ok = await createPost({
      text: formText.trim(),
      post_type: formType,
      images: formImages,
      poll: poll ?? undefined,
    })
    setIsSubmitting(false)
    if (ok) {
      setSheetOpen(false)
      resetForm()
    } else {
      toast.error('Non riesco a pubblicare. Riprova.')
    }
  }

  const handleClose = () => {
    setSheetOpen(false)
    resetForm()
  }

  const handlePollOptionChange = (idx: number, value: string) => {
    setPollOptions((prev) => prev.map((o, i) => (i === idx ? value : o)))
  }

  const handleAddPollOption = () => {
    setPollOptions((prev) => (prev.length < MAX_POLL_OPTIONS ? [...prev, ''] : prev))
  }

  const handleRemovePollOption = (idx: number) => {
    setPollOptions((prev) =>
      prev.length > MIN_POLL_OPTIONS ? prev.filter((_, i) => i !== idx) : prev,
    )
  }

  return (
    // bg #FAFAFA (off-white riposante) + -mx-4 -my-2 cancella il padding
    // del wrapper main del layout così la light surface arriva edge-to-edge.
    // pb generoso per spazio FAB + bottom-tab + safe area.
    <div className="-mx-4 -my-2 min-h-screen bg-[#FAFAFA] pb-32">
      {/* Header sticky — wordmark Inter sans-serif (NON serif italic).
          bg #FAFAFA/85 + backdrop-blur-xl: Threads style, header trasparente
          che si fonde con lo scroll. Hairline 1px bottom #EAEAEA.
          z-20: sotto la layout Header globale (z-30) e sotto FAB/BottomSheet. */}
      <div className="sticky top-0 z-20 bg-[#FAFAFA]/85 backdrop-blur-xl border-b border-[#EAEAEA]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-semibold text-[#0F0F0F] text-[22px] leading-none tracking-tight">
            La Famiglia
          </h1>
          <button
            type="button"
            onClick={() => router.push('/saved')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#0F0F0F] hover:bg-[#EAEAEA] transition-colors"
            aria-label="Apri post salvati"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Banner compleanni — light style: bg quasi-bianco con hairline, NO
       * gradient navy. Mantiene affordance "celebrazione" con accent purple
       * iOS che è il nostro accent link nel feed light. */}
      {birthdaysToday.length > 0 && (
        <div className="px-4 pt-3 flex flex-col gap-2">
          {birthdaysToday.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => router.push(`/family/${b.id}`)}
              className="w-full text-left rounded-2xl border border-[#EAEAEA] bg-white px-4 py-3 transition-colors hover:border-[#0F0F0F]"
              aria-label={`Apri profilo di ${b.name}`}
            >
              <p className="text-[15px] text-[#0F0F0F]">
                Oggi <span className="font-semibold text-[#5856D6]">{b.name}</span>{' '}
                {b.id === member?.id ? (
                  <>compi <span className="font-semibold">{b.age}</span> anni. Auguri!</>
                ) : (
                  <>compie <span className="font-semibold">{b.age}</span> anni. Auguri!</>
                )}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Posts — gap-0! I post sono separati dal border-b hairline interno
          al PostCard (Threads style). px-4 mantiene il padding orizzontale. */}
      <div className="px-4">
        {isLoading && posts.length === 0 ? (
          <div className="flex flex-col gap-4 py-4">
            {Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-8">
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
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentMemberId={member?.id}
              members={members}
              onLike={toggleLike}
              onBookmark={toggleBookmark}
              onReact={(id, emoji) => {
                if (member) toggleReaction(id, emoji, member as MemberPublic)
              }}
              onDelete={deletePost}
              onCommentsClick={(id) => router.push(`/feed/${id}`)}
              onPollVote={votePoll}
              onPollRetract={retractPollVote}
            />
          ))
        )}

        {hasMore && (
          <div ref={bottomRef} className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-[#EAEAEA] border-t-[#0F0F0F] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* FAB — mono nero pieno, niente animazione tap. */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-[#0F0F0F] shadow-lg shadow-black/15 flex items-center justify-center text-white hover:bg-[#2A2A2A] transition-colors"
        aria-label="Crea post"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
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

          {/* Poll toggle + form */}
          <button
            onClick={() => setPollEnabled((v) => !v)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed text-sm transition-colors ${
              pollEnabled
                ? 'border-[#E8A838]/60 text-[#E8A838]'
                : 'border-white/20 text-white/50 hover:border-[#E8A838]/50 hover:text-[#E8A838]'
            }`}
            aria-pressed={pollEnabled}
            aria-label={pollEnabled ? 'Rimuovi sondaggio' : 'Aggiungi sondaggio'}
          >
            <span aria-hidden="true" className="text-base leading-none">📊</span>
            {pollEnabled ? 'Sondaggio attivo — tocca per rimuovere' : 'Aggiungi sondaggio'}
          </button>

          {pollEnabled && (
            <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              {/* Header del blocco — separa visivamente dal resto del composer,
                  così è chiaro che la domanda e le opzioni qui dentro NON
                  sono il testo del post ma il sondaggio. */}
              <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                <span aria-hidden="true" className="text-base">📊</span>
                <h3 className="text-sm font-semibold text-white">Sondaggio</h3>
              </div>

              {/* Domanda */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="poll-question" className="text-caption text-white/70 font-medium">
                  Domanda
                </label>
                <input
                  id="poll-question"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Es. Dove andiamo a cena sabato?"
                  maxLength={200}
                  className="w-full bg-surface-sunken border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-white/40 text-body focus:outline-none focus:border-[#E8A838]/60"
                />
              </div>

              {/* Risposte possibili */}
              <div className="flex flex-col gap-1.5">
                <label className="text-caption text-white/70 font-medium">
                  Risposte possibili ({MIN_POLL_OPTIONS}–{MAX_POLL_OPTIONS})
                </label>
                <div className="flex flex-col gap-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        value={opt}
                        onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                        placeholder={`Risposta ${idx + 1}`}
                        maxLength={100}
                        aria-label={`Risposta ${idx + 1}`}
                        className="flex-1 bg-surface-sunken border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/40 text-body focus:outline-none focus:border-[#E8A838]/60"
                      />
                      {pollOptions.length > MIN_POLL_OPTIONS && (
                        <button
                          onClick={() => handleRemovePollOption(idx)}
                          className="shrink-0 w-9 h-9 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors flex items-center justify-center"
                          aria-label={`Rimuovi risposta ${idx + 1}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < MAX_POLL_OPTIONS && (
                  <button
                    onClick={handleAddPollOption}
                    className="self-start mt-1 flex items-center gap-1.5 text-sm text-[#E8A838] hover:text-[#E8A838]/80 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Aggiungi risposta
                  </button>
                )}
              </div>

              {/* Opzioni avanzate */}
              <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={pollMultiChoice}
                  onChange={(e) => setPollMultiChoice(e.target.checked)}
                  className="w-4 h-4 accent-[#E8A838]"
                />
                <span className="text-sm text-white/80">Permetti di scegliere più risposte</span>
              </label>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="poll-closes" className="text-caption text-white/70 font-medium">
                  Chiusura sondaggio <span className="text-white/40 font-normal">(opzionale)</span>
                </label>
                <input
                  id="poll-closes"
                  type="datetime-local"
                  value={pollClosesAt}
                  onChange={(e) => setPollClosesAt(e.target.value)}
                  className="w-full bg-surface-sunken border border-white/10 rounded-lg px-3 py-2 text-white text-body focus:outline-none focus:border-[#E8A838]/60"
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!formText.trim() && !formImages?.length && !pollEnabled}
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
