import { Chess, type Square } from 'chess.js'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const DISPLAY_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const
const FEN_RANKS = DISPLAY_RANKS
const PIECE_PATTERN = /^[pnbrqkPNBRQK]$/
const CASTLING_ORDER = ['K', 'Q', 'k', 'q'] as const

export type SetupPiece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type SetupTurn = 'w' | 'b'
export type SetupCastlingRight = typeof CASTLING_ORDER[number]

const CASTLING_REQUIREMENTS: Record<SetupCastlingRight, {
  king: Square
  kingPiece: SetupPiece
  rook: Square
  rookPiece: SetupPiece
}> = {
  K: { king: 'e1', kingPiece: 'K', rook: 'h1', rookPiece: 'R' },
  Q: { king: 'e1', kingPiece: 'K', rook: 'a1', rookPiece: 'R' },
  k: { king: 'e8', kingPiece: 'k', rook: 'h8', rookPiece: 'r' },
  q: { king: 'e8', kingPiece: 'k', rook: 'a8', rookPiece: 'r' },
}

export type PositionSetup = {
  pieces: Partial<Record<Square, SetupPiece>>
  turn: SetupTurn
  castling: string
  halfmove: number
  fullmove: number
}

export const SETUP_BOARD_SQUARES: Square[] = DISPLAY_RANKS.flatMap(rank =>
  FILES.map(file => `${file}${rank}` as Square),
)

export const SETUP_PIECE_OPTIONS: Array<{ piece: SetupPiece; label: string; glyph: string }> = [
  { piece: 'P', label: 'White pawn', glyph: '♙' },
  { piece: 'N', label: 'White knight', glyph: '♘' },
  { piece: 'B', label: 'White bishop', glyph: '♗' },
  { piece: 'R', label: 'White rook', glyph: '♖' },
  { piece: 'Q', label: 'White queen', glyph: '♕' },
  { piece: 'K', label: 'White king', glyph: '♔' },
  { piece: 'p', label: 'Black pawn', glyph: '♟' },
  { piece: 'n', label: 'Black knight', glyph: '♞' },
  { piece: 'b', label: 'Black bishop', glyph: '♝' },
  { piece: 'r', label: 'Black rook', glyph: '♜' },
  { piece: 'q', label: 'Black queen', glyph: '♛' },
  { piece: 'k', label: 'Black king', glyph: '♚' },
]

const PIECE_LABELS = Object.fromEntries(SETUP_PIECE_OPTIONS.map(option => [option.piece, option.label])) as Record<SetupPiece, string>
const PIECE_GLYPHS = Object.fromEntries(SETUP_PIECE_OPTIONS.map(option => [option.piece, option.glyph])) as Record<SetupPiece, string>

export function setupPieceLabel(piece: SetupPiece): string {
  return PIECE_LABELS[piece]
}

export function setupPieceGlyph(piece: SetupPiece): string {
  return PIECE_GLYPHS[piece]
}

export function createEmptyPositionSetup(): PositionSetup {
  return {
    pieces: {},
    turn: 'w',
    castling: '-',
    halfmove: 0,
    fullmove: 1,
  }
}

export function createStartingPositionSetup(): PositionSetup {
  return parsePositionSetupFen(new Chess().fen()) ?? createEmptyPositionSetup()
}

export function normalizeCastlingRights(value: string | undefined): string {
  if (!value || value === '-') return '-'

  const rights = new Set(value.split('').filter(char => CASTLING_ORDER.includes(char as typeof CASTLING_ORDER[number])))
  const normalized = CASTLING_ORDER.filter(right => rights.has(right)).join('')
  return normalized || '-'
}

export function canUseSetupCastlingRight(setup: PositionSetup, right: SetupCastlingRight): boolean {
  const requirement = CASTLING_REQUIREMENTS[right]
  return setup.pieces[requirement.king] === requirement.kingPiece
    && setup.pieces[requirement.rook] === requirement.rookPiece
}

export function hasSetupCastlingRight(setup: PositionSetup, right: SetupCastlingRight): boolean {
  return normalizeAvailableCastlingRights(setup).includes(right)
}

