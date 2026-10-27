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
  premove?: boolean
  queuedPremove?: { from: Square; to: Square } | null
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

/** A keyboard destination in the visible board, without wrapping across an edge. */
export function boardKeyboardDestination(square: Square, key: string, orientation: 'white' | 'black'): Square | null {
  let file = square.charCodeAt(0) - 97
  let rank = Number(square[1]) - 1
  const direction = orientation === 'white' ? 1 : -1
  switch (key) {
    case 'ArrowLeft': file -= direction; break
    case 'ArrowRight': file += direction; break
    case 'ArrowUp': rank += direction; break
    case 'ArrowDown': rank -= direction; break
    case 'Home': file = orientation === 'white' ? 0 : 7; break
    case 'End': file = orientation === 'white' ? 7 : 0; break
    default: return null
  }
  return `${String.fromCharCode(97 + Math.max(0, Math.min(7, file)))}${Math.max(0, Math.min(7, rank)) + 1}` as Square
}

export function describeBoardSquare(
  chess: Chess,
  square: Square,
  { selectedSquare = null, legalTargets = [], premove = false, queuedPremove = null, hidePiece = false }: BoardSquareDescriptionOptions = {},
): string {
  const piece = chess.get(square)
  const pieceLabel = piece
    ? `${COLOR_NAMES[piece.color] ?? piece.color} ${PIECE_NAMES[piece.type] ?? piece.type}`
    : 'empty square'
  const stateLabels: string[] = []

  if (selectedSquare === square) {
    stateLabels.push('selected')
  }
  if (premove && selectedSquare && selectedSquare !== square) {
    stateLabels.push('premove target')
  } else if (legalTargets.includes(square)) {
    stateLabels.push(piece ? 'legal capture target' : 'legal move target')
  }
  if (queuedPremove?.from === square) stateLabels.push(`premove queued to ${queuedPremove.to}`)
  if (queuedPremove?.to === square) stateLabels.push(`premove queued from ${queuedPremove.from}`)
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
