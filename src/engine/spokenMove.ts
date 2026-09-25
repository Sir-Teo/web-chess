import type { Move } from 'chess.js'

const PIECE_WORDS: Record<string, string> = {
  p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
}

/**
 * A move in words, for a screen reader.
 *
 * SAN is written for the eye: read aloud, "Nxd5+" comes out as "N x d 5 plus",
 * and "O-O" as "O O". This says what happened instead -- "Knight takes d5,
 * check", "Castles kingside" -- from the move's own fields, so it cannot
 * disagree with the move that was played.
 */
export function spokenMove(move: Pick<Move, 'san' | 'piece' | 'flags' | 'to' | 'promotion'>): string {
  let words: string
  if (move.flags.includes('k')) words = 'Castles kingside'
  else if (move.flags.includes('q')) words = 'Castles queenside'
  else {
    const piece = PIECE_WORDS[move.piece] ?? move.piece
    const takes = move.flags.includes('c') || move.flags.includes('e')
    words = `${piece} ${takes ? 'takes' : 'to'} ${move.to}`
    if (move.flags.includes('e')) words += ' en passant'
    if (move.promotion) words += `, promotes to ${(PIECE_WORDS[move.promotion] ?? move.promotion).toLowerCase()}`
  }
  if (move.san.includes('#')) return `${words}, checkmate`
  if (move.san.includes('+')) return `${words}, check`
  return words
}
