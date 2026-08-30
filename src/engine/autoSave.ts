import { type KeyValueStorage, getLocalStorage, readStorage, removeStorage, writeStorage } from './storage'

/**
 * Keeps the game in progress somewhere it survives a reload, so a refresh does
 * not throw away an analysis. Distinct from the library: one slot, overwritten
 * constantly, and the reader never asked for it.
 *
 * Ported from web-katrain's autoSave.ts, including the injected storage that
 * keeps it testable without a browser.
 */

export const AUTO_SAVED_GAME_KEY = 'webchess:auto-saved-game:v1'
export const AUTO_SAVE_MAX_BYTES = 2 * 1024 * 1024
export const AUTO_SAVE_MAX_LABEL = '2 MB'

export type AutoSavedGame = {
  version: 1
  savedAt: number
  pgn: string
  /** Plies at the time of writing, so the prompt can say how much is at stake. */
  moveCount: number
}

/**
 * The longest the slot may go unwritten while something keeps changing.
 *
 * A plain debounce fires only once its input goes quiet, and the evaluation
 * map the auto-save watches never does while the engine is searching: a
 * reading with more nodes at the same depth counts as an improvement, so every
 * 100ms flush is a new map. Measured in `analysis.test.ts`: 100 changes across
 * 100 flushes. A 700ms debounce over that input never elapses, which meant a
 * game review or an infinite search could run for minutes with nothing written.
 */
export const AUTO_SAVE_MAX_WAIT_MS = 5_000

/**
 * How long to wait before writing, given when the last write landed.
 *
 * The debounce still governs the quiet case -- a burst of moves writes once.
 * The deadline governs the noisy one: the wait shrinks as it approaches and
 * reaches zero at it, so a stream of changes 100ms apart still lands a write
 * every {@link AUTO_SAVE_MAX_WAIT_MS} instead of none at all.
 */
export function autoSaveDelayMs(
  now: number,
  lastWriteAt: number | null,
  debounceMs: number,
  maxWaitMs: number = AUTO_SAVE_MAX_WAIT_MS,
): number {
  const debounce = Math.max(0, debounceMs)
  if (lastWriteAt === null) return debounce
  const untilDeadline = maxWaitMs - (now - lastWriteAt)
  if (untilDeadline <= 0) return 0
  return Math.min(debounce, untilDeadline)
}

export type AutoSaveWriteResult = 'saved' | 'too-large' | 'empty' | 'failed'

type AutoSaveStorage = KeyValueStorage

function serializedByteLength(value: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  } catch {
    // Fall back to the UTF-16 length when TextEncoder is blocked.
  }
  return value.length
}

export function readAutoSavedGame(
  storage: AutoSaveStorage | null = getLocalStorage(),
): AutoSavedGame | null {
  if (!storage) return null
  try {
    const raw = readStorage(AUTO_SAVED_GAME_KEY, storage)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AutoSavedGame> | null
    if (!parsed || parsed.version !== 1) return null
    if (typeof parsed.pgn !== 'string' || !parsed.pgn.trim()) return null
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null
    const moveCount = typeof parsed.moveCount === 'number' && Number.isFinite(parsed.moveCount)
      ? Math.max(0, Math.trunc(parsed.moveCount))
      : 0
    return { version: 1, savedAt: parsed.savedAt, pgn: parsed.pgn, moveCount }
  } catch {
    return null
  }
}

export function writeAutoSavedGame(
  pgn: string,
  moveCount: number,
  storage: AutoSaveStorage | null = getLocalStorage(),
  savedAt = Date.now(),
): AutoSaveWriteResult {
  if (!storage) return 'failed'
  if (!pgn.trim() || moveCount <= 0) {
    // An untouched board should not offer to restore nothing.
    clearAutoSavedGame(storage)
    return 'empty'
  }

  try {
    const snapshot: AutoSavedGame = {
      version: 1,
      savedAt,
      pgn,
      moveCount: Math.max(0, Math.trunc(moveCount)),
    }
    const serialized = JSON.stringify(snapshot)
    if (serializedByteLength(serialized) > AUTO_SAVE_MAX_BYTES) {
      // A stale snapshot that no longer matches the board is worse than none.
      removeStorage(AUTO_SAVED_GAME_KEY, storage)
      return 'too-large'
    }
    return writeStorage(AUTO_SAVED_GAME_KEY, serialized, storage) ? 'saved' : 'failed'
  } catch {
    return 'failed'
  }
}

export function clearAutoSavedGame(storage: AutoSaveStorage | null = getLocalStorage()): void {
  removeStorage(AUTO_SAVED_GAME_KEY, storage)
}
