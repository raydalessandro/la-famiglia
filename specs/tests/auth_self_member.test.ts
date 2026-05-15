// @vitest-environment node
/**
 * Regression test per il bug del 11/05/2026: il toggle "Notifiche push"
 * in Settings si spegneva da solo dopo "Salva modifiche" perché
 * `toPublicMember` strippa intenzionalmente `notify_push` (e gli altri
 * flag di preferenza) dal payload pubblico — ma la GET di
 * `/api/members/:id` la usava anche per il proprietario del record,
 * quindi il useEffect di Settings vedeva `undefined` e re-imposta il
 * toggle a OFF a ogni refetch.
 *
 * Questi test garantiscono:
 *  - `toPublicMember` continua a strippare i flag privati (privacy verso
 *    altri membri della famiglia).
 *  - `toSelfMember` espone i flag personali (notify_push, notify_telegram,
 *    telegram_chat_id) così Settings può popolare i toggle.
 *  - Entrambi rimuovono sempre `pin_hash` (mai esposto).
 */

import { describe, it, expect, vi } from 'vitest'
import type { Member } from '@/types/database'

vi.mock('@/lib/supabase/client', () => ({
  createServerClient: vi.fn(() => ({ from: vi.fn() })),
}))

const { toPublicMember, toSelfMember } = await import('@/lib/auth')

const FULL_MEMBER: Member = {
  id: 'm-1',
  name: 'Mario',
  avatar_emoji: '🍕',
  avatar_url: null,
  family_role: 'padre',
  bio: 'bio',
  pin_hash: 'super-secret-bcrypt-hash',
  is_admin: false,
  is_active: true,
  color: '#FF0000',
  notify_push: true,
  notify_telegram: true,
  telegram_chat_id: '12345',
  birth_date: '1980-05-15',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-05-11T00:00:00Z',
}

describe('toPublicMember', () => {
  it('strippa pin_hash e tutti i flag di preferenza personale', () => {
    const pub = toPublicMember(FULL_MEMBER)

    expect(pub).not.toHaveProperty('pin_hash')
    expect(pub).not.toHaveProperty('notify_push')
    expect(pub).not.toHaveProperty('notify_telegram')
    expect(pub).not.toHaveProperty('telegram_chat_id')
    expect(pub).not.toHaveProperty('created_at')
    expect(pub).not.toHaveProperty('updated_at')
  })

  it('mantiene i campi pubblici (id, name, avatar, role, bio, color, is_*)', () => {
    const pub = toPublicMember(FULL_MEMBER)

    expect(pub).toMatchObject({
      id: 'm-1',
      name: 'Mario',
      avatar_emoji: '🍕',
      avatar_url: null,
      family_role: 'padre',
      bio: 'bio',
      is_admin: false,
      is_active: true,
      color: '#FF0000',
    })
  })
})

describe('toSelfMember', () => {
  it('include i flag di preferenza personale (regression notify_push)', () => {
    const self = toSelfMember(FULL_MEMBER)

    expect(self.notify_push).toBe(true)
    expect(self.notify_telegram).toBe(true)
    expect(self.telegram_chat_id).toBe('12345')
  })

  it('continua a strippare pin_hash e timestamps', () => {
    const self = toSelfMember(FULL_MEMBER)

    expect(self).not.toHaveProperty('pin_hash')
    expect(self).not.toHaveProperty('created_at')
    expect(self).not.toHaveProperty('updated_at')
  })

  it('mantiene tutti i campi pubblici', () => {
    const self = toSelfMember(FULL_MEMBER)

    expect(self).toMatchObject({
      id: 'm-1',
      name: 'Mario',
      avatar_emoji: '🍕',
      family_role: 'padre',
      is_admin: false,
      is_active: true,
      color: '#FF0000',
    })
  })

  it('preserva i valori falsy senza coercire (null su telegram_chat_id assente)', () => {
    // Edge case: un utente con notify_telegram=false e telegram_chat_id=null
    // (uscito da Telegram). Il client deve poter leggere il null per non
    // mostrare un valore stale nel campo.
    const noTelegram: Member = {
      ...FULL_MEMBER,
      notify_telegram: false,
      telegram_chat_id: null,
    }
    const self = toSelfMember(noTelegram)

    expect(self.notify_telegram).toBe(false)
    expect(self.telegram_chat_id).toBeNull()
    expect(self).toHaveProperty('telegram_chat_id')
  })
})
