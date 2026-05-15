# Production changelog

Things that need to happen on the live deployment when a release lands. This
file is the source of truth for **manual ops** (DB migrations, env vars,
storage policies, etc.) — the kind of work `vercel deploy` won't do for you.

Format: newest first. Each entry says what to run and where.

---

## 2026-05-15 — Bookmark / salva post (Fase 6.4)

**Why**. La nonna salva spesso ricette nei post per rileggerle e oggi
deve scorrere indietro nel feed per recuperarle. Aggiungiamo l'icona
segnalibro sotto ogni post e una pagina dedicata `/saved`.

Questa entry copre **solo la migration SQL** — API routes e UI
verranno in commit / PR separati per consentirne review atomica.

**What to apply on production**

Già **applicata via MCP** sul progetto remoto `la-famiglia`
(`syikumgxsfnoxrwrbste`) il 2026-05-15. Nessun comando da rilanciare;
`supabase db push` resta no-op se rieseguito (migration idempotente).

Applica una migration:
- `012_post_bookmarks.sql` — crea `post_bookmarks(id, post_id,
  member_id, created_at)` con `UNIQUE(post_id, member_id)` (consente
  toggle idempotente lato API), FK con `ON DELETE CASCADE` verso
  `posts` e `members`, index `(member_id, created_at DESC)` per la
  query principale "post salvati da X dal più recente". RLS abilitata
  **senza policy SELECT pubblica** — pattern difensivo: anon/authenticated
  leggono zero righe, il service_role bypassa e tutta la lettura
  passa dalle API server-side che filtrano per utente autenticato.
  Coerente con migration `008_rls_defensive.sql`.

**Privacy**. I bookmark sono privati per disegno: nessun altro membro
può vedere cosa hai salvato. Senza policy SELECT pubblica, anche un
client che cercasse di leggere `post_bookmarks` direttamente con la
anon key otterrebbe sempre 0 righe.

**Realtime**. La tabella NON è aggiunta a `supabase_realtime`: l'azione
salva/rimuovi è dell'utente sul suo device, nessun altro client deve
vedere il cambiamento in real-time.

**Verifica post-migration** (eseguita via MCP):
- Tabella creata ✓
- 3 index: `post_bookmarks_pkey`, `post_bookmarks_post_id_member_id_key`
  (unique), `idx_post_bookmarks_member` ✓
- 2 FK con CASCADE: `post_bookmarks_post_id_fkey`,
  `post_bookmarks_member_id_fkey` ✓
- `rowsecurity = true`, `pg_policies` count = 0 ✓
- NON in `pg_publication_tables` per `supabase_realtime` ✓
- Advisor Supabase: solo INFO `rls_enabled_no_policy`, atteso (stesso
  pattern di `push_subscriptions`, `chat_group_members`, `sessions`,
  ecc.).

**API e UI**: rimangono da implementare in PR separate (vedi
`HANDOFF.md` sez. 6.4 per spec). API previste:
`POST /api/posts/:id/bookmark` (toggle), `GET /api/posts/bookmarked`.

---

## 2026-05-14 — Reply citation + edit/elimina messaggio chat (Fase 6.2 + 6.3)

**Why**. Due lamentele esplicite della famiglia durante l'uso reale della
chat: (1) "non si capisce a chi sto rispondendo nei gruppi grandi" — fix
con pattern WhatsApp di citazione. (2) "ho fatto un errore di battitura e
non posso correggerlo" — fix con edit inline entro 2 minuti + soft-delete.

**What to apply on production**

```sh
supabase db push
```

Applica due migration:
- `010_chat_message_replies.sql` — aggiunge `chat_messages.reply_to_message_id`
  (UUID NULL, FK self con `ON DELETE SET NULL`) + index parziale. Il
  `ON DELETE SET NULL` garantisce che eliminare un messaggio NON cancelli
  le reply che lo citano (mostriamo "Messaggio eliminato" nella citation).
- `011_chat_message_edits.sql` — aggiunge `chat_messages.edited_at` e
  `chat_messages.deleted_at` (entrambi TIMESTAMPTZ NULL) + index parziale
  `WHERE deleted_at IS NULL`. Soft-delete tombstone, non hard-delete: la
  riga resta perché potrebbe avere reply che la citano.

**Già applicate sul progetto remoto `la-famiglia` il 2026-05-14** via
`supabase db push` (linked).

