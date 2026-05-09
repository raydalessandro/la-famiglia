import { OfflineOperation } from '../types/database'

// Constants
export const DB_NAME = 'famiglia_offline'
export const STORE_NAME = 'operations'
export const MAX_RETRIES = 3

// Helper: openDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('created_at', 'created_at', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Helper: getAPIEndpoint
function getAPIEndpoint(
  type: OfflineOperation['type'],
  payload: Record<string, unknown>
): { url: string; method: string; body: FormData | string | null } {
  switch (type) {
    case 'create_post': {
      const url = '/api/posts'
      const method = 'POST'
      if (payload.images) {
        const formData = new FormData()
        for (const [key, value] of Object.entries(payload)) {
          if (value instanceof File) {
            formData.append(key, value)
          } else if (Array.isArray(value)) {
            value.forEach((item) => {
              if (item instanceof File) {
                formData.append(key, item)
              } else {
                formData.append(key, String(item))
              }
            })
          } else if (value !== null && value !== undefined) {
            formData.append(key, String(value))
          }
        }
        return { url, method, body: formData }
      }
      return { url, method, body: JSON.stringify(payload) }
    }
    case 'toggle_like': {
      const url = `/api/posts/${payload.post_id}/like`
      return { url, method: 'POST', body: null }
    }
    case 'add_comment': {
      const url = `/api/posts/${payload.post_id}/comments`
      return { url, method: 'POST', body: JSON.stringify({ text: payload.text }) }
    }
  }
}

// Helper: updateOperationStatus
function updateOperationStatus(
  db: IDBDatabase,
  id: string,
  status: OfflineOperation['status']
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getRequest = store.get(id)
    getRequest.onsuccess = () => {
      const operation = getRequest.result as OfflineOperation
      if (!operation) {
        resolve()
        return
      }
      operation.status = status
      const putRequest = store.put(operation)
      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

// Helper: updateOperationRetries
function updateOperationRetries(
  db: IDBDatabase,
  id: string,
  retries: number,
  status: OfflineOperation['status']
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getRequest = store.get(id)
    getRequest.onsuccess = () => {
      const operation = getRequest.result as OfflineOperation
      if (!operation) {
        resolve()
        return
      }
      operation.retries = retries
      operation.status = status
      const putRequest = store.put(operation)
      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    }
    getRequest.onerror = () => reject(getRequest.error)
  })
}

// Helper: deleteOperation
function deleteOperation(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const deleteRequest = store.delete(id)
    deleteRequest.onsuccess = () => resolve()
    deleteRequest.onerror = () => reject(deleteRequest.error)
  })
}

// enqueueOperation
export async function enqueueOperation(
  type: OfflineOperation['type'],
  payload: Record<string, unknown>
): Promise<string> {
  const operation: OfflineOperation = {
    id: crypto.randomUUID(),
    type,
    payload,
    created_at: new Date().toISOString(),
    status: 'pending',
    retries: 0,
  }

  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const addRequest = store.add(operation)
    addRequest.onsuccess = () => resolve()
    addRequest.onerror = () => reject(addRequest.error)
  })

  try {
    const registration = await navigator.serviceWorker.ready
    await (registration as unknown as { sync: { register(tag: string): Promise<void> } }).sync.register(
      'sync-offline-queue'
    )
  } catch {
    // Background Sync not supported or service worker not available; silently continue
  }

  return operation.id
}

// processQueue
export async function processQueue(): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0

  const db = await openDB()

  const pendingOperations = await new Promise<OfflineOperation[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('status')
    const request = index.getAll(IDBKeyRange.only('pending'))
    request.onsuccess = () => resolve(request.result as OfflineOperation[])
    request.onerror = () => reject(request.error)
  })

  // Sort by created_at ascending
  pendingOperations.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  for (const operation of pendingOperations) {
    await updateOperationStatus(db, operation.id, 'syncing')

    const { url, method, body } = getAPIEndpoint(operation.type, operation.payload)

    try {
      const fetchOptions: RequestInit = { method }
      if (body !== null) {
        if (typeof body === 'string') {
          fetchOptions.headers = { 'Content-Type': 'application/json' }
          fetchOptions.body = body
        } else {
          // FormData — let browser set Content-Type with boundary
          fetchOptions.body = body
        }
      }

      const response = await fetch(url, fetchOptions)

      if (response.ok) {
        await deleteOperation(db, operation.id)
        synced++
      } else if (response.status >= 400 && response.status < 500) {
        // Client error — do not retry
        await deleteOperation(db, operation.id)
        failed++
      } else {
        // 5xx server error — increment retries
        const newRetries = operation.retries + 1
        if (newRetries >= MAX_RETRIES) {
          await updateOperationRetries(db, operation.id, newRetries, 'failed')
        } else {
          await updateOperationRetries(db, operation.id, newRetries, 'pending')
        }
      }
    } catch {
      // Network error — treat like 5xx
      const newRetries = operation.retries + 1
      if (newRetries >= MAX_RETRIES) {
        await updateOperationRetries(db, operation.id, newRetries, 'failed')
      } else {
        await updateOperationRetries(db, operation.id, newRetries, 'pending')
      }
    }
  }

  return { synced, failed }
}

// getQueueSize
export async function getQueueSize(): Promise<number> {
  const db = await openDB()
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('status')
    const request = index.count(IDBKeyRange.only('pending'))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// clearQueue
export async function clearQueue(): Promise<void> {
  const db = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
