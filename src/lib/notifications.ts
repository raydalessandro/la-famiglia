import { createServerClient } from './supabase/client'
import { Notification, PushSubscription } from '../types/database'
import webpush from 'web-push'

// Constants
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@famiglia.local'
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

// Helper: escape special characters for Telegram MarkdownV2
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

// Insert a notification record into the notifications table and return it
export async function createNotificationRecord(
  memberId: string,
  type: Notification['type'],
  title: string,
  body: string,
  link?: string
): Promise<Notification> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      member_id: memberId,
      type,
      title,
      body,
      link: link ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`createNotificationRecord: ${error.message}`)
  return data as Notification
}

/**
 * Helper di logging strutturato per il pipeline push. JSON su stdout
 * così i log Vercel sono filtrabili per chiave. NON usare `console.log`
 * libero qua dentro — passa da `pushLog` perché vogliamo poter
 * rintracciare l'intera vita di una push (member + reason) nei log
 * dopo un incident come quello del 2026-05-14 (subscription a 0 per
 * cleanup 410).
 */
function pushLog(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown>) {
  const entry = { level, scope: 'push', message, ...fields }
  if (level === 'error') console.error(JSON.stringify(entry))
  else if (level === 'warn') console.warn(JSON.stringify(entry))
  else console.log(JSON.stringify(entry))
}

// Send a web-push notification to all active subscriptions for a member
export async function sendPushNotification(
  memberId: string,
  title: string,
  body: string,
  link?: string
): Promise<boolean> {
  const supabase = createServerClient()

  // Fetch push subscriptions for this member
  const { data: subscriptions, error: subError } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('member_id', memberId)

  if (subError) {
    pushLog('error', 'fetch_subscriptions_failed', { memberId, error: subError.message })
    return false
  }

  const subCount = subscriptions?.length ?? 0
  if (subCount === 0) {
    // Caso critico: dopo il 2026-05-14 abbiamo scoperto che 0 subscription
    // nel DB è uno stato comune (cleanup 410 dopo reinstall PWA) ma
    // silenzioso. Logghiamo INFO così è visibile nei log Vercel.
    pushLog('info', 'no_subscriptions_for_member', { memberId })
    return false
  }

  // Check member's push notification preference
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('notify_push')
    .eq('id', memberId)
    .single()

  if (memberError || !member) {
    pushLog('error', 'fetch_member_failed', { memberId, error: memberError?.message })
    return false
  }

  if (!member.notify_push) {
    pushLog('info', 'push_disabled_by_pref', { memberId })
    return false
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const payload = JSON.stringify({ title, body, link })
  let sentCount = 0
  let cleanedUp = 0

  for (const sub of subscriptions as PushSubscription[]) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys_p256dh,
        auth: sub.keys_auth,
      },
    }

    try {
      await webpush.sendNotification(pushSub, payload)
      sentCount++
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode
      // Endpoint truncato per non riempire i log con FCM URL completi.
      const endpointHost = (() => {
        try { return new URL(sub.endpoint).host } catch { return 'unknown' }
      })()
      if (statusCode === 410 || statusCode === 404) {
        // Subscription is no longer valid — remove it
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('member_id', memberId)
          .eq('endpoint', sub.endpoint)
        cleanedUp++
        pushLog('warn', 'subscription_cleanup', {
          memberId,
          endpointHost,
          statusCode,
          reason: 'web_push_returned_410_or_404',
        })
      } else {
        pushLog('error', 'send_failed', {
          memberId,
          endpointHost,
          statusCode: statusCode ?? null,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  pushLog('info', 'send_summary', {
    memberId,
    subscriptionsAttempted: subCount,
    sent: sentCount,
    cleanedUp,
  })

  // Ritorna true solo se almeno una push è effettivamente partita. Prima
  // ritornava true sempre — questo significava che `sent_push` veniva
  // marcato true anche se TUTTE le subscription erano fallite con 410.
  // Comportamento più onesto: sent_push riflette "almeno una è andata".
  return sentCount > 0
}

// Send a Telegram message to a member via the Telegram Bot API
export async function sendTelegramNotification(
  memberId: string,
  title: string,
  body: string
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false

  const supabase = createServerClient()

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('notify_telegram, telegram_chat_id')
    .eq('id', memberId)
    .single()

  if (memberError || !member) {
    console.error('sendTelegramNotification: failed to fetch member', memberError?.message)
    return false
  }

  if (!member.notify_telegram || !member.telegram_chat_id) return false

  const text = `*${escapeMarkdown(title)}*\n${escapeMarkdown(body)}`

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: member.telegram_chat_id,
        text,
        parse_mode: 'MarkdownV2',
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('sendTelegramNotification: Telegram API error', response.status, errBody)
      return false
    }

    return true
  } catch (err) {
    console.error('sendTelegramNotification: fetch error', err)
    return false
  }
}

// Main wrapper: notify multiple members, recording the notification and sending via all channels
export async function notifyMembers(
  memberIds: string[],
  type: Notification['type'],
  title: string,
  body: string,
  link?: string
): Promise<void> {
  const supabase = createServerClient()

  await Promise.allSettled(
    memberIds.map(async (memberId) => {
      // Create the notification record
      const record = await createNotificationRecord(memberId, type, title, body, link)

      // Send push notification and update record if sent
      const pushSent = await sendPushNotification(memberId, title, body, link)
      if (pushSent) {
        await supabase
          .from('notifications')
          .update({ sent_push: true })
          .eq('id', record.id)
      }

      // Send Telegram notification and update record if sent
      const telegramSent = await sendTelegramNotification(memberId, title, body)
      if (telegramSent) {
        await supabase
          .from('notifications')
          .update({ sent_telegram: true })
          .eq('id', record.id)
      }
    })
  )
}

// Upsert a push subscription for a member (conflict on member_id + endpoint)
export async function subscribePush(
  memberId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<PushSubscription> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        member_id: memberId,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
      },
      { onConflict: 'member_id,endpoint' }
    )
    .select()
    .single()

  if (error) throw new Error(`subscribePush: ${error.message}`)
  return data as PushSubscription
}

// Delete a push subscription for a member by endpoint
export async function unsubscribePush(memberId: string, endpoint: string): Promise<void> {
  const supabase = createServerClient()

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('member_id', memberId)
    .eq('endpoint', endpoint)

  if (error) throw new Error(`unsubscribePush: ${error.message}`)
}
