import { describe, expect, it } from 'vitest'
import { FEN_KING_PLACEMENT_ERROR, FEN_LOOKS_LIKE_GAME_ERROR, FEN_LOOKS_LIKE_URL_ERROR, FEN_OPPONENT_IN_CHECK_ERROR, FEN_PARSE_ERROR, hasLegalKingPlacement, opponentIsInCheck, validateFenForAnalysis } from './fen'

describe('FEN validation helpers', () => {
  it('accepts separated kings and rejects adjacent kings', () => {
    expect(hasLegalKingPlacement('8/8/8/8/8/8/4K3/6k1 w - - 0 1')).toBe(true)
    expect(hasLegalKingPlacement('8/8/8/8/8/8/7K/6k1 w - - 0 1')).toBe(false)
  })

  it('rejects positions without both kings', () => {
    expect(hasLegalKingPlacement('8/8/8/8/8/8/4K3/8 w - - 0 1')).toBe(false)
    expect(hasLegalKingPlacement('8/8/8/8/8/8/8/6k1 w - - 0 1')).toBe(false)
  })

  it('normalizes valid FEN and returns user-facing validation errors', () => {
    expect(validateFenForAnalysis('  8/8/8/8/8/8/4K3/6k1   w   -   -   0   1  ')).toEqual({
      ok: true,
      fen: '8/8/8/8/8/8/4K3/6k1 w - - 0 1',
    })
    expect(validateFenForAnalysis('8/8/8/8/8/8/4K3/8 w - - 0 1')).toEqual({
      ok: false,
      error: FEN_KING_PLACEMENT_ERROR,
    })
    expect(validateFenForAnalysis('not a fen')).toEqual({
      ok: false,
      error: FEN_PARSE_ERROR,
    })
  })
})

describe('opponentIsInCheck', () => {
  // Impossible for the same reason adjacent kings are: the player who just
  // moved cannot have left their own king attacked.
  it('catches a position the side not to move could never have left', () => {
    expect(opponentIsInCheck('4k3/8/8/8/8/8/8/r3K3 b - - 0 1')).toBe(true)
    const result = validateFenForAnalysis('4k3/8/8/8/8/8/8/r3K3 b - - 0 1')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toBe(FEN_OPPONENT_IN_CHECK_ERROR)
  })

  it('allows the same position with the other side to move', () => {
    expect(opponentIsInCheck('4k3/8/8/8/8/8/8/r3K3 w - - 0 1')).toBe(false)
    expect(validateFenForAnalysis('4k3/8/8/8/8/8/8/r3K3 w - - 0 1').ok).toBe(true)
  })

  it('leaves ordinary positions alone', () => {
    expect(opponentIsInCheck('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false)
    // A real check, on the side that is to move, is perfectly legal.
    expect(opponentIsInCheck('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe(false)
  })

  // The en-passant square describes the previous move, so it cannot survive
  // flipping the side to move -- `chess.js` refuses the result otherwise.
  it('is not confused by an en-passant square', () => {
    expect(opponentIsInCheck('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3')).toBe(false)
  })

  it('answers false for anything it cannot read, rather than refusing a FEN on a guess', () => {
    expect(opponentIsInCheck('')).toBe(false)
    expect(opponentIsInCheck('8/8/8/8/8/8/8/8')).toBe(false)
    expect(opponentIsInCheck('nonsense x - - 0 1')).toBe(false)
  })
})

/**
 * What it is, before what is wrong with it. A game and a link are both things
 * this box cannot take, and neither has piece placement to check -- so the
 * parse error was describing four fields the reader had not pasted.
 */
describe('a wrong paste in the FEN box', () => {
  it('names a game rather than blaming its piece placement', () => {
    expect(validateFenForAnalysis('[Event "T"]\n\n1. e4 e5 1-0'))
      .toEqual({ ok: false, error: FEN_LOOKS_LIKE_GAME_ERROR })
    expect(validateFenForAnalysis('1. e4 e5 2. Nf3'))
      .toEqual({ ok: false, error: FEN_LOOKS_LIKE_GAME_ERROR })
  })

  it('names a link rather than blaming its castling rights', () => {
    expect(validateFenForAnalysis('https://lichess.org/x3kPqR2a'))
      .toEqual({ ok: false, error: FEN_LOOKS_LIKE_URL_ERROR })
  })

  /** And a real FEN still gets the answers it always got. */
  it('leaves every FEN judgement where it was', () => {
    expect(validateFenForAnalysis('8/8/8/8/8/8/4K3/6k1 w - - 0 1').ok).toBe(true)
    expect(validateFenForAnalysis('8/8/8/8/8/8/4K3/8 w - - 0 1'))
      .toEqual({ ok: false, error: FEN_KING_PLACEMENT_ERROR })
    expect(validateFenForAnalysis('not a fen at all'))
      .toEqual({ ok: false, error: FEN_PARSE_ERROR })
  })
})
