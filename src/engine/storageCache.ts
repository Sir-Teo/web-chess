/**
 * The localStorage half of a response cache, shared by the three services that
 * keep one — cloud evaluations, the tablebase and the opening explorer. Each
 * had its own copy of this, identical down to the pruning comparator; only the
 * key, the entry limit and the payload parser ever differed.
 *
 * The in-memory half stays with each service, bounded by `withBoundedMapEntry`.
 */

export type StorageCacheEntry<T> = {
  expiresAt: number
  payload: T | null
}

type Options<T> = {
  storageKey: string
  entryLimit: number
  /** Rejects anything that is not a well-formed payload, so a corrupted or
   *  outdated cache reads as a miss rather than reaching the UI. */
  parsePayload: (raw: unknown) => T | null
}

export function createStorageCache<T>({ storageKey, entryLimit, parsePayload }: Options<T>) {
  // The parsed form of whatever was last read or written, so repeated reads in
  // one session do not re-parse the whole cache.
  let cachedRaw: string | null | undefined
  let snapshot: Record<string, unknown> = {}

  const parseEntry = (raw: unknown): StorageCacheEntry<T> | null => {
    if (!raw || typeof raw !== 'object') return null
    const entry = raw as Record<string, unknown>
    const expiresAt = entry.expiresAt
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
    if (entry.payload === null) return { expiresAt, payload: null }
    const payload = parsePayload(entry.payload)
    return payload ? { expiresAt, payload } : null
  }

  const readAll = (): Record<string, unknown> => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw === cachedRaw) return snapshot
      cachedRaw = raw
      const parsed = raw ? JSON.parse(raw) : null
      snapshot = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
      return snapshot
    } catch {
      cachedRaw = undefined
      snapshot = {}
      return {}
    }
  }

  const writeAll = (cache: Record<string, StorageCacheEntry<T>>) => {
    if (typeof window === 'undefined') return
    try {
      const serialized = JSON.stringify(cache)
      window.localStorage.setItem(storageKey, serialized)
      cachedRaw = serialized
      snapshot = cache
    } catch {
      // Persistence is optional; ignore private-mode and quota failures.
    }
  }

  return {
    /** The stored entry for `key`, or null if absent, expired-looking or malformed. */
    read(key: string): StorageCacheEntry<T> | null {
      return parseEntry(readAll()[key])
    },

    /** Stores `entry`, then drops expired entries and keeps the freshest `entryLimit`. */
    write(key: string, entry: StorageCacheEntry<T>) {
      const now = Date.now()
      const stored: Record<string, unknown> = { ...readAll(), [key]: entry }

      writeAll(Object.fromEntries(
        Object.entries(stored)
          .map(([entryKey, value]) => [entryKey, parseEntry(value)] as const)
          .filter((item): item is readonly [string, StorageCacheEntry<T>] =>
            item[1] !== null && item[1].expiresAt > now)
          .sort(([, a], [, b]) => b.expiresAt - a.expiresAt)
          .slice(0, entryLimit),
      ))
    },
  }
}
