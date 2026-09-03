import { describe, expect, it } from 'vitest'
import type { ReviewLabel, ReviewRow } from './analysis'
import { isReviewFault, reviewFaultPosition, reviewFaults, stepToReviewFault } from './reviewNavigation'

/** A row with only the fields this module reads; the rest is not its business. */
function row(ply: number, quality: ReviewLabel): ReviewRow {
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    sideToMove: ply % 2 === 1 ? 'w' : 'b',
    san: `m${ply}`,
    uci: 'e2e4',
    quality,
    phase: 'middleGame',
    confidence: 'standard',
  }
}

const game = [
  row(1, 'book'),
  row(2, 'best'),
  row(3, 'inaccuracy'),
  row(4, 'good'),
  row(5, 'blunder'),
  row(6, 'excellent'),
  row(7, 'mistake'),
  row(8, 'pending'),
]

describe('which moves count as faults', () => {
  it('takes the three grades a reader would go back to, and no others', () => {
    expect(reviewFaults(game).map(item => item.ply)).toEqual([3, 5, 7])
  })

  it('does not treat a move that has not been evaluated as a mistake', () => {
    expect(isReviewFault(row(1, 'pending'))).toBe(false)
    expect(isReviewFault(row(1, 'book'))).toBe(false)
    expect(isReviewFault(row(1, 'best'))).toBe(false)
  })
})

describe('stepping from one fault to the next', () => {
  /**
   * A fault at ply p is played from node index p-1, and that is the position
   * worth landing on: the one with the decision still in it.
   */
  it('lands on the position the move was played from', () => {
    expect(stepToReviewFault(game, 0, 1)?.ply).toBe(3)
  })

  it('steps forward past the fault it is standing on rather than re-finding it', () => {
    expect(stepToReviewFault(game, 2, 1)?.ply).toBe(5)
    expect(stepToReviewFault(game, 4, 1)?.ply).toBe(7)
  })

  it('steps back to the one before where the board is', () => {
    expect(stepToReviewFault(game, 6, -1)?.ply).toBe(5)
    expect(stepToReviewFault(game, 4, -1)?.ply).toBe(3)
  })

  it('runs out rather than wrapping, at both ends', () => {
    expect(stepToReviewFault(game, 6, 1)).toBeNull()
    expect(stepToReviewFault(game, 2, -1)).toBeNull()
    expect(stepToReviewFault(game, 999, 1)).toBeNull()
    expect(stepToReviewFault(game, -1, -1)).toBeNull()
  })

  it('finds the next one from between two faults, not the nearest in either direction', () => {
    // Standing at node 3, which is between the ply-3 and ply-5 faults.
    expect(stepToReviewFault(game, 3, 1)?.ply).toBe(5)
    expect(stepToReviewFault(game, 3, -1)?.ply).toBe(3)
  })

  it('has nothing to step to in a game with no faults', () => {
    const clean = [row(1, 'best'), row(2, 'excellent'), row(3, 'book')]
    expect(stepToReviewFault(clean, 0, 1)).toBeNull()
    expect(stepToReviewFault(clean, 3, -1)).toBeNull()
    expect(stepToReviewFault([], 0, 1)).toBeNull()
  })
})

describe('how far through the faults the board is', () => {
  it('counts from one, over the faults alone', () => {
    expect(reviewFaultPosition(game, 2)).toEqual({ index: 1, total: 3 })
    expect(reviewFaultPosition(game, 4)).toEqual({ index: 2, total: 3 })
    expect(reviewFaultPosition(game, 6)).toEqual({ index: 3, total: 3 })
  })

  it('says nothing when the board is not standing on one', () => {
    expect(reviewFaultPosition(game, 0)).toBeNull()
    expect(reviewFaultPosition(game, 3)).toBeNull()
    expect(reviewFaultPosition([], 0)).toBeNull()
  })

  /**
   * The rows handed in are already narrowed by the side and phase filters, so
   * the count is of what the review is reporting rather than of the game --
   * which is the whole reason the stepping composes with the filters.
   */
  it('counts within a filtered set, not within the game', () => {
    const blackOnly = game.filter(item => item.sideToMove === 'b')
    expect(reviewFaults(blackOnly).map(item => item.ply)).toEqual([])
    const whiteOnly = game.filter(item => item.sideToMove === 'w')
    expect(reviewFaults(whiteOnly).map(item => item.ply)).toEqual([3, 5, 7])
    expect(reviewFaultPosition(whiteOnly, 4)).toEqual({ index: 2, total: 3 })
  })
})
