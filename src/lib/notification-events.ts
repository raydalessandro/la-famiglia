import { createServerClient } from './supabase/client'
import { notifyMembers } from './notifications'
import type { Notification } from '@/types/database'

/**
 * Registry centrale degli eventi che producono notifiche (push / Telegram / DB).
 *
 * Pattern: ogni evento del dominio (un messaggio in chat, un post pubblicato,
 * un'attività creata, ecc.) è una entry nel catalog. Il route handler che
 * scatena l'evento chiama solo `emit('chat_message', payload)` — non si
 * preoccupa di scoprire chi notificare, di formattare il titolo o il body,
 * né di sapere se le push sono attive. Tutto questo vive nella definition
 * dell'evento.
 *
 * Vantaggi:
 *   1. Single source of truth per ogni notifica: cambi il body in 1 posto.
 *   2. Discoverable: chi vuole aggiungere una notifica va in questo file,
 *      aggiunge una entry, e basta. Il dispatcher fa il resto.
 *   3. Type-safe: il payload di ogni evento è tipato, il route handler
 *      che chiama emit() non può sbagliare la shape.
 *   4. Scalabile: nuovi eventi (nuovo album, nuova foto, nuovo task
 *      completato, ecc.) sono ~10 righe di definition + 1 chiamata emit().
 *   5. Recipients DRY: la logica "chi notificare" sta vicino alla
 *      definizione dell'evento, non duplicata in 6 route handlers.
 *
 * Come aggiungere un nuovo evento:
 *   a) Se il `type` non esiste, aggiungilo all'enum in types/database.ts.
 *   b) Estendi PayloadByEvent con la shape del payload.
 *   c) Aggiungi la entry in NOTIFICATION_EVENTS con title/body/link/recipients.
 *   d) Nel route handler, chiama `emit('nome_evento', payload)` dopo
 *      l'INSERT (fire-and-forget, vedi sotto).
 *   e) Aggiungi un test in specs/tests/notification_events.test.ts.
 *
 * Nota su `notify_push`: il gate per-utente vive ancora dentro
 * sendPushNotification (lib/notifications.ts:77). Le definitions qui sotto
 * NON devono filtrarci sopra — restituiscono tutti i potenziali recipienti
 * e il sistema più in basso scarta chi ha disattivato le push.
 */

type Db = ReturnType<typeof createServerClient>

// ---------------------------------------------------------------------------
// PAYLOAD per evento
// ---------------------------------------------------------------------------

type PayloadByEvent = {
  chat_message: {
    sender: { id: string; name: string }
    message: {
      id: string
      group_id: string
      text: string
      message_type: string
    }
  }
  new_post: {
    sender: { id: string; name: string }
    post: { id: string; text: string; post_type: string }
  }
  new_activity: {
    sender: { id: string; name: string }
    activity: { id: string; title: string; icon: string | null }
    // Chi è coinvolto nell'attività. La definizione filtrerà il sender via.
    participantIds: string[]
  }
}

export type NotificationEventKey = keyof PayloadByEvent

// ---------------------------------------------------------------------------
// DEFINITION — la "forma" di un evento
// ---------------------------------------------------------------------------

type EventDefinition<K extends NotificationEventKey> = {
  // Persistito sulla riga notifications.type del DB. Vincolato all'enum.
  type: Notification['type']
  // Title del banner di sistema (e della riga DB).
  title: (p: PayloadByEvent[K]) => string
  // Body del banner — preview/snippet del contenuto.
  body: (p: PayloadByEvent[K]) => string
  // Deep link aperto cliccando la push.
  link: (p: PayloadByEvent[K]) => string
  // Lista member_id da notificare. Convenzione: ESCLUDERE il sender qui.
  recipients: (p: PayloadByEvent[K], db: Db) => Promise<string[]>
}

type Catalog = {
  [K in NotificationEventKey]: EventDefinition<K>
}

// ---------------------------------------------------------------------------
// Helper interni
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function chatSnippet(message: PayloadByEvent['chat_message']['message']): string {
  if (message.message_type === 'image') return '📷 Foto'
  if (message.message_type === 'document') return '📎 File'
  return truncate(message.text, 80)
}

// ---------------------------------------------------------------------------
// CATALOG
// ---------------------------------------------------------------------------

export const NOTIFICATION_EVENTS: Catalog = {
  chat_message: {
    type: 'chat_message',
    // Title = nome del mittente (parallelo WhatsApp/Telegram). Aggregare
    // più messaggi in un singolo banner è un futuro problema di coalescing;
    // per ora ogni messaggio = 1 push.
    title: (p) => p.sender.name,
    body: (p) => chatSnippet(p.message),
    link: (p) => `/chat/${p.message.group_id}`,
    recipients: async (p, db) => {
      const { data } = await db
        .from('chat_group_members')
        .select('member_id')
        .eq('group_id', p.message.group_id)
      return ((data ?? []) as Array<{ member_id: string }>)
        .map((m) => m.member_id)
        .filter((id) => id !== p.sender.id)
    },
  },

  new_post: {
    type: 'new_post',
    title: () => 'Nuovo post',
    body: (p) => `${p.sender.name}: ${truncate(p.post.text, 60)}`,
    link: (p) => `/posts/${p.post.id}`,
    recipients: async (p, db) => {
      // Tutti i membri attivi tranne l'autore. Notifica gli "spettatori"
      // del feed di famiglia.
      const { data } = await db
        .from('members')
        .select('id')
        .eq('is_active', true)
      return ((data ?? []) as Array<{ id: string }>)
        .map((m) => m.id)
        .filter((id) => id !== p.sender.id)
    },
  },

  new_activity: {
    type: 'new_activity',
    title: () => 'Nuova attività',
    body: (p) => `${p.sender.name}: ${p.activity.icon ?? '📅'} ${p.activity.title}`,
    link: () => `/activities`,
    recipients: async (p) =>
      // Solo i partecipanti dell'attività, escluso chi l'ha creata.
      // Notifichiamo solo chi è coinvolto — non spammiamo l'intera famiglia
      // per attività private (es. "Karate Luca").
      p.participantIds.filter((id) => id !== p.sender.id),
  },
}

// ---------------------------------------------------------------------------
// emit() — punto di ingresso pubblico
// ---------------------------------------------------------------------------

/**
 * Emette un evento di notifica. Cerca la definition, calcola recipients,
 * chiama notifyMembers. notifyMembers a sua volta:
 *   - crea la riga notifications nel DB (per la campanella in-app)
 *   - chiama sendPushNotification (con gate notify_push per-utente)
 *   - chiama sendTelegramNotification (con gate notify_telegram per-utente)
 *
 * Convenzione di chiamata: nei route handler usa fire-and-forget così la
 * risposta HTTP non aspetta il push service esterno:
 *
 *     emit('chat_message', { sender, message })
 *       .catch((err) => console.error('emit chat_message failed:', err))
 *
 * Se l'evento è "critico" (es. transazione che DEVE registrare la riga
 * notifications anche se la push fallisce), aspetta con `await`.
 */
export async function emit<K extends NotificationEventKey>(
  eventKey: K,
  payload: PayloadByEvent[K],
): Promise<void> {
  const def = NOTIFICATION_EVENTS[eventKey]
  const db = createServerClient()
  const recipients = await def.recipients(payload, db)
  if (recipients.length === 0) return
  await notifyMembers(
    recipients,
    def.type,
    def.title(payload),
    def.body(payload),
    def.link(payload),
  )
}
