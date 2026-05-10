// Bump this on every release that touches client-side code or the app shell —
// the activate handler purges any cache whose name doesn't match, which is
// what forces installed PWAs to pick up the new bundle.
const CACHE_NAME = 'la-famiglia-v3'
const APP_SHELL = ['/', '/feed', '/activities', '/calendar', '/chat', '/tasks']

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
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
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            return response
          })
      )
    )
    return
  }

  // Network-first for everything else (with cache fallback)
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
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

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'La Famiglia', body: event.data.text(), url: '/feed' }
  }

  const { title = 'La Famiglia', body = '', icon = '/icons/icon-192x192.png', badge = '/icons/icon-192x192.png', url = '/feed' } = data

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
        // Focus existing window if already open at that URL
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      })
  )
})
