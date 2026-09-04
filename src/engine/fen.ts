import { Chess, validateFen } from 'chess.js'

export const FEN_PARSE_ERROR = 'Failed to parse FEN. Check piece placement, side to move, castling rights, and counters.'
export const FEN_KING_PLACEMENT_ERROR = 'Invalid FEN: kings cannot be adjacent or missing.'
export const FEN_OPPONENT_IN_CHECK_ERROR = 'Invalid FEN: the side that is not to move is already in check, which no legal game can reach. Check the side to move.'

export type FenValidationResult =
  | { ok: true; fen: string }
  | { ok: false; error: string }

type BoardSquare = {
  file: number
  rank: number
}

function findKingSquares(fen: string): { black: BoardSquare | null; white: BoardSquare | null } {
  const board = fen.trim().split(/\s+/)[0] ?? ''
  let file = 0
  let rank = 7
  let white: BoardSquare | null = null
  let black: BoardSquare | null = null

  for (const char of board) {
    if (char === '/') {
      file = 0
      rank -= 1
      continue
    }
    if (/\d/.test(char)) {
      file += Number(char)
      continue
    }
    if (char === 'K') white = { file, rank }
    if (char === 'k') black = { file, rank }
    file += 1
  }

  return { black, white }
}

export function hasLegalKingPlacement(fen: string): boolean {
  const { black, white } = findKingSquares(fen)
  if (!black || !white) return false

  const fileDistance = Math.abs(white.file - black.file)
  const rankDistance = Math.abs(white.rank - black.rank)
  return Math.max(fileDistance, rankDistance) > 1
}

/**
 * Whether the side that is *not* to move is standing in check.
 *
 * An impossible position, for the same reason adjacent kings are: the player
 * who just moved cannot have left their own king attacked, so no legal game
 * reaches it. It is the easiest illegal FEN to type by accident, because it
 * takes only the wrong letter in the side-to-move field.
 *
 * Worth refusing rather than loading, because what the app does with one is
 * worse than a refusal. Measured on `4k3/8/8/8/8/8/8/r3K3 b - - 0 1`: the board
 * takes it and reads "Black to move", the local engine returns no line and no
 * evaluation at all, and the panel reports "Tablebase: Lichess tablebase
 * request failed (400)" -- blaming the network for a position that cannot
 * exist. `chess.js` does not check this and neither did we.
 *
 * Asked by flipping the side to move and reading `isCheck`, which is the same
 * question from the other side. The en-passant square goes with the flip: it
 * describes the previous move, and keeping it can make the flipped position
 * one `chess.js` will not construct. Anything it will not construct answers
 * false -- a FEN is refused on evidence, not on failure to gather it.
 */
export function opponentIsInCheck(fen: string): boolean {
  const parts = fen.trim().split(/\s+/)
  if (parts.length < 2 || (parts[1] !== 'w' && parts[1] !== 'b')) return false
  const flipped = [...parts]
  flipped[1] = parts[1] === 'w' ? 'b' : 'w'
  if (flipped.length > 3) flipped[3] = '-'
  try {
    return new Chess(flipped.join(' ')).isCheck()
  } catch {
    return false
  }
}

export function validateFenForAnalysis(fenText: string): FenValidationResult {
  const trimmed = fenText.trim()
  const syntax = validateFen(trimmed)
  if (!syntax.ok) {
    return {
      ok: false,
      error: /king/i.test(syntax.error ?? '') ? FEN_KING_PLACEMENT_ERROR : FEN_PARSE_ERROR,
    }
  }

  try {
    const fen = new Chess(trimmed).fen()
    if (!hasLegalKingPlacement(fen)) {
      return { ok: false, error: FEN_KING_PLACEMENT_ERROR }
    }
    if (opponentIsInCheck(fen)) {
      return { ok: false, error: FEN_OPPONENT_IN_CHECK_ERROR }
    }

    return { ok: true, fen }
  } catch {
    return { ok: false, error: FEN_PARSE_ERROR }
  }
}
