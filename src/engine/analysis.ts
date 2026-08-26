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

export function scoreToCp(cp?: number, mate?: number): number | undefined {
  if (typeof mate === 'number') {
    if (mate > 0) return 10000
    if (mate < 0) return -10000
    return undefined
  }
  return cp
}

export function formatEvaluation(cp?: number, mate?: number): string {
  if (typeof mate === 'number') return `#${mate}`
  if (typeof cp === 'number') return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`
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
  if (typeof snapshot.depth === 'number' && snapshot.depth < 10) return true
  if (typeof snapshot.time === 'number' && snapshot.time < 150 && typeof snapshot.depth !== 'number') return true
  return false
}

function minDepth(a: EvalSnapshot, b: EvalSnapshot): number | undefined {
  if (typeof a.depth === 'number' && typeof b.depth === 'number') return Math.min(a.depth, b.depth)
  return a.depth ?? b.depth
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
    if (!beforeSnapshot || !afterSnapshot || typeof before !== 'number' || typeof after !== 'number') {
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
  if (typeof mate === 'number') return formatEvaluation(undefined, normalizeWhitePovMate(fen, mate))
  if (typeof cp === 'number') return formatEvaluation(normalizeWhitePovCp(fen, cp), undefined)
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

function normalizeWhitePovWdl(fen: string, wdl: { w: number; d: number; l: number }): { white: number; draw: number; black: number } | null {
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

function cpToWhiteWinrate(cp: number): number {
  const limited = Math.max(-2000, Math.min(2000, cp))
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * limited)) - 1)
  return Math.max(0, Math.min(100, raw))
}

export function buildWinrateSeries(
  history: Move[],
  evaluationsByFen: Map<string, EvalSnapshot>,
  rootFen = new Chess().fen(),
): WinratePoint[] {
  const replay = new Chess(rootFen)
  const series: WinratePoint[] = []

  const startFen = replay.fen()
  const startCp = evaluationsByFen.get(startFen)?.cp
  if (typeof startCp === 'number') {
    series.push({
      index: 0,
      label: 'Start',
      whiteWinrate: cpToWhiteWinrate(normalizeWhitePovCp(startFen, startCp)),
    })
  }

  history.forEach((move, index) => {
    replay.move({ from: move.from, to: move.to, promotion: move.promotion })
    const fen = replay.fen()
    const cp = evaluationsByFen.get(fen)?.cp
    if (typeof cp !== 'number') return

    const moveNumber = Math.floor(index / 2) + 1
    const prefix = index % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`
    series.push({
      index: index + 1,
      label: `${prefix} ${move.san}`,
      whiteWinrate: cpToWhiteWinrate(normalizeWhitePovCp(fen, cp)),
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
