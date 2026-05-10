# Production changelog

Things that need to happen on the live deployment when a release lands. This
file is the source of truth for **manual ops** (DB migrations, env vars,
storage policies, etc.) — the kind of work `vercel deploy` won't do for you.

Format: newest first. Each entry says what to run and where.

---

## 2026-05-10 — Activity weekly attendances (per-member)

**Why**: replace the global `activity_weekly_status` (one row per
activity+week) with per-member attendances so each family member can confirm
their own presence and see who else has confirmed.

**What to apply**

1. Run migration `supabase/migrations/006_activity_attendances.sql`:

   ```sh
   supabase db push
   ```

   Or paste it into the Supabase SQL editor.

2. The old table `activity_weekly_status` is **kept** (deprecated) — it is
   no longer read or written by the app. Drop it in a future cleanup if you
   want to reclaim the rows. No data loss either way.

3. Realtime: the migration adds `activity_weekly_attendances` to the
   `supabase_realtime` publication so the UI refreshes when someone confirms.

**What does NOT need to happen**

- No env var changes.
- No storage policy changes.
- No service worker re-registration (clients pick up the new build normally).

---

## 2026-05-10 — Schema indexes

**Why**: `001_initial.sql` shipped without indexes on foreign keys or
`created_at` ordering columns. Adds them everywhere queries actually filter
or order.

**What to apply**

```sh
supabase db push
```

Migration file: `supabase/migrations/005_indexes.sql`. Idempotent
(`CREATE INDEX IF NOT EXISTS`) — safe to re-run.

---

## 2026-05-10 — Bcrypt PIN migration (transparent)

**Why**: PIN hashes were SHA256 with a global salt. Replaced with bcrypt
(rounds=12, per-user salt).

**What to apply**

Nothing manual. Existing SHA256 hashes still verify via a fallback path; on
the next successful login each member's hash is silently re-hashed to bcrypt
and written back. Deploy the code and you're done.

If you ever want to force everyone off legacy hashes, run:

```sql
SELECT id, name FROM members WHERE pin_hash NOT LIKE '$2%';
```

to see who hasn't logged in yet.
