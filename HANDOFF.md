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
  (❤️ 😄 👏), commenti. Lightbox foto + pagina post singolo `/feed/[id]`.
- **Attività** (`/activities`) — eventi ricorrenti settimanali (es. "Pranzo
  domenicale" ogni sabato), con presenze per membro.
- **Agenda** (`/calendar`) — eventi one-shot con data specifica.
- **Compiti** (`/tasks`) — to-do con assegnatari.
- **Chat** (`/chat`, `/chat/[id]`) — dirette + gruppi, cluster WhatsApp.
- **Famiglia** (`/family`, `/family/[id]`) — lista membri + profilo
  arricchito con stat + griglia post Instagram-style.
- **Album** (`/albums`, `/albums/[id]`) — gallerie foto.
- **Settings** + **Admin** — gestione account membri.

## Workflow del repo

1. Sviluppa sempre sul branch `claude/fix-hydration-issues-Cp0Eu`.
   Le PR vengono mergiate su `main` automaticamente al push.
2. Commit descrittivi (focus sul "perché", non sul "cosa").
3. Push frequente — ogni feature è una PR atomica.
4. Tutto il copy in italiano. Niente jargon tecnico esposto agli utenti.

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

## Stato attuale (aggiornato 2026-05-14)

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

**Cosa NON è ancora stato fatto e dove sta**: vedi sezione **Fase 6**
sotto (6.2–6.6).

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

## Attività vs Calendario — due moduli indipendenti

`Attività` e `Agenda` sono due feature separate che leggono e scrivono su
tabelle distinte:

- **Attività** (`/activities`) → `activities` + `activity_participants` +
  `activity_weekly_attendances`. Ricorrenti settimanali.
- **Agenda** (`/calendar`) → `events`. One-shot con data specifica.

**Niente sincronizzazione bidirezionale.** Se servisse una vista unificata,
va costruita lato lettura sopra entrambe le tabelle.

**Default participants**: un'attività senza riga in `activity_participants`
viene mostrata con TUTTI i membri attivi come partecipanti. Per restringere
il roster, popolare esplicitamente la tabella.

---

# Fase 6 — Da fare (richiede modifiche al DB)

Tutte queste feature sono state proposte all'utente, **approvate in
linea di principio** e parcheggiate qui perché richiedono migration SQL
nuova. La preferenza dell'utente è di farle da PC con Claude Code, una
per volta. Ognuna è atomica: può essere fatta da sola.

Per ogni voce: cosa fare, perché serve, SQL pronto, API da aggiungere,
UI da costruire, stima impatto.

---

## 6.2 — Reply citation in chat (priorità: alta)

**Cosa**. Tap-long o swipe su un messaggio chat → opzione "Rispondi". Il
nuovo messaggio mostra in alto una citazione del messaggio originale
(pattern WhatsApp).

**Perché**. La famiglia ha già detto in test che a volte non si capisce
"a quale messaggio sta rispondendo" — soprattutto nei gruppi.

**Schema SQL** (nuovo file `010_chat_message_replies.sql`):

```sql
-- ═══ CHAT MESSAGE REPLIES — quote a previous message ═══
-- Un messaggio può citare un altro messaggio dello stesso gruppo.
-- ON DELETE SET NULL: se il messaggio citato viene eliminato, la reply
-- rimane (mostriamo "Messaggio eliminato" nella citation).

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON chat_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
```

**API**.
- `POST /api/chat/groups/:id/messages` — accetta `reply_to_message_id?`
  opzionale nel body
- `GET /api/chat/groups/:id/messages` — include `reply_to: { id, text,
  author_name, author_color } | null` per ogni messaggio (joining su
  se stesso). Se `reply_to_message_id` è non-NULL ma il messaggio è stato
  eliminato (FK SET NULL), `reply_to` è `null` e l'UI mostra
  "Messaggio eliminato".

**Tipi**:
```ts
type ChatMessage = ... & { reply_to_message_id: string | null }
type ChatMessageWithAuthor = ... & {
  reply_to: { id, text, author: { name, color } } | null
}
```

**UI**.
- In `src/app/(main)/chat/[id]/page.tsx`: long-press (500ms) o swipe-right
  sul bubble → sticky bar in cima al composer "↩ Rispondi a [Marco]:
  [testo troncato]" con X per annullare.
- Sopra il bubble, se `reply_to` è non-null: piccola card embedded con
  bar verticale nel colore dell'autore citato + nome + 1 riga di testo.
  Tap sulla card embedded → scroll to original message + highlight 1s.

**Stima**: 1 sessione (~2h). Niente tabelle nuove, solo una colonna +
self-join. UI è la parte più consistente.

---

## 6.3 — Edit / elimina messaggio chat (priorità: media)

**Cosa**. Tap su un messaggio proprio → menu "Modifica" / "Elimina".
Modifica = editor inline (max 2 minuti dopo invio), elimina = sostituisce
il bubble con "Messaggio eliminato".

**Perché**. Errori di battitura su mobile sono frequenti per i nonni. Oggi
non c'è modo di correggerli — bisogna scrivere un altro messaggio.

**Schema SQL** (file `011_chat_message_edits.sql`):

```sql
-- ═══ CHAT MESSAGE EDITS / DELETES ═══
-- edited_at NULL = mai modificato. deleted_at NULL = non eliminato.
-- Tombstone soft-delete: la riga resta perché potrebbe avere
-- reply_to_message_id che la cita (vedi 010).

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_messages_active
  ON chat_messages(group_id, created_at)
  WHERE deleted_at IS NULL;
```

**API**.
- `PATCH /api/chat/messages/:id { text }` — solo author, solo entro 2
  minuti da `created_at` (window editabile, dopo restituisci 403)
- `DELETE /api/chat/messages/:id` — solo author. Imposta `deleted_at`,
  NON cancella la riga.
- `GET /api/chat/groups/:id/messages` — se `deleted_at` non-null, sostituisci
  `text` con stringa placeholder (`'[Messaggio eliminato]'`) lato server
  per non leakare il testo originale.

**UI**.
- Long-press sul bubble proprio → menu (BottomSheet con due voci).
- Editor inline: il bubble si trasforma in textarea, "Salva" / "Annulla".
- Bubble eliminato: italic, opacity-50, text "Messaggio eliminato".
- Badge "Modificato" piccolo sotto il timestamp se `edited_at` non-null.

**Stima**: 1 sessione (~2h).

---

## 6.4 — Bookmark / salva post (priorità: bassa)

**Cosa**. Icona segnalibro sotto ogni post. Pagina dedicata `/saved` con i
post salvati dall'utente corrente.

**Perché**. La nonna salva spesso ricette per rileggerle. Oggi deve
scorrere indietro nel feed.

**Schema SQL** (file `012_post_bookmarks.sql`):

```sql
CREATE TABLE IF NOT EXISTS post_bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  member_id   UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_post_bookmarks_member
  ON post_bookmarks(member_id, created_at DESC);

ALTER TABLE post_bookmarks ENABLE ROW LEVEL SECURITY;
-- Niente policy SELECT pubblica: i bookmark sono privati. Service role
-- via API gestisce tutto.

-- Realtime non necessaria (l'azione è dell'utente stesso).
```

**API**.
- `POST /api/posts/:id/bookmark` — toggle (idempotent: 201 created o 200
  removed)
- `GET /api/posts/bookmarked?page=…` — lista dei post salvati dall'utente

**UI**.
- Icona segnalibro nel `<PostCard>` (vicino al cuore).
- Nuova route `/saved` con grid identica a `/feed` ma filtrata.
- Voce "Salvati" nella BottomNav o nel menu profilo (decidere con utente).

**Stima**: 1 sessione (~2h).

---

## 6.5 — Compleanni (priorità: media, stagionale)

**Cosa**. Aggiungere data di nascita ai membri. Notifica push + banner sul
feed il giorno del compleanno di un membro.

**Perché**. La famiglia ha dimenticato il compleanno di una zia.

**Schema SQL** (file `013_member_birthdays.sql`):

```sql
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS birth_date DATE;

CREATE INDEX IF NOT EXISTS idx_members_birthday
  ON members ((to_char(birth_date, 'MM-DD')))
  WHERE birth_date IS NOT NULL;
```

**API**.
- `PATCH /api/auth/members/:id` — accetta `birth_date?` opzionale (solo
  self o admin)
- `GET /api/birthdays/today` — ritorna i membri con compleanno oggi

**Cron / trigger**.
- Vercel Cron giornaliero alle 08:00 chiama `/api/cron/birthday-notifications`
  che invia push notification ai membri quando c'è un compleanno.
- Configurazione in `vercel.json` (creare il file se non esiste).

**UI**.
- Settings: campo "Data di nascita" (date picker IT).
- Feed: banner in cima il giorno del compleanno: "🎉 Oggi Marco compie X
  anni. Auguri!" — tap apre la chat con Marco (se direct chat esiste).

**Stima**: 1.5 sessioni — il cron è la parte nuova rispetto al resto del
progetto, richiede setup Vercel.

---

## 6.6 — Mention @utente persistente (priorità: bassa)

**Cosa**. Scrivere `@` in un post/commento/messaggio chat → autosuggest
membri. La mention diventa un link cliccabile + genera notifica push.

**Perché**. Quality-of-life per chat di gruppo grandi. La nonna non ha
chiesto specificamente questo.

**Schema SQL** (file `014_mentions.sql`):

```sql
CREATE TABLE IF NOT EXISTS mentions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT NOT NULL CHECK (source_type IN ('post','comment','chat_message')),
  source_id       UUID NOT NULL,
  mentioned_id    UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  author_id       UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentions_source
  ON mentions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_mentions_mentioned
  ON mentions(mentioned_id, created_at DESC);

ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_defensive_select" ON mentions FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE mentions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE mentions;
```

**Implementazione**.
- Parser lato server (in `POST /api/posts`, `POST /api/posts/:id/comments`,
  `POST /api/chat/groups/:id/messages`) che estrae `@nome` dal testo e
  fa match contro `members.name`. Per ogni match → INSERT in `mentions`
  + push notification.
- Client: textarea con `@` trigger → BottomSheet con lista membri filtrata.
- Render: parser nel client che trasforma `@nome` in `<MemberLink>`.

**Attenzione**: implementazione non triviale perché tocca parsing testo.
È la più complessa di Fase 6. Considerare se la famiglia la userebbe
davvero prima di farla.

**Stima**: 2 sessioni.

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
