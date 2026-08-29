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

export type BatchReviewTarget = ImportSweepTarget

export type BatchReviewPlan = {
  /** The positions still to search, in play order. */
  queue: BatchReviewTarget[]
  /** Positions that already had a deep enough evaluation, so the bar starts here. */
  done: number
  /** Every position worth searching, skipped or not. */
  total: number
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
): BatchReviewPlan {
  const searchable = buildBatchReviewTargets(nodes, rootFen)
    .filter(target => !isTerminalPositionFen(target.fen))
  const queue = searchable
    .filter(target => !isReviewEvaluationSufficient(evaluations.get(target.fen), minDepth))

  return {
    queue,
    done: searchable.length - queue.length,
    total: searchable.length,
  }
}
