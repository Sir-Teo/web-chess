import { Chess, validateFen } from 'chess.js'
import { looksLikeGame, looksLikeGameUrl } from './pastedText'

export const FEN_PARSE_ERROR = 'Failed to parse FEN. Check piece placement, side to move, castling rights, and counters.'
/**
 * The one sentence three different faults used to share.
 *
 * Kept because the pass-through above falls back to it for any chess.js reason
 * mentioning a king, where this file cannot tell which fault it was. Every
 * position this file checks itself gets one of the three below instead.
 */
export const FEN_KING_PLACEMENT_ERROR = 'Invalid FEN: kings cannot be adjacent or missing.'

/**
 * Which king fault a position has, in the reader's words.
 *
 * `hasLegalKingPlacement` already knew the difference and threw it away.
 * **Measured** by building positions on the setup board a square at a time: an
 * empty board, a board with one king, and two kings side by side each answered
 * "Invalid FEN: kings cannot be adjacent or missing" -- two faults named in one
 * sentence, neither of them the one in front of the reader, and nothing to say
 * which. This file already says as much about chess.js's own messages: naming
 * several fields and leaving the reader to work out which is the thing worth
 * not doing.
 */
export const FEN_NO_KINGS_ERROR = 'Invalid FEN: neither side has a king, and a position needs both.'
export const FEN_NO_WHITE_KING_ERROR = 'Invalid FEN: White has no king.'
export const FEN_NO_BLACK_KING_ERROR = 'Invalid FEN: Black has no king.'
export const FEN_KINGS_ADJACENT_ERROR = 'Invalid FEN: the two kings are side by side, which no legal position reaches.'

/** The fault, or null when the kings are placed legally. */
export function kingPlacementError(fen: string): string | null {
  const { black, white } = findKingSquares(fen)
  if (!white && !black) return FEN_NO_KINGS_ERROR
  if (!white) return FEN_NO_WHITE_KING_ERROR
  if (!black) return FEN_NO_BLACK_KING_ERROR

  const fileDistance = Math.abs(white.file - black.file)
  const rankDistance = Math.abs(white.rank - black.rank)
  return Math.max(fileDistance, rankDistance) > 1 ? null : FEN_KINGS_ADJACENT_ERROR
}
export const FEN_OPPONENT_IN_CHECK_ERROR = 'Invalid FEN: the side that is not to move is already in check, which no legal game can reach. Check the side to move.'
export const FEN_LOOKS_LIKE_GAME_ERROR = 'That is a game, not one position. Import it from the Import tab above.'
export const FEN_LOOKS_LIKE_URL_ERROR = 'That is a link, not a position. Open it and copy the FEN from the board there.'

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

/**
 * What to tell a reader about a FEN that failed the syntax check.
 *
 * chess.js already says which field is wrong, in the same shape as the two
 * messages this file writes itself -- "Invalid FEN: side-to-move is invalid",
 * "Invalid FEN: some pawns are on the edge rows", "Invalid FEN: castling
 * availability is invalid". All of it was being thrown away for
 * `FEN_PARSE_ERROR`, which names four fields and leaves the reader to work out
 * which one. Only `/king/i` survived, because that is the one case this file
 * has a better sentence for.
 *
 * Passed through rather than translated: inventing a phrasing for each of the
 * nine would be a table to keep in step with a dependency, and these are
 * already written for readers. If a future version stops using the prefix, this
 * falls back to the message that was shown before rather than to something
 * worse.
 *
 * One of them is not passed through. "Must contain six space-delimited fields"
 * is what chess.js says about text that is not a FEN at all -- prose, a
 * sentence, half a paste -- and telling someone who typed "not a fen at all"
 * about space-delimited fields is worse than the general message, which at
 * least lists what a FEN is made of. That case is the reason the general
 * message exists, and a test written before this one pins it.
 */
const FEN_WRONG_SHAPE_ENTIRELY = /six space-delimited fields/i

function fenSyntaxUserError(reason: string | undefined, fen: string): string {
  if (!reason) return FEN_PARSE_ERROR
  // Before anything else: text that is not a FEN at all has no kings either,
  // and answering "neither side has a king" to a pasted sentence is the same
  // mistake as answering "six space-delimited fields" to it.
  if (FEN_WRONG_SHAPE_ENTIRELY.test(reason)) return FEN_PARSE_ERROR
  // Then this file's own checker, because it is the one that tells all three
  // king faults apart -- and because the catch-all that used to live here threw
  // away a precision chess.js already had. Measured: chess.js answers a kingless
  // board "Invalid FEN: missing white king" and a one-king board "missing black
  // king", and both were being replaced by "kings cannot be adjacent or
  // missing", which is the exact swap the rest of this function exists to undo.
  const kingFault = kingPlacementError(fen)
  if (kingFault) return kingFault
  if (/king/i.test(reason)) return FEN_KING_PLACEMENT_ERROR
  if (!reason.startsWith('Invalid FEN:')) return FEN_PARSE_ERROR
  // The sentences here end in a full stop; chess.js's do not.
  return /[.!?]$/.test(reason) ? reason : `${reason}.`
}

export function hasLegalKingPlacement(fen: string): boolean {
  return kingPlacementError(fen) === null
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
  // What it is, before what is wrong with it: a game and a link are both
  // things this box cannot take, and neither has piece placement to check.
  if (looksLikeGameUrl(trimmed)) return { ok: false, error: FEN_LOOKS_LIKE_URL_ERROR }
  if (looksLikeGame(trimmed)) return { ok: false, error: FEN_LOOKS_LIKE_GAME_ERROR }
  const syntax = validateFen(trimmed)
  if (!syntax.ok) {
    return { ok: false, error: fenSyntaxUserError(syntax.error, trimmed) }
  }

  try {
    const fen = new Chess(trimmed).fen()
    const kingError = kingPlacementError(fen)
    if (kingError) {
      return { ok: false, error: kingError }
    }
    if (opponentIsInCheck(fen)) {
      return { ok: false, error: FEN_OPPONENT_IN_CHECK_ERROR }
    }

    return { ok: true, fen }
  } catch {
    return { ok: false, error: FEN_PARSE_ERROR }
  }
}
