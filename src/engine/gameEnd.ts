import type { Chess } from 'chess.js'

/**
 * Why a game is over, in the words the board strip and the game-over card use.
 *
 * Two things were missing before this existed. The strip said "Draw" for three
 * endings that are not the same ending — a beginner whose winning endgame
 * evaporated was told only that it had — and the PGN `Result` tag was set from
 * the clock alone, so a game that ended by checkmate exported as `*`. That
 * second one travels: the library, the auto-save and the review's narrative
 * tags all read `Result`, and every other program reads `*` as "unfinished".
 */

export type GameEndResult = '1-0' | '0-1' | '1/2-1/2'

export type GameEnd = {
  /** The cause first, then the outcome: "Stalemate · Draw". */
  label: string
  /** The PGN `Result` tag this ending deserves. */
  result: GameEndResult
}

/**
 * The result as a score line reads it -- "1-0", "0-1", "½-½" -- for the
 * places that print a number for a live position and would otherwise print
 * the mate sentinel: "-100" on the eval bar under a checkmate is a number,
 * but not one anybody means.
 */
export function gameResultScore(result: GameEndResult): string {
  return result === '1/2-1/2' ? '½-½' : result
}

/**
 * The ending for a finished position, or null while the game is still on.
 *
 * Order is deliberate. Checkmate and stalemate describe the side to move
 * having no move, so they come first and are never ambiguous. Insufficient
 * material is next because a dead position is drawn the moment it arises,
 * without anyone claiming anything.
 *
 * Repetition before the fifty-move rule is a genuine coin toss: a final
 * position can satisfy both, and which one actually ended the game depends on
 * an order this function cannot see. Repetition is named because it is much
 * the more common of the two.
 */
export function describeGameEnd(game: Chess): GameEnd | null {
  if (game.isCheckmate()) {
    // `turn()` is the side that has been mated.
    return game.turn() === 'w'
      ? { label: 'Checkmate · Black wins', result: '0-1' }
      : { label: 'Checkmate · White wins', result: '1-0' }
  }

  if (game.isStalemate()) return { label: 'Stalemate · Draw', result: '1/2-1/2' }
  if (game.isInsufficientMaterial()) return { label: 'Insufficient material · Draw', result: '1/2-1/2' }
  if (game.isThreefoldRepetition()) return { label: 'Threefold repetition · Draw', result: '1/2-1/2' }
  if (game.isDrawByFiftyMoves()) return { label: 'Fifty-move rule · Draw', result: '1/2-1/2' }

  // A draw chess.js recognises but does not break down. Nothing reaches this
  // today; it is here so a future rule cannot make the strip say "White to
  // move" under a finished game, which is the bug this whole label exists for.
  if (game.isDraw()) return { label: 'Draw', result: '1/2-1/2' }

  return null
}
