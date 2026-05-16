# HANDOFF — La Famiglia

> Documento vivo. Spiega lo stato del progetto e cosa fare appena si riapre.
> Leggilo prima di scrivere codice. **Aggiornalo** ogni volta che chiudi
> una fase.

## Cosa è il progetto

`la-famiglia` è una PWA Next.js + Supabase per una famiglia italiana di 4-6
persone. Pubblico primario: **nonni 65-75 anni**. UI in italiano, niente
onboarding, niente concetti tecnici esposti.

Aree principali:
- **Bacheca** (`/feed`) — post (foto, ricette, storie). Like, reactions
  (❤️ 😄 👏), commenti, **bookmark** (`/saved`), **share su WhatsApp**.
  Lightbox foto + pagina post singolo `/feed/[id]`. **Layout post
  riordinato** (refresh 2026-05-16): avatar+nome → caption → foto →
  timestamp uppercase tracking → reactions chip inline → action row
  (like, comment, share, bookmark right-aligned) → count row.
  `<PostCard>` separato da hairline `border-b border-white/10` —
  niente piu` card chrome esterno (no bg/bordo/rounded card).
- **Attività** (`/activities`) — vista settimanale unificata di attività
  ricorrenti (es. "Piscina ogni sabato") + eventi one-off della settimana
  corrente. Conferma presenze (Confermo / Salto / **composer chat-like
  per nota di modifica**) per entrambi i tipi. Hook `useActivities` +
  `useWeekEvents`, componenti `ActivityCard` ed `EventCard` con identica
  interazione. **DayStrip** sticky in cima sincronizzata
  bidirezionalmente con la lista delle day-sections sotto (refresh
  2026-05-16): scroll verticale → IntersectionObserver detecta day-section
  in vista → pill DayStrip si centra orizzontalmente; tap pill →
  smooth-scroll alla section. Pill compatti (`h-[42px] min-w-[56px]`).
- **Agenda** (`/calendar`) — vista mensile a calendario. Mostra dots
  colorati per ogni giorno e una sheet col dettaglio del giorno
  selezionato. Read-only sulla presenza (la conferma avviene dalla
  pagina Attività).
- **Compiti** (`/tasks`) — to-do con assegnatari.
- **Chat** (`/chat`, `/chat/[id]`) — dirette + gruppi, cluster WhatsApp.
- **Famiglia** (`/family`, `/family/[id]`) — lista membri + profilo
  arricchito con stat + griglia post Instagram-style.
- **Album** (`/albums`, `/albums/[id]`) — gallerie foto.
- **Settings** + **Admin** — gestione account membri.

## Workflow del repo

1. **Branch-per-task** da `main` (es. `claude/feed-fab-to-header`,
   `claude/activities-iteration`). Le PR mergiate su `main` triggerano
   il deploy automatico su Vercel.
2. Commit descrittivi (focus sul "perché", non sul "cosa").
3. Push frequente — ogni feature è una PR atomica.
4. Tutto il copy in italiano. Niente jargon tecnico esposto agli utenti.
5. Push diretto su `main` consentito SOLO per micro-fix UI cosmetici
   (rimozione di un blocco JSX, update di un URL nel registry, etc.)
   e SOLO con autorizzazione esplicita dell'utente. Tutto il resto
   passa da PR.

## Strumenti di debug

### Eruda — console DevTools-like su iPhone (no Mac required)

Apple non espone i DevTools su iOS senza un Mac. Per diagnosticare bug
in produzione che si manifestano solo su Safari iPhone o sulla PWA
installata, abbiamo integrato **Eruda** caricato da CDN, **opt-in via
query param**, completamente invisibile agli utenti normali.

- **Componente**: `src/components/debug/ErudaDevtools.tsx` (montato nel
  root layout, strategy `beforeInteractive`).
- **Attivazione**: aprire qualunque pagina con `?debug=1` nell'URL.
  Una pallina viola appare in basso a destra — tap per aprire console,
  network, storage, service-worker inspector. Il flag è persistente
  via localStorage anche dopo navigazioni e refresh, incluso quando si
  passa da Safari web alla PWA installata (stessa origin).
- **Disattivazione**: `?debug=0` nell'URL → rimuove il flag.
- **Off by default**: senza il flag, lo script di Eruda non viene
  scaricato dal CDN. Zero costo per gli utenti normali.

Quando ricevi un report tipo "schermata bianca / blue / non si carica"
da un device iOS, **prima cosa** chiedi all'utente di aprire il sito
con `?debug=1`, fare uno screenshot della console + del tab Network e
mandartelo. Risparmia ore di tentativi alla cieca.

## Stato attuale (aggiornato 2026-05-15)

L'app è in produzione su Vercel. Funziona su iOS Safari, Android Chrome,
Samsung Internet e desktop. Testata sui device della famiglia.

**Fasi chiuse:**
- **Fase 1** — design tokens, primitives (Button/Toast/Skeleton/EmptyState).
- **Fase 2** — colour-per-member (Cozi pattern), chat WhatsApp.
- **Fase 3** — RLS difensive + post reactions (F3.2).
- **Fase 4** — bug fixes produzione (chat order, partecipanti default,
  Safari hydration), PWA icons + manifest, service worker robusto.
- **Fase 5** — UI front-only:
  - 5.A `<MemberLink>` — click avatar/nome → `/family/[id]`
  - 5.B Pagina post singolo `/feed/[id]` con commenti + composer
  - 5.C `<ImageLightbox>` — swipe + ESC + frecce desktop
  - 5.D Profilo arricchito con stat + griglia 3 colonne tap-through
- **Fase 7** — notifiche push end-to-end:
  - Web Push client cablato (toggle Settings + subscription + VAPID).
    Funziona su Android (browser + PWA) e iPhone (solo PWA installata,
    iOS 16.4+).
  - Catalog centrale `src/lib/notification-events.ts` con `emit(key, payload)`.
    Eventi cablati oggi: `chat_message`, `new_post`, `new_activity`.
    Comments/reactions/tasks/events/attendance usano ancora il vecchio
    `notifyMembers` diretto — migrabili al catalog quando si tocca quella
    route per altro. Vedi convenzione **Notifiche** sotto.
  - Decisione di prodotto: tutti i membri di famiglia possono confermare
    la presenza a qualsiasi attività, non solo i `participant_ids`
    pre-selezionati alla creazione. `activity_participants` resta come
    metadata informativo (chi riceve la push), non come gate d'accesso.
- **Fase 6.1** — Sondaggi nei post:
  - Tre tabelle (`post_polls`, `post_poll_options`, `post_poll_votes`,
    migration `009_post_polls.sql`), modello single/multi-choice con
    `closes_at` opzionale.
  - `<Poll>` in `src/components/feed/Poll.tsx` con barre proporzionali +
    accessibility (aria-pressed, min-h-touch). Composer in `/feed` con
    toggle "📊 Aggiungi sondaggio" e 2-4 opzioni dinamiche.
  - Realtime su `post_poll_votes` in `usePosts` — barre aggiornate live
    per gli altri membri.
  - Bugfix collaterale: `POST /api/posts` accetta ora post con solo
    foto o solo sondaggio (prima richiedeva sempre testo non vuoto).
  - Vedi PRODUCTION_CHANGELOG.md 2026-05-14 per dettagli ops.
- **Fase 6.2 + 6.3** — Reply citation + edit/elimina messaggio chat:
  - Migration `010_chat_message_replies.sql` (FK self
    `reply_to_message_id` con `ON DELETE SET NULL`) e
    `011_chat_message_edits.sql` (`edited_at` + `deleted_at` tombstone).
  - API: POST/GET messages estesi con reply embedded; nuovo endpoint
    `PATCH/DELETE /api/chat/messages/:id` per edit (finestra 2 min) e
    soft-delete.
  - UI: long-press / right-click su bubble → BottomSheet "Azioni messaggio"
    (Rispondi / Modifica / Elimina condizionali). Sticky reply bar sopra
    composer. Citation embedded sopra bubble con tap-to-scroll. Edit
    inline (Enter = salva, Esc = annulla). Bubble eliminato in italic +
    placeholder "[Messaggio eliminato]". Badge "· modificato" accanto al
    timestamp.
  - Realtime esteso in `useChat`: ascolta INSERT **e** UPDATE, merge dei
    campi soft-delete/edit sui messaggi esistenti.
  - Soft-delete server-side: il testo originale viene sostituito col
    placeholder PRIMA della risposta API (no leak via response manipulation).
  - Vedi PRODUCTION_CHANGELOG.md 2026-05-14 per dettagli ops.
- **Fase 6.4** — Bookmark / salva post:
  - Migration `012_post_bookmarks.sql` (RLS privata senza policy SELECT,
    UNIQUE `(post_id, member_id)`).
  - API `POST /api/posts/:id/bookmark` (toggle), `GET /api/posts/bookmarked`
    (paginata). `PostWithDetails.bookmarked_by_me` esposto via
    `buildPostWithDetails`.
  - UI: icona segnalibro nel `<PostCard>` oro `#E8A838` quando attivo,
    nuova pagina `/saved`, scorciatoia nell'header del feed.
