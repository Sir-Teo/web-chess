import { useMemo } from 'react'
import { type ReviewRow, summarizeAccuracyByPhase } from '../engine/analysis'
import { getPhaseLabel } from '../engine/gamePhase'
import './PhaseAccuracy.css'

type Props = {
  rows: ReviewRow[]
  /** Renders the accuracy figure the same way the overall summary does. */
  formatAccuracy: (value: number | null) => string
}

/**
 * Where a game was played well and where it was not.
 *
 * A single overall accuracy hides the common shape of an amateur game — a
 * decent opening followed by a collapse — which is exactly what a review is
 * for. Ported in spirit from web-katrain, whose report has had a phase filter
 * all along.
 *
 * Nothing is shown for a game that never left one phase: a lone bar labelled
 * "Opening" repeats the overall figure without adding to it.
 */
export function PhaseAccuracy({ rows, formatAccuracy }: Props) {
  const phases = useMemo(() => summarizeAccuracyByPhase(rows), [rows])
  if (phases.length < 2) return null

  return (
    <div className="phase-accuracy" aria-label="Accuracy by phase">
      {phases.map(({ phase, summary }) => (
        <div key={phase} className="phase-accuracy-row">
          <span className="phase-accuracy-label">{getPhaseLabel(phase)}</span>
          <span className="phase-accuracy-scores">
            <span><i aria-hidden="true">W</i> <strong aria-label={`White accuracy in the ${getPhaseLabel(phase).toLowerCase()}`}>{formatAccuracy(summary.white)}</strong></span>
            <span><i aria-hidden="true">B</i> <strong aria-label={`Black accuracy in the ${getPhaseLabel(phase).toLowerCase()}`}>{formatAccuracy(summary.black)}</strong></span>
          </span>
          <span className="phase-accuracy-count">
            {summary.evaluatedMoves} {summary.evaluatedMoves === 1 ? 'move' : 'moves'}
          </span>
        </div>
      ))}
    </div>
  )
}
