-- ═══ CHAT GROUP SUMMARIES — RPC anti-N+1 (Affinamento A6.1) ═══
-- GET /api/chat/groups faceva ~4 query PER gruppo (roster, ultimo
-- messaggio, read status, unread count): con 8 gruppi ~34 round-trip
-- sulla tab più aperta dell'app. PostgREST non sa fare DISTINCT ON /
-- GROUP BY, quindi ultimo-messaggio + unread vivono qui, in UNA
-- funzione che il route chiama con la lista dei group id.
--
-- Semantica identica al vecchio codice route:
--   - last_message: il messaggio più recente del gruppo (qualunque autore)
--   - unread_count: messaggi dopo last_read_at del member, esclusi i suoi;
--     0 se il member non ha una riga di read status (JOIN la esclude)
-- CON UNA correzione deliberata: se l'ultimo messaggio è soft-deleted,
-- il testo esce già come tombstone '[Messaggio eliminato]'. Il vecchio
-- codice ritornava il testo ORIGINALE del messaggio eliminato nella
-- lista chat — in contraddizione col contratto della route messages
-- ("il testo originale non lascia mai il server").
--
-- STABLE: sola lettura. SET search_path esplicito per sicurezza.
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION chat_group_summaries(p_member_id UUID, p_group_ids UUID[])
RETURNS TABLE (group_id UUID, last_message JSONB, unread_count BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH last_msgs AS (
    SELECT DISTINCT ON (m.group_id)
      m.group_id,
      to_jsonb(m) ||
        CASE WHEN m.deleted_at IS NOT NULL
          THEN jsonb_build_object('text', '[Messaggio eliminato]')
          ELSE '{}'::jsonb
        END AS last_message
    FROM chat_messages m
    WHERE m.group_id = ANY(p_group_ids)
    ORDER BY m.group_id, m.created_at DESC
  ),
  unread AS (
    SELECT m.group_id, COUNT(*) AS unread_count
    FROM chat_messages m
    JOIN chat_read_status rs
      ON rs.group_id = m.group_id AND rs.member_id = p_member_id
    WHERE m.group_id = ANY(p_group_ids)
      AND m.created_at > rs.last_read_at
      AND m.author_id <> p_member_id
    GROUP BY m.group_id
  )
  SELECT
    g.gid AS group_id,
    lm.last_message,
    COALESCE(u.unread_count, 0) AS unread_count
  FROM unnest(p_group_ids) AS g(gid)
  LEFT JOIN last_msgs lm ON lm.group_id = g.gid
  LEFT JOIN unread u ON u.group_id = g.gid;
$$;
