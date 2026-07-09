// Bump this on every release that touches client-side code or the app shell —
// the activate handler purges any cache whose name doesn't match, which is
// what forces installed PWAs to pick up the new bundle.
const CACHE_NAME = 'la-famiglia-v6'

// Why no APP_SHELL precache:
// The previous version precached ['/feed', '/activities', '/calendar', ...]
// but those routes are auth-gated — the Next middleware 302-redirects them
// to /login for anonymous users. cache.addAll() rejects on any non-2xx
// response (including redirects under some user agents), which makes the
// whole install fail. Chromium tolerates the resulting "redundant" state,
// WebKit does not — Safari users ended up with a stale v3 SW serving
// against a v4 bundle, producing the blue-screen + frozen-pending-fetch
// symptoms we saw in production. The fetch handler below is already
// network-first with on-the-fly caching, so the runtime cache fills as the
// user navigates — pre-warming was never load-bearing.

// Install: skipWaiting only — no precache, so this never fails.
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GETs. Anything cross-origin (analytics, fonts
  // from CDNs, Supabase Realtime / Storage) goes straight to the network
  // — otherwise Safari has been seen to stall the request when the SW
  // tries to cache an opaque response.
  if (url.origin !== self.location.origin || request.method !== 'GET') {
    return
  }

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => caches.match(request))
    )
    return
  }

  // Cache-first for Next.js static assets
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Only cache full 200 responses. Redirects and partial responses
            // (range/206) must never enter the cache — otherwise the next
            // load reads back a broken entry and the page stalls.
            if (response.ok && response.status === 200 && response.type === 'basic') {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone).catch(() => {})
              })
            }
            return response
          })
      )
    )
    return
  }

  // Network-first for everything else (with cache fallback).
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone).catch(() => {})
          })
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})

// Background sync: process offline queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(processQueue())
  }
})

async function processQueue() {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    if (clients.length === 0) {
      // No open windows — throw so the browser retries the sync when a window opens
      throw new Error('No open windows to process queue')
    }
    // Ask the app window to run processQueue() (IndexedDB is accessible client-side only)
    clients.forEach((client) =>
      client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' })
    )
  } catch (err) {
    const clients = await self.clients.matchAll()
    clients.forEach((client) =>
      client.postMessage({ type: 'QUEUE_SYNCED', success: false, error: String(err) })
    )
    throw err // Let the browser retry
  }
}

// Push notifications.
//
// iOS nota bene: Safari REVOCA la subscription se il SW riceve push senza
// mostrare una notifica ("silent push" — tolleranza 3 strike). Quindi qui
// mostriamo SEMPRE qualcosa, anche con payload assente o malformato:
// meglio un banner generico che perdere la subscription in silenzio.
self.addEventListener('push', (event) => {
  let data = {}
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data = { title: 'La Famiglia', body: event.data.text() }
    }
  }

  // Il server manda `link`; versioni precedenti del SW leggevano solo
  // `url` (per questo i tap aprivano sempre /feed). Accettiamo entrambi.
  const title = data.title || 'La Famiglia'
  const body = data.body || ''
  const icon = data.icon || '/icons/icon-192x192.png'
  const badge = data.badge || '/icons/icon-192x192.png'
  const url = data.link || data.url || '/feed'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
    })
  )
})

// Notification click: open the URL from notification data
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/feed'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Riusa una finestra già aperta: confronto sul pathname perché
        // client.url è assoluto ('https://…/feed') mentre `url` è
        // relativo — il vecchio confronto stretto non matchava mai.
        for (const client of clientList) {
          let path = null
          try {
            path = new URL(client.url).pathname
          } catch {}
          if (path === url && 'focus' in client) {
            return client.focus()
          }
        }
        // Altrimenti naviga una finestra esistente (la PWA iOS ha sempre
        // al massimo una finestra) o aprine una nuova.
        const existing = clientList.find((c) => 'navigate' in c && 'focus' in c)
        if (existing) {
          return existing.focus().then((c) => (c && c.navigate ? c.navigate(url) : c))
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      })
  )
})

// Rotazione della subscription (iOS la ruota dopo restore da backup,
// update di sistema, ecc.). Senza questo handler l'endpoint registrato
// nel DB muore in silenzio e le push "smettono di arrivare" finché
// l'utente non ripassa da Impostazioni. Qui ci ri-iscriviamo con la
// stessa VAPID key e ri-registriamo l'endpoint al server (upsert
// idempotente, il cookie di sessione viaggia con la fetch same-origin).
self.addEventListener('pushsubscriptionchange', (event) => {
  const resubscribe = (async () => {
    let appServerKey =
      (event.oldSubscription && event.oldSubscription.options &&
        event.oldSubscription.options.applicationServerKey) || null

    if (!appServerKey) {
      const res = await fetch('/api/push/public-key')
      if (!res.ok) return
      const json = await res.json()
      if (!json || !json.data || !json.data.key) return
      appServerKey = urlBase64ToUint8Array(json.data.key)
    }

    const sub = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    })
    const body = sub.toJSON()
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: body.endpoint, keys: body.keys }),
    })
  })().catch(() => {})

  event.waitUntil(resubscribe)
})

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}