- **Fase 6.5** — Compleanni:
  - Migration `013_member_birthdays.sql` (`members.birth_date DATE`
    nullable + index parziale `extract(month|day from birth_date)`).
  - API: `PATCH /api/members/:id` accetta `birth_date`, `GET /api/birthdays/today`,
    `GET /api/cron/birthday-notifications` (Vercel Cron, auth via
    `CRON_SECRET` env). `vercel.json` schedule `0 6 * * *` UTC.
  - Catalog: evento `birthday` (push a tutti tranne il festeggiato).
  - UI: date picker in Settings, banner oro "🎉 Oggi {nome} compie X
    anni" in cima al feed.
- **Fase 6.6** — Mention `@utente` persistenti:
  - Migration `014_mentions.sql` (modello polimorfico
    `source_type ∈ {'post','comment','chat_message'}`, RLS difensiva).
  - Server: `lib/mentions.ts` (parseMentions/insertMentions/
    deleteMentionsForSource), integrazione nei POST handler di posts,
    comments, chat. Cleanup orfani in DELETE post.
  - Catalog: evento `mention` (push diretta al menzionato).
  - UI: `<MentionText>` renderer (`@nome` → `<MemberLink>` oro),
    wired in PostCard, comment row, chat bubble.
  - NON in scope (follow-up): autosuggest popup `@` nel composer.
