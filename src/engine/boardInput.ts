export type BoardInputWorkspaceMode = 'play' | 'analysis'
export type BoardInputGameMode = 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'
export type BoardInputColor = 'w' | 'b'

type BoardInputLockArgs = {
  workspaceMode: BoardInputWorkspaceMode
  gameMode: BoardInputGameMode
  isAiThinking: boolean
  paused: boolean
  turn: BoardInputColor
  playerColor: BoardInputColor
  /**
   * Set once a side has run out of time.
   *
   * The other endings need no guard: checkmate and stalemate leave the position
   * with no legal move, so chess.js refuses every input on its own. A flag and
   * a resignation do not — the position is ordinary and every move in it is
   * still legal, so without this the board stays playable after the game is
   * over.
   */
  endedOffBoard?: boolean
}

export function isBoardInputLocked({
  workspaceMode,
  gameMode,
  isAiThinking,
  paused,
  turn,
  playerColor,
  endedOffBoard = false,
}: BoardInputLockArgs): boolean {
  if (workspaceMode !== 'play') return false
  if (endedOffBoard) return true
  if (gameMode === 'ai-vs-ai') return true
  if (gameMode !== 'human-vs-ai') return false

  return isAiThinking || (!paused && turn !== playerColor)
}
