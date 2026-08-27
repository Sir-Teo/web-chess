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
}

export function isBoardInputLocked({
  workspaceMode,
  gameMode,
  isAiThinking,
  paused,
  turn,
  playerColor,
}: BoardInputLockArgs): boolean {
  if (workspaceMode !== 'play') return false
  if (gameMode === 'ai-vs-ai') return true
  if (gameMode !== 'human-vs-ai') return false

  return isAiThinking || (!paused && turn !== playerColor)
}
