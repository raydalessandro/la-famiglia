-- ═══ POST BOOKMARKS / SALVA POST ═══
-- Permette a un membro di salvare un post per rileggerlo dalla pagina
-- dedicata /saved. Driver: la nonna salva spesso ricette nei post e
-- oggi deve scorrere indietro nel feed per recuperarle.
--
-- Modello: tabella di join (post, member) con UNIQUE su (post_id,
-- member_id) → toggle idempotente lato API (INSERT ... ON CONFLICT
-- DO NOTHING per save; DELETE per unsave; la presenza/assenza del
-- record è la verità).
--
-- Privacy: i bookmark di un utente sono **privati**. RLS attiva senza
-- alcuna policy SELECT pubblica → anon/authenticated leggono zero
-- righe. Il service_role bypassa RLS, quindi tutta la lettura passa
-- per le API server-side (`GET /api/posts/bookmarked`) che filtrano
-- per il `member_id` dell'utente autenticato. Coerente con il pattern
-- difensivo della migration 008.
--
-- Realtime non necessaria: l'azione (salva/rimuovi) è dell'utente
-- stesso sul suo device, non c'è uno scenario in cui un altro client
-- deve vedere il cambiamento in tempo reale.
--
-- Index `(member_id, created_at DESC)`: la query principale è
-- "i post salvati da X, dal più recente al più vecchio" — l'index
-- copre direttamente sia il filter sia l'ordering.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

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
-- Niente policy SELECT pubblica: i bookmark sono privati. Le letture
-- passano dal service_role via API, che filtra per utente autenticato.
