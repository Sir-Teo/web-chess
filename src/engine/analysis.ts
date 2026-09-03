import { Chess, type Move } from 'chess.js'
import type { EngineLine } from '../hooks/useStockfishEngine'
import type { AnalyzeMode, AnalyzePurpose } from './uci'
import { GAME_PHASES, type GamePhase, getMovePhase, getPhaseLabel } from './gamePhase'
import { MIN_WEIGHT, aggregateAccuracy, volatilityWeights } from './accuracyAggregate'

export type EvalSnapshot = {
  cp: number
  mate?: number
  /**
   * Set when the engine reported the score as a bound rather than a value.
   * A `lowerbound` means "at least this much" and an `upperbound` means "at
   * most" — they come out of aspiration-window re-searches, and taking one as
   * an evaluation is taking an inequality for an equation.
   */
  scoreBound?: 'upperbound' | 'lowerbound'
  bestMove?: string
  wdl?: { w: number; d: number; l: number }
  depth?: number
  nodes?: number
  nps?: number
  time?: number
  searchId?: number
  mode?: AnalyzeMode
  purpose?: AnalyzePurpose
  searchedAt?: number
}

/**
 * What the review calls a move.
 *
 * `best` is the engine's own choice and nothing else; a move that gave up
 * almost nothing but was not that choice is `excellent`. They used to share
 * one word, and a row then read "d4 · Best e4 · Best" -- a contradiction to
 * anyone who has not read the thresholds. `book` is a sound move that stays
 * in the opening table, which is the label a reader wants on the first ten
 * moves of every game rather than a grade for each. Both are the words
 * chess.com uses, because they are the words readers arrive knowing.
 */
export type ReviewLabel = 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'pending'
export type ReviewSideFilter = 'both' | 'white' | 'black'

export type ReviewRow = {
  ply: number
  moveNumber: number
  sideToMove: 'w' | 'b'
  san: string
  uci: string
  quality: ReviewLabel
  bestMove?: string
  bestMoveSan?: string
  deltaCp?: number
  /** Winning chances the mover gave up, in percentage points. Position-aware. */
  winPercentLoss?: number
  /**
   * The mover's winning chances before they played, in percent. Kept so the
   * game's win-percent series can be rebuilt from the rows alone, which is
   * what the volatility weighting in `accuracyAggregate` reads.
   */
  winPercentBefore?: number
  /** Read from the position before the move, so it survives an unevaluated row. */
  phase: GamePhase
  evalDepth?: number
  confidence: 'pending' | 'shallow' | 'standard' | 'deep'
}

export type AccuracySummary = {
  overall: number | null
  white: number | null
  black: number | null
  averageCentipawnLoss: number | null
  whiteAverageCentipawnLoss: number | null
  blackAverageCentipawnLoss: number | null
  evaluatedMoves: number
  pendingMoves: number
}

export type WinratePoint = {
  index: number
  label: string
  whiteWinrate: number
}

