-- ═══ CHAT MEDIA — add message_type and media_url to chat_messages ═══
-- Enables sending images and documents in chat groups.
-- text becomes optional (empty string for media-only messages).

ALTER TABLE chat_messages
  ALTER COLUMN text SET DEFAULT '',
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN media_url    TEXT;