**Modello soft-delete (importante)**: il server **sostituisce `text`** con
`"[Messaggio eliminato]"` PRIMA di rispondere alla GET messages quando
`deleted_at` è non-NULL. Lato API il testo originale non lascia mai il
DB → il client non può leggerlo manipolando la response. Lo stesso vale
per la citazione embedded di un messaggio eliminato.

**Finestra di edit**: 2 minuti da `created_at`. Decisione di prodotto:
lungo abbastanza per correggere typo/autocorrect, corto abbastanza da
impedire di riscrivere la storia di una conversazione. La costante è
duplicata client/server (`EDIT_WINDOW_MS`) — server resta source of truth
(403 dopo i 2 minuti).

**API**

- `POST /api/chat/groups/:id/messages` — accetta ora `reply_to_message_id?`
  (JSON o FormData). Validato server-side: deve esistere ed essere dello
  STESSO gruppo (impedisce di citare messaggi di altri gruppi tramite id
  pinchato dalla rete).
- `GET /api/chat/groups/:id/messages` — include ora `reply_to: { id, text,
  author: { id, name, color } } | null` con self-join su `chat_messages`.
  Soft-delete placeholder applicato sia al messaggio principale sia al
  `reply_to` embedded.
- `PATCH /api/chat/messages/:id { text }` — solo autore, solo entro 2 min,
  imposta `edited_at = now()`. 403 fuori finestra, 410 se già eliminato.
- `DELETE /api/chat/messages/:id` — solo autore. Imposta `deleted_at = now()`,
  idempotente (riapplicato = no-op che ritorna il timestamp originale).

**UI** (`src/app/(main)/chat/[id]/page.tsx` riscritto):
- Long-press 500ms (touch) o right-click (desktop) su un bubble → BottomSheet
  "Azioni messaggio" con voci condizionali: Rispondi (sempre), Modifica (solo
  proprio + dentro finestra 2 min), Elimina (solo proprio).
- Sticky reply bar sopra il composer quando si sta rispondendo: bar verticale
  colore membro + autore + preview text + bottone X per annullare.
- Citation embedded sopra ogni bubble con `reply_to` non-NULL: card piccola
  con border-left colore membro citato + nome + 1 riga text troncato.
  Tap → scroll al messaggio originale con highlight ring 1.2s.
- Edit inline: il bubble si trasforma in textarea + "Annulla" / "Salva".
  Enter = salva, Esc = annulla. Optimistic update locale + realtime UPDATE
  per gli altri.
- Bubble eliminato: italic, opacity-60, testo "[Messaggio eliminato]".
- Badge "· modificato" accanto al timestamp se `edited_at` non-NULL.

**Realtime**: `useChat` ora ascolta INSERT **e** UPDATE su `chat_messages`.
INSERT arricchisce `reply_to` via lookup nei messaggi già caricati
(best-effort: se il citato è scrollato fuori della pagina, la citation appare
al prossimo refresh). UPDATE applica merge di `text` / `edited_at` /
`deleted_at` mantenendo `author` e `reply_to` esistenti.

**Side effect su dati esistenti**: nessuno. Tutte le colonne nuove sono
NULL di default, le righe vecchie restano valide; soft-delete e reply
sono opt-in via UI.

---

## 2026-05-14 — Sondaggi nei post (Fase 6.1)

