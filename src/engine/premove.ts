import { Chess, type Move, type Square } from 'chess.js'

/**
 * A move queued while it is not yet your turn.
 *
 * The point is bullet and blitz: the reply to a forced recapture is known
 * before the opponent has played, and waiting for them costs the seconds the
 * game is decided by. Now that Play mode has a clock, this is the other half of
 * being able to play a fast game here at all.
 *
 * A premove cannot be checked for legality when it is made — the position it
 * will be played into does not exist yet. So the rule is deliberately loose on
 * the way in (is that your piece?) and strict on the way out (does chess.js
 * take it?), and anything that does not fit the position that arrives is
 * dropped without comment. That is what every board that has premoves does; the
 * alternative is refusing moves that would have been legal.
 */

export type Premove = {
  from: Square
  to: Square
  /** Always a queen when a promotion is implied. See `premoveFromSquares`. */
  promotion?: 'q'
}

export type PremoveContext = {
  workspaceMode: 'play' | 'analysis'
  gameMode: 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'
  /** Side to move in the position on the board. */
  turn: 'w' | 'b'
  /** The side the human has. */
  playerColor: 'w' | 'b'
  gameOver: boolean
  clockFlagged: boolean
  paused: boolean
}

/**
 * Whether the board should be accepting a premove right now.
 *
 * Only against the engine, and only while it is the engine's turn: pass and
 * play has no waiting to do, and in analysis a move made out of turn is just a
 * move. Pausing suspends it too, because a paused game is one the reader has
 * stepped out of and a queued move would fire the moment they came back.
 */
export function canPremove(context: PremoveContext): boolean {
  if (context.workspaceMode !== 'play') return false
  if (context.gameMode !== 'human-vs-ai') return false
  if (context.gameOver || context.clockFlagged || context.paused) return false
  return context.turn !== context.playerColor
}

/** Whether a square holds a piece the human could premove. */
export function isPremoveablePiece(fen: string, square: string, playerColor: 'w' | 'b'): boolean {
  try {
    const piece = new Chess(fen).get(square as Square)
    return Boolean(piece && piece.color === playerColor)
  } catch {
    return false
  }
}

const LAST_RANK: Record<'w' | 'b', string> = { w: '8', b: '1' }

/**
 * A premove from two squares, or null when it could never be one.
 *
 * Legality is not checked and cannot be — the position it will be played into
 * has not happened. What is checked is the only thing that is knowable now:
 * that the piece is yours, and that you are not moving it onto itself.
 *
 * A pawn reaching the last rank promotes to a queen, without asking. Every
 * board with premoves does this: the dialog would have to appear during the
 * opponent's turn, for a move that may never be played, and the answer is a
 * queen more than ninety-nine times in a hundred.
 */
export function premoveFromSquares(
  fen: string,
  from: string,
  to: string,
  playerColor: 'w' | 'b',
): Premove | null {
  if (!from || !to || from === to) return null
  if (!isPremoveablePiece(fen, from, playerColor)) return null

  let piece
  try {
    piece = new Chess(fen).get(from as Square)
  } catch {
    return null
  }
  if (!piece) return null

  const promotes = piece.type === 'p' && to[1] === LAST_RANK[playerColor]
  return promotes
    ? { from: from as Square, to: to as Square, promotion: 'q' }
    : { from: from as Square, to: to as Square }
}

/**
 * Play a queued premove into the position that actually arrived, or report that
 * it does not fit.
 *
 * Mutates the position it is given on success, the way `chess.move` does, so a
 * caller can carry on from it. On failure the position is untouched: chess.js
 * throws rather than applying a partial move.
 */
export function applyPremove(position: Chess, premove: Premove): Move | null {
  try {
    return position.move({ from: premove.from, to: premove.to, promotion: premove.promotion }) ?? null
  } catch {
    return null
  }
}

/** Whether a queued premove is still worth trying in this position. */
export function premoveStillFits(fen: string, premove: Premove): boolean {
  try {
    return applyPremove(new Chess(fen), premove) !== null
  } catch {
    return false
  }
}
