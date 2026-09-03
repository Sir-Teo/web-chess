import { qualityForLoss, scoreToCp, winPercentFromCp } from './analysis'

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
  workspaceMode,
  gameMode,
  turn,
  playerColor,
  gameOver,
  engineReady,
  busy,
}: {
  workspaceMode: 'play' | 'analysis'
  gameMode: PlayGameMode
  turn: PlayColor
  playerColor: PlayColor
  gameOver: boolean
  engineReady: boolean
  busy: boolean
}): string | null {
  // Checked before the engine, or Analysis reports the play engine as "still
  // starting up" — which is not what has happened. It is off, deliberately,
  // and the panel on the right is already answering the same question.
  if (workspaceMode !== 'play') return 'The analysis panel already shows the engine\'s move.'
  if (gameMode === 'human-vs-human') return 'Hints need an engine — start a game against the computer.'
  if (gameMode === 'ai-vs-ai') return 'Both sides are the engine; there is nobody to hint to.'
  if (gameOver) return 'This game is already over.'
  if (turn !== playerColor) return 'Wait for your turn.'
  if (!engineReady) return 'The engine is still starting up.'
  if (busy) return 'Already looking.'
  return null
}

/** What the opponent's search said about a position, from its own side. */
export type AiSearchReading = {
  fen: string
  cp?: number
  mate?: number
}

export type MoveJudgement = {
  quality: 'mistake' | 'blunder'
  /** Centipawns the mover gave up, from the mover's side; negative is a loss. */
  deltaCp: number
  /** Winning chances the mover gave up, in percentage points. */
  winPercentLoss: number
  /** The move walked into a forced mate, which the centipawn figure cannot say. */
  intoMate: boolean
}

/**
 * What the opponent's two searches say about the human move played between
 * them, or null when they say nothing worth interrupting a game for.
 *
 * Both readings are from the engine's side with the engine to move: the one
 * before its last move, and the one it has just made after the human's reply.
 * If the human played the reply the engine expected, the two agree; the gap is
 * what the human gave up. It is graded on the review's own ladder, so a move
 * the game calls a blunder is one the review will call a blunder too, and only
 * a mistake or worse is reported -- a game is not the place to be told about
 * every inaccuracy.
 *
 * One property makes this safe at the weak levels, where the engine chooses
 * a worse move on purpose: the first reading is the engine's *best* line, so
 * if it then played something weaker the human's true loss is larger than
 * the gap, never smaller. The nudge can miss a mistake; it cannot invent one.
 */
export function judgeMoveBetweenSearches(
  previous: AiSearchReading,
  current: AiSearchReading,
): MoveJudgement | null {
  const before = scoreToCp(previous.cp, previous.mate)
  const after = scoreToCp(current.cp, current.mate)
  if (typeof before !== 'number' || typeof after !== 'number') return null

  // Engine side to human side is a sign flip; the loss is before minus after.
  const deltaCp = before - after
  const winPercentLoss = Math.max(0, winPercentFromCp(-before) - winPercentFromCp(-after))
  if (deltaCp >= 0) return null

  const quality = qualityForLoss(deltaCp, winPercentLoss)
  if (quality !== 'mistake' && quality !== 'blunder') return null

  return {
    quality,
    deltaCp,
    winPercentLoss,
    intoMate: typeof current.mate === 'number' && current.mate > 0,
  }
}

export type PlayEngineStatus = 'loading' | 'ready' | 'thinking' | 'stopping' | 'error' | 'disabled'

export type PlayEngineReport = {
  message: string
  /** True when the opponent is not coming, so the panel can say so loudly. */
  failed: boolean
}

/**
 * What the Play Focus card says about the opponent.
 *
 * It used to interpolate the status word straight into a sentence --
 * "`${name}` play engine is `${status}` at `${difficulty}` difficulty" -- which
 * reads correctly for exactly two of the six values it can hold. The other four
 * produced "is stopping at Intermediate difficulty", "is loading at ...", and,
 * when the opponent's worker had failed to boot, **"is error at Intermediate
 * difficulty"**: a broken sentence that was also the only sign anywhere in the
 * app that there was nobody to play against.
 *
 * The failure case gets the treatment `engineBootFailureMessage` gives the
 * analysis side: say what happened, and say what still works, because most of
 * the app does.
 */
export function describePlayEngine({
  profileName,
  status,
  difficultyLabel,
  threadCount = 1,
}: {
  profileName: string
  status: PlayEngineStatus
  difficultyLabel: string
  /**
   * Threads the opponent is searching on. Reported only above one, because
   * "on 1 thread" is the unremarkable case and saying it every time would make
   * the interesting case invisible.
   */
  threadCount?: number
}): PlayEngineReport {
  if (status === 'error') {
    return {
      failed: true,
      message: `${profileName} could not start, so there is nobody to play against. `
        + 'Reload the page to try again — Human vs Human and everything on the Analysis side are unaffected.',
    }
  }

  if (status === 'disabled') {
    return { failed: false, message: `${profileName} is off.` }
  }

  const strength = threadCount > 1
    ? `${difficultyLabel} strength on ${threadCount} threads`
    : `${difficultyLabel} strength`

  if (status === 'loading') {
    return { failed: false, message: `${profileName} is starting up, at ${strength}.` }
  }

  if (status === 'thinking') {
    return { failed: false, message: `${profileName} is thinking, at ${strength}.` }
  }

  if (status === 'stopping') {
    return { failed: false, message: `${profileName} is finishing its last search.` }
  }

  return { failed: false, message: `${profileName} is ready to play, at ${strength}.` }
}
