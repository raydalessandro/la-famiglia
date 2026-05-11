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

## Cosa resta da fare

### F3.2 — Post reactions (priorità: bassa, richiede Supabase)

3 emoji predefinite (❤️ 😄 👏) sotto ogni post, con stack avatar di chi ha reagito.

**Richiede migration DB**:
```sql
create table post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','😄','👏')),
  created_at timestamptz not null default now(),
  unique (post_id, member_id, emoji)
);
```
+ RLS policy: leggi se membro famiglia, scrivi solo own.
+ Endpoint API `/api/posts/[id]/react` (POST/DELETE).
+ UI: ReactionBar component sotto il body del post.

**Non procedere senza che l'utente abbia applicato la migration in Supabase.** Chiedi conferma.

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
