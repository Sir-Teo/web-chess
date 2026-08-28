import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLibraryGame } from './gameLibrary'
import {
  LIBRARY_FALLBACK_STORAGE_KEY,
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
