/** Squares implied by the opposing pawn’s double move, indexed by turn. */
export const EN_PASSANT_REQUIREMENTS = {
  w: { targetRank: '6', pawnRank: '5', originRank: '7', pawnPiece: 'p' },
  b: { targetRank: '3', pawnRank: '4', originRank: '2', pawnPiece: 'P' },
} as const
