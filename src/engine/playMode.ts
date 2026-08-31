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

/**
 * How many plies a takeback should undo.
 *
 * A takeback returns the board to the last position the human was asked to
 * move from, which is not always one ply. Against the engine it is normally
 * two — your move and the reply — but only one if the engine has not answered
 * yet, and none at all if the last move on the board was not yours to take
 * back.
 *
 * Returns 0 when there is nothing to undo, which is also the answer for AI vs
 * AI: nobody played those moves.
 */
export function takebackPlyCount({
  gameMode,
  playerColor,
  pliesPlayed,
  /** Whose turn it is at the tip of the line. */
  turn,
}: {
  gameMode: PlayGameMode
  playerColor: PlayColor
  pliesPlayed: number
  turn: PlayColor
}): number {
  if (pliesPlayed <= 0) return 0
  if (gameMode === 'ai-vs-ai') return 0
  // Pass and play: the last move is always a human's, so one ply is a takeback.
  if (gameMode === 'human-vs-human') return 1

  // Against the engine: back to the human's own turn.
  //   turn === playerColor  -> the engine has replied, undo both
  //   turn !== playerColor  -> your move is the last one, undo just it
  const plies = turn === playerColor ? 2 : 1
  return Math.min(plies, pliesPlayed)
}

/** Why a takeback is unavailable, or null when it is. */
export function takebackDisabledReason({
  gameMode,
  pliesPlayed,
  plies,
}: {
  gameMode: PlayGameMode
  pliesPlayed: number
  plies: number
}): string | null {
  if (gameMode === 'ai-vs-ai') return 'Nothing to take back — both sides are the engine.'
  if (pliesPlayed <= 0) return 'No moves have been played yet.'
  if (plies <= 0) return 'There is no move of yours to take back.'
  return null
}

/**
 * Why a hint is unavailable, or null when it is.
 *
 * Play mode deliberately shows nothing: no evaluation, no arrows, no coach.
 * That is right for a game and wrong for a beginner stuck on move nine, who
 * currently has to leave the game, switch to Analysis, and come back — by which
 * point the position is being studied rather than played.
 *
 * Only against the engine, because that is the only mode with an engine
 * running: Play mode turns the analysis engine off, and pass-and-play and
 * AI-vs-AI never start the other one.
 */
export function hintDisabledReason({
  gameMode,
  turn,
  playerColor,
  gameOver,
  engineReady,
  busy,
}: {
  gameMode: PlayGameMode
  turn: PlayColor
  playerColor: PlayColor
  gameOver: boolean
  engineReady: boolean
  busy: boolean
}): string | null {
  if (gameMode === 'human-vs-human') return 'Hints need an engine — start a game against the computer.'
  if (gameMode === 'ai-vs-ai') return 'Both sides are the engine; there is nobody to hint to.'
  if (gameOver) return 'This game is already over.'
  if (turn !== playerColor) return 'Wait for your turn.'
  if (!engineReady) return 'The engine is still starting up.'
  if (busy) return 'Already looking.'
  return null
}
