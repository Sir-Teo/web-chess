import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildReviewRows } from './analysis'
import type { EvalSnapshot, ReviewRow } from './analysis'

/**
 * `accuracyForRow` falls back to a second, undifferentiated accuracy curve for a
 * row with no win-percent reading — the two disagree by up to 6.6 points on the
 * same move (see docs/architecture.md). That branch is only safe because it has
 * no live caller, which is a reachability claim, not a guarantee.
 *
 * These pin it: every row that `summarizeAccuracy` will actually score carries a
 * win-percent loss, so the second curve is never reached. If a future change
 * makes it reachable, these fail and the divergence becomes a real one.
 */
function rowsFor(evaluated: boolean[]) {
  const game = new Chess()
  const rootFen = game.fen()
  const evaluations = new Map<string, EvalSnapshot>([[rootFen, { cp: 0, depth: 22 }]])
  const moves = []
  for (const [index, san] of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'].entries()) {
    moves.push(game.move(san))
    if (evaluated[index]) evaluations.set(game.fen(), { cp: -20 * (index + 1), depth: 22 })
  }
  return buildReviewRows(moves, evaluations, rootFen)
}

/** The rows summarizeAccuracy does not skip. */
const scored = (rows: ReviewRow[]) =>
  rows.filter(row => typeof row.deltaCp === 'number' && Number.isFinite(row.deltaCp) && row.quality !== 'pending')

describe('the second accuracy curve stays unreachable', () => {
  it('gives every scored row a win-percent loss', () => {
    const rows = rowsFor([true, true, true, true, true, true])
    expect(scored(rows).length).toBeGreaterThan(0)
    for (const row of scored(rows)) {
      expect(Number.isFinite(row.winPercentLoss as number)).toBe(true)
    }
  })

  it('holds when only some of the game has been evaluated', () => {
    // The partial case is where a row might plausibly get one reading and not
    // the other.
    const rows = rowsFor([true, false, true, false, true, false])
    expect(scored(rows).length).toBeGreaterThan(0)
    for (const row of scored(rows)) {
      expect(Number.isFinite(row.winPercentLoss as number)).toBe(true)
    }
  })

  it('never scores a row it left pending', () => {
    const rows = rowsFor([true, false, false, false, false, false])
    for (const row of rows.filter(r => r.quality === 'pending')) {
      expect(scored(rows)).not.toContain(row)
    }
  })

  it('carries both readings or neither, never one alone', () => {
    const rows = rowsFor([true, false, true, true, false, true])
    for (const row of rows) {
      const hasDelta = typeof row.deltaCp === 'number'
      const hasWinPercent = typeof row.winPercentLoss === 'number'
      expect(hasDelta).toBe(hasWinPercent)
    }
  })
})
