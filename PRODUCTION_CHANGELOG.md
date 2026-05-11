# Production changelog

Things that need to happen on the live deployment when a release lands. This
file is the source of truth for **manual ops** (DB migrations, env vars,
storage policies, etc.) — the kind of work `vercel deploy` won't do for you.

Format: newest first. Each entry says what to run and where.

---

## 2026-05-11 — Defensive RLS on every table

**Why**: until now the project had no RLS. The browser anon key — public by
definition — could read `sessions.token` and INSERT/UPDATE/DELETE on every
public table directly via the Supabase REST endpoint, bypassing the API
routes. Closing that door is overdue.

**What to apply**

```sh
supabase db push
```

This applies two files together (the second is the load-bearing one):

- `supabase/migrations/007_post_reactions.sql` — recovery of the
  `post_reactions` table that someone had created out-of-repo. Fully
  idempotent (`CREATE TABLE IF NOT EXISTS`, guarded `ALTER PUBLICATION`).
  If 007 is already marked applied on the remote, `db push` skips it.
- `supabase/migrations/008_rls_defensive.sql` — enables RLS on every
  public table. 11 realtime tables get a SELECT policy for `anon` and
  `authenticated` so `postgres_changes` keeps working. The other 14
  tables get RLS enabled with NO policies → default deny for non-privileged
  roles. `service_role` bypasses RLS by design, so the API routes are
  unaffected.

**What does NOT need to happen**

- No env var changes.
- No code changes outside `supabase/migrations/`.
- The browser realtime hooks (`useRealtimeSubscription`) keep functioning —
  they only need SELECT, which the realtime tables still permit.

**How to verify after applying**

```sh
npm run test:integration
```

Should report 7/7 GREEN. The same suite was 4/7 RED before the migration.

---

## 2026-05-11 — Post reactions (F3.2)

**Why**: three quick-reaction emoji (❤️ 😄 👏) under every post, with an
avatar stack of who reacted. Closes F3.2 in the handoff.

**What to apply**

The DB side was already in place (table `post_reactions` created out-of-repo
and recovered by `007_post_reactions.sql` above). The app side ships as code:

- `POST /api/posts/:id/reactions { emoji }` — 201 created or 200 idempotent
- `DELETE /api/posts/:id/reactions?emoji=…` — 200 `{ removed }`
- `<ReactionBar>` rendered in the feed PostCard
- Realtime subscription on `post_reactions` so other members see updates live

Nothing manual to do on the deploy beyond the standard `vercel deploy` —
the migration is applied with the RLS one above.

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
