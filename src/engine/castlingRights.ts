/** Standard castling rights require these pieces on their home squares. */
export const CASTLING_REQUIREMENTS = {
  K: { king: 'e1', kingPiece: 'K', rook: 'h1', rookPiece: 'R' },
  Q: { king: 'e1', kingPiece: 'K', rook: 'a1', rookPiece: 'R' },
  k: { king: 'e8', kingPiece: 'k', rook: 'h8', rookPiece: 'r' },
  q: { king: 'e8', kingPiece: 'k', rook: 'a8', rookPiece: 'r' },
} as const
