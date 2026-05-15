// @vitest-environment node
/**
 * Unit tests per src/lib/notifications.ts — il cuore della pipeline push.
 *
 * Garantisce in particolare:
 *  - Il gate `notify_push` viene rispettato: utenti che hanno disattivato
 *    le push nelle preferenze NON ricevono nulla anche se hanno
 *    subscription registrate (era successo già un bug simile in passato:
 *    sub valida ma la preferenza era stata revocata).
 *  - Subscription scadute (410 / 404 da push service) vengono ripulite
 *    dal DB automaticamente — altrimenti il loop di retry continuerebbe
 *    a fallire per sempre.
 *  - subscribePush usa upsert con conflict su (member_id, endpoint), così
 *    re-installare la PWA sullo stesso device non duplica righe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// web-push mock
// ---------------------------------------------------------------------------
const mockSendNotification = vi.fn()
const mockSetVapidDetails = vi.fn()

vi.mock('web-push', () => ({
  default: {
    sendNotification: mockSendNotification,
    setVapidDetails: mockSetVapidDetails,
  },
}))

// ---------------------------------------------------------------------------
// Supabase mock — configurabile per tabella
// ---------------------------------------------------------------------------
type TableHandler = (table: string) => unknown
const mockFrom = vi.fn<TableHandler>()

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

// Helper per costruire una catena thenable che simula PostgrestFilterBuilder.
// Ogni metodo ritorna `this`, e il valore finale viene fornito via `.thenable()`.
function thenable<T>(value: T) {
  return Promise.resolve(value)
}

// Cattura le operazioni DELETE per assertion
const deleteCalls: Array<{ table: string; eqs: Array<[string, unknown]> }> = []

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
const {
  sendPushNotification,
  notifyMembers,
  subscribePush,
  unsubscribePush,
} = await import('@/lib/notifications')

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const SUBSCRIPTION = {
  member_id: 'm-1',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys_p256dh: 'p256dh-key',
  keys_auth: 'auth-key',
  created_at: '2026-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  deleteCalls.length = 0
})

function setupSupabase(opts: {
  subscriptions?: typeof SUBSCRIPTION[] | null
  subscriptionsError?: { message: string } | null
  member?: { notify_push: boolean; notify_telegram?: boolean; telegram_chat_id?: string | null } | null
  memberError?: { message: string } | null
  notificationInsertId?: string
}) {
  const insertCalls: unknown[] = []

  mockFrom.mockImplementation((table: string) => {
    if (table === 'push_subscriptions') {
      return {
        select: () => ({
          eq: () =>
            thenable({
              data: opts.subscriptions ?? null,
              error: opts.subscriptionsError ?? null,
            }),
        }),
        delete: () => ({
          eq: (col1: string, val1: unknown) => ({
            eq: (col2: string, val2: unknown) => {
              deleteCalls.push({
                table,
                eqs: [
                  [col1, val1],
                  [col2, val2],
                ],
              })
              return thenable({ error: null })
            },
          }),
        }),
        upsert: (row: unknown) => ({
          select: () => ({
            single: () => thenable({ data: row, error: null }),
          }),
        }),
      }
    }
    if (table === 'members') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              thenable({
                data: opts.member ?? null,
                error: opts.memberError ?? null,
              }),
          }),
        }),
      }
    }
    if (table === 'notifications') {
      return {
        insert: (row: unknown) => {
          insertCalls.push(row)
          return {
            select: () => ({
              single: () =>
                thenable({
                  data: { id: opts.notificationInsertId ?? 'notif-1', ...(row as object) },
                  error: null,
                }),
            }),
          }
        },
        update: () => ({
          eq: () => thenable({ error: null }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { insertCalls }
}

// ---------------------------------------------------------------------------
// sendPushNotification
// ---------------------------------------------------------------------------
describe('sendPushNotification', () => {
  it('ritorna false quando il member non ha subscription', async () => {
    setupSupabase({ subscriptions: [] })

    const result = await sendPushNotification('m-1', 'T', 'B')

    expect(result).toBe(false)
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('rispetta il gate notify_push: false anche con subscription valida', async () => {
    // Regression: una sub registrata ma l'utente ha poi disattivato le push.
    // Non deve mai partire nulla.
    setupSupabase({
      subscriptions: [SUBSCRIPTION],
      member: { notify_push: false },
    })

    const result = await sendPushNotification('m-1', 'T', 'B')

    expect(result).toBe(false)
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('invia la push quando notify_push=true e sub presente', async () => {
    setupSupabase({
      subscriptions: [SUBSCRIPTION],
      member: { notify_push: true },
    })
    mockSendNotification.mockResolvedValue(undefined)

    const result = await sendPushNotification('m-1', 'Titolo', 'Body', '/feed')

    expect(result).toBe(true)
    expect(mockSetVapidDetails).toHaveBeenCalled()
    expect(mockSendNotification).toHaveBeenCalledTimes(1)

    const [pushSub, payload] = mockSendNotification.mock.calls[0]
    expect(pushSub).toEqual({
      endpoint: SUBSCRIPTION.endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    })
    expect(JSON.parse(payload)).toEqual({
      title: 'Titolo',
      body: 'Body',
      link: '/feed',
    })
  })

  it('rimuove la subscription dal DB se il push service risponde 410 Gone, e ritorna false', async () => {
    // Quando un browser disinstalla la PWA o revoca il permesso, il push
    // service segna l'endpoint come 410. Senza cleanup, lo stesso member
    // continuerebbe a fallire ad ogni notifica.
    //
    // Ritorna false perché NESSUNA push è effettivamente partita (l'unica
    // subscription era morta). Prima ritornava true sempre: side effect
    // era che `sent_push` veniva marcato true su notifications anche se
    // tutte le push erano fallite — falso positivo che ha mascherato
    // l'incident del 2026-05-14.
    setupSupabase({
      subscriptions: [SUBSCRIPTION],
      member: { notify_push: true },
    })
    const err = new Error('Gone')
    ;(err as unknown as { statusCode: number }).statusCode = 410
    mockSendNotification.mockRejectedValue(err)

    const result = await sendPushNotification('m-1', 'T', 'B')

    expect(result).toBe(false)
    expect(deleteCalls).toHaveLength(1)
    expect(deleteCalls[0].table).toBe('push_subscriptions')
    expect(deleteCalls[0].eqs).toEqual([
      ['member_id', 'm-1'],
      ['endpoint', SUBSCRIPTION.endpoint],
    ])
  })

  it('ritorna true se almeno una subscription riceve la push (mix successo/410)', async () => {
    // Caso realistico: 1 device con PWA reinstallata (410), 1 device attivo.
    // Vogliamo che `sent_push=true` sulla riga notifications: la notifica
    // ha raggiunto almeno un device.
    const SECOND_SUB = {
      ...SUBSCRIPTION,
      endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
    }
    setupSupabase({
      subscriptions: [SUBSCRIPTION, SECOND_SUB],
      member: { notify_push: true },
    })
    const goneErr = new Error('Gone')
    ;(goneErr as unknown as { statusCode: number }).statusCode = 410
    mockSendNotification
      .mockRejectedValueOnce(goneErr)   // prima sub morta
      .mockResolvedValueOnce(undefined) // seconda sub attiva → push OK

    const result = await sendPushNotification('m-1', 'T', 'B')

    expect(result).toBe(true)
    expect(deleteCalls).toHaveLength(1) // solo la sub morta è stata pulita
  })

  it('rimuove la subscription anche su 404 Not Found', async () => {
    setupSupabase({
      subscriptions: [SUBSCRIPTION],
      member: { notify_push: true },
    })
    const err = new Error('Not Found')
    ;(err as unknown as { statusCode: number }).statusCode = 404
    mockSendNotification.mockRejectedValue(err)

    await sendPushNotification('m-1', 'T', 'B')

    expect(deleteCalls).toHaveLength(1)
  })

  it('NON rimuove la subscription su errori transitori (es. 500)', async () => {
    // Un 500 dal push service è temporaneo — cancellare la sub farebbe
    // perdere l'utente per sempre. Solo 410/404 sono terminali.
    setupSupabase({
      subscriptions: [SUBSCRIPTION],
      member: { notify_push: true },
    })
    const err = new Error('Internal Server Error')
    ;(err as unknown as { statusCode: number }).statusCode = 500
    mockSendNotification.mockRejectedValue(err)

    await sendPushNotification('m-1', 'T', 'B')

    expect(deleteCalls).toHaveLength(0)
  })

  it('processa tutte le subscription anche se una fallisce', async () => {
    const sub2 = { ...SUBSCRIPTION, endpoint: 'https://other/endpoint' }
    setupSupabase({
      subscriptions: [SUBSCRIPTION, sub2],
      member: { notify_push: true },
    })
    const gone = new Error('Gone')
    ;(gone as unknown as { statusCode: number }).statusCode = 410
    mockSendNotification.mockRejectedValueOnce(gone).mockResolvedValueOnce(undefined)

    const result = await sendPushNotification('m-1', 'T', 'B')

    expect(result).toBe(true)
    expect(mockSendNotification).toHaveBeenCalledTimes(2)
    expect(deleteCalls).toHaveLength(1) // solo la prima morta
  })
})

// ---------------------------------------------------------------------------
// notifyMembers (orchestrator)
// ---------------------------------------------------------------------------
describe('notifyMembers', () => {
  it('crea un record notification per ogni member e tenta la push', async () => {
    const { insertCalls } = setupSupabase({
      subscriptions: [SUBSCRIPTION],
      member: { notify_push: true },
    })
    mockSendNotification.mockResolvedValue(undefined)

    await notifyMembers(['m-1', 'm-2'], 'comment', 'Titolo', 'Body', '/post/1')

    expect(insertCalls).toHaveLength(2)
    expect(insertCalls[0]).toMatchObject({
      type: 'comment',
      title: 'Titolo',
      body: 'Body',
      link: '/post/1',
    })
  })

  it('non lancia se la push fallisce per un member (Promise.allSettled)', async () => {
    setupSupabase({
      subscriptions: [SUBSCRIPTION],
      member: { notify_push: true },
    })
    mockSendNotification.mockRejectedValue(new Error('boom'))

    // Non deve throw — gli errori per-member vanno catturati dentro
    await expect(
      notifyMembers(['m-1', 'm-2'], 'comment', 'T', 'B')
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// subscribePush
// ---------------------------------------------------------------------------
describe('subscribePush', () => {
  it('fa upsert su push_subscriptions con member_id + endpoint + keys', async () => {
    let upsertedRow: unknown = null
    let upsertOpts: unknown = null

    mockFrom.mockImplementation(() => ({
      upsert: (row: unknown, opts: unknown) => {
        upsertedRow = row
        upsertOpts = opts
        return {
          select: () => ({
            single: () => thenable({ data: row, error: null }),
          }),
        }
      },
    }))

    const sub = {
      endpoint: 'https://push.example/x',
      keys: { p256dh: 'p1', auth: 'a1' },
    }
    const result = await subscribePush('m-1', sub)

    expect(upsertedRow).toEqual({
      member_id: 'm-1',
      endpoint: 'https://push.example/x',
      keys_p256dh: 'p1',
      keys_auth: 'a1',
    })
    // Conflict resolution critico: senza onConflict re-installare la PWA
    // creerebbe righe duplicate per lo stesso device.
    expect(upsertOpts).toEqual({ onConflict: 'member_id,endpoint' })
    expect(result).toMatchObject({ member_id: 'm-1' })
  })

  it('lancia se Supabase ritorna errore', async () => {
    mockFrom.mockImplementation(() => ({
      upsert: () => ({
        select: () => ({
          single: () => thenable({ data: null, error: { message: 'conflict' } }),
        }),
      }),
    }))

    await expect(
      subscribePush('m-1', { endpoint: 'x', keys: { p256dh: 'p', auth: 'a' } })
    ).rejects.toThrow(/subscribePush/)
  })
})

// ---------------------------------------------------------------------------
// unsubscribePush
// ---------------------------------------------------------------------------
describe('unsubscribePush', () => {
  it('cancella la sub corrispondente a member_id + endpoint', async () => {
    const deletes: Array<[string, unknown]> = []

    mockFrom.mockImplementation(() => ({
      delete: () => ({
        eq: (col1: string, val1: unknown) => ({
          eq: (col2: string, val2: unknown) => {
            deletes.push([col1, val1], [col2, val2])
            return thenable({ error: null })
          },
        }),
      }),
    }))

    await unsubscribePush('m-1', 'https://push.example/x')

    expect(deletes).toEqual([
      ['member_id', 'm-1'],
      ['endpoint', 'https://push.example/x'],
    ])
  })
})
