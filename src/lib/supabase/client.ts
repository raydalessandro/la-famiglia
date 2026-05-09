import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client — uses anon key (for realtime subscriptions)
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Server client — uses service_role key (for API routes: DB queries + Storage uploads)
// service_role bypasses RLS, which is disabled in this project.
// Without service_role, Storage upload fails (Supabase Storage requires RLS policies or service_role).
export function createServerClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    console.warn('[supabase] SUPABASE_SERVICE_ROLE_KEY not set — Storage uploads will fail')
  }
  return createClient(SUPABASE_URL, serviceRoleKey || SUPABASE_ANON_KEY)
}
