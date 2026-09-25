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
  /**
   * Leave the piece out, for the description that is *shown* under a
   * blindfold. The accessible name never uses this -- see the note on the
   * `blindfold` state in App.tsx for why a screen reader keeps the board.
   */
  hidePiece?: boolean
}

export function isBoardSquare(value: string): value is Square {
  return BOARD_SQUARE_SET.has(value)
}

export function describeBoardSquare(
  chess: Chess,
  square: Square,
  { selectedSquare = null, legalTargets = [], hidePiece = false }: BoardSquareDescriptionOptions = {},
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
  // The board paints the checked king red; a screen reader moving square by
  // square should meet the same fact on the same square.
  if (piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck()) {
    stateLabels.push('in check')
  }

  // Under a blindfold an occupied square and an empty one have to read the
  // same, or the tooltip answers the question the exercise is asking -- and
  // "in check" would say where the king is.
  if (hidePiece) return [square, ...stateLabels.filter(label => label !== 'in check')].join(', ')
  return [square, pieceLabel, ...stateLabels].join(', ')
}
