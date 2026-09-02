import { describe, expect, it } from 'vitest'
import { bestMoveLabel, moveNumberPrefix, ponderMoveLabel } from './moveLabels'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('bestMoveLabel', () => {
  it('writes a legal move in the notation a reader uses', () => {
    expect(bestMoveLabel(START, 'e2e4')).toBe('e4')
    expect(bestMoveLabel(START, 'g1f3')).toBe('Nf3')
  })

  it('says nothing rather than guessing when there is no move', () => {
    expect(bestMoveLabel(START, null)).toBe('...')
    expect(bestMoveLabel(START, undefined)).toBe('...')
  })

  /** Still more informative printed than blank, and reportable as a bug. */
  it('falls back to the raw move the position cannot take', () => {
    expect(bestMoveLabel(START, 'e2e5')).toBe('e2e5')
  })
})

describe('ponderMoveLabel', () => {
  /**
   * The reply is made one move ahead of the board, so the best move has to be
   * played before it is named. Reading it off the current position would be
   * notation for a move nobody makes there.
   */
  it('names the reply in the position it is actually played in', () => {
    expect(ponderMoveLabel(START, 'e2e4', 'e7e5')).toBe('e5')
    expect(ponderMoveLabel(START, 'd2d4', 'g8f6')).toBe('Nf6')
  })

  it('reads off the board when there is no move to play first', () => {
    expect(ponderMoveLabel(START, null, 'e2e4')).toBe('e4')
  })

  it('says nothing when the engine named no reply', () => {
    expect(ponderMoveLabel(START, 'e2e4', null)).toBe('...')
    expect(ponderMoveLabel(START, 'e2e4', undefined)).toBe('...')
  })

  it('falls back to the raw reply when the first move will not go in', () => {
    expect(ponderMoveLabel(START, 'e2e5', 'e7e5')).toBe('e7e5')
  })
})

describe('moveNumberPrefix', () => {
  it('reads the move number off the position the move produced', () => {
    // After 1. e4 Black is to move at move 1; after 1... e5 White is to move at 2.
    expect(moveNumberPrefix('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('1.')
    expect(moveNumberPrefix('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')).toBe('1...')
    expect(moveNumberPrefix('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3')).toBe('2...')
  })

  it('has nothing to say about a position nobody has moved in', () => {
    expect(moveNumberPrefix(START)).toBeNull()
    expect(moveNumberPrefix('not a fen')).toBeNull()
  })
})