export type WdlPoint = {
  index: number
  label: string
  white: number
  draw: number
  black: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function scoreToCp(cp?: number, mate?: number): number | undefined {
  if (isFiniteNumber(mate)) {
    if (mate > 0) return 10000
    if (mate < 0) return -10000
    return undefined
  }
  return isFiniteNumber(cp) ? cp : undefined
}

export function formatEvaluation(cp?: number, mate?: number): string {
  if (isFiniteNumber(mate)) return `#${mate}`
  if (isFiniteNumber(cp)) return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`
  return '...'
}

export function pvToSan(fen: string, line: EngineLine, maxMoves = 8): string {
  const replay = new Chess(fen)
  const moves = line.pv.slice(0, maxMoves)
  const chunks: string[] = []

  for (let index = 0; index < moves.length; index += 1) {
    const uci = moves[index]
    if (uci.length < 4) break

    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci[4]
    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()

    let move: Move | undefined
    try {
      move = replay.move({ from, to, promotion })
    } catch {
      break
    }

    if (!move) break

    const prefix = sideToMove === 'w' ? `${moveNumber}.` : `${moveNumber}...`
    chunks.push(`${prefix} ${move.san}`)
  }

  return chunks.join(' ')
}

export type PvMove = {
  /** 0-based position in the principal variation. */
  index: number
  uci: string
  san: string
  /** "12." or "12..." — printed only where a reader needs it. */
  prefix: string | null
  /**
   * "12. Nf3" or "12... Nc6", always numbered. The printed line leaves the
   * number off a Black move that follows its White one, which reads correctly
   * and announces terribly: a screen reader gets "e6" with nothing to place it.
   */
  numbered: string
  /** The position after this move, so a caller can walk into the line. */
  fenAfter: string
}

/**
 * The principal variation as moves rather than as a sentence.
 *
 * `pvToSan` renders the same walk into one string, which is all a label needs
 * and all this panel had. A line you cannot step into is a line you have to
 * replay by hand on the board to see what the engine is talking about, which is
 * the whole reason every other analysis board makes its engine line clickable.
 *
 * The move number prefix is only emitted where it carries information — ahead
 * of every White move, and ahead of a Black move that opens the line — so the
 * rendered line reads the way a printed one does.
 *
 * Stops at the first move the position will not accept, the way the rest of
 * this module does: a PV outliving its position is a stale flush, not a crash.
 */
export function pvLineMoves(fen: string, pv: string[], maxMoves = 8): PvMove[] {
  let replay: Chess
  try {
    replay = new Chess(fen)
  } catch {
    return []
  }

  const moves: PvMove[] = []
  for (const [index, uci] of pv.slice(0, maxMoves).entries()) {
    if (uci.length < 4) break

    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()

    let move: Move | undefined
    try {
      move = replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    if (!move) break

    moves.push({
      index,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      san: move.san,
      prefix: sideToMove === 'w' ? `${moveNumber}.` : index === 0 ? `${moveNumber}...` : null,
      numbered: `${moveNumber}${sideToMove === 'w' ? '.' : '...'} ${move.san}`,
      fenAfter: replay.fen(),
    })
  }

  return moves
}

/**
 * A bounded, insertion-ordered cache of `uciToSan` answers.
 *
 * The function is pure in `(fen, uci)`, and every call builds a whole `Chess`
 * from the FEN to make one move. The review pipeline asks it for the best move
 * of every ply, and it re-asks on every engine flush -- roughly ten times a
 * second while a search runs -- for a best move that has usually not changed.
 */
const SAN_CACHE_LIMIT = 1024
const sanCache = new Map<string, string | null>()

export function uciToSan(fen: string, uci: string): string | null {
  if (uci.length < 4) return null

  const key = `${fen}|${uci}`
  const cached = sanCache.get(key)
  if (cached !== undefined) return cached

  const replay = new Chess(fen)
  let san: string | null
  try {
    const move = replay.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    })
    san = move?.san ?? null
  } catch {
    san = null
  }

  sanCache.set(key, san)
  if (sanCache.size > SAN_CACHE_LIMIT) {
    const oldest = sanCache.keys().next().value
    if (typeof oldest === 'string') sanCache.delete(oldest)
  }
  return san
}

// Lichess's win-percentage model: the chance the side the score belongs to
// goes on to win. https://lichess.org/page/accuracy
const WIN_PERCENT_CP_LIMIT = 2000
const WIN_PERCENT_CP_SLOPE = 0.00368208

export function winPercentFromCp(cp: number): number {
  const limited = Math.max(-WIN_PERCENT_CP_LIMIT, Math.min(WIN_PERCENT_CP_LIMIT, cp))
  const raw = 50 + 50 * (2 / (1 + Math.exp(-WIN_PERCENT_CP_SLOPE * limited)) - 1)
  return Math.max(0, Math.min(100, raw))
}

/**
 * The rungs a loss is measured against. `best` and `book` are not rungs:
 * one is the engine's move by identity, the other a position in a table.
 */
type GradedLabel = 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

const CP_LOSS_THRESHOLDS = {
  excellent: 20,
  good: 70,
  inaccuracy: 140,
  mistake: 260,
} as const

function qualityFromDelta(deltaCp: number): GradedLabel {
  if (deltaCp >= -CP_LOSS_THRESHOLDS.excellent) return 'excellent'
  if (deltaCp >= -CP_LOSS_THRESHOLDS.good) return 'good'
  if (deltaCp >= -CP_LOSS_THRESHOLDS.inaccuracy) return 'inaccuracy'
  if (deltaCp >= -CP_LOSS_THRESHOLDS.mistake) return 'mistake'
  return 'blunder'
}

/**
 * The same ladder in percentage points of winning chances, measured from a
 * balanced position. Deriving it from the centipawn rungs rather than picking
 * round numbers means the two readings agree at equality and part company only
 * as the position becomes lopsided — which is the only place we want the
 * practical reading to take over.
 */
const WIN_PERCENT_LOSS_THRESHOLDS = {
  excellent: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.excellent),
  good: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.good),
  inaccuracy: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.inaccuracy),
  mistake: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.mistake),
} as const

const LABEL_SEVERITY: Record<GradedLabel, number> = {
  excellent: 0,
  good: 1,
  inaccuracy: 2,
  mistake: 3,
  blunder: 4,
}

function qualityFromWinPercentLoss(loss: number): GradedLabel {
  if (loss <= WIN_PERCENT_LOSS_THRESHOLDS.excellent) return 'excellent'
  if (loss <= WIN_PERCENT_LOSS_THRESHOLDS.good) return 'good'
  if (loss <= WIN_PERCENT_LOSS_THRESHOLDS.inaccuracy) return 'inaccuracy'
  if (loss <= WIN_PERCENT_LOSS_THRESHOLDS.mistake) return 'mistake'
  return 'blunder'
}

/**
 * The milder of the raw and practical readings, so a game that is already
 * decided stops calling every imprecision a blunder.
 */
function qualityForMove(deltaCp: number, winPercentLoss: number): GradedLabel {
  const raw = qualityFromDelta(deltaCp)
  if (!isFiniteNumber(winPercentLoss)) return raw
  const practical = qualityFromWinPercentLoss(winPercentLoss)
  return LABEL_SEVERITY[practical] <= LABEL_SEVERITY[raw] ? practical : raw
}

/**
 * The ladder, for a loss measured somewhere other than a review row -- the
 * nudge in Play mode grades the human's last move from the opponent's own
 * searches. One ladder, so a move the game called a blunder is one the
 * review will call a blunder too.
 */
export function qualityForLoss(deltaCp: number, winPercentLoss: number): GradedLabel {
  return qualityForMove(deltaCp, winPercentLoss)
}

/**
 * Whether a reading is too thin to grade a move with.
 *
 * The two import purposes are the app's own 70ms passes over a freshly loaded
 * game -- fast enough to fill a graph, not enough to call a move a blunder.
 *
 * An `[%eval ...]` read out of a PGN is deliberately *not* in that set, though
 * it used to be: it carried `import-load` and was therefore classed shallow,
 * which meant the 70ms sweep outranked it on depth and overwrote it. A game
 * saved with its review, then loaded back, lost that review on the way in.
 */
function isShallowEvaluation(snapshot: EvalSnapshot): boolean {
  if (snapshot.purpose === 'import-load' || snapshot.purpose === 'import-sweep') return true
  if (isFiniteNumber(snapshot.depth) && snapshot.depth < 10) return true
  if (isFiniteNumber(snapshot.time) && snapshot.time < 150 && !isFiniteNumber(snapshot.depth)) return true
  return false
}

export function isReviewEvaluationSufficient(snapshot: EvalSnapshot | undefined, minDepth: number): boolean {
  if (!snapshot) return false
  if (!isFiniteNumber(scoreToCp(snapshot.cp, snapshot.mate))) return false
  if (isShallowEvaluation(snapshot)) return false

  const normalizedMinDepth = Number.isFinite(minDepth) ? Math.max(0, Math.round(minDepth)) : 0
  if (normalizedMinDepth <= 0) return true
  return isFiniteNumber(snapshot.depth) && snapshot.depth >= normalizedMinDepth
}

function snapshotDepth(snapshot: EvalSnapshot): number {
  return isFiniteNumber(snapshot.depth) ? snapshot.depth : -1
}

function snapshotNodes(snapshot: EvalSnapshot): number {
  return isFiniteNumber(snapshot.nodes) ? snapshot.nodes : -1
}

function sameSnapshotScore(a: EvalSnapshot, b: EvalSnapshot): boolean {
  return scoreToCp(a.cp, a.mate) === scoreToCp(b.cp, b.mate)
    && a.mate === b.mate
}

function sameSnapshotWdl(a: EvalSnapshot, b: EvalSnapshot): boolean {
  return a.wdl?.w === b.wdl?.w
    && a.wdl?.d === b.wdl?.d
    && a.wdl?.l === b.wdl?.l
}

function sameEvaluationSnapshot(a: EvalSnapshot, b: EvalSnapshot): boolean {
  return sameSnapshotScore(a, b)
    && sameSnapshotWdl(a, b)
    && a.bestMove === b.bestMove
    && a.depth === b.depth
    && a.nodes === b.nodes
    && a.nps === b.nps
    && a.time === b.time
    && a.searchId === b.searchId
    && a.mode === b.mode
    && a.purpose === b.purpose
}

export function shouldReplaceEvaluationSnapshot(
  current: EvalSnapshot | undefined,
  next: EvalSnapshot,
): boolean {
  if (!isFiniteNumber(scoreToCp(next.cp, next.mate))) return false
  if (!current) return true
  if (!isFiniteNumber(scoreToCp(current.cp, current.mate))) return true

  const currentShallow = isShallowEvaluation(current)
  const nextShallow = isShallowEvaluation(next)
  if (currentShallow && !nextShallow) return true
  if (!currentShallow && nextShallow) return false

  // An exact score beats a bound at the same depth, whatever the node counts
  // say. The bounded line is the engine saying "I stopped looking once I knew
  // it was at least this"; the exact line is the answer. Without this the
  // comparison falls through to nodes, and a fail-high line that happened to
  // search more nodes could outrank the real evaluation that followed it.
  const currentDepthForBound = snapshotDepth(current)
  const nextDepthForBound = snapshotDepth(next)
  if (currentDepthForBound === nextDepthForBound) {
    if (current.scoreBound && !next.scoreBound) return true
    if (!current.scoreBound && next.scoreBound) return false
  }

  const currentDepth = snapshotDepth(current)
  const nextDepth = snapshotDepth(next)
  if (current.purpose === 'cloud-eval' && next.purpose !== 'cloud-eval' && currentDepth >= nextDepth) return false
  if (next.purpose === 'cloud-eval' && current.purpose !== 'cloud-eval' && nextDepth >= currentDepth) return true
  if (nextDepth > currentDepth) return true
  if (nextDepth < currentDepth) return false

  const currentNodes = snapshotNodes(current)
  const nextNodes = snapshotNodes(next)
  if (nextNodes > currentNodes) return true
  if (nextNodes < currentNodes) return false

  return !sameEvaluationSnapshot(current, next)
}

export function mergeEvaluationSnapshot(
  current: EvalSnapshot | undefined,
  next: EvalSnapshot,
): EvalSnapshot | undefined {
  if (shouldReplaceEvaluationSnapshot(current, next)) return next
  if (!current) return undefined

  if (next.wdl && !sameSnapshotWdl(current, next) && sameSnapshotScore(current, next)) {
    return { ...current, wdl: next.wdl }
  }

  return current
}

function minDepth(a: EvalSnapshot, b: EvalSnapshot): number | undefined {
  if (isFiniteNumber(a.depth) && isFiniteNumber(b.depth)) return Math.min(a.depth, b.depth)
  if (isFiniteNumber(a.depth)) return a.depth
  if (isFiniteNumber(b.depth)) return b.depth
  return undefined
}

function toUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

/**
 * The reading a finished position gives without a search.
 *
 * Stockfish has nothing to say about a checkmate: it answers `score mate 0`,
 * which `scoreToCp` refuses because a mate with no distance is not a score --
 * so nothing was ever recorded for the last position of a game that ended in
 * one. The review rows have long fallen back to this; the two trend series,
 * the eval bar and the Coach card read the map directly and stopped one ply
 * short, with the bar sitting at an even split under a mated king.
 *
 * Side-to-move point of view, like every engine score. The mated side has
 * lost, so the score is the mate sentinel and the WDL is all losses; a draw
 * is level and all draws. WDL is in permille, the way the engine reports it.
 */
function terminalEvaluationSnapshot(position: Chess): EvalSnapshot | null {
  if (position.isCheckmate()) {
    return {
      cp: -10000,
      wdl: { w: 0, d: 0, l: 1000 },
      purpose: 'batch-review',
      mode: 'review',
    }
  }

  if (position.isDraw()) {
    return {
      cp: 0,
      wdl: { w: 0, d: 1000, l: 0 },
      purpose: 'batch-review',
      mode: 'review',
    }
  }

  return null
}

/**
 * {@link terminalEvaluationSnapshot} for a position given as a FEN, or null
 * when the game is still on -- or the FEN is not one. A FEN cannot show a
 * repetition, so a game drawn that way is only caught by the replayed
 * history; that is the one ending this cannot see.
 */
export function terminalSnapshotForFen(fen: string): EvalSnapshot | null {
  try {
    return terminalEvaluationSnapshot(new Chess(fen))
  } catch {
    return null
  }
}

/**
 * The engine's own reading of a position, as a snapshot ready to record.
 *
 * The cloud path has had `cloudEvalToSnapshot` from the start; the engine path
 * built the same object inline inside an effect, where nothing could reach it.
 * They are the two sources that feed one map, and they should be shaped the
 * same way and testable the same way.
 *
 * Returns null when the line carries no usable score, which is the check the
 * effect used to do before building anything.
 */
export function engineLineToSnapshot(
  line: EngineLine | undefined,
  fallbackFen: string,
  searchedAt: number,
): { fen: string; snapshot: EvalSnapshot } | null {
  const cp = scoreToCp(line?.cp, line?.mate)
  if (typeof cp !== 'number' || !line) return null

  return {
    fen: line.fen ?? fallbackFen,
    snapshot: {
      cp,
      mate: line.mate,
      scoreBound: line.scoreBound,
      bestMove: line.pv[0],
      wdl: line.wdl,
      depth: line.depth,
      nodes: line.nodes,
      nps: line.nps,
      time: line.time,
      searchId: line.searchId,
      mode: line.mode,
      purpose: line.purpose,
      searchedAt,
    },
  }
}

/**
 * Records an evaluation for a position, returning the map to use next.
 *
 * Returns the *same* map when the new reading does not improve on what is
 * already stored, and that identity is load-bearing rather than an
 * optimisation. Auto-save debounces on a snapshot that depends on the
 * evaluations; if this returned a fresh Map for every `info` line the engine
 * emits, the identity would churn several times a second and the save would
 * never settle long enough to fire. That was investigated once already, when a
 * reported "auto-save starves during analysis" turned out to be wrong for
 * exactly this reason -- so the property is worth a test rather than a comment.
 *
 * Both writers -- the engine's own lines and a cloud evaluation -- had their own
 * copy of these nine lines. One of them being "simplified" to always return a
 * new Map is a single-line change with a symptom nobody would connect to it.
 */
export function recordEvaluation(
  evaluations: Map<string, EvalSnapshot>,
  fen: string,
  snapshot: EvalSnapshot,
): Map<string, EvalSnapshot> {
  const current = evaluations.get(fen)
  const merged = mergeEvaluationSnapshot(current, snapshot)
  if (!merged || merged === current) return evaluations

  const next = new Map(evaluations)
  next.set(fen, merged)
  return next
}

export function isTerminalPositionFen(fen: string): boolean {
  try {
    return new Chess(fen).isGameOver()
  } catch {
    return false
  }
}

/**
 * Replay one move of a history onto `replay`.
 *
 * chess.js throws when a move does not fit the position, and every caller here
 * runs inside a React render — an unreplayable history took the whole app down
 * to the error boundary rather than showing a shorter graph. A history and a
 * root position can disagree for ordinary reasons: an edited position, an
 * imported PGN, a shared link. Callers stop at the first move that will not go.
 */
function tryReplayMove(replay: Chess, move: Move): boolean {
  try {
    return Boolean(replay.move({ from: move.from, to: move.to, promotion: move.promotion }))
  } catch {
    return false
  }
}

/**
 * One ply of a replayed history: everything about the move and the positions
 * around it that no evaluation can change.
 */
type ReplayPly = {
  index: number
  beforeFen: string
  afterFen: string
  moveNumber: number
  sideToMove: 'w' | 'b'
  san: string
  uci: string
  phase: GamePhase
  /** The forced result after this move, if the move ended the game. */
  terminal: EvalSnapshot | null
}

type ReplayedHistory = {
  startFen: string
  plies: ReplayPly[]
}

/**
 * Replay a history once and cache the result.
 *
 * `buildReviewRows`, `buildWinrateSeries` and `buildWdlSeries` each walk the
 * same history from the same root, and every one of them is recomputed whenever
 * the evaluation map takes a new identity -- which is roughly ten times a second
 * for the whole duration of a search, because a reading with more nodes at the
 * same depth counts as an improvement. The replay is the expensive half and none
 * of it depends on an evaluation, so it is done once and shared.
 *
 * Keyed by content rather than by array identity: `App` rebuilds `mainLineMoves`
 * whenever a node's quality label changes, which is a new array holding the same
 * moves, and that should still hit.
 */
const REPLAY_CACHE_LIMIT = 8
const replayCache = new Map<string, ReplayedHistory>()

function replayHistory(history: Move[], rootFen: string): ReplayedHistory {
  let key = rootFen
  for (const move of history) key += `|${toUci(move)}`

  const cached = replayCache.get(key)
  if (cached) return cached

  const replay = new Chess(rootFen)
  const startFen = replay.fen()
  const plies: ReplayPly[] = []

  for (const [index, move] of history.entries()) {
    const beforeFen = replay.fen()
    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()
    // Read before the move is made: the phase a move was played in, not the
    // one it led to. The ply comes from the position's own move number rather
    // than the loop index, so analysing from a mid-game FEN does not restart
    // the phase clock and call move 20 an opening.
    const gamePly = (moveNumber - 1) * 2 + (sideToMove === 'w' ? 1 : 2)
    const phase = getMovePhase(beforeFen, gamePly)
    if (!tryReplayMove(replay, move)) break

    plies.push({
      index,
      beforeFen,
      afterFen: replay.fen(),
      moveNumber,
      sideToMove,
      san: move.san,
      uci: toUci(move),
      phase,
      terminal: terminalEvaluationSnapshot(replay),
    })
  }

  const replayed: ReplayedHistory = { startFen, plies }
  replayCache.set(key, replayed)
  while (replayCache.size > REPLAY_CACHE_LIMIT) {
    const oldest = replayCache.keys().next().value
    if (typeof oldest !== 'string') break
    replayCache.delete(oldest)
  }
  return replayed
}

export type ReviewRowOptions = {
  /**
   * Whether a position is in the opening table. The opening lasts as far as
   * the last position the table knows, and every sound move up to there is
   * labelled Book instead of graded: a gap inside that stretch is the
   * table's, not the game's -- 3...Nf6 in a Slav was reading "Best" between
   * six Book moves because that one position was missing from it. A move
   * the engine faulted keeps its fault, because "in the book" is not an
   * answer to "was it a mistake". Absent, nothing is Book, which is also
   * what the caller passes while the table is still loading.
   */
  isBookPosition?: (fen: string) => boolean
}

/** The grades a book position may replace. A fault is never hidden behind Book. */
const BOOK_REPLACES: ReadonlySet<ReviewLabel> = new Set(['pending', 'best', 'excellent', 'good'])

export function buildReviewRows(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
  options: ReviewRowOptions = {},
): ReviewRow[] {
  const rows: ReviewRow[] = []
  const plies = replayHistory(history, rootFen).plies

  let bookThroughIndex = -1
  if (options.isBookPosition) {
    for (const ply of plies) {
      if (options.isBookPosition(ply.afterFen)) bookThroughIndex = ply.index
    }
  }
  const labelled = (index: number, graded: ReviewLabel): ReviewLabel =>
    index <= bookThroughIndex && BOOK_REPLACES.has(graded) ? 'book' : graded

  for (const ply of plies) {
    const { index, beforeFen, afterFen, moveNumber, sideToMove, phase } = ply

    const beforeSnapshot = evaluationsByFen.get(beforeFen)
    const afterSnapshot = evaluationsByFen.get(afterFen) ?? ply.terminal
    const before = beforeSnapshot ? scoreToCp(beforeSnapshot.cp, beforeSnapshot.mate) : undefined
    const after = afterSnapshot ? scoreToCp(afterSnapshot.cp, afterSnapshot.mate) : undefined
    const bestMove = beforeSnapshot?.bestMove
    const bestMoveSan = bestMove ? uciToSan(beforeFen, bestMove) ?? bestMove : undefined
    if (!beforeSnapshot || !afterSnapshot || !isFiniteNumber(before) || !isFiniteNumber(after)) {
      rows.push({
        ply: index + 1,
        moveNumber,
        sideToMove,
        san: ply.san,
        uci: ply.uci,
        bestMove,
        bestMoveSan,
        phase,
        // The book grades the opening before the engine reaches it: the
        // review fills outward from the board, and theory is theory whether
        // or not a search has confirmed it yet.
        quality: labelled(index, 'pending'),
        confidence: 'pending',
      })
      continue
    }

    // Engine score is POV side-to-move. After the move, perspective flips.
    const measuredDeltaCp = Math.round(-after - before)
    // Both readings are from the mover's point of view, so the drop in winning
    // chances is what that player actually gave up.
    const winPercentBefore = winPercentFromCp(before)
    const measuredWinPercentLoss = Math.max(0, winPercentBefore - winPercentFromCp(-after))
    // The engine's own choice cannot have cost anything, by its own account.
    // The two readings that grade a move come from two separate searches, and
    // at a fixed depth they disagree by a few dozen centipawns as a matter of
    // course -- enough to call the move the engine asked for an inaccuracy,
    // which a reader who played it then reads beside "Best Nf3", the move they
    // played. Lichess and chess.com both grade a played best move "Best"
    // whatever the drift says; a gain is kept, because a deeper second search
    // that likes the move more is information rather than noise.
    const playedBest = bestMove !== undefined && bestMove === ply.uci
    const deltaCp = playedBest ? Math.max(0, measuredDeltaCp) : measuredDeltaCp
    const winPercentLoss = playedBest ? 0 : measuredWinPercentLoss
    const evalDepth = minDepth(beforeSnapshot, afterSnapshot)
    const shallow = isShallowEvaluation(beforeSnapshot) || isShallowEvaluation(afterSnapshot)
    const confidence = shallow
      ? 'shallow'
      : typeof evalDepth === 'number' && evalDepth >= 20
        ? 'deep'
        : 'standard'

    rows.push({
      ply: index + 1,
      moveNumber,
      sideToMove,
      san: ply.san,
      uci: ply.uci,
      bestMove,
      bestMoveSan,
      phase,
      deltaCp,
      winPercentLoss,
      winPercentBefore,
      evalDepth,
      confidence,
      // Best is the engine's move and nothing else. A move that gave up
      // almost nothing but was not that move is Excellent -- the two used to
      // share a word, and "d4 · Best e4 · Best" read as a contradiction.
      quality: labelled(index, shallow ? 'pending' : playedBest ? 'best' : qualityForMove(deltaCp, winPercentLoss)),
    })
  }

  return rows
}

/**
 * The moves that cost the most, worst first.
 *
 * Ranked by winning chances given up, not by the centipawn delta, so this
 * agrees with the labels and the accuracy — both of which are scored that way.
 * Sorting on centipawns put a large drop inside an already-decided position
 * above a smaller one that actually turned the game. Rows from an older review
 * carry no win-percent loss and fall back to the centipawn reading.
 */
export function rankCriticalMoments(rows: ReviewRow[], limit = 5): ReviewRow[] {
  const cost = (row: ReviewRow): number => (
    isFiniteNumber(row.winPercentLoss)
      ? row.winPercentLoss
      : winPercentFromCp(0) - winPercentFromCp(row.deltaCp as number)
  )

  return rows
    .filter(row => row.quality === 'inaccuracy' || row.quality === 'mistake' || row.quality === 'blunder')
    .filter(row => isFiniteNumber(row.deltaCp))
    .sort((a, b) => cost(b) - cost(a) || (a.deltaCp ?? 0) - (b.deltaCp ?? 0))
    .slice(0, Math.max(0, limit))
}

export function summarizeReview(rows: ReviewRow[]): Record<ReviewLabel, number> {
  return rows.reduce<Record<ReviewLabel, number>>(
    (acc, row) => {
      acc[row.quality] += 1
      return acc
    },
    { book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, pending: 0 },
  )
}

export function filterReviewRowsBySide(rows: ReviewRow[], filter: ReviewSideFilter): ReviewRow[] {
  if (filter === 'both') return rows
  const side = filter === 'white' ? 'w' : 'b'
  return rows.filter(row => row.sideToMove === side)
}

/** 'all', or one phase to narrow the move list to. Mirrors katrain's report filter. */
export type ReviewPhaseFilter = 'all' | GamePhase

export function filterReviewRowsByPhase(rows: ReviewRow[], filter: ReviewPhaseFilter): ReviewRow[] {
  if (filter === 'all') return rows
  return rows.filter(row => row.phase === filter)
}

/**
 * Names what the review is currently showing, for copy that would otherwise
 * describe the whole game while a filter is narrowing it — "no major swings
 * found in this reviewed line" is a different claim from the same sentence
 * about White's moves in the opening.
 */
export function describeReviewScope(
  side: ReviewSideFilter,
  phase: ReviewPhaseFilter,
): string {
  const parts = [
    side === 'both' ? null : side === 'white' ? "White's moves" : "Black's moves",
    phase === 'all' ? null : `the ${getPhaseLabel(phase).toLowerCase()}`,
  ].filter(Boolean)
  return parts.length ? parts.join(' in ') : 'this reviewed line'
}

/**
 * A mate is stored as a sentinel centipawn score (see `scoreToCp`), not as a
 * real evaluation. Subtracting it from an ordinary score gives a delta of tens
 * of pawns, which is not a measurement of anything — it is two different kinds
 * of statement in the same units. One such move was contributing ~284 to a
 * 33-move average, putting "ACPL 316" next to "Blunder 0".
 *
 * Bounding the *reported* loss keeps a forced mate at the top of the scale
 * without letting it stand in for the rest of the game. 1000cp is the bound
 * Lichess uses for the same reason. Deliberately not applied to `deltaCp`
 * itself: move quality reads winning chances, and the raw delta stays raw for
 * anything that legitimately wants it.
 */
export const MAX_REPORTED_CENTIPAWN_LOSS = 1000

export function reportedCentipawnLoss(deltaCp: number | undefined): number {
  if (!isFiniteNumber(deltaCp)) return 0
  return Math.min(MAX_REPORTED_CENTIPAWN_LOSS, Math.max(0, -deltaCp))
}

export function accuracyFromCentipawnLoss(deltaCp: number): number {
  if (!isFiniteNumber(deltaCp)) return 0
  const loss = Math.max(0, -deltaCp)
  const accuracy = 100 * Math.exp(-loss / 300)
  return Math.max(0, Math.min(100, accuracy))
}

// Lichess's published accuracy curve, over winning chances rather than
// centipawns: https://lichess.org/page/accuracy
const MOVE_ACCURACY_SCALE = 103.1668
const MOVE_ACCURACY_DECAY = 0.04354
const MOVE_ACCURACY_OFFSET = 3.1669

export function accuracyFromWinPercentLoss(winPercentLoss: number): number {
  if (!isFiniteNumber(winPercentLoss)) return 0
  const loss = Math.max(0, Math.min(100, winPercentLoss))
  const accuracy = MOVE_ACCURACY_SCALE * Math.exp(-MOVE_ACCURACY_DECAY * loss) - MOVE_ACCURACY_OFFSET
  return Math.max(0, Math.min(100, accuracy))
}

/** Prefers the position-aware reading, and falls back for rows built without one. */
function accuracyForRow(row: ReviewRow): number {
  return isFiniteNumber(row.winPercentLoss)
    ? accuracyFromWinPercentLoss(row.winPercentLoss)
    : accuracyFromCentipawnLoss(row.deltaCp as number)
}

function average(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * The game's winning-chance series, from the mover's point of view at each
 * position, with the position after the last move appended. Rows that were
 * never evaluated carry the previous reading forward: a gap is not a swing,
 * and treating it as one would inflate the weight of the moves around it.
 */
function winPercentSeries(rows: ReviewRow[]): number[] {
  if (rows.length === 0) return []
  const series: number[] = []
  let last = 50
  for (const row of rows) {
    if (isFiniteNumber(row.winPercentBefore)) last = row.winPercentBefore
    series.push(last)
  }
  const final = rows[rows.length - 1]
  const after = isFiniteNumber(final.winPercentBefore) && isFiniteNumber(final.winPercentLoss)
    ? final.winPercentBefore - final.winPercentLoss
    : last
  series.push(after)
  return series
}

export function summarizeAccuracy(rows: ReviewRow[]): AccuracySummary {
  const white: number[] = []
  const black: number[] = []
  const whiteLosses: number[] = []
  const blackLosses: number[] = []
  const whiteWeights: number[] = []
  const blackWeights: number[] = []
  let pendingMoves = 0

  // Weights come from the whole game's swing, not from one player's moves, so
  // they are computed over every row before the split by colour.
  const weights = volatilityWeights(winPercentSeries(rows))

  for (const [index, row] of rows.entries()) {
    if (!isFiniteNumber(row.deltaCp) || row.quality === 'pending') {
      pendingMoves += 1
      continue
    }

    const loss = reportedCentipawnLoss(row.deltaCp)
    const accuracy = accuracyForRow(row)
    const weight = weights[index] ?? MIN_WEIGHT
    if (row.sideToMove === 'w') {
      white.push(accuracy)
      whiteLosses.push(loss)
      whiteWeights.push(weight)
    } else {
      black.push(accuracy)
      blackLosses.push(loss)
      blackWeights.push(weight)
    }
  }

  const values = [...white, ...black]
  const losses = [...whiteLosses, ...blackLosses]

  return {
    // Volatility-weighted, then averaged with the harmonic mean; see
    // engine/accuracyAggregate for why the plain mean is the wrong aggregate
    // for this number. Centipawn loss stays a plain average: it is reported as
    // "average centipawn loss" and that is what it should be.
    overall: aggregateAccuracy(values, [...whiteWeights, ...blackWeights]),
    white: aggregateAccuracy(white, whiteWeights),
    black: aggregateAccuracy(black, blackWeights),
    averageCentipawnLoss: average(losses),
    whiteAverageCentipawnLoss: average(whiteLosses),
    blackAverageCentipawnLoss: average(blackLosses),
    evaluatedMoves: values.length,
    pendingMoves,
  }
}

/**
 * Accuracy split by phase, so a report can say *where* a game was lost rather
 * than only by how much. Phases with nothing evaluated are left out entirely —
 * an empty phase would otherwise read as a score of zero.
 */
export function summarizeAccuracyByPhase(
  rows: ReviewRow[],
): Array<{ phase: GamePhase; summary: AccuracySummary }> {
  return GAME_PHASES
    .map(({ key }) => ({ phase: key, summary: summarizeAccuracy(rows.filter(row => row.phase === key)) }))
    .filter(entry => entry.summary.evaluatedMoves > 0)
}

/**
 * What the evaluation means, in words.
 *
 * The Coach card showed "-0.49", which is precise and tells a beginner nothing:
 * the whole point of that view is to say things in plain language, and the one
 * number at the top of it was the least plain thing on the panel. The bands are
 * the ones a commentator uses, and the percentage is this app's own
 * `winPercentFromCp` — the same model the trend graph and the accuracy scoring
 * read, so the sentence cannot disagree with the graph beside it.
 *
 * Everything is White-relative, because everything the reader sees is.
 */
const ADVANTAGE_BANDS: Array<{ upTo: number; label: string }> = [
  { upTo: 30, label: 'level' },
  { upTo: 90, label: 'slightly better' },
  { upTo: 250, label: 'better' },
  { upTo: 600, label: 'winning' },
  { upTo: Number.POSITIVE_INFINITY, label: 'completely winning' },
]

export function describeAdvantage(whitePovCp?: number, whitePovMate?: number): string | null {
  if (isFiniteNumber(whitePovMate)) {
    if (whitePovMate === 0) return null
    const side = whitePovMate > 0 ? 'White' : 'Black'
    const moves = Math.abs(whitePovMate)
    return `${side} has mate in ${moves}.`
  }
  if (!isFiniteNumber(whitePovCp)) return null

  const percent = Math.round(winPercentFromCp(whitePovCp))
  const band = ADVANTAGE_BANDS.find(entry => Math.abs(whitePovCp) <= entry.upTo)!
  if (band.label === 'level') return `Level · ${percent}% for White`

  const side = whitePovCp > 0 ? 'White' : 'Black'
  return `${side} is ${band.label} · ${percent}% for White`
}

export function normalizeWhitePovCp(fen: string, cp: number): number {
  const turn = fen.split(' ')[1]
  return turn === 'w' ? cp : -cp
}

export function normalizeWhitePovMate(fen: string, mate: number): number {
  const turn = fen.split(' ')[1]
  return turn === 'w' ? mate : -mate
}

export function formatWhitePovEvaluation(fen: string, cp?: number, mate?: number): string {
  if (isFiniteNumber(mate)) return formatEvaluation(undefined, normalizeWhitePovMate(fen, mate))
  if (isFiniteNumber(cp)) return formatEvaluation(normalizeWhitePovCp(fen, cp), undefined)
  return formatEvaluation()
}

/**
 * Short white-POV score for the board's evaluation bar, where the column is only
 * a couple of characters wide. Large advantages drop the decimal rather than
 * overflowing; the exact score stays available in the analysis panel.
 */
export function formatCompactWhitePovEvaluation(fen: string, cp?: number, mate?: number): string | null {
  if (typeof mate === 'number') {
    // Same `#` notation the panels use — an `M` prefix here put two different
    // mate notations on screen at once.
    return `#${normalizeWhitePovMate(fen, mate)}`
  }
  if (typeof cp !== 'number') return null
  const pawns = normalizeWhitePovCp(fen, cp) / 100
  const sign = pawns < 0 ? '-' : '+'
  const magnitude = Math.round(Math.abs(pawns) * 10) / 10
  if (magnitude >= 10) return `${sign}${Math.round(magnitude)}`
  return `${sign}${magnitude.toFixed(1)}`
}

