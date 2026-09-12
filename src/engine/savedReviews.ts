import type { GameNode } from '../hooks/useGameTree'
import { isReviewEvaluationSufficient, isTerminalPositionFen, type EvalSnapshot } from './analysis'
import { decodeEvaluationEngine, encodeEvaluationEngine, sameEvaluationEngine } from './evaluationSource'
import { flattenPgnMainLine, parsePgnMoveTree } from './pgn'
import { exportReviewPgn } from './reviewPgn'
import type { ReviewSettings, ReviewSnapshot } from './reviewSession'

export const MAX_SAVED_REVIEWS = 50
export const MAX_SAVED_REVIEW_BYTES = 512 * 1024
const MAX_POSITIONS = 2049

export type SavedReviewSummary = {
  id: string
  title: string
  lineKey: string
  settings: ReviewSettings
  startedAt: number
  finishedAt: number
  total: number
  complete: boolean
  reused: number
  evaluated: number
}

export type SavedReview = SavedReviewSummary & {
  version: 1
  pgn: string
  evaluations: Array<[string, EvalSnapshot]>
}

/** IDs change on PGN import. Include the entire history, including the root clocks. */
export function reviewLineKey(line: ReadonlyArray<{ fen: string; uci: string }>): string {
  return JSON.stringify([line[0]?.fen ?? '', ...line.slice(1).map(node => node.uci)])
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function settingsFrom(value: unknown): ReviewSettings | null {
  if (!object(value) || !object(value.engine)) return null
  const engine = decodeEvaluationEngine(encodeEvaluationEngine(value.engine as ReviewSettings['engine']) ?? undefined)
  if (!engine || !integer(value.depth, 1, 128) || !integer(value.hashMb, 1, 65536)
    || typeof value.showWdl !== 'boolean') return null
  return { engine, depth: value.depth, hashMb: value.hashMb, showWdl: value.showWdl }
}

/** Read only small metadata when listing runs; validate the PGN/readings on opening. */
export function savedReviewSummary(value: unknown): SavedReviewSummary | null {
  if (!object(value) || value.version !== 1 || typeof value.id !== 'string' || !/^[\w-]{1,100}$/.test(value.id)
    || typeof value.title !== 'string' || !value.title || value.title.length > 200
    || typeof value.lineKey !== 'string' || value.lineKey.length > 15000
    || !integer(value.startedAt, 0, 8.64e15) || !integer(value.finishedAt, value.startedAt, 8.64e15)
    || !integer(value.total, 0, MAX_POSITIONS) || !integer(value.reused, 0, value.total)
    || !integer(value.evaluated, 0, value.total) || typeof value.complete !== 'boolean') return null
  const settings = settingsFrom(value.settings)
  if (!settings || value.complete !== (value.evaluated === value.total) || value.reused > value.evaluated) return null
  return {
    id: value.id, title: value.title, lineKey: value.lineKey, settings,
    startedAt: value.startedAt, finishedAt: value.finishedAt, total: value.total,
    complete: value.complete, reused: value.reused, evaluated: value.evaluated,
  }
}

function readingFrom(value: unknown, settings: ReviewSettings): EvalSnapshot | null {
  if (!object(value) || typeof value.cp !== 'number' || !Number.isFinite(value.cp)) return null
  if (!sameEvaluationEngine(settings.engine, object(value.engine) ? value.engine as ReviewSettings['engine'] : undefined)
    || !isReviewEvaluationSufficient(value as EvalSnapshot, settings.depth)) return null
  const reading: EvalSnapshot = { cp: value.cp, engine: { ...settings.engine }, depth: value.depth as number, purpose: 'batch-review' }
  if (value.mate !== undefined) {
    if (!integer(value.mate, -100000, 100000)) return null
    reading.mate = value.mate
  }
  if (value.bestMove !== undefined) {
    if (typeof value.bestMove !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value.bestMove)) return null
    reading.bestMove = value.bestMove
  }
  if (value.wdl !== undefined) {
    if (!object(value.wdl)) return null
    const { w, d, l } = value.wdl
    if (!integer(w, 0, 1000) || !integer(d, 0, 1000) || !integer(l, 0, 1000) || w + d + l !== 1000) return null
    reading.wdl = { w, d, l }
  }
  for (const key of ['nodes', 'nps', 'time', 'searchedAt'] as const) {
    if (value[key] !== undefined) {
      if (!integer(value[key], 0, Number.MAX_SAFE_INTEGER)) return null
      reading[key] = value[key]
    }
  }
  return reading
}

