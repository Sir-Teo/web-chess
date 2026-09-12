import type { GameNode } from '../hooks/useGameTree'
import { evaluationEngineLabel } from './evaluationSource'
import { exportAnnotatedPgn } from './pgn'
import type { ReviewSnapshot } from './reviewSession'

/** Export the reviewed branch and its own scores, with no unrelated variation results. */
export function exportReviewPgn(
  line: GameNode[],
  report: ReviewSnapshot,
  headers: Record<string, string>,
  qualities: Array<GameNode['quality']>,
): string | null {
  if (line.length < 2 || line.at(-1)?.id !== report.lineEndId) return null
  const selectedLine = line.map((node, index) => ({
    ...node,
    parent: index > 0 ? line[index - 1].id : null,
    children: index + 1 < line.length ? [line[index + 1].id] : [],
    quality: index > 0 ? qualities[index - 1] : undefined,
  }))
  return exportAnnotatedPgn(selectedLine, report.evaluations, {
    ...headers,
    Annotator: `Web Chess review · ${evaluationEngineLabel(report.settings.engine)}`,
    WebChessReviewDepth: String(report.settings.depth),
    WebChessReviewHash: String(report.settings.hashMb),
    WebChessReviewStatus: report.complete ? 'complete' : 'partial',
    WebChessReviewReused: String(report.reused),
  }, undefined, { includeVariations: false })
}
