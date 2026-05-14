'use client'

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Browser client lazy — uses anon key (per Realtime postgres_changes).
//
// Tenuto separato da `./client.ts` (server) e LAZY (funzione) perché
// `next build` esegue gli import top-level anche dei moduli `'use client'`
// durante il prerendering delle pagine. Un `createClient(URL, ANON)` eager
// al top-level falliva con "supabaseUrl is required" quando le env Supabase
// non sono presenti (build CI, Preview env senza setup).
//
// Il client viene istanziato alla prima chiamata e memoizzato per il resto
// del bundle browser.
let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return _client
}