**Why**: sblocca decisioni di famiglia coordinate ("Quando ci vediamo?
— Sabato / Domenica / Liberi"). Prima feature di prodotto richiesta
esplicitamente come "WhatsApp/Instagram-like". Allegata a un post
normale, niente modulo a sé.

**What to apply on production**

```sh
supabase db push
```

Applica `supabase/migrations/009_post_polls.sql` — tre nuove tabelle:
- `post_polls` — sondaggio per post (1:1 con `posts.id`, UNIQUE)
- `post_poll_options` — 2-4 opzioni per sondaggio, ordinate via `sort_order`
- `post_poll_votes` — voti per opzione, UNIQUE(poll, option, member) per
  impedire doppio voto sulla stessa opzione

RLS difensive: SELECT pubblico per anon/authenticated (necessario per
Realtime), mutazioni solo via service_role attraverso le API. Realtime
opt-in: tutte e tre le tabelle in `supabase_realtime` con
`REPLICA IDENTITY FULL`, guardate da `pg_publication_tables` per
idempotenza (vedi pattern già usato in 007).

**Già applicata sul progetto remoto `la-famiglia` il 2026-05-14** via
`supabase db push` (linked). Niente reset password DB richiesto: il link
funziona con il solo access token CLI; `db push` ha applicato la 009 senza
chiedere credenziali aggiuntive perché era l'unica pendente.

**Modello di voto**:
- `multi_choice = false` (default) → tap su un'opzione sostituisce il voto
  precedente del membro su quel sondaggio (l'endpoint cancella i voti
  precedenti del membro e inserisce il nuovo, atomicamente sul lato
  applicativo). Idempotente se si rivota la stessa opzione.
- `multi_choice = true` → ogni opzione è un voto indipendente, toggla.
- `closes_at` non-null e nel passato → endpoint vote restituisce 403.
  La UI mostra il sondaggio in modalità lettura.

**Side effect su dati esistenti**: nessuno. Le tre tabelle sono nuove,
nessun backfill, nessuna migration di righe.

**API aggiunte**

- `POST /api/posts` ora accetta `poll` opzionale nel FormData (JSON
  string: `{ question, options[], multi_choice?, closes_at? }`). Validazione
  server-side: question 1-200 char, 2-4 opzioni non vuote di max 100 char,
  niente duplicati, `closes_at` se presente deve essere nel futuro.
- `POST /api/posts/:id/poll/vote { option_id }` — vota / cambia voto,
  201 created o 200 idempotente.
- `DELETE /api/posts/:id/poll/vote?option_id=...` — ritira voto. Se
  `option_id` assente rimuove tutti i voti del membro per il sondaggio
  (utile in single-choice quando si toglie il voto attivo).

**Bugfix collaterale al gate del POST `/api/posts`**: il server prima
rifiutava qualsiasi POST con `text` vuoto. Il client invece accettava
post con solo foto o solo sondaggio. Allineato il server: ora un post è
valido se ha **almeno uno** tra testo, foto o sondaggio. Sblocca il
caso "post sondaggio-only" (la `question` fa da contenuto).

**UI**

- `<Poll>` (`src/components/feed/Poll.tsx`) — barre proporzionali, %,
  tap per votare/cambiare. Accessibilità: `aria-pressed`, `aria-label`
  parlanti, `min-h-touch` (44px) per ogni opzione. Stato closed = barre
  visibili, tap disabilitato.
- Composer in `/feed` — toggle "📊 Aggiungi sondaggio" → form con domanda
  + 2-4 opzioni dinamiche, checkbox multi-choice, datetime-local opzionale
  per chiusura.
- Realtime su `post_poll_votes` (in `usePosts`) — quando un membro vota,
  le barre nel feed degli altri si aggiornano live senza refresh.

**Come testare**

1. Crea un post con solo sondaggio (text vuoto + toggle sondaggio
   attivo + domanda + 2 opzioni). Deve pubblicarsi.
2. Vota da un device, apri lo stesso feed in incognito con un altro
   membro: la barra si aggiorna live.
3. Cambia voto in single-choice → il vecchio voto sparisce dal count.
4. Crea un sondaggio multi-choice → puoi votare più opzioni dallo stesso
   membro.
5. Crea un sondaggio con `closes_at` 1 minuto nel futuro → dopo che è
   scaduto, tap sulle opzioni non fa nulla, endpoint torna 403.

---

## 2026-05-11 — Conferma attività aperta a tutti i membri

**Why**: il design originale ammetteva la conferma presenza solo per i
`participant_ids` pre-selezionati alla creazione dell'attività. In
famiglia funzionava solo per chi aveva creato l'attività (papà admin).
Decisione di prodotto: tutti i membri loggati possono confermare
qualsiasi attività.

**What to apply on production**

Nessuna migration SQL. Nessuna env var. Il deploy normale di Vercel
basta. `activity_participants` resta come metadata (chi riceve la
push), non più come gate d'accesso (vedi commit `c9d7694`).

**Side effect su dati esistenti**: le attività create finora con un
sottoinsieme di `participant_ids` continueranno a notificare solo quel
sottoinsieme. Se vuoi che tutti i membri ricevano la push di un'attività,
modifica l'attività e aggiungi tutti come participants. Nessun
backfill automatico — è una scelta esplicita per non spammare attività
private (es. "Karate Luca") inavvertitamente.

---

## 2026-05-11 — Catalog notifiche `lib/notification-events.ts`

**Why**: tutte le notifiche dell'app ora passano da un registry centrale
tipato. Riduce il rischio di "feature dimenticata" (è successo con la
chat) e standardizza title/body/link.

**What to apply on production**

Nessuna migration. Aggiunto solo `'new_activity'` all'enum
`Notification['type']` TS — la colonna DB è già `TEXT` senza CHECK.
Pattern documentato in HANDOFF.md sezione "Notifiche push".

---

## 2026-05-11 — Web Push notifications (PWA only)

**Why**: il backend per le notifiche push esisteva da tempo (libreria
`web-push`, tabella `push_subscriptions`, service worker handler) ma
mancava il "filo" client che chiedesse il permesso al browser e
registrasse la PushSubscription. Il toggle in Settings salvava solo
una preferenza nel DB → nessuna push veniva mai recapitata.

**What to apply on production**

Nessuna migration. Solo verificare che le tre env vars su Vercel
siano configurate. Quelle senza prefisso `NEXT_PUBLIC_` sono già
in uso dal codice server-side:

- `VAPID_PUBLIC_KEY` — base64-url, generata con
  `npx web-push generate-vapid-keys` (libreria già in package.json).
- `VAPID_PRIVATE_KEY` — base64-url, lo stesso comando.
- `VAPID_EMAIL` — mailto URL (es. `mailto:famiglia@example.com`).
  Richiesto dallo standard VAPID per identificare il sender.

Se le variabili non ci sono, `GET /api/push/public-key` torna 500 con
messaggio "Notifiche push non configurate sul server" e il toggle in
Settings mostra `toast.error` chiaro all'utente.

**iOS caveat (importante)**

Web Push su iPhone funziona **solo** se la PWA è stata aggiunta alla
schermata Home (iOS 16.4+). Da Safari browser normale non funziona —
è una limitazione Apple. L'hook `usePushSubscription` rileva questo
caso (`support === 'needs-pwa-install'`) e mostra all'utente le
istruzioni per installare la PWA prima di attivare il toggle.

Su Android Chrome funziona sia in browser che in PWA.

**Come testare**

1. Aprire la PWA (iOS: aggiunta alla Home; Android/desktop: anche browser).
2. Settings → toggle "Notifiche push" → tap → conferma il permesso del
   sistema.
3. Verifica nel DB Supabase: `select * from push_subscriptions where
   member_id = '<id>'` deve avere una riga.
4. Trigger reale: fai un'azione che genera notifica (commento sotto un
   post di un altro, like, attività confermata, ecc.) → il device deve
   ricevere la push.

