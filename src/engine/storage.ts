/**
 * One place where browser storage is allowed to fail.
 *
 * Ported from web-katrain's `utils/storage.ts`. Every reader here previously
 * carried its own `try`/`catch`, which works but has to be remembered: a new
 * reader that forgets one throws at startup, and private mode, a blocked-cookie
 * setting or a quota error are all ordinary conditions rather than edge cases.
 *
 * Guarding once at the boundary is the same shape as `reportedCentipawnLoss` on
 * the analysis side — downstream code stops needing to know the hazard exists.
 */

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Null rather than a throw when storage is absent or access is denied. */
export function getLocalStorage(): KeyValueStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    // globalThis covers a worker or a test environment with no window.
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

/** Per-tab storage can be restricted independently of local storage. */
export function getSessionStorage(): KeyValueStorage | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null
  } catch {
    return null
  }
}

export function readStorage(key: string, storage: KeyValueStorage | null = getLocalStorage()): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** False when the write did not happen, so a caller can say so if it matters. */
export function writeStorage(key: string, value: string, storage: KeyValueStorage | null = getLocalStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function removeStorage(key: string, storage: KeyValueStorage | null = getLocalStorage()): boolean {
  try {
    if (!storage) return false
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
