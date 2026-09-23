import { Chess, type Move } from 'chess.js'
import type { EngineLine } from '../hooks/useStockfishEngine'
import type { AnalyzeMode, AnalyzePurpose } from './uci'

export type EvalSnapshot = {
  cp: number
  mate?: number
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

export type ReviewRow = {
  ply: number
  moveNumber: number
  sideToMove: 'w' | 'b'
  san: string
  uci: string
  quality: ReviewLabel
  deltaCp?: number
  evalDepth?: number
  confidence: 'pending' | 'shallow' | 'standard' | 'deep'
}

export type ScorePoint = {
  index: number
  label: string
  whiteScore: number
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

function qualityFromDelta(deltaCp: number): ReviewLabel {
  if (deltaCp >= -20) return 'best'
  if (deltaCp >= -70) return 'good'
  if (deltaCp >= -140) return 'inaccuracy'
  if (deltaCp >= -260) return 'mistake'
  return 'blunder'
}

function isShallowEvaluation(snapshot: EvalSnapshot): boolean {
  if (snapshot.purpose === 'import-load' || snapshot.purpose === 'import-sweep') return true
  if (isFiniteNumber(snapshot.depth) && snapshot.depth < 10) return true
  if (isFiniteNumber(snapshot.time) && snapshot.time < 150 && !isFiniteNumber(snapshot.depth)) return true
  return false
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

export function buildReviewRows(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
): ReviewRow[] {
  const replay = new Chess(rootFen)

  return history.map((move, index) => {
    const beforeFen = replay.fen()
    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()
    replay.move({ from: move.from, to: move.to, promotion: move.promotion })
    const afterFen = replay.fen()

    const beforeSnapshot = evaluationsByFen.get(beforeFen)
    const afterSnapshot = evaluationsByFen.get(afterFen)
    const before = beforeSnapshot?.cp
    const after = afterSnapshot?.cp
    if (!beforeSnapshot || !afterSnapshot || !isFiniteNumber(before) || !isFiniteNumber(after)) {
      return {
        ply: index + 1,
        moveNumber,
        sideToMove,
        san: move.san,
        uci: toUci(move),
        quality: 'pending',
        confidence: 'pending',
      }
    }

    // Engine score is POV side-to-move. After the move, perspective flips.
    const deltaCp = Math.round(-after - before)
    const evalDepth = minDepth(beforeSnapshot, afterSnapshot)
    const shallow = isShallowEvaluation(beforeSnapshot) || isShallowEvaluation(afterSnapshot)
    const confidence = shallow
      ? 'shallow'
      : typeof evalDepth === 'number' && evalDepth >= 20
        ? 'deep'
        : 'standard'

    return {
      ply: index + 1,
      moveNumber,
      sideToMove,
      san: move.san,
      uci: toUci(move),
      deltaCp,
      evalDepth,
      confidence,
      quality: shallow ? 'pending' : qualityFromDelta(deltaCp),
    }
  })
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

function normalizeWhitePovWdl(fen: string, wdl: { w: number; d: number; l: number }): { white: number; draw: number; black: number } | null {
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

function cpToWhiteScoreEstimate(cp: number): number {
  const limited = Math.max(-2000, Math.min(2000, cp))
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * limited)) - 1)
  return Math.max(0, Math.min(100, raw))
}

function whiteScoreEstimate(fen: string, snapshot: EvalSnapshot | undefined): number | null {
  if (!snapshot) return null
  const wdl = snapshot.wdl && normalizeWhitePovWdl(fen, snapshot.wdl)
  if (wdl) return wdl.white + wdl.draw / 2
  if (!isFiniteNumber(snapshot.cp)) return null
  return cpToWhiteScoreEstimate(normalizeWhitePovCp(fen, snapshot.cp))
}

export function buildScoreSeries(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
): ScorePoint[] {
  const replay = new Chess(rootFen)
  const series: ScorePoint[] = []

  const startFen = replay.fen()
  const startScore = whiteScoreEstimate(startFen, evaluationsByFen.get(startFen))
  if (startScore !== null) {
    series.push({
      index: 0,
      label: 'Start',
      whiteScore: startScore,
    })
  }

  history.forEach((move, index) => {
    replay.move({ from: move.from, to: move.to, promotion: move.promotion })
    const fen = replay.fen()
    const whiteScore = whiteScoreEstimate(fen, evaluationsByFen.get(fen))
    if (whiteScore === null) return

    const moveNumber = Math.floor(index / 2) + 1
    const prefix = index % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`
    series.push({
      index: index + 1,
      label: `${prefix} ${move.san}`,
      whiteScore,
    })
  })

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

  history.forEach((move, index) => {
    replay.move({ from: move.from, to: move.to, promotion: move.promotion })
    const fen = replay.fen()
    const wdl = evaluationsByFen.get(fen)?.wdl
    if (!wdl) return

    const normalized = normalizeWhitePovWdl(fen, wdl)
    if (!normalized) return

    const moveNumber = Math.floor(index / 2) + 1
    const prefix = index % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`
    series.push({
      index: index + 1,
      label: `${prefix} ${move.san}`,
      ...normalized,
    })
  })

  return series
}
