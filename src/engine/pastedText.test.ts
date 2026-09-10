import { describe, expect, it } from 'vitest'
import { looksLikeFen, looksLikeGameUrl } from './pastedText'

/**
 * Telling a position from a game, so a FEN pasted into the PGN box gets an
 * answer about FENs. Shape rather than validity: what the reader needs to hear
 * is which of the two things they pasted, and a FEN with a bad castling field
 * is still the one they meant.
 */
describe('looksLikeFen', () => {
  it('recognises the FENs a reader actually pastes', () => {
    expect(looksLikeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(true)
    // Lichess hands out four fields; chess.com pads to six. Both are FENs.
    expect(looksLikeFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -')).toBe(true)
    expect(looksLikeFen('8/8/8/8/8/8/4K3/6k1 b - - 12 34')).toBe(true)
    expect(looksLikeFen('  8/8/8/8/8/8/4K3/6k1 w - - 0 1  ')).toBe(true)
  })

  /** Still the FEN they meant, and still not a game. */
  it('does not ask the FEN to be valid first', () => {
    expect(looksLikeFen('8/8/8/8/8/8/8/8 w ZZZZ - 0 1')).toBe(true)
    expect(looksLikeFen('pppppppp/pppppppp/pppppppp/pppppppp/pppppppp/pppppppp/pppppppp/pppppppp w - - 0 1')).toBe(true)
  })

  it('is not fooled by a game, however short', () => {
    expect(looksLikeFen('1. e4 e5 2. Nf3 Nc6 *')).toBe(false)
    expect(looksLikeFen('[Event "T"]\n\n1. e4 e5 1-0')).toBe(false)
    expect(looksLikeFen('')).toBe(false)
    expect(looksLikeFen('   ')).toBe(false)
    expect(looksLikeFen('this is not a pgn at all, just words')).toBe(false)
  })

  /** A board is eight ranks, the side to move is one of two, and it is one line. */
  it('holds to the shape', () => {
    expect(looksLikeFen('8/8/8/8/8/8/4K3 w - - 0 1'), 'seven ranks').toBe(false)
    expect(looksLikeFen('8/8/8/8/8/8/8/4K3/6k1 w - - 0 1'), 'nine ranks').toBe(false)
    expect(looksLikeFen('8/8/8/8/8/8/4K3/6k1 x - - 0 1'), 'no side to move').toBe(false)
    expect(looksLikeFen('8/8/8/8/8/8/4K3/6k1'), 'placement alone').toBe(false)
    expect(looksLikeFen('8/8/8/8/8/8/4K3/6k1 w - - 0 1 extra'), 'too many fields').toBe(false)
    expect(looksLikeFen('8/8/8/8/8/8/4K3/6k1\nw - - 0 1'), 'across two lines').toBe(false)
    expect(looksLikeFen('8/8/8/8/8/8/4K3/6X1 w - - 0 1'), 'a letter no piece uses').toBe(false)
  })
})

describe('looksLikeGameUrl', () => {
  it('recognises a share link from either board', () => {
    expect(looksLikeGameUrl('https://lichess.org/x3kPqR2a')).toBe(true)
    expect(looksLikeGameUrl('https://lichess.org/x3kPqR2a/black#42')).toBe(true)
    expect(looksLikeGameUrl('https://www.chess.com/game/live/123456789')).toBe(true)
    expect(looksLikeGameUrl('  https://lichess.org/x3kPqR2a  ')).toBe(true)
  })

  /** A link to any other board is still a link, and the answer is the same. */
  it('does not care which board the link is to', () => {
    expect(looksLikeGameUrl('http://example.test/some/game')).toBe(true)
  })

  it('leaves anything that is not a bare link alone', () => {
    expect(looksLikeGameUrl('1. e4 e5 2. Nf3 Nc6 *')).toBe(false)
    expect(looksLikeGameUrl('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false)
    expect(looksLikeGameUrl('DrNykterstein')).toBe(false)
    expect(looksLikeGameUrl('')).toBe(false)
    // A game whose comment happens to hold a link is a game.
    expect(looksLikeGameUrl('1. e4 {see https://lichess.org/x3kPqR2a} e5 *')).toBe(false)
    expect(looksLikeGameUrl('lichess.org/x3kPqR2a'), 'no scheme').toBe(false)
  })
})
