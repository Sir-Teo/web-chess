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
