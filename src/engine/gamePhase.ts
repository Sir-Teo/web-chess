/**
 * Which phase of the game a move belongs to.
 *
 * web-katrain splits phases by move number alone, with a table per board size:
 * on 19x19 the opening is the first 50 moves. That works for Go, where the
 * board fills at a predictable rate. It does not carry over to chess, where a
 * queen trade on move 8 and a 90-move rook ending are both "the middle" by
 * move count. So the split is made on material instead, which is what the game
 * itself is about, with a move-number cap only to stop a quiet symmetrical
 * opening from being called an opening forever.
 *
 * The phase names match katrain's so the two reports read the same way.
 */

/** Classic values. Pawns are excluded: phases turn on the pieces, not the pawns. */
const PIECE_VALUES: Record<string, number> = { q: 9, r: 5, b: 3, n: 3 }

/** Both sides, all pieces, pawns and kings excluded: 2 x (9 + 10 + 6 + 6). */
export const FULL_NON_PAWN_MATERIAL = 62

/**
 * Both sides together. A queen ending (18) or a double-rook ending (20) is an
 * endgame; queens and rooks still on (28) is not.
 */
const ENDGAME_MATERIAL = 26

/** Through move 12, the conventional span of an opening. */
const OPENING_MAX_PLY = 24

/** At most one pair of minor pieces exchanged. Queens coming off ends the opening. */
const OPENING_MIN_MATERIAL = 56

export type GamePhase = 'opening' | 'middleGame' | 'endgame'

export const GAME_PHASES: Array<{ key: GamePhase; label: string }> = [
  { key: 'opening', label: 'Opening' },
  { key: 'middleGame', label: 'Middlegame' },
  { key: 'endgame', label: 'Endgame' },
]

export function getPhaseLabel(phase: GamePhase): string {
  return GAME_PHASES.find(entry => entry.key === phase)?.label ?? 'Opening'
}

/**
 * Queens, rooks, bishops and knights left on the board, both sides, in classic
 * points. Reads only the placement field, so a malformed tail cannot affect it.
 */
export function nonPawnMaterialFromFen(fen: string): number {
  const placement = String(fen ?? '').trim().split(/\s+/)[0] ?? ''
  let total = 0
  for (const char of placement) {
    if (char === '/') continue
    total += PIECE_VALUES[char.toLowerCase()] ?? 0
  }
  return total
}

/**
 * The phase a move belongs to, read from the position before it was played.
 *
 * Endgame is decided on material alone, so a game that empties out quickly
 * reaches it quickly. Opening additionally requires being early: a repetition
 * shuffle on move 40 with everything still on the board is a middlegame, not an
 * opening.
 */
export function getMovePhase(fenBeforeMove: string, ply: number): GamePhase {
  const material = nonPawnMaterialFromFen(fenBeforeMove)
  if (material <= ENDGAME_MATERIAL) return 'endgame'
  if (ply <= OPENING_MAX_PLY && material >= OPENING_MIN_MATERIAL) return 'opening'
  return 'middleGame'
}
