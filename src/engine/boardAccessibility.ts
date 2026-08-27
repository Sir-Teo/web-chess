import { Chess, type Square } from 'chess.js'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

const COLOR_NAMES: Record<string, string> = {
  w: 'White',
  b: 'Black',
}

export const BOARD_SQUARES = FILES.flatMap(file => RANKS.map(rank => `${file}${rank}` as Square))
const BOARD_SQUARE_SET = new Set<string>(BOARD_SQUARES)

type BoardSquareDescriptionOptions = {
  selectedSquare?: Square | null
  legalTargets?: Square[]
}

export function isBoardSquare(value: string): value is Square {
  return BOARD_SQUARE_SET.has(value)
}

export function describeBoardSquare(
  chess: Chess,
  square: Square,
  { selectedSquare = null, legalTargets = [] }: BoardSquareDescriptionOptions = {},
): string {
  const piece = chess.get(square)
  const pieceLabel = piece
    ? `${COLOR_NAMES[piece.color] ?? piece.color} ${PIECE_NAMES[piece.type] ?? piece.type}`
    : 'empty square'
  const stateLabels: string[] = []

  if (selectedSquare === square) {
    stateLabels.push('selected')
  }
  if (legalTargets.includes(square)) {
    stateLabels.push(piece ? 'legal capture target' : 'legal move target')
  }

  return [square, pieceLabel, ...stateLabels].join(', ')
}
