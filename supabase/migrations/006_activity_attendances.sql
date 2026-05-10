-- ═══ ACTIVITY WEEKLY ATTENDANCES — per-member confirmation per week ═══
-- Replaces the global activity_weekly_status (which kept a single status per
-- activity+week) with one row per (activity, week, member). Each family
-- member confirms their own presence; the UI shows everyone who has confirmed.
--
-- The old activity_weekly_status table is intentionally LEFT IN PLACE so
-- nobody loses historical rows. The application no longer reads or writes
-- it. Drop it manually in a later cleanup if you want to reclaim space.

CREATE TABLE IF NOT EXISTS activity_weekly_attendances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     UUID REFERENCES activities(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  member_id       UUID REFERENCES members(id) ON DELETE CASCADE NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('confirmed', 'skipped', 'modified')),
  modified_notes  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, week_start, member_id)
);

CREATE INDEX IF NOT EXISTS idx_attendances_activity_week
  ON activity_weekly_attendances(activity_id, week_start);

CREATE INDEX IF NOT EXISTS idx_attendances_member
  ON activity_weekly_attendances(member_id);

-- Realtime: every member's UI must refresh when someone confirms / unconfirms.
ALTER TABLE activity_weekly_attendances REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_weekly_attendances;
