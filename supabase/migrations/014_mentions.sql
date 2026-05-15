-- ═══ MENTIONS / @utente persistenti ═══
-- Quando un membro scrive `@nome` in un post, commento o messaggio
-- chat, il server estrae la mention e crea una riga qui — più una
-- push notification verso il `mentioned_id`. Lato render, le mention
-- diventano link cliccabili al profilo del membro.
--
-- ── Modello polimorfico ──
-- Una mention può vivere dentro post / comment / chat_message:
-- discriminator `source_type` ∈ {'post','comment','chat_message'} +
-- `source_id` UUID puntatore. NIENTE FK su `source_id` perché punta a
-- tabelle diverse a seconda di `source_type` — Postgres non supporta
-- polymorphic FK con una singola constraint. CHECK constraint sul
-- discriminator fa da gate validato a DB.
--
-- Conseguenza: cancellare un post/comment/chat_message lascia mention
-- orfane. Per il messaggio chat e` accettabile perché il modello
-- soft-delete (migration 011) mantiene la riga. Per post / comment,
-- la pulizia delle mention orfane spetta all'API DELETE — pattern
-- coerente con il resto del progetto, dove la business logic vive nel
-- service_role e non nei trigger.
--
-- ── Index ──
-- `(source_type, source_id)` per la query "tutte le mention dentro
-- questo post / commento / messaggio" (render lato server + cleanup
-- al DELETE di un source).
-- `(mentioned_id, created_at DESC)` per la query "tutte le mention che
-- riguardano me, dalla più recente" — futuro feed mentions / badge
-- nel menu profilo.
--
-- ── Author ──
-- `author_id` separato dal `members` table referenziato dal `source`:
-- ridondante ma evita join per la push notification ("Marco ti ha
-- menzionato in un post"). FK su members con CASCADE: se l'autore
-- viene rimosso dalla famiglia, le sue mention spariscono.
--
-- ── RLS + Realtime ──
-- Pattern coerente con migration 008 (`rls_defensive`) e 009 (post_polls):
-- RLS abilitata, una policy SELECT pubblica `rls_defensive_select` per
-- consentire a `anon`/`authenticated` di ricevere eventi
-- `postgres_changes` tramite la publication `supabase_realtime`. Niente
-- policy INSERT/UPDATE/DELETE: service_role bypassa tutto, gli scrittori
-- sono solo le API server-side.
--
-- REPLICA IDENTITY FULL serve perché i client che ascoltano gli eventi
-- realtime devono ricevere il payload completo della riga (mentioned_id,
-- author_id, ecc.) — senza FULL, gli UPDATE/DELETE event arrivano solo
-- con la PK. Per le mention ci aspettiamo solo INSERT, ma manteniamo la
-- convenzione del progetto.
--
-- ── Idempotenza ──
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS prima del CREATE POLICY. L'ALTER PUBLICATION
-- non è idempotente (raisa se la tabella è già membro), quindi guardia
-- con `pg_publication_tables` dentro un DO block (stesso pattern di 009).

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

DROP POLICY IF EXISTS "rls_defensive_select" ON mentions;
CREATE POLICY "rls_defensive_select" ON mentions
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE mentions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mentions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mentions;
  END IF;
END $$;
