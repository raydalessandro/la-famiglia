import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { subscribePush, unsubscribePush } from '@/lib/notifications'

/**
 * POST /api/push/subscribe
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 *
 * Salva la PushSubscription del browser dell'utente corrente.
 * Idempotent: l'upsert in subscribePush risolve i duplicati su
 * (member_id, endpoint).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  const endpoint = body.endpoint
  const p256dh = body.keys?.p256dh
  const authKey = body.keys?.auth

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json(
      { data: null, error: 'endpoint, keys.p256dh e keys.auth obbligatori' },
      { status: 400 },
    )
  }

  try {
    const sub = await subscribePush(auth.id, {
      endpoint,
      keys: { p256dh, auth: authKey },
    })
    return NextResponse.json({ data: sub, error: null }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore registrazione push'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/push/subscribe
 * Body: { endpoint: string }
 *
 * Rimuove la subscription. Idempotent: se non esiste è no-op.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  let body: { endpoint?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Body non valido' }, { status: 400 })
  }

  if (!body.endpoint) {
    return NextResponse.json({ data: null, error: 'endpoint obbligatorio' }, { status: 400 })
  }

  try {
    await unsubscribePush(auth.id, body.endpoint)
    return NextResponse.json({ data: null, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore rimozione push'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
