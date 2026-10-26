import { useMemo } from 'react'
import { type ReviewPhaseFilter, type ReviewRow, summarizeAccuracyByPhase } from '../engine/analysis'
import { getPhaseLabel } from '../engine/gamePhase'
import './PhaseAccuracy.css'

type Props = {
  rows: ReviewRow[]
  /** Renders the accuracy figure the same way the overall summary does. */
  formatAccuracy: (value: number | null) => string
  selected: ReviewPhaseFilter
  onSelect: (phase: ReviewPhaseFilter) => void
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
export function PhaseAccuracy({ rows, formatAccuracy, selected, onSelect }: Props) {
  const phases = useMemo(() => summarizeAccuracyByPhase(rows), [rows])
  if (phases.length < 2) return null

  return (
    <div className="phase-accuracy" role="group" aria-label="Accuracy by phase">
      {phases.map(({ phase, summary }) => {
        const label = getPhaseLabel(phase)
        const scope = label.toLowerCase()
        const white = summary.white === null ? 'not available' : formatAccuracy(summary.white)
        const black = summary.black === null ? 'not available' : formatAccuracy(summary.black)
        const count = `${summary.evaluatedMoves} ${summary.evaluatedMoves === 1 ? 'move' : 'moves'}`
        return <button
          key={phase}
          type="button"
          className={`phase-accuracy-row${selected === phase ? ' selected' : ''}`}
          aria-label={`${label}. White accuracy in the ${scope}: ${white}. Black accuracy in the ${scope}: ${black}. ${count}.`}
          aria-pressed={selected === phase}
          title={selected === phase ? 'Show the whole game again' : `Show only the ${scope}`}
          onClick={() => onSelect(selected === phase ? 'all' : phase)}
          onFocus={event => {
            const target = event.currentTarget
            if (!target.matches(':focus-visible')) return
            // Firefox can stop scrolling once the first line is visible.
            // Reveal the complete keyboard control after native focus settles.
            requestAnimationFrame(() => {
              if (document.activeElement === target) {
                target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
              }
            })
          }}
        >
          <span className="phase-accuracy-label">{label}</span>
          <span className="phase-accuracy-scores">
            <span><i aria-hidden="true">W</i> <strong>{formatAccuracy(summary.white)}</strong></span>
            <span><i aria-hidden="true">B</i> <strong>{formatAccuracy(summary.black)}</strong></span>
          </span>
          <span className="phase-accuracy-count">{count}</span>
        </button>
      })}
    </div>
  )
}
