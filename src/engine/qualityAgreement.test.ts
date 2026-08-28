import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildReviewRows } from './analysis'
import type { EvalSnapshot } from './analysis'

/**
 * `qualityForMove` takes whichever of the centipawn and winning-chance readings
 * is *less* severe. That is only safe because the win-percent thresholds are
 * derived from the centipawn ones: the two agree at equality, and away from it
 * the sigmoid saturates so the same centipawn loss costs fewer winning chances.
 *
 * If someone ever sets the win-percent thresholds independently, that invariant
 * breaks quietly and a genuine blunder near equality could be graded by the
 * milder of two disagreeing readings. These pin the behaviour that depends on it.
 */
function labelFor(beforeCp: number, afterCp: number) {
  const game = new Chess()
  const rootFen = game.fen()
  const move = game.move('e4')
  const afterFen = game.fen()
  const evaluations = new Map<string, EvalSnapshot>([
    [rootFen, { cp: beforeCp, depth: 22 }],
    // Engine scores are POV side-to-move, so the reply's score is negated.
    [afterFen, { cp: -afterCp, depth: 22 }],
  ])
  return buildReviewRows([move], evaluations, rootFen)[0]
}

describe('grading the same centipawn loss in different positions', () => {
  it('grades a loss from equality on its centipawn cost', () => {
    // 0 -> -150 with the game level: this is a real error.
    const row = labelFor(0, -150)
    expect(row.deltaCp).toBe(-150)
    expect(['inaccuracy', 'mistake']).toContain(row.quality)
  })

  it('grades the same loss inside a decided position more kindly', () => {
    // +900 -> +750 costs the same 150 centipawns and almost no winning chances.
    const decided = labelFor(900, 750)
    expect(decided.deltaCp).toBe(-150)
    expect(decided.winPercentLoss as number).toBeLessThan(
      labelFor(0, -150).winPercentLoss as number,
    )
    expect(['best', 'good']).toContain(decided.quality)
  })

  it('never grades a move worse than its centipawn reading alone would', () => {
    // The severity order the classifier uses. Sampling across the range that
    // matters rather than asserting one case, since the guarantee is general.
    const order = ['best', 'good', 'inaccuracy', 'mistake', 'blunder']
    for (const before of [0, 100, 300, 600, 900]) {
      for (const loss of [10, 60, 130, 250, 500]) {
        const row = labelFor(before, before - loss)
        const atEquality = labelFor(0, -loss)
        expect(order.indexOf(row.quality)).toBeLessThanOrEqual(order.indexOf(atEquality.quality))
      }
    }
  })

  it('agrees with the centipawn reading exactly at equality', () => {
    // Where the two ladders are defined to meet.
    expect(labelFor(0, -10).quality).toBe('best')
    expect(labelFor(0, -500).quality).toBe('blunder')
  })
})