/**
 * Stockfish reports win/draw/loss from the side to move. Everything the reader
 * sees is white-relative, so the flip has to happen exactly once, in one place —
 * getting it backwards inverts an evaluation bar without looking wrong.
 */
export function normalizeWhitePovWdl(fen: string, wdl: { w: number; d: number; l: number }): { white: number; draw: number; black: number } | null {
  if (![wdl.w, wdl.d, wdl.l].every(value => isFiniteNumber(value) && value >= 0)) return null

  const total = wdl.w + wdl.d + wdl.l
  if (total <= 0) return null

  const turn = fen.split(' ')[1]
  const whiteWins = turn === 'w' ? wdl.w : wdl.l
  const blackWins = turn === 'w' ? wdl.l : wdl.w

  return {
    white: (whiteWins / total) * 100,
    draw: (wdl.d / total) * 100,
    black: (blackWins / total) * 100,
  }
}


export function buildWinrateSeries(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
): WinratePoint[] {
  const { startFen, plies } = replayHistory(history, rootFen)
  const series: WinratePoint[] = []

  const startSnapshot = evaluationsByFen.get(startFen)
  const startCp = startSnapshot ? scoreToCp(startSnapshot.cp, startSnapshot.mate) : undefined
  if (isFiniteNumber(startCp)) {
    series.push({
      index: 0,
      label: 'Start',
      whiteWinrate: winPercentFromCp(normalizeWhitePovCp(startFen, startCp)),
    })
  }

  for (const ply of plies) {
    // The move that ended the game has no engine reading and never will; the
    // result is the reading. Same fallback `buildReviewRows` makes.
    const snapshot = evaluationsByFen.get(ply.afterFen) ?? ply.terminal
    const cp = snapshot ? scoreToCp(snapshot.cp, snapshot.mate) : undefined
    if (!isFiniteNumber(cp)) continue

    const prefix = ply.sideToMove === 'w' ? `${ply.moveNumber}.` : `${ply.moveNumber}...`
    series.push({
      index: ply.index + 1,
      label: `${prefix} ${ply.san}`,
      whiteWinrate: winPercentFromCp(normalizeWhitePovCp(ply.afterFen, cp)),
    })
  }

  return series
}

export function buildWdlSeries(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
): WdlPoint[] {
  const { startFen, plies } = replayHistory(history, rootFen)
  const series: WdlPoint[] = []

  const startWdl = evaluationsByFen.get(startFen)?.wdl
  if (startWdl) {
    const normalized = normalizeWhitePovWdl(startFen, startWdl)
    if (normalized) {
      series.push({
        index: 0,
        label: 'Start',
        ...normalized,
      })
    }
  }

  for (const ply of plies) {
    // The result stands in for the missing engine reading, as above -- but
    // only once the series has a point to follow. With WDL off nothing else
    // in the game has one, and a graph of a single final point would claim
    // there was a WDL trend to show.
    const wdl = evaluationsByFen.get(ply.afterFen)?.wdl
      ?? (series.length > 0 ? ply.terminal?.wdl : undefined)
    if (!wdl) continue

    const normalized = normalizeWhitePovWdl(ply.afterFen, wdl)
    if (!normalized) continue

    const prefix = ply.sideToMove === 'w' ? `${ply.moveNumber}.` : `${ply.moveNumber}...`
    series.push({
      index: ply.index + 1,
      label: `${prefix} ${ply.san}`,
      ...normalized,
    })
  }

  return series
}
