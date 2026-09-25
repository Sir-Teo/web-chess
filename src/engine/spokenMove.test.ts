import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { spokenMove } from './spokenMove'

function lastMove(sans: string[], fen?: string) {
  const chess = new Chess(fen)
  let move = null
  for (const san of sans) move = chess.move(san)
  return spokenMove(move!)
}

describe('spokenMove', () => {
  it('names the piece and the square', () => {
    expect(lastMove(['e4'])).toBe('Pawn to e4')
    expect(lastMove(['e4', 'e5', 'Nf3'])).toBe('Knight to f3')
  })

  it('says a capture and a check in words', () => {
    expect(lastMove(['e4', 'd5', 'exd5'])).toBe('Pawn takes d5')
    expect(lastMove(['e4', 'e5', 'Bc4', 'Nc6', 'Bxf7+'])).toBe('Bishop takes f7, check')
    expect(lastMove(['f3', 'e5', 'g4', 'Qh4#'])).toBe('Queen to h4, checkmate')
  })

  it('names castling rather than spelling O-O', () => {
    expect(lastMove(['O-O'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBe('Castles kingside')
    expect(lastMove(['O-O-O'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBe('Castles queenside')
  })

  it('says en passant and promotion', () => {
    expect(lastMove(['exd6'], '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1')).toBe('Pawn takes d6 en passant')
    expect(lastMove(['b8=N'], '8/1P2k3/8/8/8/8/8/4K3 w - - 0 1')).toBe('Pawn to b8, promotes to knight')
  })
})
