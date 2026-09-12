import { useMemo, useState } from 'react'
import type { GameNode } from '../hooks/useGameTree'
import { pvLineMoves, type EvalSnapshot } from '../engine/analysis'
import { evaluationEngineLabel } from '../engine/evaluationSource'
import { compareReviews, comparisonScore, comparisonWdl } from '../engine/reviewComparison'
import type { ReviewSnapshot } from '../engine/reviewSession'
import type { SavedReview } from '../engine/savedReviews'

type Props = {
  line: GameNode[]
  report: ReviewSnapshot
  saved: SavedReview
  onNavigate: (node: GameNode) => void
  onClose: () => void
}

function bestMove(fen: string, reading?: EvalSnapshot): string {
  if (!reading?.bestMove) return 'Not recorded'
  return pvLineMoves(fen, [reading.bestMove], 1)[0]?.san ?? reading.bestMove
}

export function ReviewComparison({ line, report, saved, onNavigate, onClose }: Props) {
  const comparison = useMemo(() => compareReviews(line, report, saved), [line, report, saved])
  const [onlyDifferences, setOnlyDifferences] = useState(true)
  const [visibleCount, setVisibleCount] = useState(10)
  if (!comparison) return null
  const rows = comparison.rows.filter(row => !onlyDifferences || row.differs)
  return (
    <section className="review-comparison" aria-label="Review comparison">
      <h4>Review comparison</h4>
      <p className="panel-copy small"><strong>Open:</strong> {evaluationEngineLabel(report.settings.engine)} · D{report.settings.depth} · Hash {report.settings.hashMb} MB · {new Date(report.finishedAt).toLocaleString()}</p>
      <p className="panel-copy small"><strong>Saved:</strong> {evaluationEngineLabel(saved.settings.engine)} · D{saved.settings.depth} · Hash {saved.settings.hashMb} MB · {new Date(saved.finishedAt).toLocaleString()}</p>
      <p className="panel-copy" data-testid="review-comparison-summary">
        {comparison.paired}/{comparison.rows.length} positions have readings in both runs.<br />
        {comparison.changedScores} score changes · {comparison.changedBestMoves} different best moves · {comparison.changedWdl} WDL changes.<br />
        Missing: {comparison.missingOpen} in open · {comparison.missingSaved} in saved.
      </p>
      <p className="panel-copy small">Scores and changes favor White when positive. Change = open − saved, in pawns. Mate scores retain their distance. WDL = White / draw / Black (%). Different sources or limits can produce different readings.</p>
      <label className="comparison-filter"><input type="checkbox" checked={onlyDifferences}
        onChange={event => { setOnlyDifferences(event.target.checked); setVisibleCount(10) }} />Only differences</label>
      <p className="panel-copy small">{rows.length ? `Showing ${Math.min(visibleCount, rows.length)} of ${rows.length} positions, in move order.` : 'No differences in the recorded scores, best moves or WDL.'}</p>
      <ol className="comparison-positions">
        {rows.slice(0, visibleCount).map(row => <li key={row.node.id}>
          <button className="comparison-position" type="button" onClick={() => onNavigate(row.node)}
            aria-label={row.label === 'Start' ? 'Show starting position' : `Show position after ${row.label}`}>{row.label}</button>
          <dl>
            <dt>Open</dt><dd>{comparisonScore(row.node.fen, row.open)}{row.open?.depth !== undefined && ` · D${row.open.depth}`}</dd>
            <dt>Saved</dt><dd>{comparisonScore(row.node.fen, row.saved)}{row.saved?.depth !== undefined && ` · D${row.saved.depth}`}</dd>
            <dt>Change</dt><dd>{row.changePawns === null ? '—' : `${row.changePawns > 0 ? '+' : ''}${row.changePawns.toFixed(2)}`}</dd>
            <dt>Best, open</dt><dd>{bestMove(row.node.fen, row.open)}</dd>
            <dt>Best, saved</dt><dd>{bestMove(row.node.fen, row.saved)}</dd>
          </dl>
          {(row.open?.wdl || row.saved?.wdl) && <p className="panel-copy small">
            WDL, open: {comparisonWdl(row.node.fen, row.open)}<br />
            WDL, saved: {comparisonWdl(row.node.fen, row.saved)}
          </p>}
        </li>)}
      </ol>
      <div className="review-report-actions">
        {visibleCount < rows.length && <button type="button" onClick={() => setVisibleCount(count => count + 10)}>Show 10 more positions</button>}
        <button type="button" onClick={onClose}>Close comparison</button>
      </div>
    </section>
  )
}
