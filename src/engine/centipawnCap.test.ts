import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  MAX_REPORTED_CENTIPAWN_LOSS,
  buildReviewRows,
  reportedCentipawnLoss,
  summarizeAccuracy,
} from './analysis'
import type { EvalSnapshot } from './analysis'

describe('bounding the reported centipawn loss', () => {
  it('leaves an ordinary loss exactly as it was', () => {
    expect(reportedCentipawnLoss(-40)).toBe(40)
    expect(reportedCentipawnLoss(-999)).toBe(999)
  })

  it('reports a gain as no loss at all', () => {
    expect(reportedCentipawnLoss(120)).toBe(0)
    expect(reportedCentipawnLoss(0)).toBe(0)
  })

  it('stops at the bound rather than following a mate sentinel', () => {
    // scoreToCp maps any mate to 10000, so this is the real shape of the input.
    expect(reportedCentipawnLoss(-9500)).toBe(MAX_REPORTED_CENTIPAWN_LOSS)
    expect(reportedCentipawnLoss(-20000)).toBe(MAX_REPORTED_CENTIPAWN_LOSS)
  })

  it('treats a missing or unusable delta as nothing lost', () => {
    expect(reportedCentipawnLoss(undefined)).toBe(0)
    expect(reportedCentipawnLoss(Number.NaN)).toBe(0)
    expect(reportedCentipawnLoss(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('a game that ends in mate', () => {
  /** One move, evaluated as walking from a lost position into a forced mate. */
  function matedReview() {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('e4')
    const afterFen = game.fen()
    const evaluations = new Map<string, EvalSnapshot>([
      [rootFen, { cp: -500, depth: 22 }],
      // Side to move after e4 is Black, and Black is mating: from the mover's
      // side this is the collapse the sentinel encodes.
      [afterFen, { cp: 10000, depth: 22 }],
    ])
    return buildReviewRows([move], evaluations, rootFen)
  }

  it('books the move as a real collapse, not tens of pawns', () => {
    const [row] = matedReview()
    expect(row.deltaCp).toBeLessThan(-MAX_REPORTED_CENTIPAWN_LOSS)
    // The raw delta is preserved; only what gets reported is bounded.
    expect(reportedCentipawnLoss(row.deltaCp)).toBe(MAX_REPORTED_CENTIPAWN_LOSS)
  })

  it('keeps one mate from swamping the average', () => {
    const summary = summarizeAccuracy(matedReview())
    expect(summary.averageCentipawnLoss).toBe(MAX_REPORTED_CENTIPAWN_LOSS)
    // Without the bound this was in the thousands.
    expect(summary.averageCentipawnLoss as number).toBeLessThan(2000)
  })
})
