import { type KeyValueStorage, getLocalStorage, readStorage, removeStorage, writeStorage } from './storage'
import type { ClockSide, TimeControl } from './chessClock'

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

/**
 * A timed game's clock, as much of it as survives being closed.
 *
 * Banks only, never a running side: the reader was not thinking while the page
 * was shut, so a restored clock is a stopped one and resuming is a decision.
 * Without this a reload was a free escape from a lost position — the clock came
 * back empty and the game went on untimed.
 */
export type AutoSavedClock = {
  control: TimeControl
  whiteMs: number
  blackMs: number
  flagged: ClockSide | null
}

/**
 * Who was playing, and as what.
 *
 * Without this "pick up where you left off" restored the moves into the
 * analysis board: a game against the engine came back as a position to study,
 * with no opponent and no clock. Absent when the game was not being played --
 * an imported PGN being analysed has no side to take.
 */
export type AutoSavedPlay = {
  gameMode: 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'
  playerColor: 'white' | 'black'
  /** 1-8; see `useAiPlayer`. Clamped rather than rejected, so a stale value still loads. */
  difficulty: number
}

export type AutoSavedGame = {
  version: 1
  savedAt: number
  pgn: string
  /** Plies at the time of writing, so the prompt can say how much is at stake. */
  moveCount: number
  /** Absent for an untimed game, which is most of them. */
  clock?: AutoSavedClock
  /** Absent when the board was being analysed rather than played. */
  play?: AutoSavedPlay
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

function positiveMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null
}

/**
 * A stored clock, or nothing.
 *
 * Every field is checked rather than trusted, the way every other reader here
 * works: a half-written clock would restore a game with one side already on
 * zero, which is worse than restoring it untimed.
 */
export function normalizeAutoSavedClock(value: unknown): AutoSavedClock | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const control = raw.control as Record<string, unknown> | undefined
  if (!control || typeof control !== 'object') return undefined

  const initialMs = positiveMs(control.initialMs)
  const incrementMs = positiveMs(control.incrementMs)
  const whiteMs = positiveMs(raw.whiteMs)
  const blackMs = positiveMs(raw.blackMs)
  if (initialMs === null || initialMs <= 0) return undefined
  if (incrementMs === null || whiteMs === null || blackMs === null) return undefined

  const flagged = raw.flagged === 'w' || raw.flagged === 'b' ? raw.flagged : null
  return { control: { initialMs, incrementMs }, whiteMs, blackMs, flagged }
}

const GAME_MODES = new Set(['human-vs-human', 'human-vs-ai', 'ai-vs-ai'])

/** The game being played, or nothing. Clamps the difficulty rather than refusing it. */
export function normalizeAutoSavedPlay(value: unknown): AutoSavedPlay | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.gameMode !== 'string' || !GAME_MODES.has(raw.gameMode)) return undefined
  const playerColor = raw.playerColor === 'black' ? 'black' : 'white'
  const difficulty = typeof raw.difficulty === 'number' && Number.isFinite(raw.difficulty)
    ? Math.min(8, Math.max(1, Math.trunc(raw.difficulty)))
    : 4
  return { gameMode: raw.gameMode as AutoSavedPlay['gameMode'], playerColor, difficulty }
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
    const clock = normalizeAutoSavedClock(parsed.clock)
    const play = normalizeAutoSavedPlay(parsed.play)
    return {
      version: 1,
      savedAt: parsed.savedAt,
      pgn: parsed.pgn,
      moveCount,
      ...(clock ? { clock } : {}),
      ...(play ? { play } : {}),
    }
  } catch {
    return null
  }
}

export function writeAutoSavedGame(
  pgn: string,
  moveCount: number,
  storage: AutoSaveStorage | null = getLocalStorage(),
  savedAt = Date.now(),
  clock?: AutoSavedClock,
  play?: AutoSavedPlay,
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
      ...(clock ? { clock } : {}),
      ...(play ? { play } : {}),
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
