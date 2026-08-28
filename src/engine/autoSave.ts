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

export type AutoSaveWriteResult = 'saved' | 'too-large' | 'empty' | 'failed'

type AutoSaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function getDefaultStorage(): AutoSaveStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

function serializedByteLength(value: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  } catch {
    // Fall back to the UTF-16 length when TextEncoder is blocked.
  }
  return value.length
}

export function readAutoSavedGame(
  storage: AutoSaveStorage | null = getDefaultStorage(),
): AutoSavedGame | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(AUTO_SAVED_GAME_KEY)
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
  storage: AutoSaveStorage | null = getDefaultStorage(),
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
      storage.removeItem(AUTO_SAVED_GAME_KEY)
      return 'too-large'
    }
    storage.setItem(AUTO_SAVED_GAME_KEY, serialized)
    return 'saved'
  } catch {
    return 'failed'
  }
}

export function clearAutoSavedGame(storage: AutoSaveStorage | null = getDefaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(AUTO_SAVED_GAME_KEY)
  } catch {
    // Unavailable or quota-limited storage: nothing to undo.
  }
}
