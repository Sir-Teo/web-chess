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
