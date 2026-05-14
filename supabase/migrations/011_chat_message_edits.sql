-- ═══ CHAT MESSAGE EDITS / SOFT DELETES ═══
-- Permette di modificare un messaggio (entro una finestra di 2 minuti,
-- gate applicativo) e di eliminarlo via soft-delete tombstone.
--
-- edited_at NULL = mai modificato. Quando l'utente modifica il testo via
-- PATCH, il server setta edited_at = now() e aggiorna il testo. La UI
-- mostra un badge "Modificato" sotto il timestamp se non-NULL.
--
-- deleted_at NULL = non eliminato. Quando l'utente elimina via DELETE,
-- il server setta deleted_at = now() (NON cancella la riga) e l'API GET
-- sostituisce `text` con "[Messaggio eliminato]" prima di rispondere —
-- così il client non leak mai il testo originale anche se manipola la
-- response. La riga resta perché potrebbe avere altri messaggi che la
-- citano via `reply_to_message_id` (vedi 010): cancellarla hard
-- propagherebbe ON DELETE SET NULL e farebbe perdere il contesto della
-- reply.
--
-- Index parziale `WHERE deleted_at IS NULL`: la query principale
-- `GET messages` non filtra esplicitamente, ma altre query che vogliono
-- solo i messaggi "vivi" (count unread, last_message in sidebar)
-- beneficiano di un index che salta i tombstone.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_messages_active
  ON chat_messages(group_id, created_at)
  WHERE deleted_at IS NULL;

-- Niente RLS / realtime da toccare per gli stessi motivi di 010.