/** Corrupt or foreign readings must never become an apparently complete review. */
export function readSavedReview(value: unknown): SavedReview | null {
  const summary = savedReviewSummary(value)
  if (!summary || !object(value) || typeof value.pgn !== 'string' || value.pgn.length > MAX_SAVED_REVIEW_BYTES
    || !Array.isArray(value.evaluations) || value.evaluations.length !== summary.evaluated) return null
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_SAVED_REVIEW_BYTES) return null
    const parsed = parsePgnMoveTree(value.pgn)
    const moves = flattenPgnMainLine(parsed.moves)
    if (moves.length < 1 || moves.length >= MAX_POSITIONS) return null
    const line = [{ fen: parsed.rootFen, uci: '' }, ...moves.map(node => ({
      fen: node.fen, uci: node.move.from + node.move.to + (node.move.promotion ?? ''),
    }))]
    if (reviewLineKey(line) !== summary.lineKey) return null
    // Review planning does not search checkmate, stalemate or drawn FENs.
    // Their known result is derived again when the report is displayed.
    const targets = new Set(line.filter(node => !isTerminalPositionFen(node.fen)).map(node => node.fen))
    if (targets.size !== summary.total) return null
    const seen = new Set<string>()
    const evaluations: SavedReview['evaluations'] = []
    for (const pair of value.evaluations) {
      if (!Array.isArray(pair) || pair.length !== 2 || !targets.has(pair[0]) || seen.has(pair[0])) return null
      const reading = readingFrom(pair[1], summary.settings)
      if (!reading) return null
      seen.add(pair[0])
      evaluations.push([pair[0], reading])
    }
    return { ...summary, version: 1, pgn: value.pgn, evaluations }
  } catch { return null }
}

export function createSavedReview(
  line: GameNode[], report: ReviewSnapshot, headers: Record<string, string>, qualities: Array<GameNode['quality']>,
  id: string = crypto.randomUUID(),
): SavedReview {
  const pgn = exportReviewPgn(line, report, headers, qualities)
  if (!pgn) throw new Error('This report belongs to a different line. Return to its reviewed line before saving.')
  const title = headers.White && headers.Black ? `${headers.White} – ${headers.Black}` : headers.Event || 'Reviewed line'
  const saved = readSavedReview({
    version: 1, id, title: title.slice(0, 200), lineKey: reviewLineKey(line), pgn,
    settings: report.settings, startedAt: report.startedAt, finishedAt: report.finishedAt,
    total: report.total, reused: report.reused, complete: report.complete,
    evaluated: report.evaluations.size, evaluations: [...report.evaluations],
  })
  if (!saved) throw new Error('This review could not be saved. Export its PGN before closing it; saved reviews support up to 2,048 plies and 512 KB each.')
  return saved
}

export function restoreSavedReview(saved: SavedReview, line: ReadonlyArray<{ id: string; fen: string; uci: string }>): ReviewSnapshot | null {
  if (saved.lineKey !== reviewLineKey(line)) return null
  return {
    lineEndId: line.at(-1)!.id, settings: saved.settings, evaluations: new Map(saved.evaluations),
    startedAt: saved.startedAt, finishedAt: saved.finishedAt, total: saved.total,
    complete: saved.complete, reused: saved.reused,
  }
}