export function parsePositionSetupFen(fen: string): PositionSetup | null {
  const parts = fen.trim().split(/\s+/g)
  if (parts.length < 1) return null

  const placement = parts[0]
  if (!placement) return null

  const ranks = placement.split('/')
  if (ranks.length !== 8) return null

  const pieces: Partial<Record<Square, SetupPiece>> = {}

  for (let rankIndex = 0; rankIndex < ranks.length; rankIndex += 1) {
    const rank = FEN_RANKS[rankIndex]
    const row = ranks[rankIndex]
    if (!rank || row === undefined) return null

    let fileIndex = 0
    for (const char of row) {
      if (/^[1-8]$/.test(char)) {
        fileIndex += Number(char)
        continue
      }

      if (!PIECE_PATTERN.test(char)) return null
      if (fileIndex >= FILES.length) return null

      pieces[`${FILES[fileIndex]}${rank}` as Square] = char as SetupPiece
      fileIndex += 1
    }

    if (fileIndex !== FILES.length) return null
  }

  const turn = parts[1] === 'b' ? 'b' : 'w'
  const halfmove = normalizeNonNegativeInteger(parts[4], 0)
  const fullmove = Math.max(1, normalizeNonNegativeInteger(parts[5], 1))

  return {
    pieces,
    turn,
    castling: normalizeCastlingRights(parts[2]),
    halfmove,
    fullmove,
  }
}

export function positionSetupToFen(setup: PositionSetup): string {
  const ranks = FEN_RANKS.map(rank => {
    let row = ''
    let empty = 0

    for (const file of FILES) {
      const piece = setup.pieces[`${file}${rank}` as Square]
      if (!piece) {
        empty += 1
        continue
      }

      if (empty) {
        row += String(empty)
        empty = 0
      }
      row += piece
    }

    return row + (empty ? String(empty) : '')
  })

  return [
    ranks.join('/'),
    setup.turn,
    normalizeAvailableCastlingRights(setup),
    '-',
    Math.max(0, Math.floor(setup.halfmove)),
    Math.max(1, Math.floor(setup.fullmove)),
  ].join(' ')
}

export function updateSetupSquare(setup: PositionSetup, square: Square, piece: SetupPiece | null): PositionSetup {
  const pieces = { ...setup.pieces }
  if (piece) pieces[square] = piece
  else delete pieces[square]
  const next = { ...setup, pieces }
  return { ...next, castling: normalizeAvailableCastlingRights(next) }
}

export function updateSetupTurn(setup: PositionSetup, turn: SetupTurn): PositionSetup {
  return { ...setup, turn }
}

export function updateSetupCastlingRight(
  setup: PositionSetup,
  right: SetupCastlingRight,
  enabled: boolean,
): PositionSetup {
  const rights = new Set(normalizeCastlingRights(setup.castling).replace('-', '').split(''))
  if (enabled) rights.add(right)
  else rights.delete(right)

  const next = {
    ...setup,
    castling: normalizeCastlingRights(CASTLING_ORDER.filter(castlingRight => rights.has(castlingRight)).join('')),
  }
  return { ...next, castling: normalizeAvailableCastlingRights(next) }
}

export function updateSetupHalfmove(setup: PositionSetup, value: number): PositionSetup {
  return { ...setup, halfmove: normalizeCounter(value, 0, 0) }
}

export function updateSetupFullmove(setup: PositionSetup, value: number): PositionSetup {
  return { ...setup, fullmove: normalizeCounter(value, 1, 1) }
}

function normalizeNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.floor(parsed))
}

function normalizeCounter(value: number, fallback: number, min: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.floor(value))
}

function normalizeAvailableCastlingRights(setup: PositionSetup): string {
  const normalized = normalizeCastlingRights(setup.castling)
  if (normalized === '-') return '-'

  const rights = CASTLING_ORDER
    .filter(right => normalized.includes(right) && canUseSetupCastlingRight(setup, right))
    .join('')
  return rights || '-'
}
