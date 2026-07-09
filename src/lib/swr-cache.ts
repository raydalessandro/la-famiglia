'use client'

/**
 * Cache client stale-while-revalidate (Fase A2 del piano di affinamento).
 *
 * Modello: due layer.
 *  - Map in-memory (module-level) — sopravvive alle navigazioni SPA.
 *  - localStorage — sopravvive a reload e cold start della PWA. È qui
 *    che nasce il "feel Instagram": riapri l'app e il feed è GIÀ lì,
 *    mentre la revalidation gira in background.
 *
 * Regole d'uso (vedi specs/AFFINAMENTO.md § A2):
 *  1. Gli hook leggono la cache SOLO come stato iniziale (niente
 *     skeleton se c'è) e fetchano SEMPRE in background al mount: la
 *     cache non salta mai una revalidation, quindi non può servire dati
 *     vecchi oltre la durata del fetch. Niente TTL — a scala famiglia
 *     il costo di revalidare sempre è trascurabile e il modello resta
 *     semplice.
 *  2. Le chiavi DEVONO essere scoped per member id (campi come
 *     liked_by_me dipendono dal viewer, e su un device condiviso due
 *     membri non devono vedersi i dati a vicenda). `cacheKey` lo
 *     impone strutturalmente.
 *  3. `clearSwrCache()` va chiamata a ogni login e logout.
 */

const PREFIX = 'swr:v1:'

const memory = new Map<string, unknown>()

function storage(): Storage | null {
  // SSR-safe + Safari private mode può lanciare al solo accesso.
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Costruisce una chiave namespace-ata per member. `memberId` null/undefined
 * (auth non disponibile, es. test senza provider) → null = cache disabilitata:
 * i call-site passano la chiave nulla e read/write diventano no-op.
 */
export function cacheKey(memberId: string | null | undefined, name: string): string | null {
  if (!memberId) return null
  return `${memberId}:${name}`
}

export function readCache<T>(key: string | null): T | null {
  if (!key) return null
  if (memory.has(key)) return memory.get(key) as T

  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + key)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as T
    // Promozione al layer memory: le letture successive nello stesso
    // runtime non ripagano il parse.
    memory.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

export function writeCache<T>(key: string | null, data: T): void {
  if (!key) return
  memory.set(key, data)

  const store = storage()
  if (!store) return
  try {
    store.setItem(PREFIX + key, JSON.stringify(data))
  } catch {
    // Quota piena (foto base64 non ci finiscono, ma difendiamoci):
    // svuota le chiavi swr e riprova una volta. Se fallisce ancora,
    // pazienza — la cache è un'ottimizzazione, mai un requisito.
    try {
      clearPersistedSwrKeys(store)
      store.setItem(PREFIX + key, JSON.stringify(data))
    } catch {
      // no-op
    }
  }
}

/** Svuota TUTTA la cache swr (memory + localStorage). Da chiamare a login/logout. */
export function clearSwrCache(): void {
  memory.clear()
  const store = storage()
  if (!store) return
  try {
    clearPersistedSwrKeys(store)
  } catch {
    // no-op
  }
}

function clearPersistedSwrKeys(store: Storage): void {
  const toRemove: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k && k.startsWith(PREFIX)) toRemove.push(k)
  }
  for (const k of toRemove) store.removeItem(k)
}
