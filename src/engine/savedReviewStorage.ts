import { MAX_SAVED_REVIEWS, savedReviewSummary, readSavedReview, type SavedReview, type SavedReviewSummary } from './savedReviews'

const DB_NAME = 'web-chess-reviews'
const STORE = 'runs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      blocked = true
      reject(new Error('Saved reviews are busy in another tab. Close that tab and try again.'))
    }
  })
}

/** Resolve only after commit, including writes queued inside request callbacks. */
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, setResult: (value: T) => void) => void): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      let result: T
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(tx.error ?? new Error('The saved-review transaction was cancelled.'))
      tx.onerror = () => reject(tx.error ?? new Error('The browser could not store this review.'))
      action(tx.objectStore(STORE), value => { result = value })
    })
  } finally { db.close() }
}

export async function listSavedReviews(): Promise<SavedReviewSummary[]> {
  return transaction('readonly', (store, setResult) => {
    const summaries: SavedReviewSummary[] = []
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) { setResult(summaries.sort((a, b) => b.finishedAt - a.finishedAt || a.id.localeCompare(b.id))); return }
      const summary = savedReviewSummary(cursor.value)
      if (summary) summaries.push(summary)
      cursor.continue()
    }
  })
}

/** One readonly transaction takes a consistent snapshot for a portable backup. */
export async function snapshotSavedReviews(): Promise<unknown[]> {
  return transaction('readonly', (store, setResult) => {
    const request = store.getAll(undefined, MAX_SAVED_REVIEWS + 1)
    request.onsuccess = () => setResult(request.result)
  })
}

export async function loadSavedReview(id: string): Promise<SavedReview> {
  const raw = await transaction<unknown>('readonly', (store, setResult) => {
    const request = store.get(id)
    request.onsuccess = () => setResult(request.result)
  })
  const saved = readSavedReview(raw)
  if (!saved) throw new Error('This saved review is missing or unreadable. The current board has been kept.')
  return saved
}

export async function saveReview(saved: SavedReview): Promise<void> {
  // Count and add in one transaction: concurrent tabs cannot evict or overwrite runs.
  const added = await transaction<boolean>('readwrite', (store, setResult) => {
    const count = store.count()
    count.onsuccess = () => {
      if (count.result >= MAX_SAVED_REVIEWS) { setResult(false); return }
      store.add(saved)
      setResult(true)
    }
  })
  if (!added) throw new Error(`Saved reviews is full (${MAX_SAVED_REVIEWS}). Delete a saved review before saving another.`)
}

export async function deleteSavedReview(id: string): Promise<void> {
  await transaction<void>('readwrite', store => { store.delete(id) })
}
