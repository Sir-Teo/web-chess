import { describe, expect, it } from 'vitest'
import { FEN_KINGS_ADJACENT_ERROR, FEN_LOOKS_LIKE_GAME_ERROR, FEN_LOOKS_LIKE_URL_ERROR, FEN_NO_BLACK_KING_ERROR, FEN_NO_KINGS_ERROR, FEN_NO_WHITE_KING_ERROR, FEN_OPPONENT_IN_CHECK_ERROR, FEN_PARSE_ERROR, hasLegalKingPlacement, kingPlacementError, opponentIsInCheck, validateFenForAnalysis } from './fen'

describe('declared en passant targets', () => {
  it.each([
    ['4k3/8/8/4P3/8/8/8/4K3 w - d6 0 12', 'd5'],
    ['4k3/8/8/8/4p3/8/8/4K3 b - d3 0 12', 'd4'],
  ])('requires the pawn that just advanced: %s', (fen, square) => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(new RegExp(`en passant.*pawn on ${square}`))
  })

  it.each([
    ['4k3/8/8/3PP3/8/8/8/4K3 w - d6 0 12'],
    ['4k3/8/8/3rP3/8/8/8/4K3 w - d6 0 12'],
    ['4k3/8/8/8/3pp3/8/8/4K3 b - d3 0 12'],
    ['4k3/8/8/8/3Np3/8/8/4K3 b - d3 0 12'],
  ])('requires the actual opposing pawn rather than a different piece: %s', fen => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/en passant.*pawn/)
  })

  it.each([
    ['4k3/8/3B4/3pP3/8/8/8/4K3 w - d6 0 12', 'd6'],
    ['4k3/8/8/8/3Pp3/3b4/8/4K3 b - d3 0 12', 'd3'],
  ])('requires an empty target square: %s', (fen, target) => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(new RegExp(`en passant.*${target}.*empty`))
  })

  it.each([
    ['4k3/3p4/8/3pP3/8/8/8/4K3 w - d6 0 12', 'd7'],
    ['4k3/8/8/8/3Pp3/8/3P4/4K3 b - d3 0 12', 'd2'],
  ])('requires the double-push origin to be vacated: %s', (fen, origin) => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(new RegExp(`en passant.*${origin}.*empty`))
  })

  it.each([
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 12'],
    ['4k3/8/8/8/3Pp3/8/8/4K3 b - d3 0 12'],
    ['4k3/8/8/3p4/8/8/8/4K3 w - d6 0 12'],
    ['4k3/8/8/8/3P4/8/8/4K3 b - d3 0 12'],
    ['k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 12'],
    ['4k3/8/8/3pP3/4K3/8/8/8 w - d6 0 12'],
    ['8/8/8/4k3/3Pp3/8/8/4K3 b - d3 0 12'],
  ])('accepts real double-push fields with no capturer, a pin or check: %s', fen => {
    expect(validateFenForAnalysis(fen).ok).toBe(true)
  })
})

describe('explicit shorthand support for imported roots', () => {
  const placement = '4k3/8/8/8/8/8/4P3/4K3'
  it.each([
    [`${placement} w`, `${placement} w - - 0 1`],
    [`${placement} w -`, `${placement} w - - 0 1`],
    [`${placement} w - -`, `${placement} w - - 0 1`],
    [`${placement} w - - 42`, `${placement} w - - 42 1`],
  ])('keeps editor input strict while retaining importer defaults: %s', (input, complete) => {
    expect(validateFenForAnalysis(input).ok).toBe(false)
    expect(validateFenForAnalysis(input, { allowAbbreviated: true })).toEqual({ ok: true, fen: complete })
  })
})

