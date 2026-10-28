import type { Move } from 'chess.js'

/**
 * Who is up material, and by how much.
 *
 * The one thing every other board shows beside the players and this one did
 * not. A beginner reading an evaluation bar learns that they are worse; a
 * material count tells them *why* in the only currency they already understand,
 * and it is the first thing anyone checks after a trade.
 *
 * Material value comes from the position. Captures follow the selected line,
 * so a position study starts without invented captures and promotions retain
 * the identity of the pieces actually taken.
 */

/** Centipawns would be false precision here: this is the count players do in their heads. */
export const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

/** Heaviest first, which is the order every captured-piece strip uses. */
const DISPLAY_ORDER = ['q', 'r', 'b', 'n', 'p']

export type MaterialMove = Readonly<Pick<Move, 'color' | 'captured'>>

export type MaterialBalance = {
  /** Positive when White is ahead, negative when Black is, zero when level. */
  delta: number
  /** Black pieces missing from the board, heaviest first. */
  capturedByWhite: string[]
  /** White pieces missing from the board, heaviest first. */
  capturedByBlack: string[]
}

const EMPTY: MaterialBalance = { delta: 0, capturedByWhite: [], capturedByBlack: [] }

function countPieces(fen: string): Record<string, number> | null {
  const board = String(fen ?? '').trim().split(/\s+/)[0]
  if (!board) return null
  const counts: Record<string, number> = {}
  for (const character of board) {
    if (!/[pnbrqkPNBRQK]/.test(character)) continue
    counts[character] = (counts[character] ?? 0) + 1
  }
  return counts
}

function valueOf(counts: Record<string, number>, upper: boolean): number {
  let total = 0
  for (const [piece, value] of Object.entries(PIECE_VALUES)) {
    total += (counts[upper ? piece.toUpperCase() : piece] ?? 0) * value
  }
  return total
}

/**
 * `rootFen` is the position the game started from, not the standard array, so
 * a game set up from a FEN counts what has gone since *it* began.
 *
 * When the complete line from that root is available, read its actual captures.
 * A promoted pawn has not been captured, and a captured promoted queen is a
 * queen even if none existed in the starting position. Without a move history,
 * retain the missing-piece estimate. Material value always comes from the FEN.
 */
export function materialBalance(rootFen: string, fen: string, moves?: readonly MaterialMove[]): MaterialBalance {
  const now = countPieces(fen)
  if (!now) return EMPTY

  const delta = valueOf(now, true) - valueOf(now, false)
  if (moves) {
    const white: string[] = [], black: string[] = []
    for (const move of moves) {
      if (move.captured) (move.color === 'w' ? white : black).push(move.captured)
    }
    const ordered = (pieces: string[]) => DISPLAY_ORDER.flatMap(piece => pieces.filter(taken => taken === piece))
    return { delta, capturedByWhite: ordered(white), capturedByBlack: ordered(black) }
  }
  const root = countPieces(rootFen)
  if (!root) return { delta, capturedByWhite: [], capturedByBlack: [] }

  const missing = (upper: boolean) => DISPLAY_ORDER.flatMap(piece => {
    const key = upper ? piece.toUpperCase() : piece
    const gone = Math.max(0, (root[key] ?? 0) - (now[key] ?? 0))
    return Array.from({ length: gone }, () => piece)
  })

  return { delta, capturedByWhite: missing(false), capturedByBlack: missing(true) }
}

/** "+3" for the side that is ahead, and nothing at all when the game is level. */
export function materialAdvantageLabel(delta: number, side: 'w' | 'b'): string | null {
  const ahead = side === 'w' ? delta : -delta
  return ahead > 0 ? `+${ahead}` : null
}

const PIECE_NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }
const SMALL_NUMBERS = ['', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']

/**
 * "a rook and two pawns", for the tooltip and the screen reader.
 *
 * Words rather than glyphs because this is the text a screen reader speaks,
 * and "♜♟♟" is not something anyone should have to hear read out.
 */
export function describeCaptures(pieces: string[]): string {
  const counts = new Map<string, number>()
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1)

  const parts = DISPLAY_ORDER.filter(piece => counts.has(piece)).map(piece => {
    const count = counts.get(piece)!
    const name = count === 1 ? PIECE_NAMES[piece] : `${PIECE_NAMES[piece]}s`
    return `${SMALL_NUMBERS[count] ?? count} ${name}`
  })

  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
