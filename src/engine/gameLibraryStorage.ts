/**
 * Where saved games live. IndexedDB when the browser has it, localStorage when
 * it does not, and memory when neither works — so the library still functions
 * for one session in a locked-down or private context rather than throwing.
 *
 * Follows the arrangement in web-katrain's library.ts: one writer, normalized
 * on the way in and on the way out, and a flag so a failed read does not keep
 * retrying IndexedDB for the rest of the session.
 */

import { type LibraryGame, normalizeLibraryGames } from './gameLibrary'

const DB_NAME = 'web-chess-library'
const DB_VERSION = 1
const GAME_STORE = 'games'

export const LIBRARY_FALLBACK_STORAGE_KEY = 'webchess:library:v1'

function getIndexedDb(): IDBFactory | null {
  try {
    return typeof globalThis.indexedDB === 'undefined' ? null : globalThis.indexedDB
  } catch {
    return null
  }
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const indexedDb = getIndexedDb()
    if (!indexedDb) {
      reject(new Error('IndexedDB is unavailable'))
      return
    }
    const request = indexedDb.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(GAME_STORE)) {
        const store = db.createObjectStore(GAME_STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

async function loadFromIndexedDb(): Promise<LibraryGame[]> {
  const db = await openLibraryDb()
  try {
    const tx = db.transaction(GAME_STORE, 'readonly')
    return normalizeLibraryGames(await requestToPromise(tx.objectStore(GAME_STORE).getAll()))
  } finally {
    db.close()
  }
}

async function saveToIndexedDb(games: LibraryGame[]): Promise<void> {
  const db = await openLibraryDb()
  try {
    const tx = db.transaction(GAME_STORE, 'readwrite')
    const store = tx.objectStore(GAME_STORE)
    store.clear()
    for (const game of games) store.put(game)
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

// Last resort when neither IndexedDB nor localStorage will take a write, so the
// library still behaves normally until the tab closes.
let memoryGames: LibraryGame[] | null = null

function loadFallback(): LibraryGame[] {
  if (memoryGames) return memoryGames
  const storage = getLocalStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(LIBRARY_FALLBACK_STORAGE_KEY)
    return raw ? normalizeLibraryGames(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function saveFallback(games: LibraryGame[]): void {
  memoryGames = games
  const storage = getLocalStorage()
  if (!storage) return
  try {
    storage.setItem(LIBRARY_FALLBACK_STORAGE_KEY, JSON.stringify(games))
    memoryGames = null
  } catch {
    // Quota or a blocked store: memoryGames keeps this session working.
  }
}

let indexedDbFailed = false

/** Exposed so tests can start from a known state. */
export function resetLibraryStorageState(): void {
  memoryGames = null
  indexedDbFailed = false
}

export async function loadLibraryGames(): Promise<LibraryGame[]> {
  if (!getIndexedDb() || indexedDbFailed) return loadFallback()
  try {
    const games = await loadFromIndexedDb()
    indexedDbFailed = false
    return games
  } catch {
    indexedDbFailed = true
    return loadFallback()
  }
}

export async function saveLibraryGames(games: LibraryGame[]): Promise<void> {
  const normalized = normalizeLibraryGames(games)
  if (!getIndexedDb() || indexedDbFailed) {
    saveFallback(normalized)
    return
  }
  try {
    await saveToIndexedDb(normalized)
  } catch {
    indexedDbFailed = true
    saveFallback(normalized)
  }
}
