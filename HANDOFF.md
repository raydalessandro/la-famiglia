# HANDOFF — La Famiglia (per Claude Code)

> File temporaneo di passaggio di consegne. Da eliminare quando il lavoro qui descritto è completato.

## Cosa è il progetto

`la-famiglia` è una PWA Next.js + Supabase per una famiglia italiana di 4-6 persone. Pubblico primario: **nonni 65-75 anni**. UI in italiano, niente onboarding, niente concetti tecnici esposti.

Le aree principali:
- **Bacheca** (feed) — post (foto, ricette, storie, audio)
- **Attività** — eventi ricorrenti settimanali (es. "Pranzo domenicale" ogni sabato), con presenze
- **Agenda** (calendar) — eventi one-shot
- **Compiti** (tasks) — to-do con assegnatari
- **Chat** — dirette + di gruppo
- **Famiglia** — profili membri
- **Album** — gallerie foto

## Branch su cui lavorare

```
claude/fix-hydration-issues-Cp0Eu
```

**NON pushare su altri branch.** Il branch nasce da un bug fix ma è diventato l'integration branch del refactor UI.

## Stato attuale (verificato dall'utente l'11/05/2026)

- App testata su **Chrome, Safari, Samsung Internet**: funziona.
- Tutte le pagine fanno il giusto su mobile (375-414px viewport).
- **Bug noto**: la pagina **Attività** è vuota anche se in `calendar` ci sono eventi di tipo activity. Vedi sezione "Bug pagina Attività" più sotto.

## Convenzioni — leggi PRIMA di scrivere codice

### Audience
Stai scrivendo per nonni di 70 anni. Tutto il copy in italiano. Mai jargon tecnico ("API", "errore 500", "carica in corso"). Frasi corte e inviti all'azione, non descrizioni di stato.

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

- **`<Button>`** — `variant: primary | ghost | destructive`, `size: sm | md`, supporta `loading`. Sostituisce tutti i `<button className="bg-[#E8A838]...">` inline.
- **`<EmptyState>`** — icon + title + description + action. Una sola shape per tutti gli empty.
- **`<Toast>` + `useToast()`** — per feedback async (success, error, info). Sostituisce gli errori inline rossi.
- **`<Skeleton>`** + preset `RowSkeleton` / `PostCardSkeleton` / `AlbumCardSkeleton` — per i loading state. Mai spinner.
- **`<Avatar>`** — passare `ringed` quando il colore-membro è informativo (chat, feed header, admin).
- **`<MiniAvatarStack>`** — stack avatar sovrapposti per assignees/partecipanti.
- **`<BottomSheet>`** — modale dal basso.
- **`<ParticipantPicker>`** — picker membri famiglia.
- **`<Header>`** — header sticky standard, già `z-30 + backdrop-blur`.

### Pattern "colour-per-member" (à la Cozi)

Ogni membro ha un `color` nel DB (`members.color`). USALO ovunque il membro appaia:
- Avatar `ringed`
- Stripe colorata sinistra delle card che gli appartengono (task assignee, post author, event)
- Nome autore nel suo colore (chat bubbles)

### Card pattern unificato

Tutte le card primarie:
```tsx
className="bg-surface-raised rounded-card border border-white/5"
```
+ stripe colorata se appartengono a un membro:
```tsx
style={{ borderLeft: `3px solid ${color}` }}
```

Eccezione: sezioni interne di settings/admin restano `bg-white/5` (sono group di campi, non card).

### Chat bubbles

Vedi `src/app/(main)/chat/[id]/page.tsx`. Le regole:
- Raggruppamento per autore + finestra **5 minuti**.
- Avatar mostrato solo sul **primo** bubble del cluster (incoming).
- Nome autore solo sul primo bubble del cluster, **nel colore del membro**.
- Timestamp solo sull'**ultimo** bubble del cluster.
- Radius `rounded-bubble` pieno, con angolo `rounded-br-md` (outgoing) / `rounded-bl-md` (incoming) **solo** sull'ultimo bubble del cluster.

### Supabase / database

