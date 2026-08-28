import { Chess, type Move } from 'chess.js'
import type { EngineLine } from '../hooks/useStockfishEngine'
import type { AnalyzeMode, AnalyzePurpose } from './uci'

export type EvalSnapshot = {
  cp: number
  mate?: number
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

export type ReviewLabel = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'pending'
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

export function uciToSan(fen: string, uci: string): string | null {
  if (uci.length < 4) return null

  const replay = new Chess(fen)
  try {
    const move = replay.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    })
    return move?.san ?? null
  } catch {
    return null
  }
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

type GradedLabel = Exclude<ReviewLabel, 'pending'>

const CP_LOSS_THRESHOLDS = {
  best: 20,
  good: 70,
  inaccuracy: 140,
  mistake: 260,
} as const

function qualityFromDelta(deltaCp: number): GradedLabel {
  if (deltaCp >= -CP_LOSS_THRESHOLDS.best) return 'best'
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
  best: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.best),
  good: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.good),
  inaccuracy: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.inaccuracy),
  mistake: winPercentFromCp(0) - winPercentFromCp(-CP_LOSS_THRESHOLDS.mistake),
} as const

const LABEL_SEVERITY: Record<GradedLabel, number> = {
  best: 0,
  good: 1,
  inaccuracy: 2,
  mistake: 3,
  blunder: 4,
}

function qualityFromWinPercentLoss(loss: number): GradedLabel {
  if (loss <= WIN_PERCENT_LOSS_THRESHOLDS.best) return 'best'
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

function terminalEvaluationSnapshot(position: Chess): EvalSnapshot | null {
  if (position.isCheckmate()) {
    return {
      cp: -10000,
      purpose: 'batch-review',
      mode: 'review',
    }
  }

  if (position.isDraw()) {
    return {
      cp: 0,
      purpose: 'batch-review',
      mode: 'review',
    }
  }

  return null
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

export function buildReviewRows(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
): ReviewRow[] {
  const replay = new Chess(rootFen)
  const rows: ReviewRow[] = []

  for (const [index, move] of history.entries()) {
    const beforeFen = replay.fen()
    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()
    if (!tryReplayMove(replay, move)) break
    const afterFen = replay.fen()

    const beforeSnapshot = evaluationsByFen.get(beforeFen)
    const afterSnapshot = evaluationsByFen.get(afterFen) ?? terminalEvaluationSnapshot(replay)
    const before = beforeSnapshot ? scoreToCp(beforeSnapshot.cp, beforeSnapshot.mate) : undefined
    const after = afterSnapshot ? scoreToCp(afterSnapshot.cp, afterSnapshot.mate) : undefined
    const bestMove = beforeSnapshot?.bestMove
    const bestMoveSan = bestMove ? uciToSan(beforeFen, bestMove) ?? bestMove : undefined
    if (!beforeSnapshot || !afterSnapshot || !isFiniteNumber(before) || !isFiniteNumber(after)) {
      rows.push({
        ply: index + 1,
        moveNumber,
        sideToMove,
        san: move.san,
        uci: toUci(move),
        bestMove,
        bestMoveSan,
        quality: 'pending',
        confidence: 'pending',
      })
      continue
    }

    // Engine score is POV side-to-move. After the move, perspective flips.
    const deltaCp = Math.round(-after - before)
    // Both readings are from the mover's point of view, so the drop in winning
    // chances is what that player actually gave up.
    const winPercentLoss = Math.max(0, winPercentFromCp(before) - winPercentFromCp(-after))
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
      san: move.san,
      uci: toUci(move),
      bestMove,
      bestMoveSan,
      deltaCp,
      winPercentLoss,
      evalDepth,
      confidence,
      quality: shallow ? 'pending' : qualityForMove(deltaCp, winPercentLoss),
    })
  }

  return rows
}

export function summarizeReview(rows: ReviewRow[]): Record<ReviewLabel, number> {
  return rows.reduce<Record<ReviewLabel, number>>(
    (acc, row) => {
      acc[row.quality] += 1
      return acc
    },
    { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, pending: 0 },
  )
}

export function filterReviewRowsBySide(rows: ReviewRow[], filter: ReviewSideFilter): ReviewRow[] {
  if (filter === 'both') return rows
  const side = filter === 'white' ? 'w' : 'b'
  return rows.filter(row => row.sideToMove === side)
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

export function summarizeAccuracy(rows: ReviewRow[]): AccuracySummary {
  const white: number[] = []
  const black: number[] = []
  const whiteLosses: number[] = []
  const blackLosses: number[] = []
  let pendingMoves = 0

  for (const row of rows) {
    if (!isFiniteNumber(row.deltaCp) || row.quality === 'pending') {
      pendingMoves += 1
      continue
    }

    const loss = Math.max(0, -row.deltaCp)
    const accuracy = accuracyForRow(row)
    if (row.sideToMove === 'w') {
      white.push(accuracy)
      whiteLosses.push(loss)
    } else {
      black.push(accuracy)
      blackLosses.push(loss)
    }
  }

  const values = [...white, ...black]
  const losses = [...whiteLosses, ...blackLosses]

  return {
    overall: average(values),
    white: average(white),
    black: average(black),
    averageCentipawnLoss: average(losses),
    whiteAverageCentipawnLoss: average(whiteLosses),
    blackAverageCentipawnLoss: average(blackLosses),
    evaluatedMoves: values.length,
    pendingMoves,
  }
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
  const replay = new Chess(rootFen)
  const series: WinratePoint[] = []

  const startFen = replay.fen()
  const startSnapshot = evaluationsByFen.get(startFen)
  const startCp = startSnapshot ? scoreToCp(startSnapshot.cp, startSnapshot.mate) : undefined
  if (isFiniteNumber(startCp)) {
    series.push({
      index: 0,
      label: 'Start',
      whiteWinrate: winPercentFromCp(normalizeWhitePovCp(startFen, startCp)),
    })
  }

  for (const [index, move] of history.entries()) {
    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()
    if (!tryReplayMove(replay, move)) break
    const fen = replay.fen()
    const snapshot = evaluationsByFen.get(fen)
    const cp = snapshot ? scoreToCp(snapshot.cp, snapshot.mate) : undefined
    if (!isFiniteNumber(cp)) continue

    const prefix = sideToMove === 'w' ? `${moveNumber}.` : `${moveNumber}...`
    series.push({
      index: index + 1,
      label: `${prefix} ${move.san}`,
      whiteWinrate: winPercentFromCp(normalizeWhitePovCp(fen, cp)),
    })
  }

  return series
}

export function buildWdlSeries(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
): WdlPoint[] {
  const replay = new Chess(rootFen)
  const series: WdlPoint[] = []

  const startFen = replay.fen()
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

  for (const [index, move] of history.entries()) {
    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()
    if (!tryReplayMove(replay, move)) break
    const fen = replay.fen()
    const wdl = evaluationsByFen.get(fen)?.wdl
    if (!wdl) continue

    const normalized = normalizeWhitePovWdl(fen, wdl)
    if (!normalized) continue

    const prefix = sideToMove === 'w' ? `${moveNumber}.` : `${moveNumber}...`
    series.push({
      index: index + 1,
      label: `${prefix} ${move.san}`,
      ...normalized,
    })
  }

  return series
}
