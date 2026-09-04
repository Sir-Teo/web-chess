import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLibraryGame } from './gameLibrary'
import {
  LIBRARY_FALLBACK_STORAGE_KEY,
  libraryStorageIsDurable,
  loadLibraryGames,
  resetLibraryStorageState,
  saveLibraryGames,
} from './gameLibraryStorage'

const PGN = '[White "A"]\n[Black "B"]\n\n1. e4 e5 *'

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function restore(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else Reflect.deleteProperty(globalThis, name)
}

/** Just enough of the Storage interface for the fallback path. */
function stubLocalStorage(overrides: Partial<Storage> = {}) {
  const entries = new Map<string, string>()
  const storage: Storage = {
    get length() { return entries.size },
    clear: () => entries.clear(),
    key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, String(value)) },
    removeItem: key => { entries.delete(key) },
    ...overrides,
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  return { storage, entries }
}

beforeEach(() => {
  resetLibraryStorageState()
  // No IndexedDB in the test environment, so these exercise the fallback.
  Reflect.deleteProperty(globalThis, 'indexedDB')
})

afterEach(() => {
  restore('indexedDB', originalIndexedDb)
  restore('localStorage', originalLocalStorage)
  resetLibraryStorageState()
})

describe('falling back to localStorage', () => {
  it('round-trips games through the fallback key', async () => {
    const { entries } = stubLocalStorage()
    await saveLibraryGames([createLibraryGame('Saved', PGN, 1)])

    expect(entries.has(LIBRARY_FALLBACK_STORAGE_KEY)).toBe(true)
    const loaded = await loadLibraryGames()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ name: 'Saved', moveCount: 2 })
  })

  it('reads an empty library when nothing has been saved', async () => {
    stubLocalStorage()
    expect(await loadLibraryGames()).toEqual([])
  })

  it('reads corrupted storage as empty rather than throwing', async () => {
    const { storage } = stubLocalStorage()
    storage.setItem(LIBRARY_FALLBACK_STORAGE_KEY, '{not json')
    expect(await loadLibraryGames()).toEqual([])

    storage.setItem(LIBRARY_FALLBACK_STORAGE_KEY, JSON.stringify({ not: 'an array' }))
    expect(await loadLibraryGames()).toEqual([])
  })

  it('drops entries that no longer normalize', async () => {
    const { storage } = stubLocalStorage()
    storage.setItem(LIBRARY_FALLBACK_STORAGE_KEY, JSON.stringify([{ id: 'a', pgn: PGN }, { id: 'b' }, null]))
    expect(await loadLibraryGames()).toHaveLength(1)
  })
})

describe('when storage will not take a write', () => {
  it('keeps the library working in memory for the session', async () => {
    stubLocalStorage({
      setItem: () => { throw new Error('QuotaExceededError') },
    })

    await saveLibraryGames([createLibraryGame('Unwritable', PGN, 1)])
    const loaded = await loadLibraryGames()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Unwritable')
  })

  it('works with no storage at all', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage')

    expect(await loadLibraryGames()).toEqual([])
    await saveLibraryGames([createLibraryGame('Memory only', PGN, 1)])
    expect((await loadLibraryGames())[0].name).toBe('Memory only')
  })

  it('reads an empty library after the session state is reset', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    await saveLibraryGames([createLibraryGame('Gone', PGN, 1)])
    resetLibraryStorageState()
    expect(await loadLibraryGames()).toEqual([])
  })
})

describe('what gets written', () => {
  it('normalizes before storing, so a bad record never lands', async () => {
    const { storage } = stubLocalStorage()
    await saveLibraryGames([
      createLibraryGame('Fine', PGN, 1),
      { id: 'broken', pgn: '' } as never,
    ])

    const stored = JSON.parse(storage.getItem(LIBRARY_FALLBACK_STORAGE_KEY) as string)
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Fine')
  })

  it('replaces the previous contents rather than appending', async () => {
    stubLocalStorage()
    await saveLibraryGames([createLibraryGame('First', PGN, 1)])
    await saveLibraryGames([createLibraryGame('Second', PGN, 2)])

    const loaded = await loadLibraryGames()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('Second')
  })
})

describe('whether the library will survive a reload', () => {
  afterEach(() => {
    resetLibraryStorageState()
    vi.unstubAllGlobals()
  })

  function stub({ idb, local }: { idb?: unknown; local?: unknown }) {
    vi.stubGlobal('indexedDB', idb)
    vi.stubGlobal('window', { localStorage: local })
    vi.stubGlobal('localStorage', local)
  }

  const workingStorage = () => {
    const entries = new Map<string, string>()
    return {
      getItem: (k: string) => entries.get(k) ?? null,
      setItem: (k: string, v: string) => { entries.set(k, v) },
      removeItem: (k: string) => { entries.delete(k) },
      clear: () => entries.clear(), key: () => null, length: 0,
    } as unknown as Storage
  }

  const refusingStorage = () => ({
    getItem: () => null,
    setItem: () => { throw new Error('blocked') },
    removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
  } as unknown as Storage)

  it('is durable when IndexedDB is there', () => {
    stub({ idb: {}, local: refusingStorage() })
    expect(libraryStorageIsDurable()).toBe(true)
  })

  it('is durable when only localStorage is there and it takes a write', () => {
    stub({ idb: undefined, local: workingStorage() })
    expect(libraryStorageIsDurable()).toBe(true)
  })

  /**
   * The case that produced the lie: a `localStorage` that exists and refuses
   * every write. Only trying one tells them apart.
   */
  it('is not durable when localStorage exists but refuses writes', () => {
    stub({ idb: undefined, local: refusingStorage() })
    expect(libraryStorageIsDurable()).toBe(false)
  })

  it('is not durable when there is no store at all', () => {
    stub({ idb: undefined, local: undefined })
    expect(libraryStorageIsDurable()).toBe(false)
  })

  it('leaves nothing behind when it probes', () => {
    const storage = workingStorage()
    stub({ idb: undefined, local: storage })
    libraryStorageIsDurable()
    expect(storage.length).toBe(0)
    expect(storage.getItem(`${LIBRARY_FALLBACK_STORAGE_KEY}:probe`)).toBeNull()
  })

  it('reports honestly once a save has already fallen through to memory', async () => {
    stub({ idb: undefined, local: refusingStorage() })
    await saveLibraryGames([createLibraryGame('kept for now', '1. e4 *', 1)])
    expect(libraryStorageIsDurable()).toBe(false)
  })
})