- Le migrations sono in `supabase/migrations/00X_*.sql`. Applicale via `supabase db push` (CLI linkata al progetto remoto) oppure incollandole nella dashboard SQL editor.
- **RLS difensive attive dal 2026-05-11** (`008_rls_defensive.sql`):
  - L'autenticazione resta custom (PIN + tabella `sessions`, non Supabase Auth) → `auth.uid()` non esiste.
  - Tutte le API routes usano `createServerClient()` con `SUPABASE_SERVICE_ROLE_KEY`, che bypassa RLS by design. Per ogni endpoint **deve esserci `requireAuth()` o `requireAdmin()`** — l'autorizzazione vive lì.
  - Per il client browser anon: SELECT consentito sulle 11 tabelle realtime (necessario per `postgres_changes`), tutto il resto negato. Le mutazioni dirette dal client sono bloccate ovunque.
  - Se aggiungi una tabella nuova: includi nella nuova migration `ENABLE ROW LEVEL SECURITY`. Se la tabella va anche in realtime, aggiungi `CREATE POLICY "rls_defensive_select" ON x FOR SELECT TO anon, authenticated USING (true)`.
- Realtime è opt-in: per ogni tabella che il client osserva via `subscribe()`, la migration deve fare `ALTER TABLE x REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE x` (vedi `002_realtime.sql`).
- Tutte le FK verso `members`/`posts`/`activities` usano `ON DELETE CASCADE`.

### Toast

```tsx
import { useToast } from '@/components/ui'
const toast = useToast()
toast.error('Non riesco a salvare. Riprova.')
toast.success('Salvato.')
```

Tutti i provider sono in `src/app/layout.tsx` o `(main)/layout.tsx` — già montati.

## Bug pagina Attività (da risolvere insieme all'utente)

**Sintomo**: `/activities` mostra empty state anche se sul calendario ci sono eventi.

**Probabile causa** (da verificare con Supabase aperto):
1. Migration `006_activity_attendances.sql` non applicata in produzione → la query JOIN su `activity_attendances` fallisce silente.
2. Schema `calendar_events` ha campo `type` o simile che distingue activity da event one-shot, e la query di `/activities` filtra male.
3. RLS policy che taglia fuori l'utente loggato.

**L'utente ha esplicitamente detto di NON toccare attività ora** — dice che "la faremo modulare a parte, è più complessa". Quando ci sederete insieme:
- Prima diagnostica SQL (verificare migration, schema, RLS).
- Poi refactor UI completo (Button, EmptyState, body 17px, stripe colorata membro, card unificata).
- Probabile redesign: distinzione visuale tra "activity ricorrente" (badge ricorrenza) e "evento" (data singola).

**Per ora non fare niente sulla pagina attività finché l'utente non te lo chiede esplicitamente.**

## Cosa è stato fatto (commits sul branch)

| Sha | Tema |
|---|---|
| `edfb33c` | Design tokens Tailwind |
| `3cb3319` | Primitives: Button, Toast, Skeleton |
| `93dd8d4` | Sostituzioni Button/Toast/Skeleton in 9 pagine |
| `ac91586` | Body 17px, touch 44px, BottomNav etichette IT, header z-30 |
| `bd2effe` | Avatar ring colore-membro, chat WhatsApp con cluster, stripe per autore, card unificate |
| `e03a901` | EmptyState component + 7 sostituzioni |
| `df81f50` | Fase 1 — RLS difensive (008) + recovery file 007 + integration test suite |
| `f86fc15` | Fase 2 (F3.2) — Post reactions: API + tipi + componente + integrazione feed |
| `299e42e` | tsc clean (target ES2017, fix test-time type errors preesistenti) |

## Cosa resta da fare

### F3.2 — Post reactions ✅ DONE (commit `f86fc15`, 2026-05-11)

Implementato. La tabella `post_reactions` era già stata applicata in
produzione fuori repo; recuperato il file `007_post_reactions.sql`
idempotente nel commit `df81f50`. API route `POST/DELETE
/api/posts/[id]/reactions`, componente `<ReactionBar>` integrato nel feed,
subscription realtime su `post_reactions`.

**Convenzioni migrations** (template `006_activity_attendances.sql`):

1. **RLS attive (`008_rls_defensive.sql`).** Per ogni nuova tabella:
   - Includi `ENABLE ROW LEVEL SECURITY`.
   - Se la tabella va anche in realtime, aggiungi una policy SELECT per
     `anon, authenticated`.
   - NON serve creare policy INSERT/UPDATE/DELETE: senza policy, anon è
     in default-deny e service_role bypassa comunque.
2. **PK come UUID** con `gen_random_uuid()`.
3. **FK con `ON DELETE CASCADE`** verso `posts` / `members`.
4. **`CREATE TABLE IF NOT EXISTS`** + **`CREATE INDEX IF NOT EXISTS`** —
   le migrations devono essere idempotenti.
