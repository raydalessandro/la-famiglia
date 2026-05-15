-- ═══ EVENT ATTENDANCE STATUS — Conferma/Salta/Modifica per evento ═══
-- Estende `event_participants` con il modello di risposta presenza che
-- oggi vive solo per le attività ricorrenti (`activity_weekly_attendances`,
-- migration 006). Driver: la pagina Attività diventa una vista
-- settimanale unificata di attività ricorrenti + eventi one-off; per
-- entrambi i tipi un membro deve poter dire "Confermo / Salto / Modifico"
-- e lasciare una nota.
--
-- ── Perché estendere event_participants invece di una tabella nuova ──
-- `event_participants` è già una row-per-member del giusto livello (UNIQUE
-- su (event_id, member_id)). Gli eventi sono one-off, non c'è un asse
-- "week_start" da introdurre — la sua semantica naturale è già "la
-- relazione fra un membro e un evento". Aggiungere stato/notes evita di
-- creare una `event_attendances` parallela che dovrebbe puntare a
-- `event_participants` con una FK ridondante.
--
-- ── Convivenza con le 11 righe esistenti ──
-- Le righe esistenti sono "roster" creati dal flusso di creazione evento
-- (POST /api/events accetta `participant_ids` e li inserisce qui). Dopo
-- questa migration esisteranno con `status = NULL`, semanticamente "il
-- membro è in qualche modo associato all'evento ma non ha ancora
-- risposto". Le risposte future (Conferma/Salta/Modifica) faranno UPSERT
-- aggiornando il `status`. Nessun backfill: trasformare "in roster"
-- automaticamente in "confermato" sarebbe inventare un consenso che
-- l'utente non ha mai dato.
--
-- ── CHECK su valori validi ──
-- `CHECK (status IN ('confirmed','skipped','modified'))` passa anche
-- quando `status IS NULL` perché in SQL il CHECK fallisce solo su FALSE,
-- non su NULL. Mantenuti gli stessi 3 valori di `activity_weekly_attendances`.
--
-- ── RLS + Realtime ──
-- `event_participants` finora non era in `supabase_realtime` e non aveva
-- policy: era in default-deny per anon (migration 008). Da ora il client
-- deve aggiornarsi quando un altro membro conferma — quindi RLS attiva
-- con `rls_defensive_select` (SELECT anon+authenticated) e aggiunta alla
-- publication. REPLICA IDENTITY FULL serve perché gli eventi realtime
-- portino il payload completo della riga, non solo la PK. Pattern
-- identico a `activity_weekly_attendances` / `post_polls`.
--
-- ── Index su (member_id) ──
-- Coerente con `idx_attendances_member` di 006. Query supportate:
-- "tutte le risposte di X agli eventi" (futuro feed personale "eventi
-- a cui vai questo mese"). L'index per (event_id, …) c'è già
-- implicitamente dalla constraint UNIQUE(event_id, member_id).
--
-- ── Note out-of-scope ──
-- La FK `event_participants.member_id` punta a `members(id)` SENZA
-- `ON DELETE CASCADE`, divergente da `activity_weekly_attendances` che
-- ha CASCADE. È un pre-esistente, NON viene corretto qui: cambiarlo
-- richiederebbe `DROP CONSTRAINT … ADD CONSTRAINT …` ed è fuori scope
-- per questa migration (che aggiunge solo lo status flow). Da fissare
-- in cleanup separato.
--
-- ── Idempotenza ──
-- ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS prima del CREATE POLICY. ALTER PUBLICATION
-- guardato da DO block su pg_publication_tables (stesso pattern di 009).

ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS status         TEXT,
  ADD COLUMN IF NOT EXISTS modified_notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();

-- CHECK su valori validi. Costruito a posteriori con DO block per
-- essere idempotente (ADD CONSTRAINT non supporta IF NOT EXISTS in
-- Postgres 17 in modo diretto sul singolo constraint).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_participants_status_check'
      AND conrelid = 'public.event_participants'::regclass
  ) THEN
    ALTER TABLE event_participants
      ADD CONSTRAINT event_participants_status_check
      CHECK (status IN ('confirmed','skipped','modified'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_participants_member_responses
  ON event_participants(member_id, status)
  WHERE status IS NOT NULL;

-- RLS difensive: la tabella entra in publication realtime, quindi serve
-- la policy SELECT per anon/authenticated (pattern di 008).
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_defensive_select" ON event_participants;
CREATE POLICY "rls_defensive_select" ON event_participants
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE event_participants REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'event_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_participants;
  END IF;
END $$;