/**
 * What happens to the fallback once IndexedDB starts working again.
 *
 * `indexedDbFailed` is session state, so a browser that refuses IndexedDB for
 * one session and allows it the next is the ordinary case, not an exotic one:
 * quota pressure, a blocked upgrade, an eviction under storage pressure. The
 * writer always stores the whole library at once, so whenever the fallback
 * holds anything it holds a *complete* snapshot, written at a moment when
 * IndexedDB had refused -- which makes it strictly newer than whatever
 * IndexedDB still has.
 *
 * These tests use a fake IndexedDB rather than deleting it, which is what the
 * rest of this file does and why none of these paths had ever run.
 */
describe('recovering games the fallback is still holding', () => {
  type Row = Record<string, unknown>

  /** Just enough of IndexedDB for open/getAll/clear/put, answering off-thread. */
  function stubIndexedDb(rows: Row[] = []) {
    const store = new Map<string, Row>()
    for (const row of rows) store.set(String(row.id), row)

    const later = (run: () => void) => { setTimeout(run, 0) }

    const makeRequest = <T>(resolveWith: () => T) => {
      const request = { onsuccess: null, onerror: null, result: undefined, error: null } as unknown as
        IDBRequest<T> & { onsuccess: (() => void) | null }
      later(() => {
        ;(request as { result: T }).result = resolveWith()
        request.onsuccess?.()
      })
      return request
    }

    const objectStore = {
      getAll: () => makeRequest(() => [...store.values()]),
      put: (row: Row) => { store.set(String(row.id), row) },
      clear: () => { store.clear() },
      createIndex: () => {},
    }

    const db = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => objectStore,
      transaction: () => {
        const tx = { objectStore: () => objectStore, oncomplete: null, onerror: null, onabort: null, error: null }
        later(() => { (tx.oncomplete as (() => void) | null)?.() })
        return tx as unknown as IDBTransaction
      },
      close: () => {},
    }

    const factory = {
      open: () => makeRequest(() => db as unknown as IDBDatabase),
    }
    Object.defineProperty(globalThis, 'indexedDB', { value: factory, configurable: true, writable: true })
    return { store }
  }

  it('hands back the stranded snapshot instead of the emptier store', async () => {
    // Session one: IndexedDB is gone, so the save lands in localStorage.
    const { entries } = stubLocalStorage()
    await saveLibraryGames([createLibraryGame('Rescued', PGN, 1)])
    expect(entries.get(LIBRARY_FALLBACK_STORAGE_KEY)).toBeTruthy()

    // Session two: a fresh module, and IndexedDB works again -- but is empty,
    // because the write that mattered never reached it.
    resetLibraryStorageState()
    stubIndexedDb([])

    const loaded = await loadLibraryGames()
    expect(loaded.map(game => game.name)).toEqual(['Rescued'])
  })

  it('moves the rescued snapshot into IndexedDB and lets go of the fallback', async () => {
    const { entries } = stubLocalStorage()
    await saveLibraryGames([createLibraryGame('Rescued', PGN, 1)])

    resetLibraryStorageState()
    const { store } = stubIndexedDb([])
    await loadLibraryGames()

    // Carried across, so the next load needs no rescue...
    expect([...store.values()].map(row => (row as { name: string }).name)).toEqual(['Rescued'])
    // ...and released, or a stale snapshot would shadow every later save.
    expect(entries.get(LIBRARY_FALLBACK_STORAGE_KEY)).toBeFalsy()
  })

  /**
   * The other direction, and the reason the rescue compares rather than
   * assumes. If `clearFallback` ever fails -- a store that reads but refuses
   * writes -- the leftover snapshot would otherwise win every later load and
   * roll the library back to whatever it held on the day IndexedDB broke.
   */
  it('ignores a fallback the store has since overtaken, and lets go of it', async () => {
    const { entries } = stubLocalStorage()
    await saveLibraryGames([createLibraryGame('Stale', PGN, 1)])

    resetLibraryStorageState()
    stubIndexedDb([createLibraryGame('Newer', PGN, 5) as unknown as Row])

    const loaded = await loadLibraryGames()
    expect(loaded.map(game => game.name)).toEqual(['Newer'])
    expect(entries.get(LIBRARY_FALLBACK_STORAGE_KEY)).toBeFalsy()
  })

  it('leaves a healthy store alone when the fallback is empty', async () => {
    stubLocalStorage()
    resetLibraryStorageState()
    stubIndexedDb([createLibraryGame('Already there', PGN, 1) as unknown as Row])

    const loaded = await loadLibraryGames()
    expect(loaded.map(game => game.name)).toEqual(['Already there'])
  })
})
