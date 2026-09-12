/**
 * Deciding what a game review needs to search, before anything is dispatched.
 *
 * This lived inside `startBatchReview` in the component, which meant the rule
 * that decides how much work a review does — and what its progress bar starts
 * at — could not be exercised without mounting the app. It is the sibling of
 * `importSweep`, which already owns the target type and the same kind of
 * planning for a freshly imported game.
 *
 * Nothing here talks to an engine. It answers one question: given a line, what
 * is already known well enough, and what is left to look at.
 */
import type { ImportSweepTarget } from './importSweep'
import { type EvalSnapshot, isReviewEvaluationSufficient, isTerminalPositionFen } from './analysis'
import { sameEvaluationEngine, type EvaluationEngine } from './evaluationSource'
import { repetitionFensOnPath } from './gameEnd'

export type BatchReviewTarget = ImportSweepTarget

export type BatchReviewPlan = {
  /** The positions still to search, in play order. */
  queue: BatchReviewTarget[]
  /** Positions that already had a deep enough evaluation, so the bar starts here. */
  done: number
  /** Every position worth searching, skipped or not. */
  total: number
  /** Only the readings actually accepted for this review, scoped to its line. */
  reused: Map<string, EvalSnapshot>
}

/**
 * One target per position in the line, each carrying the moves that reach it.
 *
 * The history matters: an engine handed only a FEN cannot see a repetition, and
 * the moves are what let it. The root is included, and contributes no move.
 */
export function buildBatchReviewTargets(
  nodes: Array<{ fen: string; uci: string }>,
  rootFen: string,
): BatchReviewTarget[] {
  if (!nodes.length) return []

  const historyMoves: string[] = []
  return nodes.map((node, index) => {
    if (index > 0 && node.uci) historyMoves.push(node.uci)
    return {
      fen: node.fen,
      rootFen,
      historyMoves: [...historyMoves],
    }
  })
}

/** Canonical positions that need an engine reading, shared by planning and reports. */
export function reviewTargetFens(nodes: readonly { fen: string }[]): Set<string> {
  const repeated = repetitionFensOnPath(nodes)
  return new Set(nodes.filter(node => !repeated.has(node.fen) && !isTerminalPositionFen(node.fen)).map(node => node.fen))
}

/**
 * What a review of this line still has to do.
 *
 * Terminal positions are dropped entirely rather than skipped: a checkmate has
 * nothing to search and counting it would make the total larger than the work.
 * Positions already evaluated deeply enough are counted as done, so re-running a
 * review on an analysed game shows a full bar instead of pretending to work.
 */
export function planBatchReview(
  nodes: Array<{ fen: string; uci: string }>,
  rootFen: string,
  evaluations: Map<string, EvalSnapshot>,
  minDepth: number,
  engine?: EvaluationEngine,
): BatchReviewPlan {
  const targets = reviewTargetFens(nodes)
  const searchable = buildBatchReviewTargets(nodes, rootFen)
    .filter(target => targets.has(target.fen))
  const reused = new Map<string, EvalSnapshot>()
  const queue = searchable.filter(target => {
    const reading = evaluations.get(target.fen)
    if (reading && isReviewEvaluationSufficient(reading, minDepth)
      && (!engine || sameEvaluationEngine(engine, reading.engine))) {
      reused.set(target.fen, reading)
      return false
    }
    return true
  })

  return {
    queue,
    done: searchable.length - queue.length,
    total: searchable.length,
    reused,
  }
}
