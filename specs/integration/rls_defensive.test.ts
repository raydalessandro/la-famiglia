// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Integration tests for the defensive RLS layer (migration 008).
//
// These talk to the REAL Supabase project. They are intentionally read-mostly
// and any mutation attempts use a dedicated sentinel row (created/torn down
// with service_role) so no real family data is ever touched.
//
// RED → GREEN flow:
//   - Before 008 is applied to remote, the "must be blocked" assertions fail.
//   - After 008 is applied, they pass.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Integration tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'and SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
}

const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY)
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// A handful of representative tables. Once the pattern is validated we can
// expand to the full set (members, posts, post_reactions, …).
const REALTIME_TABLE = 'posts'
// Tables that the client must NEVER read directly with anon key.
const SENSITIVE_TABLE = 'sessions'

describe('RLS defensive — SELECT', () => {
  it('anon CAN SELECT a realtime table (needed for postgres_changes)', async () => {
    const { error } = await anon.from(REALTIME_TABLE).select('id').limit(1)
    expect(error).toBeNull()
  })

  it('anon CANNOT SELECT a sensitive non-realtime table (sessions)', async () => {
    // After 008: anon has no policy on sessions → result is empty or errored,
    // but it MUST NOT leak token rows. We assert "no rows visible".
    const { data, error } = await anon.from(SENSITIVE_TABLE).select('token').limit(1)
    // Either an explicit error, or an empty result set is acceptable —
    // both mean RLS did its job. What's NOT acceptable is data with rows.
    const visibleRows = data?.length ?? 0
    if (!error) {
      expect(visibleRows).toBe(0)
    } else {
      expect(error).toBeTruthy()
    }
  })

  it('service_role CAN SELECT any table', async () => {
    const { error } = await admin.from(SENSITIVE_TABLE).select('id').limit(1)
    expect(error).toBeNull()
  })
})

describe('RLS defensive — INSERT/UPDATE/DELETE blocked for anon', () => {
  // We need a valid member_id to build a realistic posts row.
  // Otherwise FK violation would mask the RLS check.
  let memberId: string | null = null
  let sentinelPostId: string | null = null

  beforeAll(async () => {
    const { data: member } = await admin
      .from('members')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single()
    memberId = member?.id ?? null

    if (memberId) {
      const { data: post } = await admin
        .from('posts')
        .insert({ author_id: memberId, text: '__rls_test_sentinel__' })
        .select('id')
        .single()
      sentinelPostId = post?.id ?? null
    }
  })

  it('anon INSERT into posts is blocked', async () => {
    if (!memberId) {
      // Repo with zero members → skip rather than false negative
      return
    }
    const { data, error } = await anon
      .from('posts')
      .insert({ author_id: memberId, text: '__rls_test_anon_insert__' })
      .select()

    if (data && data.length > 0) {
      // RLS did NOT block — clean up the leaked row before failing
      await admin.from('posts').delete().eq('id', data[0].id)
    }

    expect(error).toBeTruthy()
  })

  it('anon UPDATE on sentinel post does NOT change the row', async () => {
    if (!sentinelPostId) return

    await anon
      .from('posts')
      .update({ text: '__rls_test_anon_update__' })
      .eq('id', sentinelPostId)

    const { data: after } = await admin
      .from('posts')
      .select('text')
      .eq('id', sentinelPostId)
      .single()

    expect(after?.text).toBe('__rls_test_sentinel__')
  })

  it('anon DELETE on sentinel post does NOT remove the row', async () => {
    if (!sentinelPostId) return

    await anon.from('posts').delete().eq('id', sentinelPostId)

    const { data: stillThere } = await admin
      .from('posts')
      .select('id')
      .eq('id', sentinelPostId)
      .maybeSingle()

    expect(stillThere?.id).toBe(sentinelPostId)
  })

  // Cleanup at suite end
  it('cleanup: remove sentinel post', async () => {
    if (sentinelPostId) {
      await admin.from('posts').delete().eq('id', sentinelPostId)
    }
    // Also sweep any orphan rows from previous runs
    await admin.from('posts').delete().eq('text', '__rls_test_sentinel__')
    await admin.from('posts').delete().eq('text', '__rls_test_anon_insert__')
    await admin.from('posts').delete().eq('text', '__rls_test_anon_update__')
  })
})
