// @vitest-environment node
/**
 * Test del catalog `lib/notification-events.ts` — il pattern centrale per
 * tutte le notifiche dell'app. Ogni evento è una entry nel registry; il
 * dispatcher `emit()` legge la definition, calcola i recipients, chiama
 * notifyMembers.
 *
 * Cosa è coperto qui:
 *   - title/body/link generati correttamente per ogni evento del catalog
 *   - recipients escludono sempre il sender
 *   - emit() dispatcha a notifyMembers con il payload giusto
 *   - emit() esce silenziosamente se non ci sono recipienti
 *
 * Nuovi eventi: aggiungi un blocco describe dedicato qui sotto. Il pattern
 * del file fa da template.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNotifyMembers = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/notifications', () => ({
  notifyMembers: mockNotifyMembers,
}))

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

const { NOTIFICATION_EVENTS, emit } = await import('@/lib/notification-events')

// Costruisce un mock di Supabase che ritorna un dataset thenable per la
// chain .from('table').select(...).eq(...). Sufficient per i recipient
// lookups di chat_message e new_post.
function mockTable(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  ;(builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve)
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
  mockNotifyMembers.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Catalog shape — invariante strutturale
// ---------------------------------------------------------------------------

describe('NOTIFICATION_EVENTS — invarianti del catalog', () => {
  it('ogni entry espone type, title, body, link, recipients', () => {
    for (const [key, def] of Object.entries(NOTIFICATION_EVENTS)) {
      expect(typeof def.type).toBe('string')
      expect(typeof def.title).toBe('function')
      expect(typeof def.body).toBe('function')
      expect(typeof def.link).toBe('function')
      expect(typeof def.recipients).toBe('function')
      // L'eventKey e il type DB possono essere uguali o differenti (es.
      // chat_message → 'chat_message'), ma il type deve esistere.
      expect(def.type.length, `evento ${key} ha type vuoto`).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// chat_message
// ---------------------------------------------------------------------------

describe('event: chat_message', () => {
  const basePayload = {
    sender: { id: 'm-1', name: 'Mario' },
    message: {
      id: 'msg-1',
      group_id: 'group-1',
      text: 'Ciao a tutti',
      message_type: 'text',
    },
  }

  it('title = nome del mittente (stile WhatsApp/Telegram)', () => {
    const def = NOTIFICATION_EVENTS.chat_message
    expect(def.title(basePayload)).toBe('Mario')
  })

  it('body per messaggi di testo = testo intero se ≤ 80 char', () => {
    expect(NOTIFICATION_EVENTS.chat_message.body(basePayload)).toBe('Ciao a tutti')
  })

  it('body tronca testi lunghi a 80 char + ellipsis', () => {
    const long = { ...basePayload, message: { ...basePayload.message, text: 'x'.repeat(200) } }
    const body = NOTIFICATION_EVENTS.chat_message.body(long)
    expect(body).toHaveLength(81)
    expect(body.endsWith('…')).toBe(true)
  })

  it('body = "📷 Foto" per messaggi image', () => {
    const img = { ...basePayload, message: { ...basePayload.message, message_type: 'image' } }
    expect(NOTIFICATION_EVENTS.chat_message.body(img)).toBe('📷 Foto')
  })

  it('body = "📎 File" per messaggi document', () => {
    const doc = { ...basePayload, message: { ...basePayload.message, message_type: 'document' } }
    expect(NOTIFICATION_EVENTS.chat_message.body(doc)).toBe('📎 File')
  })

  it('link punta alla chat group', () => {
    expect(NOTIFICATION_EVENTS.chat_message.link(basePayload)).toBe('/chat/group-1')
  })

  it('recipients esclude il sender dai membri del gruppo', async () => {
    mockFrom.mockReturnValue(
      mockTable([
        { member_id: 'm-1' }, // sender
        { member_id: 'm-2' },
        { member_id: 'm-3' },
      ]),
    )
    const db = { from: mockFrom } as never
    const recipients = await NOTIFICATION_EVENTS.chat_message.recipients(basePayload, db)
    expect(recipients).toEqual(['m-2', 'm-3'])
  })
})

// ---------------------------------------------------------------------------
// new_post
// ---------------------------------------------------------------------------

describe('event: new_post', () => {
  const payload = {
    sender: { id: 'm-1', name: 'Mario' },
    post: { id: 'post-1', text: 'Cena pronta!', post_type: 'normal' },
  }

  it('title = "Nuovo post"', () => {
    expect(NOTIFICATION_EVENTS.new_post.title(payload)).toBe('Nuovo post')
  })

  it('body = nome autore + preview troncata a 60 char', () => {
    expect(NOTIFICATION_EVENTS.new_post.body(payload)).toBe('Mario: Cena pronta!')

    const long = { ...payload, post: { ...payload.post, text: 'y'.repeat(200) } }
    const body = NOTIFICATION_EVENTS.new_post.body(long)
    expect(body.startsWith('Mario: ')).toBe(true)
    expect(body.endsWith('…')).toBe(true)
  })

  it('link punta al post specifico (deep link al feed)', () => {
    expect(NOTIFICATION_EVENTS.new_post.link(payload)).toBe('/posts/post-1')
  })

  it('recipients = tutti i membri attivi tranne l\'autore', async () => {
    mockFrom.mockReturnValue(
      mockTable([{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-3' }]),
    )
    const db = { from: mockFrom } as never
    const recipients = await NOTIFICATION_EVENTS.new_post.recipients(payload, db)
    expect(recipients).toEqual(['m-2', 'm-3'])
  })
})

// ---------------------------------------------------------------------------
// new_activity
// ---------------------------------------------------------------------------

describe('event: new_activity', () => {
  const payload = {
    sender: { id: 'm-1', name: 'Mario' },
    activity: { id: 'act-1', title: 'Karate', icon: '🥋' },
    participantIds: ['m-1', 'm-2', 'm-3'],
  }

  it('title = "Nuova attività"', () => {
    expect(NOTIFICATION_EVENTS.new_activity.title(payload)).toBe('Nuova attività')
  })

  it('body include icon + titolo dell\'attività', () => {
    expect(NOTIFICATION_EVENTS.new_activity.body(payload)).toBe('Mario: 🥋 Karate')
  })

  it('body fallback su 📅 se icon mancante', () => {
    const noIcon = { ...payload, activity: { ...payload.activity, icon: null } }
    expect(NOTIFICATION_EVENTS.new_activity.body(noIcon)).toBe('Mario: 📅 Karate')
  })

  it('recipients = participantIds escluso il sender', async () => {
    const db = { from: vi.fn() } as never
    const recipients = await NOTIFICATION_EVENTS.new_activity.recipients(payload, db)
    expect(recipients).toEqual(['m-2', 'm-3'])
  })

  it('recipients = [] se solo il creatore è partecipante (no spam a se stessi)', async () => {
    const solo = { ...payload, participantIds: ['m-1'] }
    const db = { from: vi.fn() } as never
    expect(await NOTIFICATION_EVENTS.new_activity.recipients(solo, db)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// emit() — dispatcher
// ---------------------------------------------------------------------------

describe('emit()', () => {
  it('chiama notifyMembers con tipo, title, body, link calcolati dalla definition', async () => {
    mockFrom.mockReturnValue(
      mockTable([{ member_id: 'm-1' }, { member_id: 'm-2' }]),
    )

    await emit('chat_message', {
      sender: { id: 'm-1', name: 'Mario' },
      message: { id: 'msg-1', group_id: 'group-1', text: 'Ciao', message_type: 'text' },
    })

    expect(mockNotifyMembers).toHaveBeenCalledTimes(1)
    const [recipients, type, title, body, link] = mockNotifyMembers.mock.calls[0]
    expect(recipients).toEqual(['m-2'])
    expect(type).toBe('chat_message')
    expect(title).toBe('Mario')
    expect(body).toBe('Ciao')
    expect(link).toBe('/chat/group-1')
  })

  it('non chiama notifyMembers se la lista recipients è vuota', async () => {
    mockFrom.mockReturnValue(
      mockTable([{ member_id: 'm-1' }]), // solo il sender
    )

    await emit('chat_message', {
      sender: { id: 'm-1', name: 'Mario' },
      message: { id: 'msg-1', group_id: 'group-1', text: 'Eco', message_type: 'text' },
    })

    expect(mockNotifyMembers).not.toHaveBeenCalled()
  })

  it('propaga gli errori di notifyMembers (chiamante decide se await o catch)', async () => {
    mockFrom.mockReturnValue(mockTable([{ member_id: 'm-2' }]))
    mockNotifyMembers.mockRejectedValueOnce(new Error('push service down'))

    await expect(
      emit('chat_message', {
        sender: { id: 'm-1', name: 'Mario' },
        message: { id: 'msg-1', group_id: 'group-1', text: 'x', message_type: 'text' },
      }),
    ).rejects.toThrow(/push service down/)
  })

  it('dispatcha new_activity con il type DB corretto', async () => {
    await emit('new_activity', {
      sender: { id: 'm-1', name: 'Mario' },
      activity: { id: 'act-1', title: 'Karate', icon: '🥋' },
      participantIds: ['m-1', 'm-2'],
    })

    const [, type] = mockNotifyMembers.mock.calls[0]
    expect(type).toBe('new_activity')
  })

  it('dispatcha new_post con il type DB corretto', async () => {
    mockFrom.mockReturnValue(mockTable([{ id: 'm-1' }, { id: 'm-2' }]))

    await emit('new_post', {
      sender: { id: 'm-1', name: 'Mario' },
      post: { id: 'post-1', text: 'Hello', post_type: 'normal' },
    })

    const [, type] = mockNotifyMembers.mock.calls[0]
    expect(type).toBe('new_post')
  })
})
