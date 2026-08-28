import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  FULL_NON_PAWN_MATERIAL,
  getMovePhase,
  getPhaseLabel,
  nonPawnMaterialFromFen,
} from './gamePhase'

const START = new Chess().fen()

describe('counting the pieces left on the board', () => {
  it('starts at a full set', () => {
    expect(nonPawnMaterialFromFen(START)).toBe(FULL_NON_PAWN_MATERIAL)
  })

  it('ignores pawns and kings', () => {
    expect(nonPawnMaterialFromFen('4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1')).toBe(0)
  })

  it('counts both colours the same', () => {
    expect(nonPawnMaterialFromFen('4k2r/8/8/8/8/8/8/4K2R w - - 0 1')).toBe(10)
  })

  it('reads only the placement field', () => {
    // The move counters and castling field must not be mistaken for pieces.
    const board = '4k3/8/8/8/8/8/8/4K3'
    expect(nonPawnMaterialFromFen(`${board} b KQkq - 99 120`)).toBe(0)
  })

  it('survives a fen that is not one', () => {
    expect(nonPawnMaterialFromFen('')).toBe(0)
    expect(nonPawnMaterialFromFen('nonsense')).toBe(9) // three knights spelt by accident
  })
})

describe('deciding which phase a move belongs to', () => {
  it('calls the first dozen moves the opening', () => {
    expect(getMovePhase(START, 1)).toBe('opening')
    expect(getMovePhase(START, 24)).toBe('opening')
  })

  it('stops calling it an opening once the game has gone on', () => {
    // Everything still on the board, but 30 plies in: a shuffle, not an opening.
    expect(getMovePhase(START, 30)).toBe('middleGame')
  })

  it('ends the opening early when the queens come off', () => {
    // Both queens traded on move 6, everything else still on.
    const queensOff = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 6'
    expect(getMovePhase(queensOff, 11)).toBe('middleGame')
  })

  it('tolerates a single pair of minors being swapped in the opening', () => {
    // One knight each, not all four: b8 and g1 are empty.
    const oneKnightPairOff = 'r1bqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKB1R w KQkq - 0 6'
    expect(getMovePhase(oneKnightPairOff, 11)).toBe('opening')
  })

  it('reads a queen ending as an endgame', () => {
    expect(getMovePhase('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 40', 79)).toBe('endgame')
    expect(getMovePhase('3qk3/8/8/8/8/8/4Q3/4K3 w - - 0 40', 79)).toBe('endgame')
  })

  it('reads a double-rook ending as an endgame', () => {
    expect(getMovePhase('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 30', 59)).toBe('endgame')
  })

  it('does not call queens and rooks an endgame', () => {
    expect(getMovePhase('r2qk2r/8/8/8/8/8/8/R2QK2R w - - 0 30', 59)).toBe('middleGame')
  })

  it('reaches an endgame however early the material goes', () => {
    // A phase read from material rather than move number does not need the
    // game to have lasted a conventional length first.
    expect(getMovePhase('4k3/8/8/8/8/8/8/R3K3 w - - 0 5', 9)).toBe('endgame')
  })

  it('names every phase it can return', () => {
    expect(getPhaseLabel('opening')).toBe('Opening')
    expect(getPhaseLabel('middleGame')).toBe('Middlegame')
    expect(getPhaseLabel('endgame')).toBe('Endgame')
  })
})
