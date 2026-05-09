-- ═══ REALTIME — enable postgres_changes for key tables ═══
-- Required for client-side useRealtimeSubscription to receive live updates.
-- REPLICA IDENTITY FULL ensures DELETE events include the old row data.

ALTER TABLE posts              REPLICA IDENTITY FULL;
ALTER TABLE activities         REPLICA IDENTITY FULL;
ALTER TABLE tasks              REPLICA IDENTITY FULL;
ALTER TABLE events             REPLICA IDENTITY FULL;
ALTER TABLE notifications      REPLICA IDENTITY FULL;
ALTER TABLE members            REPLICA IDENTITY FULL;
ALTER TABLE chat_messages      REPLICA IDENTITY FULL;
ALTER TABLE chat_groups        REPLICA IDENTITY FULL;
ALTER TABLE post_comments      REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE
  posts,
  activities,
  tasks,
  events,
  notifications,
  members,
  chat_messages,
  chat_groups,
  post_comments;
