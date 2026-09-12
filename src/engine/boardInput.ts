import type { Chess, Square } from 'chess.js'

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
  /** Drawn positions can still have legal moves; Play must stop accepting them. */
  gameOver?: boolean
  /**
   * Set once a side has run out of time.
   *
   * A flag and a resignation leave legal moves on the board, just as some
   * board draws do. Keep their session result separate from the board result.
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
  gameOver = false,
  endedOffBoard = false,
}: BoardInputLockArgs): boolean {
  if (workspaceMode !== 'play') return false
  if (endedOffBoard || gameOver) return true
  if (gameMode === 'ai-vs-ai') return true
  if (gameMode !== 'human-vs-ai') return false

  return isAiThinking || (!paused && turn !== playerColor)
}

/**
 * Whether dropping a piece from `from` on `to` is a promotion, so the caller
 * can ask which piece before playing anything.
 *
 * Read from the legal moves rather than from the rank, because the rank alone
 * is not the question: a pawn on the seventh has promoting moves and
 * non-promoting ones, and a piece that merely *looks* like a pawn to the board
 * library is not one.
 */
export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from)
  if (!piece || piece.type !== 'p') return false
  return chess.moves({ square: from, verbose: true }).some(move => move.to === to && move.flags.includes('p'))
}
