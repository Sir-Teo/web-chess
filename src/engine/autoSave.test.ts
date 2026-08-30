import { describe, expect, it } from 'vitest'
import {
  AUTO_SAVED_GAME_KEY,
  AUTO_SAVE_MAX_BYTES,
  AUTO_SAVE_MAX_WAIT_MS,
  autoSaveDelayMs,
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

/**
 * The scheduling half. A plain debounce is the wrong tool for an input that
 * never goes quiet, and the evaluation map does not go quiet while the engine
 * searches -- every flush is a new identity, ten times a second.
 */
describe('deciding when to write', () => {
  const DEBOUNCE = 700

  it('waits the full debounce when nothing has been written yet', () => {
    expect(autoSaveDelayMs(10_000, null, DEBOUNCE)).toBe(DEBOUNCE)
  })

  it('waits the full debounce while the deadline is far off', () => {
    expect(autoSaveDelayMs(10_000, 9_900, DEBOUNCE)).toBe(DEBOUNCE)
  })

  it('shortens the wait as the deadline approaches', () => {
    // 4.6s since the last write, so 400ms of the 5s budget is left.
    expect(autoSaveDelayMs(14_600, 10_000, DEBOUNCE)).toBe(400)
  })

  it('writes immediately once the deadline has passed', () => {
    expect(autoSaveDelayMs(15_000, 10_000, DEBOUNCE)).toBe(0)
    expect(autoSaveDelayMs(30_000, 10_000, DEBOUNCE)).toBe(0)
  })

  /**
   * The failure this exists to stop: a change every 100ms, forever. A plain
   * debounce never fires; this schedules a write at the deadline.
   */
  it('still lands a write under a change every 100ms', () => {
    const lastWriteAt = 0
    let now = 0
    let fired: number | null = null

    for (let step = 0; step < 200; step += 1) {
      const delay = autoSaveDelayMs(now, lastWriteAt, DEBOUNCE)
      if (delay === 0 || delay < 100) {
        fired = now + delay
        break
      }
      now += 100
    }

    expect(fired).not.toBeNull()
    expect(fired!).toBeLessThanOrEqual(AUTO_SAVE_MAX_WAIT_MS)
  })
})
