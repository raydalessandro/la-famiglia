-- ═══ CHAT MESSAGE REPLIES — quote a previous message ═══
-- Un messaggio può citare un altro messaggio dello stesso gruppo (pattern
-- WhatsApp "Rispondi"). La citazione mostra autore + testo del messaggio
-- originale nell'embed sopra il nuovo bubble.
--
-- ON DELETE SET NULL: se il messaggio citato viene soft-deleted (vedi
-- migration 011) o hard-deleted, la reply rimane visibile. La UI lato
-- client (e l'API GET) mostrano "Messaggio eliminato" nella citation se
-- `reply_to_message_id` non-NULL ma il join sul self non torna nulla o
-- ha `deleted_at` non-NULL.
--
-- Index parziale: filtriamo `WHERE reply_to_message_id IS NOT NULL` per
-- evitare di indicizzare la maggioranza di messaggi (che non sono reply).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON chat_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- Niente nuove tabelle => niente RLS policies da aggiungere (le policy su
-- chat_messages sono già definite in 008_rls_defensive.sql e coprono la
-- colonna nuova by row).
--
-- Niente realtime opt-in da fare: chat_messages è già nella publication
-- supabase_realtime (vedi 002_realtime.sql) e REPLICA IDENTITY FULL
-- propaga automaticamente la nuova colonna nei payload UPDATE/INSERT.
