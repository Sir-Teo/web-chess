/**
 * Whether one side could still checkmate, given only what is on the board.
 *
 * This exists for one ending: a flag. Every other way a game stops is decided
 * by the position itself, and `describeGameEnd` reads it. Running out of time
 * is the exception — FIDE 6.9 loses the game for the player whose clock fell
 * *unless* the opponent "cannot checkmate the player's king by any possible
 * series of legal moves", in which case it is a draw. Lichess and chess.com
 * both do this; a clock that hands a bare king the win on time is reporting a
 * result no other board would agree with.
 *
 * Note what the rule asks and what it does not. It is not "can the opponent
 * *force* mate" — a helpmate counts, so K+N wins on time against a king that
 * still has a pawn to be smothered by, and two knights win against a bare king
 * even though nobody can force it. And it is one-sided: `isInsufficientMaterial`
 * on chess.js asks whether *neither* side can mate, which is a different
 * question and answers this one wrongly whenever the material is lopsided,
 * which after a flag it usually is.
 *
 * Read from the FEN rather than from a `Chess` instance, like `material.ts`
 * beside it: the caller wants this for the position a game ended in, which is
 * rarely the one loaded on the board.
 */

export type MatingSide = 'w' | 'b'

type Placed = { piece: string; dark: boolean }

/**
 * Every man on the board, with the colour of the square it stands on.
 *
 * The square colour only matters for bishops, but it costs nothing to carry
 * and keeps the walk in one place. Rank 8 is first in a FEN and file `a` is
 * first in a rank, so `(file + rankIndex)` is odd exactly on the dark squares —
 * a1 is dark, h1 and a8 are light.
 */
function readPlacement(fen: string): Placed[] | null {
  const placement = String(fen ?? '').trim().split(/\s+/)[0]
  if (!placement) return null
  const men: Placed[] = []
  let file = 0
  let rankIndex = 0
  for (const character of placement) {
    if (character === '/') {
      file = 0
      rankIndex += 1
      continue
    }
    if (character >= '1' && character <= '8') {
      file += Number(character)
      continue
    }
    if (!/[pnbrqkPNBRQK]/.test(character)) return null
    men.push({ piece: character, dark: (file + rankIndex) % 2 === 1 })
    file += 1
  }
  return men
}

function isOwn(piece: string, side: MatingSide): boolean {
  return side === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase()
}

/**
 * Whether `side` could deliver mate in the position, with the opponent's help.
 *
 * The shape is python-chess's `has_insufficient_material`, inverted, because
 * that is the formulation the ecosystem has already argued over. Unknown or
 * malformed input answers `true`: a flag should only ever be downgraded to a
 * draw on evidence, and "I could not read the position" is not evidence.
 */
export function hasMatingMaterial(fen: string, side: MatingSide): boolean {
  const men = readPlacement(fen)
  if (!men) return true

  const ours = men.filter(man => isOwn(man.piece, side))
  const theirs = men.filter(man => !isOwn(man.piece, side))
  const kindOf = (man: Placed) => man.piece.toLowerCase()

  // A pawn promotes and a rook or a queen mates unaided.
  if (ours.some(man => 'prq'.includes(kindOf(man)))) return true

  if (ours.some(man => kindOf(man) === 'n')) {
    // A lone knight cannot mate a lone king, and no series of legal moves gets
    // there. Give either side one more man and it can: two knights mate a bare
    // king with help, and one knight mates a king that still has something of
    // its own to be smothered by. A spare queen is the exception on the far
    // side — it can always be given up, so it cannot be the thing that blocks.
    if (ours.length > 2) return true
    return theirs.some(man => !'kq'.includes(kindOf(man)))
  }

  if (ours.some(man => kindOf(man) === 'b')) {
    // Bishops confined to one colour complex can never cover the escape
    // squares of the other, however many there are — unless a pawn or a knight
    // is still on the board to be mated against, or the opponent holds a
    // bishop on the other complex.
    const bishops = men.filter(man => kindOf(man) === 'b')
    const bothComplexes = bishops.some(man => man.dark) && bishops.some(man => !man.dark)
    if (bothComplexes) return true
    return men.some(man => 'pn'.includes(kindOf(man)))
  }

  return false
}
