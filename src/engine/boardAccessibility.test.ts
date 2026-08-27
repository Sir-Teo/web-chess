import { describe, expect, it } from 'vitest'
import { Chess, type Square } from 'chess.js'
import { BOARD_SQUARES, describeBoardSquare, isBoardSquare } from './boardAccessibility'

describe('board accessibility helpers', () => {
  it('labels pieces and empty squares', () => {
    const chess = new Chess()

    expect(describeBoardSquare(chess, 'e2')).toBe('e2, White pawn')
    expect(describeBoardSquare(chess, 'e4')).toBe('e4, empty square')
  })

  it('adds selected and legal-target state to labels', () => {
    const chess = new Chess()
    const legalTargets: Square[] = ['e3', 'e4']

    expect(describeBoardSquare(chess, 'e2', { selectedSquare: 'e2', legalTargets }))
      .toBe('e2, White pawn, selected')
    expect(describeBoardSquare(chess, 'e4', { selectedSquare: 'e2', legalTargets }))
      .toBe('e4, empty square, legal move target')
  })

  it('recognizes only real board squares', () => {
    expect(BOARD_SQUARES).toHaveLength(64)
    expect(isBoardSquare('a1')).toBe(true)
    expect(isBoardSquare('i9')).toBe(false)
  })
})
