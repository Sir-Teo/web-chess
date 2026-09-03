import type { ReviewLabel, ReviewRow } from './analysis'

/**
 * Walking a review's faults, one at a time.
 *
 * Critical Moments ranks the five costliest and stops there, which is the
 * right summary and the wrong tool for the job it leaves behind: a 116-move
 * game can hold twenty inaccuracies, and the only way to visit the sixth was
 * to scroll the move list looking for a coloured dot. Every other review tool
 * -- chess.com's, Lichess's -- lets you step from one fault to the next.
 *
 * Deliberately over the *reported* rows, which are already narrowed by the
 * side and phase filters. Filter to Black's middlegame and the stepping walks
 * Black's middlegame mistakes; that composition is most of the value.
 *
 * The count can drop while you step, and that is the review working rather
 * than this failing. Landing on a fault runs a deeper search of the position
 * it was played from, and a deeper reading can exonerate the move: measured on
 * Carlsen-Grischuk, stepping back to 17...Qc2 re-graded it from Inaccuracy to
 * Good and took the game from two faults to one. Critical Moments has always
 * behaved this way; the counter here is the first thing to make it visible.
 */

/** The grades worth going back to. Book, Best, Excellent and Good are not faults. */
const FAULT_LABELS: ReadonlySet<ReviewLabel> = new Set(['inaccuracy', 'mistake', 'blunder'])

export function isReviewFault(row: ReviewRow): boolean {
  return FAULT_LABELS.has(row.quality)
}

export function reviewFaults(rows: ReviewRow[]): ReviewRow[] {
  return rows.filter(isReviewFault)
}

/**
 * The fault to step to, given where the board is standing.
 *
 * `boardNodeIndex` counts nodes from the reviewed line's root, so the root is
 * 0 and the position *before* ply *p* is index `p - 1`. That is the position a
 * fault is worth landing on -- the one the move was played from, where there
 * is still a decision to make -- which is also where Critical Moments lands.
 *
 * Nothing wraps. "Next" that jumps backwards to the top of the game is a
 * worse answer than a button that says there is nothing after this one, and
 * the caller can disable it with a reason.
 */
export function stepToReviewFault(
  rows: ReviewRow[],
  boardNodeIndex: number,
  direction: 1 | -1,
): ReviewRow | null {
  const faults = reviewFaults(rows)
  if (direction === 1) {
    return faults.find(row => row.ply - 1 > boardNodeIndex) ?? null
  }
  // The last one that starts before where we are: `findLast` rather than a
  // reversed copy, because the rows are already in ply order.
  for (let index = faults.length - 1; index >= 0; index -= 1) {
    const row = faults[index]!
    if (row.ply - 1 < boardNodeIndex) return row
  }
  return null
}

/**
 * Where the board is among the faults, as "3 of 11" -- or null when it is not
 * standing on one. Read by the label, so the reader knows how far through the
 * game's mistakes they are rather than only that another exists.
 */
export function reviewFaultPosition(
  rows: ReviewRow[],
  boardNodeIndex: number,
): { index: number; total: number } | null {
  const faults = reviewFaults(rows)
  const at = faults.findIndex(row => row.ply - 1 === boardNodeIndex)
  return at < 0 ? null : { index: at + 1, total: faults.length }
}
