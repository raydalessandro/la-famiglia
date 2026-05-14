import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Server client — uses service_role key (for API routes: DB queries + Storage uploads).
// service_role bypasses RLS, which is enabled defensively in this project.
//
// Tutte le letture di env stanno DENTRO la funzione (lazy): così `next build`
// può importare questo modulo durante "Collecting page data" senza che le
// env Supabase debbano essere presenti. Le route API chiamano
// `createServerClient()` a runtime, dove le env sono sempre disponibili.
//
// Il browser client (`supabase` const usato da useRealtimeSubscription) sta
// nel file separato `./browser.ts`, importato solo da moduli `'use client'`.
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    console.warn('[supabase] SUPABASE_SERVICE_ROLE_KEY not set — Storage uploads will fail')
  }
  return createClient(url, serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