---

## 2026-05-11 — Phase 5: front-end features (no DB)

**Why**: round of Instagram/WhatsApp-style polish on the existing app —
single-post page, image lightbox, click-user-anywhere-to-profile, enriched
profile with stats. Code-only, no schema changes.

**What to apply**

Nothing manual on the DB. `vercel deploy` is enough.

**What ships**

- Route `/feed/[id]` (new) — single-post permalink with comments + composer.
- `<ImageLightbox>` (new) — full-screen photo viewer with swipe / ESC /
  arrows, used by post cards.
- `<MemberLink>` (new) — click any avatar or member name → `/family/[id]`.
  Applied in feed, chat messages, activities roles/attendees.
- Enriched `/family/[id]` — 3-column Instagram-style post grid, member
  stats (post count + joined-since), tap-through to single post.

**Server-side additions**

- `GET /api/posts/:id` (new) — single post fetch used by `/feed/[id]`.
- `src/lib/posts.ts` (new) — `buildPostWithDetails` extracted, shared
  between list / single / create endpoints.

---

## 2026-05-11 — Service worker hardening for Safari/iOS

**Why**: a previous release pre-cached the auth-gated app shell
(`['/feed', '/activities', '/calendar', '/chat', '/tasks']`) in
`cache.addAll()` at install. Anonymous visitors hit the middleware's 302
redirect to `/login`, which `cache.addAll()` rejects per spec. Chromium
tolerated the resulting "redundant" SW state; **WebKit did not** — Safari
users got blue-screen pages and pending-forever fetches.

**What to apply**

Nothing manual on the DB. `vercel deploy` ships the fix in `public/sw.js`.

**Caveat for end users on broken Safari state**

The fix lands server-side automatically, but devices that already have a
corrupt v3/v4 SW need a one-time manual cleanup to drop it:

- **Safari (Mac)**: Settings → Privacy → Manage Website Data → find the
  domain → Remove.
