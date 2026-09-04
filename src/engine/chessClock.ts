/**
 * A two-sided chess clock.
 *
 * Nothing here reads the wall clock: every function that needs the time takes
 * `now`. That is what makes a clock testable at all — the alternative is a
 * module that can only be exercised by waiting, and a flag that can only be
 * reproduced by sitting through five minutes.
 *
 * The bank is what a side has *committed*: it changes only when a move is made
 * or the clock is paused. What is displayed is the bank minus however long the
 * running side has been thinking, computed on read. So a ticking display costs
 * no state changes, which is the reason `<ChessClock />` can re-render ten times
 * a second without the rest of the app doing the same.
 */

export type ClockSide = 'w' | 'b'

export type TimeControl = {
  /** Each side's starting time. */
  initialMs: number
  /** Added to a side's bank after each of its moves — Fischer, not Bronstein. */
  incrementMs: number
}

export type ClockState = {
  control: TimeControl
  /** Committed time, not counting the running side's current think. */
  whiteMs: number
  blackMs: number
  /** Whose clock is counting, or null before the first move and while paused. */
  running: ClockSide | null
  /** When `running` started counting. Null whenever `running` is. */
  since: number | null
  /** Set once and never cleared: a flag ends the game. */
  flagged: ClockSide | null
}

export type TimeControlPreset = {
  id: string
  label: string
  /** Null is "no clock", which stays the default — this app is an analysis board first. */
  control: TimeControl | null
  blurb: string
}

/**
 * The standard ladder, named the way a player names it: minutes + increment.
 * Trimmed to the six a person actually picks rather than every FIDE category.
 */
export const TIME_CONTROL_PRESETS: TimeControlPreset[] = [
  { id: 'unlimited', label: 'No clock', control: null, blurb: 'Take as long as you like' },
  { id: '1+0', label: '1 + 0', control: { initialMs: 60_000, incrementMs: 0 }, blurb: 'Bullet' },
  { id: '3+2', label: '3 + 2', control: { initialMs: 180_000, incrementMs: 2_000 }, blurb: 'Blitz' },
  { id: '5+0', label: '5 + 0', control: { initialMs: 300_000, incrementMs: 0 }, blurb: 'Blitz' },
  { id: '10+0', label: '10 + 0', control: { initialMs: 600_000, incrementMs: 0 }, blurb: 'Rapid' },
  { id: '15+10', label: '15 + 10', control: { initialMs: 900_000, incrementMs: 10_000 }, blurb: 'Classical' },
]

export function timeControlPresetById(id: string): TimeControlPreset | undefined {
  return TIME_CONTROL_PRESETS.find(preset => preset.id === id)
}

export function isTimeControlPresetId(value: unknown): value is string {
  return typeof value === 'string' && TIME_CONTROL_PRESETS.some(preset => preset.id === value)
}

export function createClock(control: TimeControl): ClockState {
  return {
    control,
    whiteMs: control.initialMs,
    blackMs: control.initialMs,
    running: null,
    since: null,
    flagged: null,
  }
}

function bankOf(state: ClockState, side: ClockSide): number {
  return side === 'w' ? state.whiteMs : state.blackMs
}

function withBank(state: ClockState, side: ClockSide, ms: number): ClockState {
  return side === 'w' ? { ...state, whiteMs: ms } : { ...state, blackMs: ms }
}

/** What the display should show for a side, floored at zero. */
export function remainingMs(state: ClockState, side: ClockSide, now: number): number {
  const bank = bankOf(state, side)
  if (state.running !== side || state.since === null) return Math.max(0, bank)
  return Math.max(0, bank - Math.max(0, now - state.since))
}

/**
 * Stop counting and write the running side's think into its bank.
 *
 * Every transition goes through this, so there is one place where elapsed time
 * turns into committed time and one place that can notice a bank hitting zero.
 */
function commit(state: ClockState, now: number): ClockState {
  if (state.running === null || state.since === null) return { ...state, running: null, since: null }
  const side = state.running
  const left = remainingMs(state, side, now)
  const committed = withBank(state, side, left)
  return {
    ...committed,
    running: null,
    since: null,
    flagged: committed.flagged ?? (left <= 0 ? side : null),
  }
}

/** Begin counting for a side. A flagged clock never starts again. */
export function startSide(state: ClockState, side: ClockSide, now: number): ClockState {
  if (state.flagged) return state
  if (state.running === side) return state
  const settled = commit(state, now)
  if (settled.flagged) return settled
  return { ...settled, running: side, since: now }
}

/**
 * `side` has just moved: bank their think, add their increment, hand over.
 *
 * The increment is for a move made *on the clock*. Two moves do not earn one:
 * a move played while this side's clock was not running (the game had not
 * started, or it was paused) and the move that ran the flag down. Without the
 * first guard a clock that starts on the first move hands White two free
 * seconds for a move nobody timed.
 */
export function moveMade(state: ClockState, side: ClockSide, now: number): ClockState {
  if (state.flagged) return state

  const wasOnTheClock = state.running === side
  const settled = commit(state, now)
  if (settled.flagged) return settled

  const banked = wasOnTheClock
    ? withBank(settled, side, bankOf(settled, side) + settled.control.incrementMs)
    : settled
  const opponent: ClockSide = side === 'w' ? 'b' : 'w'
  return { ...banked, running: opponent, since: now }
}

