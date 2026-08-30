import { Chess } from 'chess.js'

/**
 * "What is the opponent threatening?" — the question a player asks before every
 * move and the app could not answer.
 *
 * The trick every GUI uses is a null move: hand the engine the same position
 * with the *other* side to move, and its best move is the thing you have to
 * stop. Nibbler and Lichess both do this; it is the cheapest way to turn an
 * evaluation into advice a beginner can act on, and pros use it to scan a
 * position without playing through it.
 */

export type ThreatProbe =
  | { ok: true; fen: string }
  | { ok: false; reason: string }

/**
 * The position with the side to move swapped, or why it cannot be asked for.
 *
 * Two details are load-bearing, both found by putting flipped FENs through
 * chess.js rather than by reasoning:
 *
 * - **The en-passant square has to go.** It describes a capture the other side
 *   could make, so it is nonsense once the side to move changes, and chess.js
 *   rejects the FEN outright: "Invalid FEN: illegal en-passant square".
 * - **A position in check has to be refused here.** chess.js *accepts* a
 *   flipped FEN that leaves the opponent in check, so nothing downstream would
 *   catch it — and the position is illegal, so whatever the engine returned for
 *   it would be meaningless. It is also the one case where the question has an
 *   obvious answer already: the threat is the check.
 */
export function nullMoveProbe(fen: string): ThreatProbe {
  let position: Chess
  try {
    position = new Chess(fen)
  } catch {
    return { ok: false, reason: 'This position cannot be read.' }
  }

  if (position.isGameOver()) {
    return { ok: false, reason: 'The game is over, so there is nothing to threaten.' }
  }

  if (position.isCheck()) {
    return { ok: false, reason: 'You are in check, so the check is the threat.' }
  }

  const fields = position.fen().split(' ')
  if (fields.length < 6) return { ok: false, reason: 'This position cannot be read.' }

  fields[1] = fields[1] === 'w' ? 'b' : 'w'
  fields[3] = '-'
  const flipped = fields.join(' ')

  try {
    // Round-tripped rather than trusted: castling rights and the rest come
    // straight from a position chess.js already accepted, but the flip is ours.
    new Chess(flipped)
  } catch {
    return { ok: false, reason: 'The threat cannot be read from this position.' }
  }

  return { ok: true, fen: flipped }
}