- **Safari (iOS web)**: Settings → Safari → Advanced → Website Data →
  find the domain → swipe to remove.
- **PWA installed on iOS home screen**: long-press the icon → Remove App,
  then reinstall via Share → Add to Home Screen.

After the cleanup the SW installs cleanly. Future deploys are unaffected.

**Bumped `CACHE_NAME` to `la-famiglia-v5`** so clients still on a working
v4 also receive the new file.

---

## 2026-05-11 — Defensive RLS on every table

**Why**: until now the project had no RLS. The browser anon key — public by
definition — could read `sessions.token` and INSERT/UPDATE/DELETE on every
public table directly via the Supabase REST endpoint, bypassing the API
routes. Closing that door is overdue.

**What to apply**

```sh
supabase db push
```

This applies two files together (the second is the load-bearing one):

- `supabase/migrations/007_post_reactions.sql` — recovery of the
  `post_reactions` table that someone had created out-of-repo. Fully
  idempotent (`CREATE TABLE IF NOT EXISTS`, guarded `ALTER PUBLICATION`).
  If 007 is already marked applied on the remote, `db push` skips it.
- `supabase/migrations/008_rls_defensive.sql` — enables RLS on every
  public table. 11 realtime tables get a SELECT policy for `anon` and
  `authenticated` so `postgres_changes` keeps working. The other 14
  tables get RLS enabled with NO policies → default deny for non-privileged
  roles. `service_role` bypasses RLS by design, so the API routes are
  unaffected.

**What does NOT need to happen**

- No env var changes.
- No code changes outside `supabase/migrations/`.
- The browser realtime hooks (`useRealtimeSubscription`) keep functioning —
  they only need SELECT, which the realtime tables still permit.

**How to verify after applying**

```sh
npm run test:integration
```

Should report 7/7 GREEN. The same suite was 4/7 RED before the migration.

---

## 2026-05-11 — Post reactions (F3.2)

**Why**: three quick-reaction emoji (❤️ 😄 👏) under every post, with an
avatar stack of who reacted. Closes F3.2 in the handoff.

**What to apply**

The DB side was already in place (table `post_reactions` created out-of-repo
and recovered by `007_post_reactions.sql` above). The app side ships as code:

- `POST /api/posts/:id/reactions { emoji }` — 201 created or 200 idempotent
- `DELETE /api/posts/:id/reactions?emoji=…` — 200 `{ removed }`
- `<ReactionBar>` rendered in the feed PostCard
- Realtime subscription on `post_reactions` so other members see updates live

Nothing manual to do on the deploy beyond the standard `vercel deploy` —
the migration is applied with the RLS one above.

---

## 2026-05-10 — Activity weekly attendances (per-member)

**Why**: replace the global `activity_weekly_status` (one row per
activity+week) with per-member attendances so each family member can confirm
their own presence and see who else has confirmed.

**What to apply**

1. Run migration `supabase/migrations/006_activity_attendances.sql`:

   ```sh
   supabase db push
   ```

   Or paste it into the Supabase SQL editor.

2. The old table `activity_weekly_status` is **kept** (deprecated) — it is
   no longer read or written by the app. Drop it in a future cleanup if you
   want to reclaim the rows. No data loss either way.

3. Realtime: the migration adds `activity_weekly_attendances` to the
   `supabase_realtime` publication so the UI refreshes when someone confirms.

**What does NOT need to happen**

- No env var changes.
- No storage policy changes.
- No service worker re-registration (clients pick up the new build normally).

---

## 2026-05-10 — Schema indexes

**Why**: `001_initial.sql` shipped without indexes on foreign keys or
`created_at` ordering columns. Adds them everywhere queries actually filter
or order.

**What to apply**

```sh
supabase db push
```

Migration file: `supabase/migrations/005_indexes.sql`. Idempotent
(`CREATE INDEX IF NOT EXISTS`) — safe to re-run.

---

## 2026-05-10 — Bcrypt PIN migration (transparent)

**Why**: PIN hashes were SHA256 with a global salt. Replaced with bcrypt
(rounds=12, per-user salt).

**What to apply**

Nothing manual. Existing SHA256 hashes still verify via a fallback path; on
the next successful login each member's hash is silently re-hashed to bcrypt
and written back. Deploy the code and you're done.

If you ever want to force everyone off legacy hashes, run:

```sql
SELECT id, name FROM members WHERE pin_hash NOT LIKE '$2%';
```

to see who hasn't logged in yet.
