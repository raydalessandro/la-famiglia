-- ═══ POST POLLS — inline polls attached to a post ═══
-- Un post può avere zero o un sondaggio. Le opzioni sono righe separate
-- (pattern relazionale standard). Ogni voto è una riga in post_poll_votes.
--
-- Regole di voto:
--   • multi_choice = false (default) → un membro vota UNA opzione. Il
--     vincolo è applicato a livello applicativo (l'endpoint vote sostituisce
--     il voto precedente). La UNIQUE(poll_id, option_id, member_id) impedisce
--     comunque il doppio voto sulla stessa opzione.
--   • multi_choice = true → un membro può votare più opzioni distinte
--     dello stesso sondaggio.
--   • closes_at non-null e nel passato → l'endpoint vote restituisce 403
--     (gate applicativo). Le righe esistenti restano leggibili.
--
-- Idempotente: CREATE IF NOT EXISTS, DROP POLICY IF EXISTS, ADD TABLE
-- guardata da pg_publication_tables (ALTER PUBLICATION non è idempotente
-- e raisa se la table è già membro).

CREATE TABLE IF NOT EXISTS post_polls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL UNIQUE,
  question     TEXT NOT NULL,
  multi_choice BOOLEAN NOT NULL DEFAULT false,
  closes_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_poll_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      UUID REFERENCES post_polls(id) ON DELETE CASCADE NOT NULL,
  label        TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_poll_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      UUID REFERENCES post_polls(id) ON DELETE CASCADE NOT NULL,
  option_id    UUID REFERENCES post_poll_options(id) ON DELETE CASCADE NOT NULL,
  member_id    UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, option_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_post_poll_options_poll
  ON post_poll_options(poll_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_post_poll_votes_poll
  ON post_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_post_poll_votes_member
  ON post_poll_votes(member_id);

-- RLS difensive: anon legge (necessario per Realtime postgres_changes),
-- service_role bypassa per le mutazioni via API.
ALTER TABLE post_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_defensive_select" ON post_polls;
DROP POLICY IF EXISTS "rls_defensive_select" ON post_poll_options;
DROP POLICY IF EXISTS "rls_defensive_select" ON post_poll_votes;

CREATE POLICY "rls_defensive_select" ON post_polls
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "rls_defensive_select" ON post_poll_options
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "rls_defensive_select" ON post_poll_votes
  FOR SELECT TO anon, authenticated USING (true);

-- Realtime: quando un membro vota, le barre si aggiornano nel feed
-- degli altri membri senza refresh.
ALTER TABLE post_polls REPLICA IDENTITY FULL;
ALTER TABLE post_poll_options REPLICA IDENTITY FULL;
ALTER TABLE post_poll_votes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_polls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_polls;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_poll_options'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_poll_options;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_poll_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_poll_votes;
  END IF;
END $$;