5. **Realtime opt-in** per le tabelle che il client osserva via subscription:
   `ALTER TABLE x REPLICA IDENTITY FULL;` + `ALTER PUBLICATION supabase_realtime ADD TABLE x;`.
   (Vedi `002_realtime.sql` per la lista completa delle tabelle realtime.)
6. **Naming**: `007_*.sql` per il prossimo file. Numerazione sequenziale.

**Migration di riferimento** (vedi `supabase/migrations/007_post_reactions.sql` nel repo):

```sql
-- ═══ POST REACTIONS — quick emoji reactions on bacheca posts ═══
-- Three predefined emoji (❤️ 😄 👏). One row per (post, member, emoji);
-- a member can leave multiple distinct emoji on the same post but cannot
-- duplicate the same emoji. Avatars of reactors are shown in the UI.

CREATE TABLE IF NOT EXISTS post_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  member_id   UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  emoji       TEXT NOT NULL CHECK (emoji IN ('❤️','😄','👏')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post
  ON post_reactions(post_id);

CREATE INDEX IF NOT EXISTS idx_post_reactions_member
  ON post_reactions(member_id);

-- Realtime: when someone reacts, every other family member's feed updates.
ALTER TABLE post_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE post_reactions;
```

Quanto realizzato sopra alla migration:
- API route `src/app/api/posts/[id]/reactions/route.ts` (POST `{ emoji }`,
  DELETE `?emoji=…`, idempotenti, notifica post author se reactor diverso).
- Tipi `PostReaction`, `PostReactionWithMember`, `REACTION_EMOJIS` in
  `src/types/database.ts`.
- Componente `src/components/ui/ReactionBar.tsx` (aria-pressed +
  aria-label con nomi reactor per accessibilità).
- Subscription realtime su `post_reactions` in `usePosts`.
- Test: `specs/tests/post_reactions.test.ts` (13), `ReactionBar.test.tsx`
  (5), `e2e/reactions.spec.ts` (2 auth-wall smoke).

### Security audit follow-up (priorità: medio-bassa)

Audit del 2026-05-11 sulle 24 API routes (post-RLS difensive). Risultato:
**tutti gli endpoint** chiamano `requireAuth()` o `requireAdmin()`, oppure
sono intenzionalmente pubblici e giustificati (`/api/auth` POST/DELETE,
`/api/auth/members` GET, `/api/setup` GET/POST). Nessuna route che parla
al DB con `createServerClient()` senza prima validare la sessione.

**Cosa manca**: copertura test. Esistono `*_authorization.test.ts` solo
per `albums`, `events`, `tasks`, `activities`. Da aggiungere (per parità
di coverage e per evitare regressioni future):

- `chat_groups_authorization.test.ts` — verifica scoping per membership
- `chat_messages_authorization.test.ts` — idem
- `posts_authorization.test.ts` — author/admin checks su DELETE
- `post_comments_authorization.test.ts` — auth wall
- `post_like_authorization.test.ts` — auth wall
- `notifications_authorization.test.ts` — self-scoping
- `members_authorization.test.ts` — self-update vs admin
- `reactions` è già coperto da `post_reactions.test.ts` (auth wall +
  edge cases)

Non è urgenza di sicurezza, solo copertura.

### Attività page (priorità: dopo che l'utente apre Supabase con te)

Vedi "Bug pagina Attività" sopra. Tutto da progettare insieme.

### Altre cose minori che potresti notare

- Activity card in `/activities` non è stata refactorizzata (su decisione utente — non toccare finché non si lavora sulla pagina intera).
- Settings/admin sections sono ancora `bg-white/5 rounded-2xl` (volutamente — non sono card).
- I form di create (post, task, album, event) non sono stati toccati: copy, label, validation messages potrebbero meritare un giro quando si arriva a F4.

## Workflow

1. Leggi questo file.
2. Chiedi all'utente cosa vuole fare oggi (è la persona giusta a cui chiedere — è il product owner).
3. Sviluppa sul branch `claude/fix-hydration-issues-Cp0Eu`.
4. Commit con messaggi descrittivi (vedi commits esistenti per il tono).
5. Push frequente.
6. Quando il lavoro qui descritto è finito (F3.2 + Activities page), elimina questo file.

## Note di tono per l'utente

- Parla italiano.
- È un product designer / founder, non un ingegnere senior — spiegagli le scelte tecniche solo quando hanno impatto sul prodotto.
- Apprezza commit messages dettagliati ("perché", non "cosa").
- Detesta over-engineering e abstractions premature.
- Conosce bene il pubblico (i suoi nonni / genitori) — fidati del suo giudizio sul copy.
