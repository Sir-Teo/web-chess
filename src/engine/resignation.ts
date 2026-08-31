import type { PlayColor, PlayGameMode } from './playMode'

/**
 * Conceding a game.
 *
 * The one ending a chess app has to provide that the board cannot show. Until
 * this existed there was no way to give up: a lost game had to be played out
 * to mate, abandoned with New Game -- which throws it away -- or left for the
 * clock, which takes as long as the clock has left.
 *
 * Abandoning also cost the review. The end-of-game card, and the offer to look
 * at what went wrong, appear when a game *ends*, so the games a beginner most
 * wants explained were the ones that never reached it.
 *
 * A resignation is invisible in the position, exactly like a flag, so it is
 * modelled the same way: a side, held beside the board rather than in it, that
 * every "is this game over" question has to ask about too.
 */

export type ResignedBy = 'w' | 'b'

/**
 * Which side the Resign button concedes for, or null when nobody can.
 *
 * Against the engine it is always the person playing, whichever side they took
 * and whoever is to move -- you can resign in the opponent's thinking time,
 * which is when people usually do. On a shared board it is the side to move,
 * which is the only side whose player is certain to be the one sitting there.
 */
export function resigningSide({
  gameMode,
  playerColor,
  turn,
}: {
  gameMode: PlayGameMode
  playerColor: PlayColor
  turn: ResignedBy
}): ResignedBy | null {
  if (gameMode === 'ai-vs-ai') return null
  if (gameMode === 'human-vs-ai') return playerColor === 'white' ? 'w' : 'b'
  return turn
}

/** Why resigning is unavailable, or null when it is available. */
export function resignDisabledReason({
  workspaceMode,
  gameMode,
  pliesPlayed,
  gameAlreadyOver,
}: {
  workspaceMode: 'play' | 'analysis'
  gameMode: PlayGameMode
  pliesPlayed: number
  gameAlreadyOver: boolean
}): string | null {
  // Checked first for the same reason the hint checks it first: in Analysis
  // there is no game to concede, and blaming the position would be a lie.
  if (workspaceMode !== 'play') return 'Resigning is a Play mode action.'
  if (gameMode === 'ai-vs-ai') return 'Neither side is yours to resign.'
  if (pliesPlayed <= 0) return 'No moves have been played yet.'
  if (gameAlreadyOver) return 'The game is already over.'
  return null
}

export function resignResultLabel(resigned: ResignedBy): string {
  return resigned === 'w' ? 'White resigned · Black wins' : 'Black resigned · White wins'
}

export function resignPgnResult(resigned: ResignedBy): '1-0' | '0-1' {
  return resigned === 'w' ? '0-1' : '1-0'
}
