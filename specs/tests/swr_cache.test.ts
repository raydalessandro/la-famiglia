/**
 * swr-cache — unit tests (Fase A2 del piano di affinamento).
 *
 * Il contratto della cache stale-while-revalidate:
 *  - chiavi SEMPRE scoped per member (cacheKey impone il namespace);
 *    memberId assente → chiave null → read/write no-op (cache disabilitata)
 *  - write scrive su memory + localStorage; read legge memory-first e
 *    promuove dal localStorage
 *  - clearSwrCache svuota entrambi i layer ma NON tocca chiavi estranee
 *  - JSON corrotto in localStorage → read ritorna null (mai throw)
 *  - quota piena → la write degrada senza lanciare
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheKey, readCache, writeCache, clearSwrCache } from '@/lib/swr-cache'

beforeEach(() => {
  clearSwrCache()
  window.localStorage.clear()
})

describe('cacheKey', () => {
  it('namespace-a la chiave con il member id', () => {
    expect(cacheKey('member-1', 'posts:feed')).toBe('member-1:posts:feed')
  })

  it('ritorna null senza member id (cache disabilitata)', () => {
    expect(cacheKey(null, 'posts:feed')).toBeNull()
    expect(cacheKey(undefined, 'posts:feed')).toBeNull()
  })
})

describe('readCache / writeCache', () => {
  it('round-trip: write poi read ritorna i dati', () => {
    const key = cacheKey('m1', 'members')
    writeCache(key, [{ id: 'a', name: 'Giovanna' }])
    expect(readCache(key)).toEqual([{ id: 'a', name: 'Giovanna' }])
  })

  it('chiave null → no-op (nessun throw, read null)', () => {
    expect(() => writeCache(null, { x: 1 })).not.toThrow()
    expect(readCache(null)).toBeNull()
  })

  it('read di chiave mai scritta → null', () => {
    expect(readCache(cacheKey('m1', 'mai-scritta'))).toBeNull()
  })

  it('persiste su localStorage (sopravvive alla perdita del layer memory)', () => {
    const key = cacheKey('m1', 'posts:feed')
    writeCache(key, { posts: [1, 2, 3] })
    // Simula un cold start: il layer memory di un nuovo runtime è vuoto.
    // clearSwrCache svuoterebbe anche localStorage, quindi qui ricreiamo
    // la condizione leggendo direttamente la persistenza.
    const raw = window.localStorage.getItem('swr:v1:m1:posts:feed')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ posts: [1, 2, 3] })
  })

  it('le chiavi di due member NON collidono', () => {
    writeCache(cacheKey('m1', 'members'), ['dati-m1'])
    writeCache(cacheKey('m2', 'members'), ['dati-m2'])
    expect(readCache(cacheKey('m1', 'members'))).toEqual(['dati-m1'])
    expect(readCache(cacheKey('m2', 'members'))).toEqual(['dati-m2'])
  })

  it('JSON corrotto in localStorage → null, mai throw', () => {
    window.localStorage.setItem('swr:v1:m1:rotto', '{non-json!!!')
    expect(readCache(cacheKey('m1', 'rotto'))).toBeNull()
  })

  it('quota piena → write degrada senza lanciare', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    try {
      expect(() => writeCache(cacheKey('m1', 'grosso'), { x: 1 })).not.toThrow()
      // Il layer memory funziona comunque.
      expect(readCache(cacheKey('m1', 'grosso'))).toEqual({ x: 1 })
    } finally {
      spy.mockRestore()
    }
  })
})

describe('clearSwrCache', () => {
  it('svuota memory e localStorage', () => {
    const key = cacheKey('m1', 'members')
    writeCache(key, ['x'])
    clearSwrCache()
    expect(readCache(key)).toBeNull()
    expect(window.localStorage.getItem('swr:v1:m1:members')).toBeNull()
  })

  it('NON tocca chiavi non-swr (es. il flag debug di Eruda)', () => {
    window.localStorage.setItem('eruda-debug', '1')
    writeCache(cacheKey('m1', 'members'), ['x'])
    clearSwrCache()
    expect(window.localStorage.getItem('eruda-debug')).toBe('1')
  })
})
