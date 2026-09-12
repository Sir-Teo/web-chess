import { isReviewEvaluationSufficient, type EvalSnapshot } from './analysis'
import { planBatchReview, type BatchReviewTarget } from './batchReview'
import { sameEvaluationEngine, type EvaluationEngine } from './evaluationSource'

export type ReviewSettings = {
  engine: EvaluationEngine
  depth: number
  hashMb: number
  showWdl: boolean
}

export type ReviewSnapshot = {
  lineEndId: string
  evaluations: Map<string, EvalSnapshot>
  settings: ReviewSettings
  startedAt: number
  finishedAt: number
  total: number
  complete: boolean
}

export type ReviewSession = {
  lineEndId: string
  rootFen: string
  nodes: Array<{ fen: string; uci: string }>
  targetFens: Set<string>
  queue: BatchReviewTarget[]
  settings: ReviewSettings
  evaluations: Map<string, EvalSnapshot>
  startedAt: number
  total: number
  reused: number
}

/** A review owns its readings even when an older, deeper score stays on the board. */
export function createReviewSession(
  nodes: Array<{ id: string; fen: string; uci: string }>,
  rootFen: string,
  settings: ReviewSettings,
  liveEvaluations: Map<string, EvalSnapshot>,
  previous: ReviewSnapshot | null,
  now = Date.now(),
): ReviewSession {
  const lineEndId = nodes.at(-1)?.id ?? ''
  const candidates = new Map(liveEvaluations)
  if (previous?.lineEndId === lineEndId) {
    for (const [fen, reading] of previous.evaluations) {
      if (sameEvaluationEngine(settings.engine, reading.engine) && isReviewEvaluationSufficient(reading, settings.depth)) {
        candidates.set(fen, reading)
      }
    }
  }
  const plan = planBatchReview(nodes, rootFen, candidates, settings.depth, settings.engine)
  return {
    lineEndId, rootFen, nodes: nodes.map(({ fen, uci }) => ({ fen, uci })),
    settings: { ...settings, engine: { ...settings.engine } },
    evaluations: plan.reused, startedAt: now, total: plan.total, reused: plan.done,
    queue: plan.queue,
    targetFens: new Set([...plan.queue.map(target => target.fen), ...plan.reused.keys()]),
  }
}

/** Accept finished results from this producer; never silently fill gaps from other analysis. */
export function recordReviewResult(session: ReviewSession, fen: string, reading: EvalSnapshot): boolean {
  if (!session.targetFens.has(fen) || !sameEvaluationEngine(session.settings.engine, reading.engine)
    || !isReviewEvaluationSufficient(reading, session.settings.depth)) return false
  session.evaluations.set(fen, reading)
  return true
}

export function snapshotReviewSession(session: ReviewSession, now = Date.now()): ReviewSnapshot {
  return {
    lineEndId: session.lineEndId, evaluations: new Map(session.evaluations), settings: session.settings,
    startedAt: session.startedAt, finishedAt: now, total: session.total,
    complete: [...session.targetFens].every(fen => session.evaluations.has(fen)),
  }
}
