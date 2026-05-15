'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, BottomSheet, Button, PostCardSkeleton, EmptyState, useToast } from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import { compressImage } from '@/lib/storage'
import { ReactionEmoji, MemberPublic, CreatePollInput, BirthdayToday, ApiResponse } from '@/types/database'

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
    <div className="min-h-screen bg-cocoa pb-24">
      {/* Header — wordmark "La Famiglia" in Lora serif italic (più calda
          di Georgia default). Sticky con backdrop-blur + bg cocoa/95 in
          modo che il contenuto sottostante non bleed visibile durante lo
          scroll. z-30 == BottomNav, < BottomSheet (z-40/50): nessun
          conflitto. Una sola action a destra (bookmark → /saved). */}
      <div className="sticky top-0 z-30 bg-cocoa/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-serif italic font-medium text-cream text-[28px] leading-none tracking-tight">
            La Famiglia
          </h1>
          <button
            type="button"
            onClick={() => router.push('/saved')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-cream hover:text-copper transition-colors"
            aria-label="Apri post salvati"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Banner compleanni — visibile solo se almeno un membro di
       * famiglia compie gli anni oggi. Tap → /family/[id] del
       * festeggiato (deep link al profilo). Più festeggiati →
       * un card per ciascuno. Palette cocoa-warm: bordo copper subdued,
       * fill copper/8 (gradient discreto). Niente animazioni sul tap. */}
      {birthdaysToday.length > 0 && (
        <div className="px-4 pt-4 flex flex-col gap-2">
          {birthdaysToday.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => router.push(`/family/${b.id}`)}
              className="w-full text-left rounded-xl border border-copper/40 bg-copper/10 px-4 py-3 transition-colors hover:bg-copper/15"
              aria-label={`Apri profilo di ${b.name}`}
            >
              <p className="text-[15px] text-cream">
                Oggi <span className="font-semibold text-copper">{b.name}</span>{' '}
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

      {/* Posts — gap-3 (12px) per densità senza claustrofobia. Le card
          si separano da sole grazie al raised bg + hairline border. */}
      <div className="px-4 py-4 flex flex-col gap-3">
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
            {/* Spinner: usa animate-spin perché è un loader continuo, NON
                un feedback al tap (la regola "zero animazioni" del brief
                vieta animation di feedback su tap, non i loader). */}
            <div className="w-6 h-6 border-2 border-copper/40 border-t-copper rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* FAB — solido copper su cocoa scuro. Niente active:scale (vietato
          dal brief): cambio di colore al hover, basta. */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-copper flex items-center justify-center text-cocoa text-2xl font-bold hover:bg-copper-hover transition-colors"
        aria-label="Crea post"
      >
        +
      </button>

      {/* Create Post BottomSheet — composer cocoa. Notare: BottomSheet
          globale rimane navy (bg-[#1a1a2e] hardcoded in BottomSheet.tsx,
          fuori scope). Il content qui dentro adotta la palette feed
          comunque per coerenza visiva quando l'utente apre il composer. */}
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
              <span className="text-cream font-medium text-[15px]">{member.name}</span>
            </div>
          )}

          {/* Post type selector — pill copper attivo, cocoa-raised idle. */}
          <div className="flex gap-2">
            {(['normal', 'recipe', 'story'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFormType(type)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  formType === type
                    ? 'bg-copper text-cocoa border-copper'
                    : 'bg-cocoa-raised text-warm border-cocoa-border hover:text-cream'
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
            className="w-full bg-cocoa-raised border border-cocoa-border rounded-xl px-4 py-3 text-cream placeholder-warm text-body resize-none focus:outline-none focus:border-copper"
          />

          {/* Image previews */}
          {formPreviews.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {formPreviews.map((src, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-cocoa-border">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleRemoveImage(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-cream text-xs flex items-center justify-center"
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
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-cocoa-border text-warm text-sm hover:border-copper hover:text-copper transition-colors min-h-touch"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Aggiungi foto
          </button>

          {/* Poll toggle + form */}
          <button
            onClick={() => setPollEnabled((v) => !v)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed text-sm transition-colors min-h-touch ${
              pollEnabled
                ? 'border-copper text-copper'
                : 'border-cocoa-border text-warm hover:border-copper hover:text-copper'
            }`}
            aria-pressed={pollEnabled}
            aria-label={pollEnabled ? 'Rimuovi sondaggio' : 'Aggiungi sondaggio'}
          >
            <span aria-hidden="true" className="text-base leading-none">📊</span>
            {pollEnabled ? 'Sondaggio attivo — tocca per rimuovere' : 'Aggiungi sondaggio'}
          </button>

          {pollEnabled && (
            <div className="flex flex-col gap-4 p-4 rounded-xl bg-cocoa border border-cocoa-border">
              {/* Header del blocco — separa visivamente dal resto del composer,
                  così è chiaro che la domanda e le opzioni qui dentro NON
                  sono il testo del post ma il sondaggio. */}
              <div className="flex items-center gap-2 pb-2 border-b border-cocoa-border">
                <span aria-hidden="true" className="text-base">📊</span>
                <h3 className="text-sm font-semibold text-cream">Sondaggio</h3>
              </div>

              {/* Domanda */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="poll-question" className="text-caption text-warm font-medium">
                  Domanda
                </label>
                <input
                  id="poll-question"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Es. Dove andiamo a cena sabato?"
                  maxLength={200}
                  className="w-full bg-cocoa-raised border border-cocoa-border rounded-lg px-3 py-2.5 text-cream placeholder-warm text-body focus:outline-none focus:border-copper"
                />
              </div>

              {/* Risposte possibili */}
              <div className="flex flex-col gap-1.5">
                <label className="text-caption text-warm font-medium">
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
                        className="flex-1 bg-cocoa-raised border border-cocoa-border rounded-lg px-3 py-2 text-cream placeholder-warm text-body focus:outline-none focus:border-copper"
                      />
                      {pollOptions.length > MIN_POLL_OPTIONS && (
                        <button
                          onClick={() => handleRemovePollOption(idx)}
                          className="shrink-0 w-11 h-11 rounded-lg bg-cocoa-raised hover:bg-terracotta/20 text-warm hover:text-terracotta transition-colors flex items-center justify-center"
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
                    className="self-start mt-1 flex items-center gap-1.5 text-sm text-copper hover:text-copper-hover transition-colors min-h-touch"
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
                  className="w-4 h-4 accent-copper"
                />
                <span className="text-sm text-cream">Permetti di scegliere più risposte</span>
              </label>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="poll-closes" className="text-caption text-warm font-medium">
                  Chiusura sondaggio <span className="text-warm/70 font-normal">(opzionale)</span>
                </label>
                <input
                  id="poll-closes"
                  type="datetime-local"
                  value={pollClosesAt}
                  onChange={(e) => setPollClosesAt(e.target.value)}
                  className="w-full bg-cocoa-raised border border-cocoa-border rounded-lg px-3 py-2 text-cream text-body focus:outline-none focus:border-copper"
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
