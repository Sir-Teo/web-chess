/**
 * A move written the way a panel shows it, from the position it is played in.
 *
 * Both fall back to the raw UCI rather than to nothing: a move the position
 * cannot take is still more informative printed than blank, and it is the
 * shape of a bug the reader can report.
 */
import { Chess } from 'chess.js'
import { uciToSan } from './analysis'

export function bestMoveLabel(fen: string, uci: string | null | undefined): string {
  if (!uci) return '...'
  return uciToSan(fen, uci) ?? uci
}

/**
 * "12." or "12..." for a move, read off the position it produced.
 *
 * A FEN after a White move has Black to move at the same move number; one
 * after a Black move has White to move at the next. A position nobody has
 * moved in -- the root -- has no move and gets null.
 */
export function moveNumberPrefix(fenAfter: string): string | null {
  const parts = fenAfter.split(/\s+/)
  const number = Number(parts[5])
  if (!Number.isInteger(number) || number < 1) return null
  if (parts[1] === 'b') return `${number}.`
  if (parts[1] === 'w') return number > 1 ? `${number - 1}...` : null
  return null
}

/**
 * The reply the engine expects, in the position that reply is made in.
 *
 * That position is one move ahead of the board, so the best move has to be
 * played first: SAN for the ponder move read off the *current* position would
 * be notation for a move nobody makes there, and can disambiguate wrongly or
 * name a piece that has since moved.
 */
export function ponderMoveLabel(
  fen: string,
  bestMove: string | null | undefined,
  ponderMove: string | null | undefined,
): string {
  if (!ponderMove) return '...'
  if (!bestMove) return bestMoveLabel(fen, ponderMove)

  const replay = new Chess(fen)
  try {
    const move = replay.move({
      from: bestMove.slice(0, 2),
      to: bestMove.slice(2, 4),
      promotion: bestMove[4],
    })
    if (!move) return ponderMove
  } catch {
    return ponderMove
  }

  return uciToSan(replay.fen(), ponderMove) ?? ponderMove
}
