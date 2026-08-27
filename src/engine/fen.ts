import { Chess, validateFen } from 'chess.js'

export const FEN_PARSE_ERROR = 'Failed to parse FEN. Check piece placement, side to move, castling rights, and counters.'
export const FEN_KING_PLACEMENT_ERROR = 'Invalid FEN: kings cannot be adjacent or missing.'

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

    return { ok: true, fen }
  } catch {
    return { ok: false, error: FEN_PARSE_ERROR }
  }
}