- **Vista settimanale unificata** (attività + eventi, parte 1+2 di 3):
  - Migration `015_event_attendance_status.sql` estende
    `event_participants` con `status` / `modified_notes` (mirror del
    modello `activity_weekly_attendances`).
  - API `POST /api/events/:id/attendance` (UPSERT per
    `(event_id, member_id)`, mirror di
    `/api/activities/:id/attendance`).
  - UI: in lavorazione (la pagina Attività diventa vista settimanale
    unificata con `activities` ricorrenti + `events` settimanali
    raggruppati per `day_of_week` derivato; Calendario resta
    read-only mensile).

**Vista settimanale unificata — parte 3 chiusa** (PR #49 + #51,
mergiate 2026-05-15):
- UI: nuovo hook `useWeekEvents` (settimana corrente, realtime su
  `events` + `event_participants`), componenti `ActivityCard` +
  `EventCard` con identica interazione "Confermo / Salto / Modifico
  + nota" in `src/app/(main)/activities/page.tsx`.
- Tab filter "Tutti / Eventi / Attività" sticky in cima alla pagina,
  color-coded (giallo Attività, rosa Eventi).
- Sheet di creazione condivisa `<CreateItemSheet>` con toggle interno
  "Evento / Attività" usata sia da `/activities` sia da `/calendar`.
  Default kind = quello della pagina corrente, swappabile in 1 tap.

