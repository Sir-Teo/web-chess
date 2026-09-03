type CoachMoveSources = {
  engine?: string | null
  cloud?: string | null
  stored?: string | null
  last?: string | null
  tablebase?: string | null
}

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/i

function normalizeUciMove(move: string | null | undefined): string | null {
  const normalized = move?.trim().toLowerCase()
  return normalized && UCI_MOVE_PATTERN.test(normalized) ? normalized : null
}

export function selectCoachBestMove({
  engine,
  cloud,
  stored,
  last,
  tablebase,
}: CoachMoveSources): string | null {
  return normalizeUciMove(tablebase)
    ?? normalizeUciMove(engine)
    ?? normalizeUciMove(cloud)
    ?? normalizeUciMove(stored)
    ?? normalizeUciMove(last)
}

export function isExactTablebaseCoachMove(
  selectedMove: string | null | undefined,
  tablebaseMove: string | null | undefined,
): boolean {
  const selected = normalizeUciMove(selectedMove)
  const tablebase = normalizeUciMove(tablebaseMove)
  return Boolean(selected && tablebase && selected === tablebase)
}

/** Who produced the reading the Coach card is showing. */
export type CoachSource = 'result' | 'tablebase' | 'engine' | 'cloud' | 'imported'

type CoachSourceInput = {
  /** The game is over on the board, so the result is the reading. */
  gameOver?: boolean
  /** A live line from the Stockfish running in this tab. */
  hasEngineLine: boolean
  /** A score from Lichess's cached analysis of this position. */
  hasCloudScore: boolean
  /** A stored snapshot for this position, and what produced it. */
  storedPurpose?: string
  hasStored: boolean
  hasTablebase: boolean
}

/**
 * Where the Coach card's numbers came from.
 *
 * The same order the card already resolves its evaluation in, named. It has to
 * be named because the numbers do not say it themselves and one of them is
 * actively misleading: Lichess's cache answers at depth 75, so the Depth tile
 * read "D75" next to a Lines panel saying "Start analysis" — a search this app
 * had not run, at a depth it cannot reach, with the panel below it correctly
 * reporting that nothing had run.
 */
export function coachReadingSource({
  gameOver,
  hasEngineLine,
  hasCloudScore,
  storedPurpose,
  hasStored,
  hasTablebase,
}: CoachSourceInput): CoachSource | null {
  // Before everything, including a tablebase: a mated king is in every
  // seven-piece table, and "TB exact" is a strange thing to say about it.
  if (gameOver) return 'result'
  if (hasEngineLine) return 'engine'
  if (hasCloudScore) return 'cloud'
  if (hasStored) {
    if (storedPurpose === 'cloud-eval') return 'cloud'
    if (storedPurpose === 'pgn-annotation') return 'imported'
    return 'engine'
  }
  if (hasTablebase) return 'tablebase'
  return null
}

export type CoachDepthReading = { label: string; title: string }

/**
 * What the Depth tile says, and what it means when hovered.
 *
 * A tablebase result is not a depth at all, which the tile already knew. The
 * other three are depths of different things, and the difference between "the
 * engine here reached 16" and "Lichess had 75 in its cache" is most of what a
 * reader needs to judge the number beside it.
 */
export function describeCoachDepth(
  source: CoachSource | null,
  depth: number | undefined,
  hasTablebase = false,
): CoachDepthReading {
  if (source === 'result') {
    return {
      label: 'Final',
      title: 'The game ended here. The result is the reading; there was nothing left to search.',
    }
  }

  if (hasTablebase || source === 'tablebase') {
    return {
      label: 'TB exact',
      title: 'An exact result from the Lichess endgame tablebase. Not a search, so there is no depth.',
    }
  }

  const depthLabel = typeof depth === 'number' && depth > 0 ? `D${depth}` : null

  if (source === 'cloud') {
    return {
      label: depthLabel ? `${depthLabel} cloud` : 'Cloud',
      title: 'Lichess had this position analysed already. Press Analyze to search it with the engine here.',
    }
  }

  if (source === 'imported') {
    return {
      label: depthLabel ? `${depthLabel} PGN` : 'From PGN',
      title: 'The evaluation that came in with the imported game, not a search run here.',
    }
  }

  if (source === 'engine') {
    return {
      label: depthLabel ?? '...',
      title: 'Plies reached by the engine running in this tab.',
    }
  }

  return { label: '...', title: 'Nothing has evaluated this position yet.' }
}

/** Where the Coach card's playable line comes from, or null when there is none. */
export type CoachLineSource = { fen: string; pv: string[] } | null

type CoachLineInput = {
  /** The position on the board, and the fallback for a source that carries none. */
  fen: string
  /** A live line from the Stockfish running in this tab. */
  engineLine?: { fen?: string; pv: string[] } | null
  /** Lichess's cached principal variation for this position. */
  cloudMoves?: string[] | null
  /** The best move stored for this position, from a review or an import sweep. */
  storedBestMove?: string | null
  /** Whether that move is the tablebase's, which the card writes out itself. */
  bestMoveIsTablebase?: boolean
}

/**
 * The line the Coach card draws.
 *
 * The last of the three is the one this exists for. A position the review or
 * the import sweep has already searched keeps its **best move** in the
 * evaluation map and not the line it came from -- so navigating back to one
 * left the card saying four things at once: best move Kf3, depth 22, "Start
 * analysis to get a candidate line", and an insight telling the reader to use
 * the line that was not drawn. Measured on a reviewed game, not imagined.
 *
 * One known move is a one-move line, and a one-move line is exactly what is
 * known -- so it is drawn as one, clickable and previewable like any other.
 * The tablebase move is left out because `coachTablebaseLine` already writes
 * it with its distance to mate, which is more than an arrow would say.
 */
export function selectCoachLineSource({
  fen,
  engineLine,
  cloudMoves,
  storedBestMove,
  bestMoveIsTablebase,
}: CoachLineInput): CoachLineSource {
  if (engineLine?.pv?.length) return { fen: engineLine.fen ?? fen, pv: engineLine.pv }
  if (cloudMoves?.length) return { fen, pv: cloudMoves }
  if (bestMoveIsTablebase) return null
  const stored = normalizeUciMove(storedBestMove)
  return stored ? { fen, pv: [stored] } : null
}
