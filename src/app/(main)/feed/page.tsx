'use client'

import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Cormorant_Garamond, EB_Garamond } from 'next/font/google'
import { usePosts } from '@/hooks/usePosts'
import { useAuth } from '@/hooks/useAuth'
import { useMembers } from '@/hooks/useMembers'
import { Avatar, BottomSheet, Button, PostCardSkeleton, EmptyState, useToast } from '@/components/ui'
import { PostCard } from '@/components/feed/PostCard'
import { compressImage } from '@/lib/storage'
import { MemberPublic, CreatePollInput, BirthdayToday, ApiResponse } from '@/types/database'

// Cormorant Garamond Italic — italica calligrafica seria settecentesca,
// usata per nome autore e header pagina "La Famiglia". EB Garamond regular
// per il body serif "libro" (lettura calma).
// Font sono caricati solo qui (page-level) perche` solo /feed e i suoi
// PostCard vivono nella visual language "lettera manoscritta". Il resto
// dell'app resta Inter.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400', '500', '600'],
  variable: '--font-cormorant',
})
const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['400', '500'],
  variable: '--font-eb-garamond',
})

const MAX_POLL_OPTIONS = 4
const MIN_POLL_OPTIONS = 2

function emptyPollOptions(): string[] {
  return ['', '']
}

