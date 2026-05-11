-- ═══ RLS DEFENSIVE — block direct DB writes / sensitive reads from anon ═══
-- Background: the project uses custom auth (PIN + sessions table, not
-- Supabase Auth). All API routes go through the service_role key, which
-- bypasses RLS. The browser uses the anon key only for Realtime
-- subscriptions via supabase.channel().on('postgres_changes').
--
-- Until now no RLS was in place, so anyone holding the (public) anon key
-- could SELECT sessions tokens and INSERT/UPDATE/DELETE freely on every
-- table directly via the REST endpoint. This migration closes that hole.
--
-- Strategy:
--   • Realtime tables (the 11 tables in supabase_realtime publication):
--     enable RLS, add one SELECT-only policy for anon/authenticated so
--     postgres_changes keeps delivering events.
--   • All other public tables: enable RLS with NO policies → default deny
--     for anon/authenticated. service_role bypasses RLS, so server-side
--     API routes are unaffected.
--   • For every table no INSERT/UPDATE/DELETE policy exists, so writes
--     are denied by default for non-privileged roles.
--
-- Idempotent: DO blocks wrap ALTER TABLE / CREATE POLICY with DROP-if-exists.

-- ─── 11 realtime tables: SELECT allowed, writes denied by default ───
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'members',
    'posts',
    'post_comments',
    'post_reactions',
    'activities',
    'activity_weekly_attendances',
    'events',
    'tasks',
    'chat_groups',
    'chat_messages',
    'notifications'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "rls_defensive_select" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "rls_defensive_select" ON public.%I '
      || 'FOR SELECT TO anon, authenticated USING (true)',
      t
    );
  END LOOP;
END $$;

-- ─── 14 non-realtime public tables: RLS on, no policies → full deny for anon ───
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'sessions',
    'activity_participants',
    'activity_roles',
    'activity_weekly_status',
    'albums',
    'album_photos',
    'app_config',
    'chat_group_members',
    'chat_read_status',
    'event_participants',
    'post_images',
    'post_likes',
    'push_subscriptions',
    'task_assignees'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
