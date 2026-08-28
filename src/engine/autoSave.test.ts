import { describe, expect, it } from 'vitest'
import {
  AUTO_SAVED_GAME_KEY,
  AUTO_SAVE_MAX_BYTES,
  clearAutoSavedGame,
  readAutoSavedGame,
  writeAutoSavedGame,
} from './autoSave'

const PGN = '[Event "Casual"]\n\n1. e4 e5 2. Nf3 *'

/** Just the three methods autoSave reaches for. */
function stubStorage(overrides: Partial<Storage> = {}) {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, String(value)) },
    removeItem: (key: string) => { entries.delete(key) },
    ...overrides,
  }
  return { storage, entries }
}

describe('writing and reading back', () => {
  it('round-trips the game in progress', () => {
    const { storage } = stubStorage()
    expect(writeAutoSavedGame(PGN, 3, storage, 1234)).toBe('saved')
    expect(readAutoSavedGame(storage)).toEqual({ version: 1, savedAt: 1234, pgn: PGN, moveCount: 3 })
  })

  it('overwrites rather than accumulating', () => {
    const { storage, entries } = stubStorage()
    writeAutoSavedGame(PGN, 3, storage, 1)
    writeAutoSavedGame('1. d4 *', 1, storage, 2)

    expect(entries.size).toBe(1)
    expect(readAutoSavedGame(storage)?.pgn).toBe('1. d4 *')
  })

  it('clears the slot for an untouched board instead of storing it', () => {
    const { storage, entries } = stubStorage()
    writeAutoSavedGame(PGN, 3, storage, 1)

    expect(writeAutoSavedGame('', 0, storage, 2)).toBe('empty')
    expect(entries.has(AUTO_SAVED_GAME_KEY)).toBe(false)
    expect(writeAutoSavedGame(PGN, 0, storage, 3)).toBe('empty')
    expect(writeAutoSavedGame('   ', 5, storage, 4)).toBe('empty')
  })

  it('forgets a snapshot too big to be worth keeping', () => {
    const { storage, entries } = stubStorage()
    writeAutoSavedGame(PGN, 3, storage, 1)

    expect(writeAutoSavedGame('x'.repeat(AUTO_SAVE_MAX_BYTES + 10), 3, storage, 2)).toBe('too-large')
    expect(entries.has(AUTO_SAVED_GAME_KEY)).toBe(false)
  })

  it('reports a storage that refuses the write', () => {
    const { storage } = stubStorage({
      setItem: () => { throw new Error('QuotaExceededError') },
    })
    expect(writeAutoSavedGame(PGN, 3, storage, 1)).toBe('failed')
  })

  it('does nothing at all without storage', () => {
    expect(writeAutoSavedGame(PGN, 3, null, 1)).toBe('failed')
    expect(readAutoSavedGame(null)).toBeNull()
    expect(() => clearAutoSavedGame(null)).not.toThrow()
  })
})

describe('refusing to restore something unusable', () => {
  it('reads nothing from an empty or corrupt slot', () => {
    const { storage } = stubStorage()
    expect(readAutoSavedGame(storage)).toBeNull()

    storage.setItem(AUTO_SAVED_GAME_KEY, '{not json')
    expect(readAutoSavedGame(storage)).toBeNull()
  })

  it('rejects a version it does not know', () => {
    const { storage } = stubStorage()
    storage.setItem(AUTO_SAVED_GAME_KEY, JSON.stringify({ version: 2, savedAt: 1, pgn: PGN }))
    expect(readAutoSavedGame(storage)).toBeNull()
  })

  it('rejects a snapshot with no PGN or no usable timestamp', () => {
    const { storage } = stubStorage()
    storage.setItem(AUTO_SAVED_GAME_KEY, JSON.stringify({ version: 1, savedAt: 1, pgn: '   ' }))
    expect(readAutoSavedGame(storage)).toBeNull()

    storage.setItem(AUTO_SAVED_GAME_KEY, JSON.stringify({ version: 1, savedAt: 'yesterday', pgn: PGN }))
    expect(readAutoSavedGame(storage)).toBeNull()
  })

  it('treats a missing or nonsense move count as zero', () => {
    const { storage } = stubStorage()
    storage.setItem(AUTO_SAVED_GAME_KEY, JSON.stringify({ version: 1, savedAt: 1, pgn: PGN }))
    expect(readAutoSavedGame(storage)?.moveCount).toBe(0)

    storage.setItem(AUTO_SAVED_GAME_KEY, JSON.stringify({ version: 1, savedAt: 1, pgn: PGN, moveCount: Number.NaN }))
    expect(readAutoSavedGame(storage)?.moveCount).toBe(0)
  })

  it('clears the slot on request', () => {
    const { storage } = stubStorage()
    writeAutoSavedGame(PGN, 3, storage, 1)
    clearAutoSavedGame(storage)
    expect(readAutoSavedGame(storage)).toBeNull()
  })
})
