import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { parseCandidateMoveInput } from './candidateMoves'

describe('candidate move input', () => {
  it('accepts legal SAN and UCI moves from the current position', () => {
    const fen = new Chess().fen()

    expect(parseCandidateMoveInput('e4 Nf3 b1c3', fen)).toEqual({
      invalidTokens: [],
      validMoves: ['e2e4', 'g1f3', 'b1c3'],
    })
  })

  it('deduplicates repeated candidate moves across SAN and UCI notation', () => {
    const fen = new Chess().fen()

    expect(parseCandidateMoveInput('e4 e2e4, Nf3 g1f3', fen)).toEqual({
      invalidTokens: [],
      validMoves: ['e2e4', 'g1f3'],
    })
  })

  it('rejects malformed or illegal moves instead of sending them to Stockfish', () => {
    const fen = new Chess().fen()

    expect(parseCandidateMoveInput('e2e5 e9e4 Qh5', fen)).toEqual({
      invalidTokens: ['e2e5', 'e9e4', 'Qh5'],
      validMoves: [],
    })
  })

  it('understands castling SAN when castling is legal', () => {
    const game = new Chess()
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) {
      game.move(san)
    }

    expect(parseCandidateMoveInput('O-O', game.fen()).validMoves).toEqual(['e1g1'])
  })
})
