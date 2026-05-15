'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Playfair_Display, Cormorant_Garamond } from 'next/font/google'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, BottomSheet, Button, useToast } from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import { compressImage } from '@/lib/storage'
import { MemberPublic, CreatePollInput, BirthdayToday, ApiResponse } from '@/types/database'

/**
 * Pagina /feed — redesign "editorial magazine" (Kinfolk/Cereal/Aesop).
 * Sfondo carta crema, inchiostro caldo, serif display per i nomi, mono
 * uppercase per timestamp e azioni. Le foto a angoli vivi 4:5 verticali.
 * Post separati da margin 40px + hairline 1px terra: text-only post
 * NON spariscono più perché hanno peso tipografico autonomo (serif italic
 * 20px per il nome autore + body 17px serif libro).
 *
 * Font caricati con next/font/google in scope locale (questa pagina e
 * sotto-componenti via CSS variable + tailwind font-serif/mono fallback).
 * Niente font globale: il resto dell'app rimane navy/Inter.
 */

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  style: ['italic', 'normal'],
  variable: '--font-playfair',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['italic', 'normal'],
  variable: '--font-cormorant',
  display: 'swap',
})

const MAX_POLL_OPTIONS = 4
const MIN_POLL_OPTIONS = 2

function emptyPollOptions(): string[] {
  return ['', '']
}

/** Skeleton editoriale "carta" — niente shimmer scuro, blocchi paper-deep
 * spaziati come un post vero, così durante il loading la pagina già "respira"
 * come un magazine. */
function PaperPostSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center gap-3 pb-5">
        <div className="h-8 w-8 rounded-full bg-paper-deep" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 bg-paper-deep" />
          <div className="h-2.5 w-20 bg-paper-deep" />
        </div>
      </div>
      <div className="space-y-2 pb-5">
        <div className="h-3 w-full bg-paper-deep" />
        <div className="h-3 w-5/6 bg-paper-deep" />
        <div className="h-3 w-4/6 bg-paper-deep" />
      </div>
      <div className="aspect-[4/5] w-full bg-paper-deep -mx-4" />
    </div>
  )
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

  // L'app shell padre setta px-4 + bg navy. Lo annulliamo con -mx-4 + -mt-2
  // sul wrapper esterno e applichiamo il nostro bg-paper a tutto schermo,
  // poi riapplichiamo px-4 dentro. Layout pulito senza toccare il layout
  // (main).
  //
  // Nota fonts: NON usiamo styled-jsx per ridefinire font-serif/font-mono
  // globalmente nello scope. Invece passiamo i CSS-variables `--font-playfair`
  // e `--font-cormorant` come prop alle classi/style inline dove servono.
  // Tailwind `font-serif` di default è la stack di sistema (Georgia, Times) e
  // va bene come fallback per body. Sovrascriviamo via `style={{fontFamily}}`
  // solo dove vogliamo Playfair (display/headlines) o Cormorant (body articolo).
  return (
    <div
      className={`${playfair.variable} ${cormorant.variable} -mx-4 -mt-2 min-h-screen bg-paper text-ink pb-24`}
      style={{
        // Body serif Cormorant per tutta la pagina, font-mono cade su default
        // monospace (leggibile). Display Playfair via override locale.
        fontFamily: 'var(--font-cormorant), Georgia, "Times New Roman", serif',
      }}
    >
      <div>
        {/* Masthead — banda paper opaca per coprire il navy app shell quando
            la pagina scrolla. Header "La Famiglia" in Playfair italic 34px,
            sottotitolo mono uppercase tracking-widest "DIARIO DI FAMIGLIA"
            stile sotto-testa di magazine. */}
        <div className="sticky top-0 z-30 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
          <div className="px-4 pt-4 pb-3 flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <h1
                className="italic font-normal text-ink text-[34px] leading-[1] tracking-tight"
                style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
              >
                La Famiglia
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-soft">
                Diario di famiglia &middot; {new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/saved')}
              className="flex h-touch w-touch items-center justify-center text-terra hover:text-terracotta transition-colors"
              aria-label="Apri post salvati"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
              </svg>
            </button>
          </div>
          {/* Hairline divider editoriale sotto il masthead. */}
          <div className="mx-4 h-px bg-terra" />
        </div>

        {/* Banner compleanni — riformulato in stile editoriale: niente
         * gradiente gold, è un blocco "ANNUNCIO" tipografico, in carta-deep
         * con bordo hairline terra. Tap → /family/[id] del festeggiato. */}
        {birthdaysToday.length > 0 && (
          <div className="px-4 pt-6 flex flex-col gap-3">
            {birthdaysToday.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => router.push(`/family/${b.id}`)}
                className="w-full text-left bg-paper-deep border border-terra/60 hover:border-terracotta/60 px-5 py-4 transition-colors min-h-touch"
                aria-label={`Apri profilo di ${b.name}`}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-terracotta pb-1">
                  Annuncio &middot; Compleanno
                </p>
                <p
                  className="text-ink text-[19px] leading-[1.4]"
                  style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
                >
                  Oggi <span className="italic font-medium">{b.name}</span>{' '}
                  {b.id === member?.id ? (
                    <>compi <span className="font-medium tabular-nums">{b.age}</span> anni.</>
                  ) : (
                    <>compie <span className="font-medium tabular-nums">{b.age}</span> anni.</>
                  )}{' '}
                  <span className="italic text-terracotta">Auguri.</span>
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Posts — separati da margin 48px + hairline 1px terra al centro.
            Il primo post non ha hairline sopra (è il top del feed). */}
        <div className="px-4 pt-8">
          {isLoading && posts.length === 0 ? (
            <div className="flex flex-col">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  {i > 0 && <div className="my-12 h-px bg-terra" />}
                  <PaperPostSkeleton />
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            // Empty state editoriale custom (EmptyState globale è bianco su
            // navy: non funziona su carta, e non lo possiamo modificare).
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-4">
              <p
                className="italic text-ink text-[26px] leading-tight"
                style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
              >
                La bacheca è vuota.
              </p>
              <p
                className="text-ink-soft text-[17px] leading-[1.55] max-w-xs"
                style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}
              >
                Condividi una foto, una storia o una ricetta — sarà visibile solo alla famiglia.
              </p>
              <div className="mt-2">
                <Button onClick={() => setSheetOpen(true)}>
                  Scrivi il primo post
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {posts.map((post, idx) => (
                <div key={post.id}>
                  {idx > 0 && <div className="my-12 h-px bg-terra" />}
                  <PostCard
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
                </div>
              ))}
            </div>
          )}

          {hasMore && (
            <div ref={bottomRef} className="flex justify-center py-8">
              <div className="h-5 w-5 border border-terra border-t-terracotta rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* FAB — editoriale, quadrato a angoli vivi, terracotta su carta.
            Glifo "+" in serif italic (non un emoji). Touch target ampio. */}
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-24 right-5 z-30 h-14 w-14 bg-ink text-paper flex items-center justify-center hover:bg-terracotta active:scale-95 transition-all shadow-[0_2px_12px_rgba(42,31,26,0.25)]"
          aria-label="Crea post"
          style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
        >
          <span className="text-3xl italic leading-none mb-1">+</span>
        </button>

        {/* Create Post BottomSheet. Il BottomSheet è UI globale (don't-touch)
            ma ci entriamo con contenuto stilizzato carta/inchiostro. */}
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
                  {type === 'normal' ? 'Normale' : type === 'recipe' ? 'Ricetta' : 'Racconto'}
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3m0 0V4m0 8v8m6-12h3m-3 0V8m0-4v16m6-8h3m-3 0v-4m0 4v8" />
              </svg>
              {pollEnabled ? 'Sondaggio attivo — tocca per rimuovere' : 'Aggiungi sondaggio'}
            </button>

            {pollEnabled && (
              <div className="flex flex-col gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                {/* Header del blocco — separa visivamente dal resto del composer,
                    così è chiaro che la domanda e le opzioni qui dentro NON
                    sono il testo del post ma il sondaggio. */}
                <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                  <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3m0 0V4m0 8v8m6-12h3m-3 0V8m0-4v16m6-8h3m-3 0v-4m0 4v8" />
                  </svg>
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
    </div>
  )
}