describe('declared castling rights', () => {
  it.each([
    ['White kingside', 'e1', 'h1', '4k3/8/8/8/8/8/P7/4K3 w K - 0 1'],
    ['White queenside', 'e1', 'a1', '4k3/8/8/8/8/8/P7/4K3 w Q - 0 1'],
    ['Black kingside', 'e8', 'h8', '4k3/p7/8/8/8/8/8/4K3 b k - 0 1'],
    ['Black queenside', 'e8', 'a8', '4k3/p7/8/8/8/8/8/4K3 b q - 0 1'],
  ])('requires the home rook for %s', (label, king, rook, fen) => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(new RegExp(`${label} castling.*${king}.*${rook}`))
  })

  it.each([
    ['4k3/8/8/8/8/8/4K3/7R w K - 0 1'],
    ['4k3/8/8/8/8/8/4K3/R7 w Q - 0 1'],
    ['7r/4k3/8/8/8/8/8/4K3 b k - 0 1'],
    ['r7/4k3/8/8/8/8/8/4K3 b q - 0 1'],
  ])('requires the king to remain home when a right is declared: %s', fen => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/castling.*king on e[18]/)
  })

  it.each([
    ['4k3/8/8/8/8/8/P7/4K2r w K - 0 1'],
    ['4k3/8/8/8/8/8/P7/r3K3 w Q - 0 1'],
    ['4k2R/p7/8/8/8/8/8/4K3 b k - 0 1'],
    ['R3k3/p7/8/8/8/8/8/4K3 b q - 0 1'],
  ])('requires the rook to belong to the castling side: %s', fen => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/castling/)
  })

  it.each([
    ['4k3/8/8/8/8/8/P7/4K2B w K - 0 1'],
    ['4k3/8/8/8/8/8/P7/N3K3 w Q - 0 1'],
    ['4k2b/p7/8/8/8/8/8/4K3 b k - 0 1'],
    ['n3k3/p7/8/8/8/8/8/4K3 b q - 0 1'],
  ])('requires an actual rook rather than another friendly piece: %s', fen => {
    const result = validateFenForAnalysis(fen)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/castling/)
  })

  it.each([
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'],
    ['k3r3/8/8/8/8/8/8/4K2R w K - 0 1'],
    ['4k3/8/8/8/8/8/4K3/7R w - - 0 1'],
    ['4k3/8/8/8/8/8/P7/4K3 w - - 0 1'],
  ])('keeps valid rights, blocked paths, check, and positions without rights: %s', fen => {
    expect(validateFenForAnalysis(fen)).toEqual({ ok: true, fen })
  })
})

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
      error: FEN_NO_BLACK_KING_ERROR,
    })
    expect(validateFenForAnalysis('not a fen')).toEqual({
      ok: false,
      error: FEN_PARSE_ERROR,
    })
  })
})

describe('FEN move counters retain their exact meaning', () => {
  const position = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'

  it.each(['0junk', '1.5', '1e3', '0x10', '+1'])('refuses a partial or non-decimal halfmove clock: %s', counter => {
    const result = validateFenForAnalysis(`${position} ${counter} 1`)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/halfmove/i)
  })

  it.each(['1junk', '1.5', '1e3', '+1'])('refuses a partial or non-decimal fullmove number: %s', counter => {
    const result = validateFenForAnalysis(`${position} 0 ${counter}`)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/fullmove/i)
  })

  it.each(['9007199254740992', '9007199254740993', '1000000000000000000000'])('refuses counters that cannot round-trip as exact decimal integers: %s', counter => {
    for (const [halfmove, fullmove] of [[counter, '1'], ['0', counter]]) {
      const result = validateFenForAnalysis(`${position} ${halfmove} ${fullmove}`)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.error).toMatch(/too large/i)
    }
  })

  it('normalizes leading zeros while preserving ordinary counter values', () => {
    expect(validateFenForAnalysis(`${position} 00042 00123`)).toEqual({ ok: true, fen: `${position} 42 123` })
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
      .toEqual({ ok: false, error: FEN_NO_BLACK_KING_ERROR })
    expect(validateFenForAnalysis('not a fen at all'))
      .toEqual({ ok: false, error: FEN_PARSE_ERROR })
  })
})

/**
 * A refused FEN says which field is wrong.
 *
 * chess.js already names it -- "side-to-move is invalid", "some pawns are on
 * the edge rows", "castling availability is invalid" -- and all of it was being
 * thrown away for one sentence that names four fields and leaves the reader to
 * work out which. The two cases this file has better words for keep them.
 */
