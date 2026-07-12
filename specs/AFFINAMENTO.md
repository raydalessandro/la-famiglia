# Piano di affinamento — La Famiglia

> Creato 2026-07-09 dall'analisi completa del codebase. Obiettivo:
> portare l'app da "funziona" a "sembra Instagram" — velocità percepita,
> robustezza, polish. Ogni task = branch + PR + test. Niente merge senza
> verifica su preview. Aggiorna lo stato qui quando chiudi un task.

## Diagnosi (perché è lenta)

Misurato/verificato sul codice il 2026-07-09:

1. **`GET /api/posts` fa ~72 query per caricamento** — `buildPostWithDetails`
   esegue 7 query per OGNI post (author, images, likes, comments count,
   reactions, poll, bookmark) × 10 post + count + data. Ogni round-trip
   Vercel↔Supabase costa; il feed impiega centinaia di ms lato server.
2. **Zero cache client** — ogni mount di pagina mostra skeleton e rifà
   il fetch da zero. Navigare feed → chat → feed ricarica tutto.
   `useMembers` viene rifetchato da ogni pagina che lo usa.
3. **AuthProvider blocca il primo render** — spinner globale finché
   `GET /api/auth` non risponde, POI parte il fetch dei dati della
   pagina. Due round-trip seriali prima di vedere contenuto.
4. **Realtime = full refetch** — ogni INSERT/UPDATE su posts/reactions/
   votes → `fetchPosts()` completo che RESETTA a pagina 1 (se avevi
   scrollato 5 pagine, il feed collassa a 10 post). `votePoll` fa
   refetch completo sia su successo che su errore.
5. **Il feed scarica le foto originali** — 1920px (~200KB–1MB l'una)
   anche per i thumbnail da 160px di altezza. 10 post × 4 foto = molti
   MB su mobile.

## Fase A — Velocità (priorità massima)

### A1 — Feed API: batching delle query ✅ scelto come primo task
**File**: `src/lib/posts.ts`, `src/app/api/posts/route.ts`
**Cosa**: nuova `buildPostsWithDetails(posts[], member)` che fa UNA query
per tabella con `.in('post_id', ids)`:
- `members` per gli author (`.in('id', authorIds)`)
- `post_images` (`.in('post_id', ids)`, order sort_order)
- `post_likes` (`.in('post_id', ids)`)
- `post_comments` count → una query `select post_id` + groupBy in JS
  (PostgREST non fa GROUP BY: contare in JS su select leggero)
- `post_reactions` con join members (`.in('post_id', ids)`)
- `post_polls` con options+votes (`.in('post_id', ids)`)
- `post_bookmarks` del solo viewer (`.in('post_id', ids).eq('member_id', me)`)
Poi assembla in memoria. `buildPostWithDetails` (singolo) resta come
wrapper che chiama la batch con array di 1.
**Target**: da ~72 a ~9 query per pagina di feed.
**Test**: aggiornare/estendere i test esistenti dei route posts; nuovo
test che verifica l'assemblaggio (likes/reazioni/poll attribuiti al post
giusto, liked_by_me/bookmarked_by_me corretti).
**Rischio**: shape della response INVARIATA (PostWithDetails identico) —
nessun cambio client.

### A2 — Cache client stale-while-revalidate
**File**: nuovo `src/lib/swr-cache.ts` + hook `useCachedFetch`, poi
adozione in `usePosts`, `useMembers`, `useChatGroups`, `useActivities`.
**Cosa**: store module-level (Map) + persistenza `localStorage` (scelto
al posto di sessionStorage in implementazione: sopravvive al cold start
della PWA — è lì che si gioca il "feel Instagram"). Al mount: se c'è
cache → render IMMEDIATO dei dati cached (niente skeleton), fetch in
background, aggiorna se cambiato. Niente TTL (deciso in implementazione):
la revalidation è sempre-on, a scala famiglia il costo è trascurabile.
**Sicurezza**: chiavi SEMPRE scoped per member id (liked_by_me & co.
dipendono dal viewer; device condivisi) — `cacheKey()` lo impone.
`clearSwrCache()` a ogni login/logout. Hook senza AuthProvider (test)
→ chiave null → cache disabilitata, comportamento storico.
**Regola UX**: skeleton SOLO al primissimo accesso (cache vuota).
Adottata anche in `useWeekEvents` (chiave per settimana, come
useActivities).
**Test**: unit sullo store (get/set/expire/revalidate), test hook con
fetch mockato (render da cache + update dopo revalidate).

