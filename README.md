# La Famiglia

PWA Next.js + Supabase per una famiglia italiana di 4-6 persone. Pensata
per essere usata dai nonni: italiano, niente onboarding, niente jargon
tecnico, target di tap minimo 44px, body 17px.

## Aree dell'app

- **Bacheca** (`/feed`) — post (foto, ricette, storie), like, reazioni
  (❤️ 😄 👏), commenti, sondaggi, bookmark privato, lightbox foto,
  pagina post singolo `/feed/[id]`, banner compleanno.
- **Salvati** (`/saved`) — lista dei post che hai bookmark-ato.
- **Attività** (`/activities`) — eventi ricorrenti settimanali con
  presenze per membro. In evoluzione verso vista settimanale unificata
  che include anche gli eventi one-shot.
- **Agenda** (`/calendar`) — eventi one-shot.
- **Compiti** (`/tasks`) — to-do con assegnatari.
- **Chat** (`/chat`, `/chat/[id]`) — dirette + gruppi, cluster WhatsApp,
  reply citation, edit/elimina entro 2 minuti, mention `@utente`.
- **Famiglia** (`/family`, `/family/[id]`) — lista membri + profilo
  arricchito (compleanno, stat, griglia post).
- **Album** (`/albums`, `/albums/[id]`) — gallerie foto.
- **Notifiche** — push (Web Push + VAPID, PWA-only su iOS) + Telegram
  opzionali. Pattern centrale in `src/lib/notification-events.ts`
  (registry tipato di eventi). Cron giornaliero per compleanni
  (`vercel.json`, env `CRON_SECRET`).

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + design tokens custom
- Supabase Postgres + Realtime + Storage
- PWA con service worker custom (no library)
- Auth custom: PIN + bcrypt + tabella `sessions` (no Supabase Auth)
- Test: Vitest (unit + integration) + Playwright (e2e)

## Prima volta sul progetto?

**Leggi `HANDOFF.md`.** È il documento vivo che spiega convenzioni,
componenti UI condivisi, design tokens, pattern colour-per-member, e
soprattutto **cosa è da fare** (sezione "Fase 6"). Non scrivere codice
senza averlo letto.

## Sviluppo locale

```sh
npm install
npm run dev
# http://localhost:3000
```

Variabili d'ambiente richieste in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Per le notifiche push (PWA, iOS PWA-only ≥16.4) servono anche le 3
VAPID env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`.
Generale con `npx web-push generate-vapid-keys`. Il pattern di
notifica vive in `src/lib/notification-events.ts` (catalog) +
`src/lib/notifications.ts` (primitive web-push + Telegram).

## Comandi

```sh
npm run dev               # dev server
npm run build             # production build
npm run lint              # eslint
npm run test              # vitest unit
npm run test:integration  # vitest integration (richiede Supabase live)
npm run e2e               # Playwright
```

## Database

Le migrations stanno in `supabase/migrations/00X_*.sql`. Per applicarle:

```sh
supabase db push
```

(richiede Supabase CLI linkata al progetto remoto), oppure incolla il
file SQL nel SQL editor della dashboard.

Le migration sono **idempotenti** (`CREATE TABLE IF NOT EXISTS`, ecc.).
Vedi `HANDOFF.md` → "Pattern per nuove migrations" prima di aggiungere
una migration nuova.

**RLS difensive attive** (dal `008_rls_defensive.sql`): il client browser
con anon key può solo leggere le tabelle realtime, niente scritture
dirette. Tutte le mutazioni passano dalle API routes
(`src/app/api/.../route.ts`) che usano `service_role` + `requireAuth()`.

## Deploy

Deploy automatico su Vercel via push su `main`. Le PR vengono mergiate su
`main` automaticamente dal workflow del repo.

**Operazioni manuali** (DB migrations, env vars, cleanup utenti): vedi
`PRODUCTION_CHANGELOG.md`. Ogni release che richiede ops manuale ha
un'entry datata lì.

## Branch policy

- `main` — produzione. Push automatico = deploy su Vercel.
- `claude/fix-hydration-issues-Cp0Eu` — integration branch per il
  lavoro in corso. Le PR partono da qui.
- Niente altri branch a lungo termine. Tutto si fonde via PR.

## Per chi sta scrivendo codice

1. **Leggi `HANDOFF.md`** — convenzioni, componenti, pattern.
2. Lavora sul branch indicato dall'utente (di default
   `claude/fix-hydration-issues-Cp0Eu`).
3. Commit atomici con messaggio in italiano, focus sul "perché".
4. UI in italiano, copy adatto a nonni di 70 anni.
5. Mai colori hard-coded — usa i token Tailwind.
6. Usa i componenti UI esistenti (`src/components/ui/`), non
   reinventare.
7. Per ogni nuova migration → entry in `PRODUCTION_CHANGELOG.md`.
8. Update `HANDOFF.md` quando chiudi una fase o sblocchi un follow-up.

## Per chi sta usando Claude Code

Quando apri una sessione, il modello inizia da zero. **Fai sempre leggere
`HANDOFF.md`** come primo step:

> "Leggi `HANDOFF.md` e dimmi cosa è prioritario da fare adesso."

Il documento contiene il roster delle feature in pancia (Fase 6) con SQL
pronto, API da aggiungere, UI da costruire e stima impatto. Una per
sessione, modulari.