describe('a refused FEN says which field is wrong', () => {
  const reason = (fen: string) => {
    const result = validateFenForAnalysis(fen)
    return result.ok ? '(accepted)' : result.error
  }

  it('names the side-to-move field', () => {
    expect(reason('7k/8/8/8/8/8/8/K7 x - - 0 1')).toMatch(/side-to-move/i)
  })

  it('names a pawn standing on the last rank', () => {
    expect(reason('P6k/8/8/8/8/8/8/K7 w - - 0 1')).toMatch(/pawn/i)
  })

  it('names the castling field', () => {
    expect(reason('7k/8/8/8/8/8/8/K7 w XYZ - 0 1')).toMatch(/castling/i)
  })

  it('keeps the two sentences this file writes better itself', () => {
    expect(reason('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(FEN_NO_KINGS_ERROR)
    expect(reason('R6k/8/8/8/8/8/8/K7 w - - 0 1')).toBe(FEN_OPPONENT_IN_CHECK_ERROR)
  })

  /**
   * Three faults, three sentences.
   *
   * **Measured** by building each position on the setup board a square at a
   * time: an empty board, a board with one king, and two kings side by side all
   * answered "Invalid FEN: kings cannot be adjacent or missing" -- two faults
   * named at once, neither of them necessarily the one in front of the reader.
   * chess.js had the better half of it already ("missing white king"), and a
   * `/king/i` catch-all in this file was throwing that away, which is the exact
   * swap the rest of `fenSyntaxUserError` exists to undo.
   */
  it('says which king fault a position has', () => {
    expect(reason('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(FEN_NO_KINGS_ERROR)
    expect(reason('4k3/8/8/8/8/8/8/8 w - - 0 1')).toBe(FEN_NO_WHITE_KING_ERROR)
    expect(reason('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(FEN_NO_BLACK_KING_ERROR)
    expect(reason('8/8/8/8/8/8/4k3/4K3 w - - 0 1')).toBe(FEN_KINGS_ADJACENT_ERROR)
  })

  /** And the checker underneath says the same four things. */
  it('reports the fault directly too, and nothing for a legal placement', () => {
    expect(kingPlacementError('8/8/8/8/8/8/8/8 w - - 0 1')).toBe(FEN_NO_KINGS_ERROR)
    expect(kingPlacementError('4k3/8/8/8/8/8/8/8 w - - 0 1')).toBe(FEN_NO_WHITE_KING_ERROR)
    expect(kingPlacementError('8/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(FEN_NO_BLACK_KING_ERROR)
    expect(kingPlacementError('8/8/8/8/8/8/4k3/4K3 w - - 0 1')).toBe(FEN_KINGS_ADJACENT_ERROR)
    expect(kingPlacementError('8/8/8/8/8/8/4K3/6k1 w - - 0 1')).toBeNull()
  })

  /**
   * The general message still wins for text that is not a position at all.
   * Prose has no kings either, and "neither side has a king" is the same
   * mistake as "six space-delimited fields" answered to a pasted sentence.
   */
  it('does not answer prose with a king fault', () => {
    expect(reason('not a fen at all')).toBe(FEN_PARSE_ERROR)
    expect(reason('hello world this is not a position')).toBe(FEN_PARSE_ERROR)
  })

  it('ends the borrowed sentences the way its own ones end', () => {
    expect(reason('7k/8/8/8/8/8/8/K7 x - - 0 1')).toMatch(/\.$/)
  })

  it('still accepts a legal position', () => {
    expect(validateFenForAnalysis('7k/P7/8/8/8/8/8/K7 w - - 0 1').ok).toBe(true)
  })

  /**
   * Text that is not a FEN at all keeps the general message. chess.js calls
   * this "must contain six space-delimited fields", which is true and useless
   * to someone who typed a sentence; the general message at least says what a
   * FEN is made of. Pinned before this change, and still pinned.
   */
  it('does not name a field when nothing about the text is a field', () => {
    expect(validateFenForAnalysis('not a fen at all'))
      .toEqual({ ok: false, error: FEN_PARSE_ERROR })
    expect(validateFenForAnalysis('7k/8/8/8/8/8/8/K7 w'))
      .toEqual({ ok: false, error: FEN_PARSE_ERROR })
  })
})
