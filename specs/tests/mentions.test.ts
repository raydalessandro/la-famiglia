// @vitest-environment node
/**
 * Test del parser server-side `parseMentions` (lib/mentions.ts) e
 * dell'evento `mention` del catalog. La parte client (MentionText)
 * ha test separato a livello componente.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(() => ({ from: vi.fn() })),
}))

const { parseMentions } = await import('@/lib/mentions')
const { NOTIFICATION_EVENTS } = await import('@/lib/notification-events')

const MEMBERS = [
  { id: 'm1', name: 'Marco' },
  { id: 'm2', name: 'Lucia' },
  { id: 'm3', name: 'MariaElena' },
]

describe('parseMentions', () => {
  it('riconosce un nome esatto', () => {
    const result = parseMentions('Ciao @Marco come stai?', MEMBERS)
    expect(result).toHaveLength(1)
    expect(result[0].member).toEqual({ id: 'm1', name: 'Marco' })
  })

  it('case-insensitive', () => {
    expect(parseMentions('@marco', MEMBERS)).toHaveLength(1)
    expect(parseMentions('@MARCO', MEMBERS)).toHaveLength(1)
    expect(parseMentions('@MaRcO', MEMBERS)).toHaveLength(1)
  })

  it('matcha solo nomi esistenti', () => {
    expect(parseMentions('@Nonexistent', MEMBERS)).toEqual([])
    expect(parseMentions('@stranger ciao', MEMBERS)).toEqual([])
  })

  it('multiple mention nello stesso testo', () => {
    const result = parseMentions('@Marco e @Lucia venite?', MEMBERS)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.member.id)).toEqual(['m1', 'm2'])
  })

  it('dedupe sullo stesso member', () => {
    // L'utente scrive @Marco due volte — una sola mention DB / push
    const result = parseMentions('@Marco devi venire @Marco non scordarti', MEMBERS)
    expect(result).toHaveLength(1)
    expect(result[0].member.id).toBe('m1')
  })

  it('excludeAuthorId: niente auto-mention', () => {
    const result = parseMentions('@Marco è il mio nome', MEMBERS, {
      excludeAuthorId: 'm1',
    })
    expect(result).toEqual([])
  })

  it('NO match parziale (token = name esatto, no prefix)', () => {
    // @Mari NON deve matchare "MariaElena" perché token ≠ name
    expect(parseMentions('@Mari', MEMBERS)).toEqual([])
    // @MariaElena invece sì
    expect(parseMentions('@MariaElena', MEMBERS)).toHaveLength(1)
  })

  it('si ferma a spazi e punteggiatura', () => {
    // @Marco. → match "Marco", il "." resta fuori
    const result = parseMentions('Hey @Marco, ci sei?', MEMBERS)
    expect(result).toHaveLength(1)
    expect(result[0].member.name).toBe('Marco')
  })

  it('text vuoto → array vuoto', () => {
    expect(parseMentions('', MEMBERS)).toEqual([])
  })

  it('nessun @ nel testo → array vuoto', () => {
    expect(parseMentions('Solo testo normale senza menzioni', MEMBERS)).toEqual([])
  })

  it('@ isolato (senza nome dopo) non rompe', () => {
    expect(parseMentions('Email @ wat @Marco', MEMBERS)).toHaveLength(1)
  })
})

describe('NOTIFICATION_EVENTS.mention', () => {
  const payload = {
    author: { id: 'm1', name: 'Marco' },
    mentionedId: 'm2',
    source: {
      type: 'post' as const,
      link: '/feed/post-1',
      preview: 'Ciao @Lucia, ti aspetto domani',
    },
  }

  it('title = "{nome autore} ti ha menzionato"', () => {
    expect(NOTIFICATION_EVENTS.mention.title(payload)).toBe('Marco ti ha menzionato')
  })

  it('body = preview del source', () => {
    expect(NOTIFICATION_EVENTS.mention.body(payload)).toBe(
      'Ciao @Lucia, ti aspetto domani',
    )
  })

  it('link punta al source corretto', () => {
    expect(NOTIFICATION_EVENTS.mention.link(payload)).toBe('/feed/post-1')
  })

  it('recipients = [mentionedId] sola, niente broadcast', async () => {
    const recipients = await NOTIFICATION_EVENTS.mention.recipients(
      payload,
      {} as never,
    )
    expect(recipients).toEqual(['m2'])
  })
})
