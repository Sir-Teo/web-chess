/**
 * Playing a line from memory, one side of it.
 *
 * The gap this fills is opening preparation. The explorer says what is played
 * and the review says what went wrong, but neither asks you to *produce* a
 * move — and a repertoire you can recognise is not a repertoire you can play.
 *
 * Deliberately not a new subsystem. A repertoire line here is a line in the
 * game tree, which means it is also a game in the library, which means it
 * already imports, exports, saves and shares. The drill is a way of walking one
 * of those, not a new place to keep them.
 *
 * The shape is `reviewPractice`'s, widened from one position to a sequence:
 * compare against a UCI answer, snap a wrong move back, offer the answer after
 * a couple of misses. Nothing here touches a board — the caller owns the
 * `Chess` instance, and this owns only the question "what comes next, and was
 * that it".
 */

export type DrillSide = 'white' | 'black'

export type DrillLine = {
  /** The line from its root, in UCI, in order. */
  moves: string[]
  /** The side being drilled: the one the reader has to produce. */
  side: DrillSide
  /** Whose move the root position is, so a line from a FEN counts correctly. */
  rootTurn: 'w' | 'b'
}

export type DrillAttempt = {
  from: string
  to: string
  promotion?: string
}

/** Misses at one move before the answer is offered. Two, as in review practice. */
export const DRILL_MISSES_BEFORE_ANSWER = 2

function normalizeUci(value: string): string {
  return value.trim().toLowerCase()
}

/** Whose move the ply at `index` is, counting from the root. */
export function drillPlySide(rootTurn: 'w' | 'b', index: number): DrillSide {
  const offset = rootTurn === 'w' ? 0 : 1
  return (offset + index) % 2 === 0 ? 'white' : 'black'
}

export function isDrillComplete(line: DrillLine, ply: number): boolean {
  return ply >= line.moves.length
}

/** Whether the reader is the one to move at `ply`. */
export function isDrillTurn(line: DrillLine, ply: number): boolean {
  if (isDrillComplete(line, ply)) return false
  return drillPlySide(line.rootTurn, ply) === line.side
}

/** The move the reader is being asked for, or null when it is not their turn. */
export function expectedDrillMove(line: DrillLine, ply: number): string | null {
  if (!isDrillTurn(line, ply)) return null
  return normalizeUci(line.moves[ply] ?? '') || null
}

/**
 * The opponent's moves to play before the reader is asked again.
 *
 * A run rather than a single move, because a line can hand over more than one
 * ply at a time — the root of a line starting from a FEN, or a line whose
 * remaining moves are all the opponent's, which is how a line *ends* when the
 * reader has the last word.
 */
export function opponentMovesFrom(line: DrillLine, ply: number): string[] {
  const run: string[] = []
  for (let index = ply; index < line.moves.length; index++) {
    if (drillPlySide(line.rootTurn, index) === line.side) break
    run.push(normalizeUci(line.moves[index]!))
  }
  return run
}

export type DrillJudgement = {
  correct: boolean
  /** Where the line stands after the attempt. Unchanged when it was wrong. */
  ply: number
  misses: number
  /** Whether the answer should now be shown. */
  revealed: boolean
  finished: boolean
}

/**
 * Judge one attempt.
 *
 * A wrong move leaves the ply where it was: the caller snaps the piece back
 * rather than recording it, so a drill does not fill the tree with the moves
 * you were trying *not* to play. Promotions are part of the answer — e7e8 and
 * e7e8q are different moves.
 */
export function judgeDrillMove(
  line: DrillLine,
  ply: number,
  misses: number,
  attempt: DrillAttempt,
): DrillJudgement {
  const expected = expectedDrillMove(line, ply)
  const played = normalizeUci(`${attempt.from}${attempt.to}${attempt.promotion ?? ''}`)
  if (!expected) {
    return { correct: false, ply, misses, revealed: false, finished: isDrillComplete(line, ply) }
  }

  if (expected !== played) {
    const nextMisses = misses + 1
    return {
      correct: false,
      ply,
      misses: nextMisses,
      revealed: nextMisses >= DRILL_MISSES_BEFORE_ANSWER,
      finished: false,
    }
  }

  const advanced = ply + 1 + opponentMovesFrom(line, ply + 1).length
  return {
    correct: true,
    ply: advanced,
    misses: 0,
    revealed: false,
    finished: isDrillComplete(line, advanced),
  }
}

/** How many moves the reader owns in this line, and how many are behind them. */
export function drillProgress(line: DrillLine, ply: number): { done: number; total: number } {
  let done = 0
  let total = 0
  for (let index = 0; index < line.moves.length; index++) {
    if (drillPlySide(line.rootTurn, index) !== line.side) continue
    total += 1
    if (index < ply) done += 1
  }
  return { done, total }
}

/**
 * Why this line cannot be drilled, or null when it can.
 *
 * A line with none of the reader's moves in it is the case that matters: it
 * would open, play itself to the end and congratulate them, which is worse than
 * saying no.
 */
export function drillUnavailableReason(line: DrillLine): string | null {
  if (line.moves.length === 0) return 'There are no moves in this line to drill.'
  if (drillProgress(line, 0).total === 0) {
    const side = line.side === 'white' ? 'White' : 'Black'
    return `This line has no moves for ${side} to play. Flip the side you are drilling.`
  }
  return null
}
