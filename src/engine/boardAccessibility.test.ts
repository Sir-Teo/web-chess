import { describe, expect, it } from 'vitest'
import { Chess, type Square } from 'chess.js'
import { BOARD_SQUARES, boardKeyboardDestination, describeBoardSquare, isBoardSquare } from './boardAccessibility'

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

  it('says which king is in check, except under a blindfold', () => {
    // Fool's mate: the white king on e1 is in check (and mated).
    const chess = new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')

    expect(describeBoardSquare(chess, 'e1')).toBe('e1, White king, in check')
    expect(describeBoardSquare(chess, 'e8')).toBe('e8, Black king')
    expect(describeBoardSquare(chess, 'e1', { hidePiece: true })).toBe('e1')
    expect(describeBoardSquare(new Chess(), 'e1')).toBe('e1, White king')
  })

  it('recognizes only real board squares', () => {
    expect(BOARD_SQUARES).toHaveLength(64)
    expect(isBoardSquare('a1')).toBe(true)
    expect(isBoardSquare('i9')).toBe(false)
  })

  it('describes waiting destinations without promising legality after the reply', () => {
    const chess = new Chess()
    chess.move('e4')
    expect(describeBoardSquare(chess, 'g1', { selectedSquare: 'g1', premove: true }))
      .toBe('g1, White knight, selected')
    expect(describeBoardSquare(chess, 'f3', { selectedSquare: 'g1', legalTargets: ['f3'], premove: true }))
      .toBe('f3, empty square, premove target')
    expect(describeBoardSquare(chess, 'g8', { selectedSquare: 'g1', premove: true }))
      .toBe('g8, Black knight, premove target')
    expect(describeBoardSquare(chess, 'f3', { premove: true })).toBe('f3, empty square')
  })

  it('describes both ends of the queued move, including under a blindfold', () => {
    const chess = new Chess()
    const queuedPremove = { from: 'g1' as Square, to: 'f3' as Square }
    expect(describeBoardSquare(chess, 'g1', { queuedPremove })).toBe('g1, White knight, premove queued to f3')
    expect(describeBoardSquare(chess, 'f3', { queuedPremove })).toBe('f3, empty square, premove queued from g1')
    expect(describeBoardSquare(chess, 'g1', { queuedPremove, hidePiece: true })).toBe('g1, premove queued to f3')
    expect(describeBoardSquare(chess, 'f3', { selectedSquare: 'g1', premove: true, hidePiece: true }))
      .toBe('f3, premove target')
  })

  it('returns to legal-move wording when the waiting turn ends', () => {
    const chess = new Chess()
    chess.move('e4'); chess.move('e5')
    expect(describeBoardSquare(chess, 'f3', { selectedSquare: 'g1', legalTargets: ['f3'] }))
      .toBe('f3, empty square, legal move target')
  })
})

describe('keyboard board destinations', () => {
  it.each([
    ['g1', 'ArrowUp', 'white', 'g2'], ['g3', 'ArrowLeft', 'white', 'f3'],
    ['g8', 'ArrowUp', 'black', 'g7'], ['g6', 'ArrowRight', 'black', 'f6'],
    ['d4', 'ArrowDown', 'white', 'd3'], ['d4', 'ArrowDown', 'black', 'd5'],
    ['d4', 'Home', 'white', 'a4'], ['d4', 'End', 'white', 'h4'],
    ['d4', 'Home', 'black', 'h4'], ['d4', 'End', 'black', 'a4'],
    ['a1', 'ArrowLeft', 'white', 'a1'], ['h8', 'ArrowUp', 'white', 'h8'],
    ['h1', 'ArrowLeft', 'black', 'h1'], ['a8', 'ArrowDown', 'black', 'a8'],
  ] as const)('%s %s viewed from %s reaches %s', (square, key, orientation, expected) => {
    expect(boardKeyboardDestination(square, key, orientation)).toBe(expected)
  })

  it('leaves other keys to their own controls', () => {
    expect(boardKeyboardDestination('e4', 'Tab', 'white')).toBeNull()
    expect(boardKeyboardDestination('e4', 'Escape', 'black')).toBeNull()
  })
})