// Dingbat divider — ✻ (sextile / six-pointed asterism) in oro tenue.
// Scelto rispetto a ❦ (floral heart, troppo decorativo, profuma di San
// Valentino) e ⁕ (low asterisk, troppo discreto). ✻ ha presenza araldica
// senza cedere al kitsch — e` quello che separa i capoversi nei libri
// settecenteschi.
function Fleuron({ size = 18 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center select-none"
      style={{ margin: '40px 0' }}
      aria-hidden="true"
    >
      <span
        className="font-serif"
        style={{
          color: '#A88830',
          fontSize: `${size}px`,
          letterSpacing: '0.4em',
          // tre dingbat ravvicinati = "asterism" tipografico classico
          opacity: 0.85,
        }}
      >
        ✻ ✻ ✻
      </span>
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

  return (
    // Wrapper di tutta la pagina /feed in visual language "lettera manoscritta".
    // bg-paper sostituisce il navy della shell — la pagina e` un foglio.
    // Le variabili font sono attaccate qui in cima per propagare ai figli
    // (PostCard, BottomSheet, toast non rilevanti perche` usano colori propri).
    <div
      className={`${cormorant.variable} ${ebGaramond.variable} min-h-screen pb-24 text-ink`}
      style={{
        background: '#EDE4D3',
        // Carta antica con una sfumatura sottilissima e una vignettatura
        // macchiata via radial-gradient. NIENTE pattern/texture immagini
        // (lo lascerei per dopo) — qui solo gradienti CSS per stare leggeri.
        backgroundImage: `
          radial-gradient(ellipse 80% 60% at 30% 20%, rgba(168,136,48,0.06), transparent 60%),
          radial-gradient(ellipse 70% 50% at 80% 90%, rgba(58,40,24,0.05), transparent 70%)
        `,
        fontFamily: 'var(--font-eb-garamond), Georgia, serif',
      }}
    >
      <style jsx global>{`
        .feed-vintage .font-serif {
          font-family: var(--font-cormorant), Georgia, serif;
        }
      `}</style>

      {/* Header — "La Famiglia" in italica calligrafica grande, centrata.
          Niente border-b, niente backdrop blur scuro: lo sfondo carta
          continua oltre l'header senza interruzione. Dingbat ✻ sotto il
          titolo come "decorazione araldica". Bottone salvati come testo,
          coerente con il resto del design (parole, non icone). */}
      <div className="feed-vintage sticky top-0 z-30" style={{ background: '#EDE4D3' }}>
        <div className="relative px-4 pt-5 pb-3">
          <h1
            className="font-serif italic text-ink text-center leading-none"
            style={{ fontSize: '34px', letterSpacing: '0.005em' }}
          >
            La Famiglia
          </h1>
          <div
            className="flex items-center justify-center select-none mt-2"
            aria-hidden="true"
          >
            <span
              className="font-serif"
              style={{
                color: '#A88830',
                fontSize: '14px',
                letterSpacing: '0.5em',
                opacity: 0.85,
              }}
            >
              ✻ ✻ ✻
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.push('/saved')}
            className="absolute right-3 top-5 min-h-touch min-w-touch px-3 font-serif italic text-sepia hover:text-ink active:scale-95 transition-all"
            style={{ fontSize: '14px' }}
            aria-label="Apri post salvati"
          >
            salvati
          </button>
        </div>
      </div>

      {/* Banner compleanni — riformattato in stile "annotazione a margine"
          su sfondo carta, con cornice oro tenue tratteggiata. Mantiene la
          tap-to-profile logic. */}
      {birthdaysToday.length > 0 && (
        <div className="feed-vintage px-4 pt-2 flex flex-col gap-2">
          {birthdaysToday.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => router.push(`/family/${b.id}`)}
              className="w-full text-left px-4 py-3 active:scale-[0.99] transition-transform"
              style={{
                border: '1px dashed #A88830',
                background: 'rgba(168,136,48,0.06)',
              }}
              aria-label={`Apri profilo di ${b.name}`}
            >
              <p
                className="font-serif italic text-ink"
                style={{ fontSize: '17px', lineHeight: '1.5' }}
              >
                <span style={{ color: '#A88830' }}>✻</span>{' '}
                Oggi <span className="font-medium">{b.name}</span>{' '}
                {b.id === member?.id ? (
                  <>compi <span className="font-medium">{b.age}</span> anni. Auguri.</>
                ) : (
                  <>compie <span className="font-medium">{b.age}</span> anni. Auguri.</>
                )}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Posts — separati da ornamento dingbat centrale invece che da gap.
          Il primo post NON ha dingbat sopra (il dingbat dell'header
          funge gia` da apertura). */}
      <div className="feed-vintage px-4 py-2 flex flex-col">
        {isLoading && posts.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Fragment key={i}>
              {i > 0 && <Fleuron />}
              <PostCardSkeleton />
            </Fragment>
          ))
        ) : posts.length === 0 ? (
          <div className="py-10">
            <EmptyState
              icon=""
              title="Il quaderno è ancora bianco"
              description="Scrivi qualcosa — una foto, un ricordo, una ricetta. Lo vedrà solo la famiglia."
              action={
                <Button onClick={() => setSheetOpen(true)}>
                  Scrivi il primo post
                </Button>
              }
            />
          </div>
        ) : (
          posts.map((post, i) => (
            <Fragment key={post.id}>
              {i > 0 && <Fleuron />}
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
            </Fragment>
          ))
        )}

        {hasMore && (
          <div ref={bottomRef} className="flex justify-center py-8">
            <span
              className="font-serif italic"
              style={{ color: '#A88830', fontSize: '14px', letterSpacing: '0.1em' }}
            >
              ...continua a sfogliare
            </span>
          </div>
        )}
      </div>

      {/* FAB — sostituito il + brutale con un "scrivi" in oro tenue su
          carta, cornice sottile. Conservato active:scale-95. */}
      <button
        onClick={() => setSheetOpen(true)}
        className="feed-vintage fixed bottom-24 right-5 z-30 min-h-touch px-5 py-3 font-serif italic active:scale-95 transition-all"
        style={{
          fontSize: '17px',
          background: '#EDE4D3',
          color: '#A88830',
          border: '1px solid #A88830',
          boxShadow: '0 2px 12px rgba(58,40,24,0.18)',
          borderRadius: '999px',
        }}
        aria-label="Crea post"
      >
        scrivi qualcosa
      </button>

      {/* Create Post BottomSheet — sheet conserva il tema scuro dell'app
          (e` un componente UI globale, non si tocca). I controlli interni
          restano com'erano per non rompere la coerenza del componente
          condiviso. Eccezione: il titolo "Nuovo post" e` gestito dal
          BottomSheet stesso. */}
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