**Refresh UI globale + /feed + /activities** (2026-05-16, PR #54 #62 #64 #65):

Pure UI iteration, zero DB, zero API touch. Allineamento di feed +
activities + chrome globale a un design "minimal Instagram-like + navy
warm". Migliorie + nuovi pattern infrastrutturali:

- **PR #54 minimal feed**: rimosso il chrome card esterno dai post
  (no bg, border, rounded); separazione fra post via hairline
  `border-b border-white/10`. Header pagina diventa serif italic
  light "La Famiglia".
- **PR #62 hamburger drawer + bottom nav SVG + post reordering**:
  - Header globale: hamburger menu drawer al posto delle 3 icone
    separate (Settings, Admin, Notifiche). Drawer arricchito con
    voce "Famiglia" + sezione "Le nostre app" inline (loghi 36px +
    nome + freccina ↗ external).
  - BottomNav: emoji native sostituite con SVG outline stroke 1.5
    (home, list-checks, calendar, bubble, users). Tab "Famiglia"
    rimossa (spostata nel drawer); 5° slot ora placeholder
    "Presto" disabilitato per futura feature front-only.
  - PostCard riordinato: avatar+nome → caption → foto → timestamp
    piccolo uppercase → reactions chip inline → action row → count.
- **PR #64 + nell'header + firma**:
  - Convenzione globale "+ in header" via `<HeaderActionPortal>`:
    le pagine wrap il proprio bottone action; il portal lo proietta
    nello slot `<div id="header-page-action">` montato dal layout.
    Sostituisce il FAB fixed bottom-right. Zero state, zero loop di
    re-render.
  - Wordmark header centro: `<Logo>` spirale dorato + "La Famiglia"
    (mix bianco + oro Inter).
  - Share post via WhatsApp: anchor `wa.me/?text=...` con preview-less
    (testo + link). Niente Open Graph preview ricca (deciso di no per
    privacy: richiederebbe rotta pubblica `/p/[id]` con scrape-bait).
  - Firma "powered by EAR LAB" in fondo al drawer hamburger.
  - Fix flicker reactions: debounce 600ms delle realtime subscription
    + rimozione del `fetchPosts()` esplicito post-success (era
    ridondante con l'optimistic update).
- **PR #65 activities iteration**:
  - Sync bidirezionale DayStrip ↔ day-sections (vedi sopra "Aree
    principali"). Anti-loop via `isProgrammaticRef` timer 800ms.
  - Bottone "Modifico" → composer chat-like inline in fondo a ogni
    card ("Scrivi una nota di modifica…" + send arrow). Overlay
    modal `modNotesOpen` rimosso del tutto.
  - Espansione card: rimossa riga "Modificano (N)" con pill avatar
    (ridondante col box blu sottostante). Avatar dei modificatori
    rimossi anche dal summary chiuso (confondevano con i confermatori).
  - FAB → `<HeaderActionPortal>` (stessa convenzione del feed).
  - DayStrip pill compatti (`h-[42px] min-w-[56px]` rounded-xl,
    numero 15px label 10px, dots assoluti in basso, shadow gold
    attenuata).
  - Pulizia: `bg-[#16213e]` hardcoded → token `bg-surface-raised`;
    `active:scale-95` rimossi (no animazioni feedback click); emoji
    decorative nel chrome (✓ ✏️ ⏭ 🗓️ 📅 🔁) → SVG outline stroke
    1.5/2 (user-content emoji su `activity.icon` / `event.icon`
    preservate quando l'utente le ha scelte).

**Pagine NON ancora armonizzate** al refresh UI: `/family`,
`/family/[id]`, `/chat`, `/chat/[id]`, `/calendar`, `/tasks`,
`/saved`, `/settings`, `/admin`, `/albums`, `/albums/[id]`. Hanno
ancora `bg-[#1a1a2e]` / `bg-surface` hardcoded + emoji decorative +
FAB bottom-right. Da riarmonizzare pagina-per-pagina con lo stesso
pattern usato su feed + activities.

**5° slot bottom nav ("Presto")**: placeholder riservato per una
feature front-only. Idea in discussione: "Memoria / Oggi un anno fa"
(Facebook Memories pattern — pesca da `posts` quelli di N anni fa
oggi, filtra client-side, riusa `<PostCard>`). Decisione finale
posticipata.

**Cosa NON è ancora stato fatto e dove sta**: i follow-up minori
6.7–6.13 (no DB) restano parcheggiati nelle sezioni più sotto.

## Convenzioni — leggi PRIMA di scrivere codice

### Audience
Stai scrivendo per nonni di 70 anni. Tutto il copy in italiano. Mai jargon
tecnico ("API", "errore 500", "carica in corso"). Frasi corte, inviti
all'azione.

Esempi:
- ✅ "La bacheca è vuota — condividi una foto con la famiglia"
- ❌ "Nessun dato disponibile"

### Design tokens (in `tailwind.config.ts`)

Usa **sempre** i token. Mai colori hard-coded.

```
bg-surface          → #1a1a2e (base pagina)
bg-surface-raised   → #16213e (cards)
bg-surface-high     → #1e2a4a (hover)
bg-surface-sunken   → #0f1729 (input fields)
bg-accent           → #E8A838 (gold, CTA)
text-accent         → #E8A838

rounded-card        → 1rem (card grandi)
rounded-bubble      → 20px (chat bubbles)

min-h-touch / min-w-touch → 44px (tap target minimi iOS)

text-body           → 17px (testo leggibile per anziani)
text-caption        → 13px (metadati)
```

### Componenti UI condivisi (in `src/components/ui/`)

USA QUESTI, non reinventare:

- **`<Button>`** — `variant: primary | ghost | destructive`, `size: sm | md`,
  supporta `loading`.
- **`<EmptyState>`** — icon + title + description + action.
- **`<Toast>` + `useToast()`** — feedback async (success, error, info).
- **`<Skeleton>`** + preset `RowSkeleton` / `PostCardSkeleton` /
  `AlbumCardSkeleton` — loading state. Mai spinner.
- **`<Avatar>`** — passare `ringed` quando il colore-membro è informativo.
- **`<MemberLink>`** — wrapper Link a `/family/[id]`. Usalo dovunque un
  avatar o nome di membro è cliccabile.
- **`<MiniAvatarStack>`** — stack avatar sovrapposti per assignees.
- **`<BottomSheet>`** — modale dal basso.
- **`<SideDrawer>`** — pannello slide-from-side (default 'right',
  passa `side="left"` per il menu hamburger). Usa `createPortal` a
  `document.body` per scappare al containing block dell'header che
  ha `backdrop-blur` (Chrome/Safari issue, vedi commento nel file).
  Scrim z-40, panel z-50 — simmetrico a `BottomSheet`. Esc + tap
  fuori chiudono.
- **`<HeaderActionPortal>`** — wrap il bottone action di pagina (es.
  il "+" che apre un composer) e lo proietta nello slot
  `<div id="header-page-action">` montato dal layout globale.
  Convenzione "+ in header" sostituisce il pattern FAB
  bottom-right per tutte le pagine con action principale.
- **`<Logo>`** — spirale geometrica brand di la-famiglia. Usa
  `currentColor` per ereditare il colore dal parent (es.
  `text-[#E8A838]` per gold). Props `size` (default 32) e
  `animated` (riservato — la classe `animate-spiral-breathe` non
  e` ancora definita in tailwind config, no-op per ora).
- **`<ParticipantPicker>`** — picker membri famiglia.
- **`<Header>`** — header sticky standard (z-30, backdrop-blur).
- **`<ImageLightbox>`** — modale full-screen per foto, swipe tra immagini,
  ESC + frecce desktop. Lock dello scroll della pagina sotto.
- **`<ReactionBar>`** — reazioni ❤️ 😄 👏 sotto i post.
- **`<PostCard>`** (in `src/components/feed/`) — card del post, usata sia
  nel feed lista che nella pagina post singolo. Accetta `onCommentsClick`
  opzionale per il click-through.

### Pattern "colour-per-member" (à la Cozi)

Ogni membro ha un `color` nel DB (`members.color`). USALO ovunque il
membro appaia:
- Avatar `ringed`
- Stripe colorata sinistra delle card che gli appartengono (task assignee,
  post author, event)
- Nome autore nel suo colore (chat bubbles, commenti)

### Card pattern unificato

Tutte le card primarie:
```tsx
className="bg-surface-raised rounded-card border border-white/5"
```
+ stripe colorata se appartengono a un membro:
```tsx
style={{ borderLeft: `3px solid ${color}` }}
```

Eccezione: sezioni interne di settings/admin restano `bg-white/5` (group
di campi, non card).

### Chat bubbles

Vedi `src/app/(main)/chat/[id]/page.tsx`:
- Raggruppamento per autore + finestra **5 minuti**.
- Avatar mostrato solo sul **primo** bubble del cluster (incoming).
- Nome autore solo sul primo bubble del cluster, **nel colore del membro**.
- Timestamp solo sull'**ultimo** bubble del cluster.
- Radius `rounded-bubble` pieno, `rounded-br-md` (outgoing) /
  `rounded-bl-md` (incoming) solo sull'ultimo bubble del cluster.

### Supabase / database

- Migrations in `supabase/migrations/00X_*.sql`. Apply: `supabase db push`
  (CLI linkata al progetto remoto) o paste nella dashboard SQL editor.
- **RLS difensive attive** (`008_rls_defensive.sql`):
  - Auth custom (PIN + tabella `sessions`, non Supabase Auth) →
    `auth.uid()` non esiste.
  - Tutte le API routes usano `createServerClient()` con
    `SUPABASE_SERVICE_ROLE_KEY` → bypassa RLS by design. **Ogni endpoint
    deve chiamare `requireAuth()` o `requireAdmin()`** — l'autorizzazione
    vive lì.
  - Client browser anon: SELECT consentito sulle 11 tabelle realtime
    (necessario per `postgres_changes`), tutto il resto negato.
- Realtime opt-in: per ogni tabella che il client osserva via
  `useRealtimeSubscription`, la migration deve fare
  `ALTER TABLE x REPLICA IDENTITY FULL` +
  `ALTER PUBLICATION supabase_realtime ADD TABLE x`.
- Tutte le FK verso `members`/`posts`/`activities` usano `ON DELETE CASCADE`.

### Toast

```tsx
import { useToast } from '@/components/ui'
const toast = useToast()
toast.error('Non riesco a salvare. Riprova.')
toast.success('Salvato.')
```

Provider già montato in `src/app/layout.tsx`.

### PostCard riusabile

`<PostCard>` in `src/components/feed/PostCard.tsx` è usato da:
- `/feed` (lista) → passa `onCommentsClick` per aprire `/feed/[id]`
- `/feed/[id]` (singolo) → omette `onCommentsClick` (i commenti sono già sotto)

Stessa shape `PostWithDetails` ovunque, costruita da `buildPostWithDetails`
in `src/lib/posts.ts`. Aggiungi campi nuovi al post lì.

### Notifiche push (pattern catalog)

Tutte le notifiche passano da un registry centrale tipato in
`src/lib/notification-events.ts`. Quando una nuova feature deve produrre
una push:

1. Se il tipo è nuovo, aggiungilo all'enum `Notification['type']` in
   `src/types/database.ts` (la colonna DB è TEXT senza CHECK, niente
   migration).
2. Estendi `PayloadByEvent` con la shape del payload tipata.
3. Aggiungi una entry in `NOTIFICATION_EVENTS` con
   `title / body / link / recipients`. Convenzione: il sender va
   sempre escluso dentro `recipients`.
4. Nel route handler chiama:
   ```ts
   emit('nome_evento', payload).catch(err => console.error('emit failed:', err))
   ```
   Fire-and-forget — la risposta HTTP non aspetta web-push.
5. Aggiungi un blocco `describe` in `specs/tests/notification_events.test.ts`.

Il gate `notify_push` per-utente vive dentro `sendPushNotification`
(`src/lib/notifications.ts`). Le definitions del catalog NON devono
filtrarci sopra — restituiscono tutti i potenziali destinatari e il
sistema più in basso scarta chi ha disattivato le push.

Caveat iOS: le push funzionano solo se l'utente ha aggiunto l'app alla
Home schermata (PWA installata, iOS 16.4+). Ogni reinstall invalida la
subscription. Lato server è automatico: `sendPushNotification` pulisce
le subscription scadute (410 / 404) dal DB al primo errore.

## Attività vs Agenda — vista unificata sopra due tabelle

`activities` (ricorrenti settimanali) e `events` (one-off con data
specifica) restano **due tabelle distinte** nel DB perché modellano
concetti semanticamente diversi: ricorrenza vs istanza singola. Ma sopra
di esse vivono due viste che le presentano in modo diverso all'utente:

- **Attività** (`/activities`, hook `useActivities` + `useWeekEvents`)
  → vista settimanale unificata. Mostra entrambi i tipi raggruppati per
  giorno, con identica interazione "Confermo / Salto / Modifico + nota".
  Componenti `ActivityCard` per ricorrenti, `EventCard` per one-off,
  entrambe in `src/app/(main)/activities/page.tsx`.
- **Agenda** (`/calendar`, hook `useEvents` mensile) → calendario
  mensile classico. Mostra dots colorati per ogni giorno e una sheet
  con il dettaglio del giorno selezionato. Read-only sulla presenza
  (la conferma avviene dalla pagina Attività).

**Modello dati**:
- `activities` + `activity_participants` (metadata partecipanti
  abituali, NON gate d'accesso) + `activity_weekly_attendances`
  (risposta per (activity, week_start, member)) + `activity_roles`.
- `events` + `event_participants` (dalla migration 015 fa doppio
  uso: invitati storici legacy + risposte presenza con `status`).

**Modello di interazione (unico)**: tutti i membri loggati possono
rispondere a qualunque attività o evento. Niente roster come gate.
`activity_participants` resta come hint informativo ("chi normalmente
fa parte"), `event_participants` accoglie le risposte.

**Default participants per le card**: un'attività senza riga in
`activity_participants` viene mostrata con TUTTI i membri attivi come
partecipanti abituali. Per restringere, popolare esplicitamente la
tabella.

**Creazione (unificata)**: il "+" su entrambe le pagine apre lo stesso
`<CreateItemSheet>` (`src/components/CreateItemSheet.tsx`) con toggle
interno "Evento / Attività". Default kind = quello della pagina
corrente (Attività su `/activities`, Evento su `/calendar`),
swappabile in 1 tap. `defaultEventDate` precompila la data quando
l'utente apre create da un giorno specifico del calendario. Il
submit chiama la rotta giusta (`POST /api/activities` o
`POST /api/events`) e la pagina si aggiorna via realtime.

**Filtro vista**: tab segment "Tutti / Eventi / Attività" sticky in
cima a `/activities`, color-coded (giallo per attività, rosa per
eventi). Filtra la stessa grouped view senza ri-fetchare.

---

# Follow-up minori (no DB, una sessione ciascuno)

Cose front-only proposte nella Fase 5 ma non realizzate per non gonfiare
i commit. Tutte fattibili da web o PC indifferentemente.

## 6.7 — Long-press reactions su like (Messenger-style)
Tap sul cuore = like (come ora). Long-press 500ms = appare overlay con
❤️ 😄 👏 da scegliere. Decongestiona la `<ReactionBar>` che oggi è
sempre visibile. Componente: `<LikeButton>` che incapsula entrambe le
gesture. File: `src/components/feed/PostCard.tsx`.

## 6.8 — Pull-to-refresh
In `/feed`, `/chat`, `/activities`, `/calendar`. Pattern iOS/Android.
Hook `usePullToRefresh()` in `src/hooks/`, componente
`<PullToRefreshIndicator>` o usare un effetto CSS. Niente librerie
esterne (la famiglia di hook touch è semplice).

## 6.9 — "Memories" banner in feed
Top del feed: se esistono post dello stesso giorno-mese di anni precedenti,
banner orizzontale "Un anno fa..." con foto piccola + tap → post singolo
(5.B). Query in più sul `GET /api/posts`: ?same_day_anniversary=true.

## 6.10 — Composer post migliorato
Bottom sheet di `/feed` page → anteprima immagini più grandi, riordino
drag-and-drop, counter caratteri, auto-grow textarea. File:
`src/app/(main)/feed/page.tsx`. Niente DB.

## 6.11 — Album lightbox unificato
La pagina `/albums/[id]` ha oggi un fullscreen viewer custom inline con
bottone "elimina foto" dentro. Per unificarlo con `<ImageLightbox>` serve
estendere il lightbox con uno slot `actions?: ReactNode`. Refactor
piccolo, una sessione. File: `src/components/ui/ImageLightbox.tsx` +
`src/app/(main)/albums/[id]/page.tsx`.

## 6.12 — Like handler nel post singolo (refactor)
In `/feed/[id]/page.tsx` la logica di `handleLike` è replicata invece di
riusare quella di `usePosts.toggleLike`. Estrarre in `useTogglePostLike()`
hook in `src/hooks/` e riusare. Solo cleanup, zero comportamento nuovo.

## 6.13 — MiniAvatarStack tap-to-expand
Oggi gli `<MiniAvatarStack>` (3 avatar sovrapposti < 44px) non sono
cliccabili — troppo piccoli per essere tap target individuali. Quando
servisse: tap sullo stack apre BottomSheet con lista estesa dei membri,
ognuno con `<MemberLink>` al profilo. File:
`src/components/ui/MiniAvatarStack.tsx`.

---

# Punti aperti dall'audit di Fase 1/2 (in pancia)

9 cose minori parcheggiate, da verificare insieme — non bloccanti:
1. `post_likes` vs `post_reactions` — chiarire se `post_likes` è legacy.
2. `app_config` in default-deny — `grep -rn "app_config" src/` per
   vedere se qualcuno legge lato client.
3. Test cleanup come `it()` finale in `rls_defensive.test.ts` → spostare
   in `afterAll()`.
4. Confermare modello "anon legge tutte le reazioni" è coerente con la
   privacy desiderata.
5. Tre fonti di verità per realtime tables (`002`, `006`, `007`, `008`,
   `009+`) — eventuale view di sync.
6. `usePosts` fa `fetchPosts()` completo a ogni reaction toggle →
   ottimizzare quando il feed cresce oltre 100 post.
7. `postId: _postId` unused in `<ReactionBar>` → toglierlo o documentare
   il "reserved for".
8. `member as MemberPublic` cast in `feed/page.tsx` → tipare meglio
   `useAuth()`.
9. E2E reactions completo (login + click + persist) — richiede member di
   test seedato.

# Security audit follow-up (priorità: media)

Audit del 2026-05-11 sulle 24 API routes (post-RLS difensive): **tutti
gli endpoint** chiamano `requireAuth()` / `requireAdmin()` o sono
pubblici giustificati. Manca solo la **copertura test**.

Da aggiungere (per parità coverage):
- `chat_groups_authorization.test.ts`
- `chat_messages_authorization.test.ts`
- `posts_authorization.test.ts` — author/admin checks su DELETE
- `post_comments_authorization.test.ts`
- `post_like_authorization.test.ts`
- `notifications_authorization.test.ts` — self-scoping
- `members_authorization.test.ts` — self-update vs admin

Non urgenza di sicurezza, solo copertura.

---

# Pattern per nuove migrations

Quando aggiungi una migration:

1. **Numerazione sequenziale**: `009_*.sql`, `010_*.sql`, ecc. (vedi
   `supabase/migrations/` per l'ultimo numero usato).
2. **Idempotenza**: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
   EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Le migration devono
   essere ri-eseguibili senza errori.
3. **RLS attive**: per ogni tabella nuova `ENABLE ROW LEVEL SECURITY`.
   Se serve realtime, aggiungi `CREATE POLICY "rls_defensive_select" ... FOR
   SELECT TO anon, authenticated USING (true);`. Niente policy INSERT /
   UPDATE / DELETE — service_role bypassa, anon è in default-deny.
4. **PK UUID** con `gen_random_uuid()`.
5. **FK con `ON DELETE CASCADE`** verso `posts` / `members` / `chat_groups`,
   `ON DELETE SET NULL` quando vuoi conservare la riga referente (es.
   `reply_to_message_id`).
6. **Realtime opt-in**: `ALTER TABLE x REPLICA IDENTITY FULL;` +
   `ALTER PUBLICATION supabase_realtime ADD TABLE x;` per le tabelle che
   il client osserva via `useRealtimeSubscription`.
7. **Aggiungi entry in `PRODUCTION_CHANGELOG.md`** con la data e il comando
   `supabase db push` da eseguire in produzione.

# Note di tono per l'utente

- Parla italiano.
- È product designer / founder, non ingegnere senior — spiegagli le
  scelte tecniche solo quando hanno impatto sul prodotto.
- Apprezza commit messages dettagliati (focus sul "perché").
- Detesta over-engineering e abstractions premature.
- Conosce il pubblico (nonni / genitori) — fidati del suo giudizio sul
  copy.
- Chiedi prima di intraprendere refactor non richiesti.
- Mantieni la modularità: features grosse vanno in commit separati e
  atomici (vedi Fase 5 come modello — 4 sub-features = 4 commit).
