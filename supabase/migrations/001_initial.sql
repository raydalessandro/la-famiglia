-- ═══ UTENTI ═══

CREATE TABLE members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  avatar_emoji    TEXT,
  avatar_url      TEXT,
  family_role     TEXT NOT NULL,
  bio             TEXT DEFAULT '',
  pin_hash        TEXT NOT NULL,
  is_admin        BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  color           TEXT DEFAULT '#E8A838',
  notify_push     BOOLEAN DEFAULT true,
  notify_telegram BOOLEAN DEFAULT false,
  telegram_chat_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ AUTH ═══

CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID REFERENCES members(id),
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ FEED ═══

CREATE TABLE posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID REFERENCES members(id) NOT NULL,
  text            TEXT NOT NULL,
  post_type       TEXT DEFAULT 'normal',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE post_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE post_likes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, member_id)
);

CREATE TABLE post_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES members(id) NOT NULL,
  text            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ ATTIVITÀ RICORRENTI ═══

CREATE TABLE activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  icon            TEXT DEFAULT '📅',
  color           TEXT DEFAULT '#4FC3F7',
  day_of_week     INT NOT NULL,
  time            TEXT NOT NULL,
  location        TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES members(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE activity_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     UUID REFERENCES activities(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) NOT NULL,
  UNIQUE(activity_id, member_id)
);

CREATE TABLE activity_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     UUID REFERENCES activities(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) NOT NULL,
  role_label      TEXT NOT NULL,
  UNIQUE(activity_id, role_label)
);

CREATE TABLE activity_weekly_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     UUID REFERENCES activities(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  status          TEXT DEFAULT 'pending',
  confirmed_by    UUID REFERENCES members(id),
  modified_notes  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(activity_id, week_start)
);

-- ═══ CALENDARIO ═══

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  icon            TEXT DEFAULT '📅',
  color           TEXT DEFAULT '#E85D75',
  event_date      DATE NOT NULL,
  event_time      TEXT,
  location        TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_by      UUID REFERENCES members(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE event_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID REFERENCES events(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) NOT NULL,
  UNIQUE(event_id, member_id)
);

-- ═══ TASK ═══

CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  notes           TEXT DEFAULT '',
  is_completed    BOOLEAN DEFAULT false,
  completed_by    UUID REFERENCES members(id),
  completed_at    TIMESTAMPTZ,
  linked_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  linked_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES members(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE task_assignees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) NOT NULL,
  UNIQUE(task_id, member_id)
);

-- ═══ CHAT ═══

CREATE TABLE chat_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  is_direct       BOOLEAN DEFAULT false,
  icon            TEXT DEFAULT '👥',
  created_by      UUID REFERENCES members(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_group_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) NOT NULL,
  UNIQUE(group_id, member_id)
);

CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES members(id) NOT NULL,
  text            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_read_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) NOT NULL,
  last_read_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, member_id)
);

-- ═══ ALBUM ═══

CREATE TABLE albums (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  cover_image_url TEXT,
  created_by      UUID REFERENCES members(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE album_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id        UUID REFERENCES albums(id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  caption         TEXT DEFAULT '',
  uploaded_by     UUID REFERENCES members(id),
  post_id         UUID REFERENCES posts(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ NOTIFICHE ═══

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID REFERENCES members(id) NOT NULL,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT DEFAULT '',
  link            TEXT,
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,
  sent_push       BOOLEAN DEFAULT false,
  sent_telegram   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ PWA ═══

CREATE TABLE push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID REFERENCES members(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL,
  keys_p256dh     TEXT NOT NULL,
  keys_auth       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, endpoint)
);

-- ═══ SETUP ═══

CREATE TABLE app_config (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══ STORAGE BUCKETS ═══
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('posts', 'posts', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('albums', 'albums', true);
