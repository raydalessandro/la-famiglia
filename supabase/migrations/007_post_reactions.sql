-- ═══ POST REACTIONS — quick emoji reactions on bacheca posts ═══
-- Three predefined emoji (❤️ 😄 👏). One row per (post, member, emoji);
-- a member can leave multiple distinct emoji on the same post but cannot
-- duplicate the same emoji. Avatars of reactors are shown in the UI.
--
-- NB: This migration was originally applied to the remote DB outside the
-- repo (no file existed locally). This file is a recovery / re-import so
-- the repo and the remote stay in sync. Fully idempotent — re-running is
-- a no-op.

CREATE TABLE IF NOT EXISTS post_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  member_id   UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  emoji       TEXT NOT NULL CHECK (emoji IN ('❤️','😄','👏')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post
  ON post_reactions(post_id);

CREATE INDEX IF NOT EXISTS idx_post_reactions_member
  ON post_reactions(member_id);

-- Realtime: when someone reacts, every other family member's feed updates.
ALTER TABLE post_reactions REPLICA IDENTITY FULL;

-- Guarded add to the realtime publication: ALTER PUBLICATION ... ADD TABLE
-- is not idempotent and raises if the table is already a member, so we
-- check pg_publication_tables first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'post_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE post_reactions;
  END IF;
END $$;