/**
 * The move that ended the game: bank it as usual, then stop.
 *
 * `moveMade` always hands over, because that is what a move does. A move that
 * checkmates or stalemates does not — a finished game has no side to move, so
 * nobody's clock should run. Without this the loser's clock counted down for a
 * full minute after a fool's mate and then flagged, replacing "Checkmate" with
 * "flagged on time"; a stalemate would have turned a draw into a loss.
 */
export function moveEndedGame(state: ClockState, side: ClockSide, now: number): ClockState {
  return pauseClock(moveMade(state, side, now), now)
}

export function pauseClock(state: ClockState, now: number): ClockState {
  if (state.running === null) return state
  return commit(state, now)
}

/**
 * Whether the running side has run out, without mutating anything.
 *
 * Separate from `commit` because the ticking check runs several times a second
 * and must not produce a new state object until there is something to report.
 */
export function flaggedSide(state: ClockState, now: number): ClockSide | null {
  if (state.flagged) return state.flagged
  if (state.running === null) return null
  return remainingMs(state, state.running, now) <= 0 ? state.running : null
}

/** The state after a flag, or the same object when nothing has run out. */
export function settleFlag(state: ClockState, now: number): ClockState {
  const side = flaggedSide(state, now)
  if (!side) return state
  if (state.flagged === side && state.running === null) return state
  return { ...withBank(state, side, 0), running: null, since: null, flagged: side }
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
/** Below this, tenths appear. Lichess's threshold, and it is the right one. */
export const CLOCK_TENTHS_THRESHOLD_MS = 10_000

/**
 * "5:00", "0:09.4", "1:02:03".
 *
 * Tenths only under ten seconds: they are noise at five minutes and they are
 * the only thing that matters at nine seconds. Always floored, never rounded —
 * a clock reading 1.0 with 0.96 left has lied about the last move you can make.
 */
export function formatClockTime(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0

  if (safe >= HOUR_MS) {
    const hours = Math.floor(safe / HOUR_MS)
    const minutes = Math.floor((safe % HOUR_MS) / MINUTE_MS)
    const seconds = Math.floor((safe % MINUTE_MS) / 1000)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const minutes = Math.floor(safe / MINUTE_MS)
  const seconds = Math.floor((safe % MINUTE_MS) / 1000)
  if (safe < CLOCK_TENTHS_THRESHOLD_MS) {
    const tenths = Math.floor((safe % 1000) / 100)
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** How a clock reads to a screen reader, where "5:00" is ambiguous. */
export function describeClockTime(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0
  const totalSeconds = Math.floor(safe / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`)
  parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`)
  return parts.join(' ')
}

/** The most a clock is ever called low, however long the game is. */
export const LOW_TIME_CEILING_MS = 60_000

/**
 * When a clock starts reading as urgent.
 *
 * A flat minute is wrong at both ends of the ladder: a 15+10 game is nowhere
 * near trouble at 59 seconds by the standards of the first hour, and a 1+0 game
 * would be amber from its first move, which tells the player nothing they did
 * not already know. A fifth of the starting time, capped at a minute, says the
 * same thing at every control: you are into the last of it.
 */
export function lowTimeThresholdMs(control: TimeControl): number {
  return Math.min(LOW_TIME_CEILING_MS, Math.max(0, control.initialMs) / 5)
}

/**
 * The PGN `TimeControl` tag for a control: seconds, then increment.
 *
 * The standard's "sudden death" and "increment" forms, which is what Lichess
 * and chess.com both write. Without it an exported timed game carries per-move
 * `[%clk]` readings and no statement of what they were counting down from.
 */
export function timeControlTag(control: TimeControl): string {
  const seconds = Math.max(0, Math.round(control.initialMs / 1000))
  const increment = Math.max(0, Math.round(control.incrementMs / 1000))
  return increment > 0 ? `${seconds}+${increment}` : String(seconds)
}

/**
 * The result line for a game that ended on the clock.
 *
 * `opponentCanMate` is FIDE 6.9: a flag loses, *unless* the side still on the
 * clock could not checkmate by any series of legal moves, and then it is a
 * draw. `hasMatingMaterial` in `matingMaterial.ts` answers it from the final
 * position; it defaults to true here so that a caller with no position to hand
 * gets the ordinary ruling rather than a wrong draw.
 *
 * The draw says why. "Draw" alone under a clock that just hit zero reads as a
 * bug, and the rule is one most players meet for the first time by losing a
 * game they thought they had won.
 */
export function flagResultLabel(flagged: ClockSide, opponentCanMate = true): string {
  const survivor = flagged === 'w' ? 'Black' : 'White'
  const loser = flagged === 'w' ? 'White' : 'Black'
  if (!opponentCanMate) return `${loser} flagged · Draw: ${survivor} cannot checkmate`
  return `${loser} flagged · ${survivor} wins on time`
}

/** The PGN Result tag for a game that ended on the clock. */
export function flagPgnResult(flagged: ClockSide, opponentCanMate = true): '1-0' | '0-1' | '1/2-1/2' {
  if (!opponentCanMate) return '1/2-1/2'
  return flagged === 'w' ? '0-1' : '1-0'
}
