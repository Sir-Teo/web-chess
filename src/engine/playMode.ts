export type PlayGameMode = 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'
export type PlayColor = 'white' | 'black'
export type PlayOrientation = 'white' | 'black'

export function defaultOrientationForGameMode(
  mode: PlayGameMode,
  playerColor: PlayColor,
): PlayOrientation {
  return mode === 'human-vs-ai' ? playerColor : 'white'
}

/**
 * The side to move in a FEN.
 *
 * This is who takes over when a position is handed from the analysis board to
 * Play mode: someone stopping at a critical moment wants to find *that* move,
 * not to watch the other side reply. Reads the field rather than building a
 * position, so a malformed tail cannot affect it -- the rule gamePhase.ts
 * follows for the same reason.
 *
 * Returns null for anything that does not name a side, which is the caller's
 * signal to leave the board alone.
 */
export function sideToMoveColor(fen: string): PlayColor | null {
  const field = String(fen ?? '').trim().split(/\s+/)[1]
  if (field === 'w') return 'white'
  if (field === 'b') return 'black'
  return null
}

export type AiSearchHistory = {
  rootFen: string
  moves: string[]
}

/**
 * The move history to hand the play engine along with the position, or
 * undefined when there is none worth sending.
 *
 * `position fen <current>` on its own -- which is all this app sent the play
 * engine -- costs the engine repetition detection. Stockfish builds its
 * repetition history from the moves in the position command, so with none it
 * cannot know the position has occurred before: it will shuffle into a
 * threefold draw from a winning position, and will not steer into one from a
 * losing position. The analysis engine has always sent the history; the engine
 * you actually play against did not.
 *
 * The history is only usable if it leads to the position being searched. A
 * stale one is worse than none -- it would hand the engine a *different* game's
 * repetitions -- so the two are checked against each other rather than assumed
 * to agree.
 */
export function aiSearchHistory(
  requestFen: string,
  currentNodeFen: string,
  rootFen: string,
  pathMoves: string[],
): AiSearchHistory | undefined {
  if (!requestFen || requestFen !== currentNodeFen) return undefined
  if (!rootFen) return undefined
  const moves = pathMoves.filter(Boolean)
  if (!moves.length) return undefined
  return { rootFen, moves }
}
