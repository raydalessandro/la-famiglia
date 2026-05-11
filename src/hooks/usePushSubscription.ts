'use client'

import { useCallback, useEffect, useState } from 'react'

type SupportStatus =
  | 'supported'              // pieno supporto + (su iOS) PWA installata in standalone
  | 'needs-pwa-install'      // iOS: la pagina è aperta in Safari, non in standalone
  | 'unsupported'            // browser senza ServiceWorker / PushManager / Notification API

type PermissionState = 'default' | 'granted' | 'denied'

type UsePushSubscriptionReturn = {
  /** Stato del supporto al push sul device corrente. */
  support: SupportStatus
  /** Permission corrente del browser. */
  permission: PermissionState
  /** Vero se c'è una subscription attiva nel browser per questo device. */
  isSubscribed: boolean
  /** True mentre enable() / disable() sono in volo. */
  isPending: boolean
  /** Attiva le push: richiede permesso, crea subscription, la registra a server. */
  enable: () => Promise<{ ok: true } | { ok: false; reason: string }>
  /** Disattiva le push: unsubscribe browser + DELETE server. */
  disable: () => Promise<{ ok: true } | { ok: false; reason: string }>
}

/**
 * Encoding helper: VAPID public key arriva come base64-url string, ma
 * `PushManager.subscribe` vuole un `Uint8Array`. Conversione standard
 * documentata da MDN.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

/**
 * Detect iOS Safari (incluso iPadOS che mente sull'userAgent). Serve per
 * sapere se richiedere lo standalone PWA prima di attivare le push:
 * Safari iOS supporta le Web Push solo per PWA aggiunte alla home schermata
 * (iOS 16.4+).
 */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS recenti si dichiarano "Macintosh" ma supportano touch.
  const iPadOnMac =
    ua.includes('Macintosh') && 'ontouchend' in (globalThis.document ?? {})
  return iOSDevice || iPadOnMac
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  // iOS expone navigator.standalone, gli altri usano display-mode: standalone.
  const iosStandalone =
    'standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone
  const matchesStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return Boolean(iosStandalone || matchesStandalone)
}

function detectSupport(): SupportStatus {
  if (typeof window === 'undefined') return 'unsupported'
  const hasSW = 'serviceWorker' in navigator
  const hasPush = 'PushManager' in window
  const hasNotif = 'Notification' in window
  if (!hasSW || !hasPush || !hasNotif) return 'unsupported'
  // iOS Safari supporta push solo se la PWA è in modalità standalone.
  if (isIos() && !isStandalonePwa()) return 'needs-pwa-install'
  return 'supported'
}

/**
 * Gestisce il ciclo di vita della Web Push subscription lato client:
 * permesso, registrazione PushManager, sync con il server.
 *
 * Backend già presente: src/lib/notifications.ts + tabella
 * push_subscriptions + API in src/app/api/push/. Questo hook è
 * l'ultimo pezzo del filo.
 */
export function usePushSubscription(): UsePushSubscriptionReturn {
  const [support, setSupport] = useState<SupportStatus>('unsupported')
  const [permission, setPermission] = useState<PermissionState>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isPending, setIsPending] = useState(false)

  // Init dopo mount perché tutto è browser-only.
  useEffect(() => {
    setSupport(detectSupport())
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission as PermissionState)
    }
  }, [])

  // Probe: c'è già una subscription registrata per questo device?
  useEffect(() => {
    if (support !== 'supported') return
    let cancelled = false
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setIsSubscribed(!!sub)
      })
      .catch(() => {
        if (!cancelled) setIsSubscribed(false)
      })
    return () => {
      cancelled = true
    }
  }, [support])

  const enable = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    if (support !== 'supported') {
      return {
        ok: false,
        reason:
          support === 'needs-pwa-install'
            ? 'Su iPhone, prima aggiungi l\'app alla schermata Home: tocca Condividi, poi "Aggiungi a Home".'
            : 'Questo dispositivo non supporta le notifiche push.',
      }
    }

    setIsPending(true)
    try {
      // 1. Permesso. Notification.requestPermission risolve immediato
      //    se già granted/denied — è solo prompt se default.
      const perm = await Notification.requestPermission()
      setPermission(perm as PermissionState)
      if (perm !== 'granted') {
        return {
          ok: false,
          reason:
            perm === 'denied'
              ? 'Le notifiche sono bloccate. Attivale dalle impostazioni del dispositivo.'
              : 'Permesso non concesso.',
        }
      }

      // 2. VAPID public key dal server.
      const keyRes = await fetch('/api/push/public-key')
      if (!keyRes.ok) return { ok: false, reason: 'Notifiche non configurate sul server.' }
      const keyJson = (await keyRes.json()) as { data: { key: string } | null; error: string | null }
      if (!keyJson.data?.key) {
        return { ok: false, reason: keyJson.error ?? 'VAPID key mancante.' }
      }

      // 3. Subscribe al PushManager. userVisibleOnly:true è obbligatorio
      //    su Chromium e raccomandato ovunque — evita push silenziose.
      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyJson.data.key),
      })

      // 4. Push subscription al server: endpoint + keys come JSON.
      const json = subscription.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      })
      if (!res.ok) {
        // Rollback browser-side per evitare di tenere una subscription
        // di cui il server non sa nulla.
        await subscription.unsubscribe().catch(() => {})
        const errBody = await res.json().catch(() => ({ error: 'Errore registrazione.' }))
        return { ok: false, reason: errBody.error ?? 'Errore registrazione.' }
      }

      setIsSubscribed(true)
      return { ok: true }
    } catch (err) {
      console.error('[usePushSubscription] enable failed:', err)
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'Errore inatteso.',
      }
    } finally {
      setIsPending(false)
    }
  }, [support])

  const disable = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    if (support !== 'supported') {
      // Nulla da disattivare se il supporto non c'è — ritorna ok per
      // semplificare la UI (toggle off → off).
      return { ok: true }
    }
    setIsPending(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.getSubscription()
      if (!subscription) {
        setIsSubscribed(false)
        return { ok: true }
      }
      const endpoint = subscription.endpoint
      // Unsubscribe browser-side prima, poi server: se il server fallisce
      // restiamo comunque senza push attive sul device, che è il behavior
      // atteso quando l'utente clicca "off".
      await subscription.unsubscribe().catch(() => {})
      setIsSubscribed(false)
      const res = await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
      if (!res.ok) {
        // Soft-fail: il server potrebbe avere la subscription ancora,
        // ma il client l'ha già rimossa. Il backend la pulirà al primo
        // tentativo di push (410 Gone → cleanup automatico, vedi
        // src/lib/notifications.ts:96).
        return { ok: true }
      }
      return { ok: true }
    } catch (err) {
      console.error('[usePushSubscription] disable failed:', err)
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'Errore inatteso.',
      }
    } finally {
      setIsPending(false)
    }
  }, [support])

  return { support, permission, isSubscribed, isPending, enable, disable }
}