### A3 — Immagini a due taglie (thumb + full)
**File**: `src/lib/storage.ts`, `src/app/api/posts/route.ts`,
`src/components/feed/PostCard.tsx`, migration `016_post_images_thumb.sql`
**Cosa**: all'upload il client genera DUE versioni (riusa compressImage:
thumb maxWidth 480 q0.7, full 1920 q0.8) e le manda entrambe nel
FormData (`images` + `thumbs` paralleli). Il server salva `{post_id}/{i}`
e `{post_id}/{i}_thumb`, colonna `thumb_url` su `post_images`
(nullable — i post vecchi non ce l'hanno).
**Client**: PostCard usa `thumb_url ?? image_url` nel feed; lightbox
usa sempre `image_url`.
**Test**: upload route (due file salvati, thumb_url popolato), PostCard
render (thumb nel feed, full nel lightbox), fallback per post legacy.

### A4 — Realtime chirurgico (niente full refetch)
**File**: `src/hooks/usePosts.ts`
**Cosa**: i canali realtime applicano patch incrementali allo state:
- `posts` INSERT → fetch del SOLO post nuovo (`GET /api/posts/[id]`) e
  prepend; DELETE → rimozione locale; UPDATE → fetch singolo e replace.
- `post_reactions` INSERT/DELETE → patch della lista reactions del post
  interessato (il payload realtime ha post_id e member_id).
- `post_poll_votes` → refetch del solo post interessato.
La pagination NON si resetta mai. `votePoll`/`retractPollVote` →
aggiornamento ottimistico + fetch singolo post, non fetchPosts.
**Test**: usePosts con eventi realtime simulati (prepend, patch,
pagination preservata).

### A5 — Auth istantanea
**File**: `src/hooks/useAuth.tsx`
**Cosa**: cache di `member` in `localStorage` (solo campi public).
Al mount: se presente → `isLoading=false` subito con il member cached,
`GET /api/auth` in background conferma/aggiorna/invalida (401 → logout
UI). Rimuove lo spinner globale a ogni apertura.
**Attenzione**: al logout pulire la cache. 401 dalla revalidation →
redirect login.
**Test**: render immediato da cache, invalidazione su 401, pulizia su
logout.

### A6 — Estendere la velocità alle altre tab (richiesto 2026-07-09)
Feedback utente dopo la Fase A: "ottima la velocità sul feed, stessa
cosa su attività, chat, commenti e tutte le altre tab".

Audit completato (2026-07-09). Sotto-task in ordine di impatto:

**A6.1 — server: GET /api/chat/groups** (~4 query PER gruppo: roster,
last message, read status, unread count → con 8 gruppi ~34 round-trip;
la tab più aperta dell'app). Batch: roster e read status con
`.in('group_id', ids)`; last-message + unread via query unica sui
messaggi dei gruppi con calcolo in JS (scala famiglia) — valutare RPC
`DISTINCT ON` + `COUNT FILTER` se il volume cresce.

**A6.2 — server: GET /api/events** (1 query per evento su
event_participants; il calendario mensile ne ha 20-40). Batch banale
`.in('event_id', ids)` — modello già in repo in activities/route.ts.

**A6.3 — server: GET /api/tasks** (2 query per task: assignees +
creator singolo). Batch assignees `.in('task_id', ids)` + una sola
lookup dei creator deduplicati.

**A6.4 — server: GET /api/albums** (1 count query per album). Una
`select('album_id').in(...)` + conteggio in JS, come comments_count
in buildPostsWithDetails.

**A6.5 — client: cache SWR sui rimanenti**: `useChat` messaggi (per
gruppo — aprire una chat parte sempre da skeleton), pagina
`/feed/[id]` (post + commenti), `useEvents`, `useTasks`, `useAlbums`,
`useNotifications`.

Già efficienti (non ritoccare): activities GET (batchato, modello di
riferimento), posts GET/bookmarked, comments GET (join embedded),
chat messages GET (join + batch parents), notifications, members,
birthdays, album photos.

## Fase B — Robustezza

### B0 — CI su GitHub Actions ✅
`.github/workflows/ci.yml`: lint + unit test + build su ogni PR verso
main e su ogni push a main. Da ora la regola "niente in produzione
senza test" è imposta dalla piattaforma, non dalla disciplina.

### B1 — Authorization test coverage (dal security audit 2026-05-11)
7 file elencati in HANDOFF § "Security audit follow-up":
chat_groups, chat_messages, posts (DELETE author/admin), post_comments,
post_like, notifications (self-scoping), members (self vs admin).
Nessun cambio di codice previsto — solo copertura; se un test scopre un
buco, fix nella stessa PR.

### B2 — Cleanup punti aperti audit Fase 1/2
- `post_likes` vs `post_reactions`: chiarire se legacy → migrare o
  documentare.
- `_postId` unused in ReactionBar.
- `member as MemberPublic` cast in feed/page.tsx → tipare `useAuth`.
- Test cleanup `rls_defensive.test.ts` → `afterAll()`.

### B3 — E2E smoke con member seedato
Login → feed → crea post → like → chat → invia messaggio. Playwright
già configurato, manca il seed. Gate in CI.

## Fase C — UX / Design polish

- C1: pull-to-refresh (HANDOFF 6.8) su feed/chat/attività.
- C2: long-press reactions Messenger-style (6.7).
- C3: composer migliorato (6.10) + blur-up placeholder foto.
- C4: transizioni di pagina (View Transitions API dove supportata),
  press-state sui bottoni, haptics-like feedback.

## Ordine consigliato

A1 → A2 → A3 (il grosso della velocità percepita) → A4 → A5 →
B1 → B2 → C. Ogni task una PR; preview Vercel per verifica; merge solo
dopo controllo su device reale (iPhone incluso).

## Stato

| Task | Stato | PR |
|------|-------|----|
| A1 | ✅ merged | #67 |
| A2 | ✅ merged | #68 |
| A3 | ✅ merged (migration 016 applicata al DB) | #69 |
| A4 | ✅ merged | #70 |
| A5 | ✅ merged | #71 |
| B0 (CI) | ✅ merged | #72 |
| B1 | ✅ merged | #73 |
| A6.1 (chat groups) | ✅ merged (RPC 017 applicata al DB) | #74 |
| A6.2 (events) | ✅ merged | #75 |
| A6.3 (tasks) | in PR | #76 |
| A6 | audit fatto, sotto-task A6.1–A6.5 da fare | — |
| B2–B3, C | da fare | — |
