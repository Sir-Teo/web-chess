import { memo } from 'react'
import type { ReviewRow } from '../engine/analysis'
import type { GameNode } from '../hooks/useGameTree'
import { REVIEW_LABELS, reviewConfidenceLabel } from '../engine/reviewLabels'
import { reviewImpactLabel } from '../engine/reviewImpact'
import { describeClockTime, formatClockTime } from '../engine/chessClock'

type ReviewMoveListProps = {
  rows: ReviewRow[]
  nodes: GameNode[]
  currentNodeId: string
  showEngineDetail: boolean
  hideBestMoves?: boolean
  onSelectNode: (node: GameNode) => void
}

export const ReviewMoveList = memo(function ReviewMoveList({ rows, nodes, currentNodeId, showEngineDetail, hideBestMoves = false, onSelectNode }: ReviewMoveListProps) {
  return (
    <ol className="moves-list review-move-list">
      {rows.map(row => {
        const node = nodes[row.ply]
        const movePrefix = row.sideToMove === 'w' ? `${row.moveNumber}.` : `${row.moveNumber}...`
        const isCurrentReviewMove = node?.id === currentNodeId
        const qualityLabel = REVIEW_LABELS[row.quality]
        const impactLabel = reviewImpactLabel(row.deltaCp)
        const confidenceLabel = reviewConfidenceLabel(row.confidence, row.evalDepth)
        const bestMoveHint =
          row.bestMove && row.bestMove !== row.uci ? `Best ${row.bestMoveSan ?? row.bestMove}` : null
        const visibleBestMoveHint = hideBestMoves ? null : bestMoveHint
        // What the mover had left when they played it, where the game carries
        // it. Half the blunders in a real game are explained by this number and
        // by nothing in the evaluation.
        const clockLabel = typeof node?.clockMs === 'number' ? formatClockTime(node.clockMs) : null
        const ariaDetails = [
          qualityLabel,
          impactLabel,
          confidenceLabel,
          visibleBestMoveHint,
          clockLabel ? `${describeClockTime(node!.clockMs!)} left` : null,
        ].filter(Boolean).join(', ')

        return (
          <li key={`${row.ply}-${row.uci}`} className={`quality-${row.quality}`}>
            <button
              type="button"
              className={`review-move-row ${showEngineDetail ? '' : 'compact'} ${isCurrentReviewMove ? 'active' : ''}`}
              disabled={!node}
              aria-current={isCurrentReviewMove ? 'true' : undefined}
              aria-label={`Go to ${movePrefix} ${row.san}: ${ariaDetails}`}
              onClick={() => {
                if (node) onSelectNode(node)
              }}
            >
              <span className="move-index">{movePrefix}</span>
              <strong>{row.san}</strong>
              {showEngineDetail && <span className="move-uci">{row.uci}</span>}
              <span className="move-best">{visibleBestMoveHint ?? ''}</span>
              <span className="move-impact">{impactLabel}</span>
              {clockLabel && <span className="move-clock" aria-hidden="true">{clockLabel}</span>}
              {showEngineDetail && (
                <span className={`move-confidence confidence-${row.confidence}`}>
                  {confidenceLabel}
                </span>
              )}
              <span className="move-quality">{qualityLabel}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
})
