/**
 * Links out to Lichess's analysis board -- for a second engine's opinion, the
 * opening explorer without a token, or a study to paste into.
 *
 * Two shapes, because the board takes two. A game goes as movetext, which
 * opens the line the reader is looking at with the moves to walk. A position
 * goes as a FEN, which is all that route can carry: the movetext route has no
 * way to name a starting position, so a game that did not begin at the
 * initial position has to be sent as where it stands.
 */
export const LICHESS_ANALYSIS_URL = 'https://lichess.org/analysis'
const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * The board at a position. Lichess writes its own links to a FEN with
 * underscores for the spaces and reads them back; the same route does not
 * decode a percent-encoded space.
 */
export function lichessPositionUrl(fen: string): string {
  return `${LICHESS_ANALYSIS_URL}/standard/${fen.trim().replace(/\s+/g, '_')}`
}

/**
 * The board with a line to walk, from the initial position.
 *
 * Spaces are "+", the one separator that route reads. A check or mate marker
 * in SAN is itself a "+" or a "#", and would be read as a separator or a
 * fragment -- so both are dropped, which every PGN reader tolerates, Lichess's
 * included, because they follow from the position.
 */
export function lichessGameUrl(sanMoves: string[]): string {
  const tokens: string[] = []
  sanMoves.forEach((san, index) => {
    if (index % 2 === 0) tokens.push(`${index / 2 + 1}.`)
    tokens.push(san.replace(/[+#]/g, ''))
  })
  return `${LICHESS_ANALYSIS_URL}/pgn/${tokens.join('+')}`
}

/**
 * The link for what is on the board: the line when it began at the initial
 * position and has moves, otherwise the position it has reached.
 */
export function lichessAnalysisUrl(input: { rootFen: string; sanMoves: string[]; fen: string }): string {
  const fromStart = input.rootFen.trim().replace(/\s+/g, ' ') === INITIAL_FEN
  if (fromStart && input.sanMoves.length > 0) return lichessGameUrl(input.sanMoves)
  return lichessPositionUrl(input.fen)
}
