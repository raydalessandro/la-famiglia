import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/client'

/**
 * GET /api/push/diagnostic — endpoint diagnostico per il debug push.
 *
 * Quando le push non arrivano e non sai dove guardare:
 *   1. Apri https://<dominio>/api/push/diagnostic nel browser (loggato).
 *   2. Il JSON ritornato dice in 1 colpo:
 *      - quali env il server vede a runtime (true/false, MAI valori)
 *      - count delle subscription nel DB per il caller
 *      - ultime 5 notifications per il caller (per vedere sent_push,
 *        sent_telegram, created_at)
 *      - stato della preferenza notify_push del member
 *
 * Mai esposto pubblicamente — `requireAuth()` lo protegge. Non logga
 * né ritorna VALORI delle env (la sola presenza/assenza è sufficiente
 * per il debug e non leakeria segreti se per qualche motivo l'endpoint
 * uscisse dietro l'auth wall).
 *
 * Decidere se mantenere in produzione o gating con
 * `process.env.ENABLE_PUSH_DIAGNOSTIC === '1'` dopo che le push
 * tornano stabili. Per ora always-on dietro auth (analogamente a
 * `/api/push/test`).
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const db = createServerClient()

  // 1. Env presence (no values)
  const envCheck = {
    VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
    VAPID_EMAIL: !!process.env.VAPID_EMAIL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
  }

  // 2. Member preference
  const { data: memberRow } = await db
    .from('members')
    .select('id, name, notify_push, notify_telegram')
    .eq('id', auth.id)
    .single()

  // 3. Subscription count + endpoint hosts (l'endpoint completo non lo
  //    esponiamo perché contiene un token; l'host basta per capire da
  //    quale push service è — fcm.googleapis.com = Android Chrome,
  //    web.push.apple.com = Safari iOS PWA, ecc.)
  const { data: subRows, error: subError } = await db
    .from('push_subscriptions')
    .select('id, endpoint, created_at')
    .eq('member_id', auth.id)
    .order('created_at', { ascending: false })

  const subscriptions = (subRows ?? []).map((row: { id: string; endpoint: string; created_at: string }) => {
    let host = 'unknown'
    try {
      host = new URL(row.endpoint).host
    } catch {
      // endpoint malformato — lo segnaliamo
      host = '<malformed>'
    }
    return {
      id: row.id,
      endpointHost: host,
      createdAt: row.created_at,
    }
  })

  // 4. Ultime 5 notifications per il caller — per vedere se vengono
  //    create regolarmente e quale è il flag sent_push (true = invio
  //    riuscito, false = bloccato dal pipeline o nessuna sub).
  const { data: notifRows } = await db
    .from('notifications')
    .select('id, type, title, sent_push, sent_telegram, created_at')
    .eq('member_id', auth.id)
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({
    data: {
      caller: {
        id: auth.id,
        name: auth.name,
        is_admin: auth.is_admin,
      },
      member: memberRow ?? null,
      env: envCheck,
      subscriptions: {
        count: subscriptions.length,
        items: subscriptions,
        error: subError?.message ?? null,
      },
      recentNotifications: notifRows ?? [],
      timestamp: new Date().toISOString(),
    },
    error: null,
  })
}
