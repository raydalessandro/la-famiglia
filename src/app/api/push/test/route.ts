import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { sendPushNotification } from '@/lib/notifications'

/**
 * POST /api/push/test
 *
 * Invia una notifica push al member corrente, usando le subscription già
 * registrate per quel member. Sempre disponibile dietro requireAuth() —
 * non è un vector di spam perché può solo inviare a sé stesso, e
 * comunque chi è loggato può sempre triggerare push genuine via like /
 * commento / reazione.
 *
 * Uso: il bottone "Invia notifica di prova" in /settings chiama questo
 * endpoint e il device dovrebbe ricevere il banner di sistema. Utile
 * sia per il debug iniziale sia per ri-verificare le push dopo un
 * cambio device / reinstall della PWA.
 *
 * Diagnosi:
 * - 200 + push ricevuta sul device = pipe completo funziona.
 * - 200 + nessuna push visibile = la subscription c'è nel DB ma OS o
 *   browser non mostra il banner. Controlla i permessi di sistema
 *   (iOS: Impostazioni > Notifiche > La Famiglia).
 * - 200 con { sent: false } = nessuna subscription per il member nel
 *   DB, OPPURE notify_push è false. Il toggle in Settings non è stato
 *   attivato con successo.
 * - 500 = VAPID keys mancanti o errore web-push. Vedi i log Vercel.
 * - 401 = sessione invalida.
 */
export async function POST() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const sent = await sendPushNotification(
      auth.id,
      'Notifica di prova',
      'Se vedi questo messaggio, le notifiche funzionano. 🎉',
      '/feed',
    )
    return NextResponse.json({ data: { sent }, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Errore invio'
    console.error('[push-test] sendPushNotification threw:', err)
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
