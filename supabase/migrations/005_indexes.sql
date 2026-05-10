-- ═══ INDEXES — frequently-queried foreign keys + ordering columns ═══
-- All API queries filter/order by these columns. Indexes are idempotent
-- (CREATE INDEX IF NOT EXISTS) so re-running the migration is safe.

-- Sessions (validateSession queries by token + member_id)
CREATE INDEX IF NOT EXISTS idx_sessions_token       ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_member_id   ON sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at  ON sessions(expires_at);

-- Posts (feed loads ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS idx_posts_author_id      ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at     ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_images_post_id  ON post_images(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id   ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_member_id ON post_likes(member_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id    ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(created_at DESC);

-- Activities + weekly status
CREATE INDEX IF NOT EXISTS idx_activity_participants_activity_id ON activity_participants(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_participants_member_id   ON activity_participants(member_id);
CREATE INDEX IF NOT EXISTS idx_activity_roles_activity_id        ON activity_roles(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_weekly_status_activity_id ON activity_weekly_status(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_weekly_status_week_start  ON activity_weekly_status(week_start);

-- Events
CREATE INDEX IF NOT EXISTS idx_events_event_date           ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_member_id ON event_participants(member_id);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_is_completed     ON tasks(is_completed);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at       ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_member_id ON task_assignees(member_id);

-- Chat
CREATE INDEX IF NOT EXISTS idx_chat_group_members_group_id  ON chat_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_members_member_id ON chat_group_members(member_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id       ON chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at     ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_read_status_group_id    ON chat_read_status(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_read_status_member_id   ON chat_read_status(member_id);

-- Albums
CREATE INDEX IF NOT EXISTS idx_albums_created_at         ON albums(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_album_photos_album_id     ON album_photos(album_id);
CREATE INDEX IF NOT EXISTS idx_album_photos_post_id      ON album_photos(post_id);
CREATE INDEX IF NOT EXISTS idx_album_photos_created_at   ON album_photos(created_at DESC);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_member_id  ON notifications(member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Push subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member_id ON push_subscriptions(member_id);
