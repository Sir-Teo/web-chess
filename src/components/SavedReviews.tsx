import { useRef, useState } from 'react'
import type { GameNode } from '../hooks/useGameTree'
import { evaluationEngineLabel } from '../engine/evaluationSource'
import { createSavedReview, reviewLineKey, type SavedReview, type SavedReviewSummary } from '../engine/savedReviews'
import { deleteSavedReview, listSavedReviews, loadSavedReview, saveReview } from '../engine/savedReviewStorage'
import type { ReviewSnapshot } from '../engine/reviewSession'
import { ReviewComparison } from './ReviewComparison'
import { exportReviewBackup, importReviewBackup } from '../engine/reviewBackupClient'
import './SavedReviews.css'

type Props = {
  line: GameNode[]
  report: ReviewSnapshot | null
  headers: Record<string, string>
  qualities: Array<GameNode['quality']>
  busy: boolean
  onOpen: (saved: SavedReview) => void
  onNavigate: (node: GameNode) => void
}

function failure(error: unknown, action: string): string {
  if (error instanceof Error && error.name === 'Error') return error.message
  return `The browser could not ${action}. Export the current review before closing this tab.`
}

export function SavedReviews({ line, report, headers, qualities, busy, onOpen, onNavigate }: Props) {
  const [runs, setRuns] = useState<SavedReviewSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [working, setWorking] = useState(false)
  /*
   * The same flag, readable in the tick it is set.
   *
   * Every routine below opens with `if (busy || working) return`, which reads
   * React state -- so three clicks on Save review in one tick all saw `false`
   * and all ran. **Measured**: three identical runs in storage. The button had
   * the right idea already, `lastSavedReport === report`, and no chance to act
   * on it, because nothing had re-rendered between the clicks.
   *
   * The state stays: it is what the buttons are disabled from, and what a
   * reader sees. The ref is what the routines ask.
   */
  const workingRef = useRef(false)
  const beginWork = () => {
    if (workingRef.current) return false
    workingRef.current = true
    setWorking(true)
    return true
  }
  const endWork = () => {
    workingRef.current = false
    setWorking(false)
  }
  const [notice, setNotice] = useState('')
  const [lastSavedReport, setLastSavedReport] = useState<ReviewSnapshot | null>(null)
  const [comparison, setComparison] = useState<{ report: ReviewSnapshot; saved: SavedReview } | null>(null)
  const loadingVersion = useRef(0)
  const details = useRef<HTMLDetailsElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const selected = runs.find(run => run.id === selectedId)
  const sameLine = selected?.lineKey === reviewLineKey(line)

  async function refresh(preferredId?: string) {
    const version = ++loadingVersion.current
    try {
      const next = await listSavedReviews()
      if (version !== loadingVersion.current) return
      setRuns(next)
      setLoaded(true)
      setLoadFailed(false)
      setSelectedId(previous => next.some(run => run.id === (preferredId ?? previous)) ? (preferredId ?? previous) : next[0]?.id ?? '')
    } catch (error) {
      if (version === loadingVersion.current) {
        setLoadFailed(true)
        setNotice(failure(error, 'read saved reviews'))
      }
    }
  }

  async function save() {
    if (!report || busy || workingRef.current) return
    if (!beginWork()) return
    setNotice('Saving review…')
    try {
      const saved = createSavedReview(line, report, headers, qualities)
      await saveReview(saved)
      setLastSavedReport(report)
      setNotice('Review saved on this device. Export a review backup to keep a complete separate copy.')
      await refresh(saved.id)
      if (details.current) details.current.open = true
    } catch (error) { setNotice(failure(error, 'save this review')) }
    finally { endWork() }
  }

  async function open() {
    if (!selected || busy || workingRef.current) return
    if (!beginWork()) return
    try {
      const saved = await loadSavedReview(selected.id)
      onOpen(saved)
      setNotice('Saved review opened. Its own scores and settings are shown below.')
    } catch (error) { setNotice(failure(error, 'open this review')) }
    finally { endWork() }
  }

  async function remove() {
    if (!selected || workingRef.current) return
    if (!beginWork()) return
    try {
      await deleteSavedReview(selected.id)
      setLastSavedReport(null)
      setNotice('Saved copy deleted. The review currently on screen is still available.')
      await refresh()
    } catch (error) { setNotice(failure(error, 'delete this saved review')) }
    finally { endWork() }
  }

  async function compare() {
    if (!selected || !report || !sameLine || busy || workingRef.current) return
    if (!beginWork()) return
    try {
      const saved = await loadSavedReview(selected.id)
      setComparison({ saved, report })
      setNotice('Comparison opened below. The current report is unchanged.')
    } catch (error) { setNotice(failure(error, 'compare this review')) }
    finally { endWork() }
  }

  async function backup() {
    if (busy || workingRef.current) return
    if (!beginWork()) return
    setNotice('Preparing review backup…')
    try {
      const { text, count } = await exportReviewBackup()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = `web-chess-reviews-${new Date().toISOString().slice(0, 10)}.json`
        document.body.append(link)
        link.click()
      } finally {
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      }
      setNotice(`Backup download started for ${count} saved ${count === 1 ? 'review' : 'reviews'}, including WDL and run details.`)
    } catch (error) { setNotice(failure(error, 'export the review backup')) }
    finally { endWork() }
  }

  async function restoreBackup(file: File) {
    if (busy || workingRef.current) return
    if (!beginWork()) return
    setNotice('Importing review backup…')
    try {
      const result = await importReviewBackup(file)
      setNotice(`Imported ${result.imported} ${result.imported === 1 ? 'review' : 'reviews'}; ${result.skipped} identical ${result.skipped === 1 ? 'review' : 'reviews'} skipped.`)
      await refresh(result.firstId)
    } catch (error) {
      setNotice(failure(error, 'import the review backup'))
      // A lost worker response can leave the outcome unknown. Re-read storage
      // before a retry; content deduplication makes that retry safe.
      await refresh()
    } finally { endWork() }
  }

  return (
    <div className="saved-reviews">
      <div className="review-report-actions">
        <button type="button" onClick={() => { void save() }} disabled={!report || busy || working || lastSavedReport === report}
          title={report ? 'Keep this report, its settings and reviewed line on this device.' : 'Review this line first.'}>
          Save review
        </button>
      </div>
      {notice && <p className="panel-copy small saved-review-notice" role="status">{notice}</p>}
      <details ref={details} onToggle={event => { if (event.currentTarget.open) void refresh() }}>
        <summary>Saved reviews{loaded ? ` (${runs.length})` : ''}</summary>
        <div className="saved-reviews-content">
          {loadFailed ? <div className="review-report-actions">
            <button type="button" onClick={() => { setNotice(''); void refresh() }}>Retry saved reviews</button>
          </div> : !loaded ? <p className="panel-copy">Loading saved reviews…</p> : runs.length === 0
            ? <p className="panel-copy">No saved reviews yet. Finish a review, then choose Save review.</p>
            : <>
              <label htmlFor="saved-review-choice">Choose a saved review</label>
              <select id="saved-review-choice" value={selectedId} disabled={working} onChange={event => setSelectedId(event.target.value)}>
                {runs.map(run => <option key={run.id} value={run.id}>
                  {run.settings.engine.name} · D{run.settings.depth} · {run.title} · {new Date(run.finishedAt).toLocaleString()}{run.complete ? '' : ' · Partial'}
                </option>)}
              </select>
              {selected && <>
                <p className="panel-copy saved-review-description">
                  <strong>{selected.title}</strong><br />
                  {new Date(selected.finishedAt).toLocaleString()}<br />
                  {evaluationEngineLabel(selected.settings.engine)}<br />
                  Depth {selected.settings.depth} · Hash {selected.settings.hashMb} MB · WDL {selected.settings.showWdl ? 'on' : 'off'}<br />
                  {selected.complete ? 'Complete' : 'Partial'} · {selected.evaluated}/{selected.total} positions · {selected.reused} reused
                </p>
                {!sameLine && <p className="panel-copy small">Opening replaces the board with this saved line. Other variations are not included.</p>}
                <div className="review-report-actions">
                  <button type="button" disabled={busy || working} onClick={() => { void open() }}>
                    {sameLine ? 'Use saved review' : 'Open reviewed line'}
                  </button>
                  <button type="button" disabled={working} onClick={() => { void remove() }}>Delete saved review</button>
                  <button type="button" disabled={busy || working || !report || !sameLine} onClick={() => { void compare() }}
                    title={sameLine && report ? 'Compare position readings with the report currently open.' : 'Open or review this same line first.'}>
                    Compare with open review
                  </button>
                </div>
                {comparison && comparison.report === report && comparison.saved.id === selectedId && sameLine && !busy && (
                  <ReviewComparison key={`${comparison.saved.id}:${report.finishedAt}`} line={line} report={report}
                    saved={comparison.saved} onNavigate={onNavigate} onClose={() => setComparison(null)} />
                )}
              </>}
            </>}
          <div className="review-report-actions">
            <button type="button" disabled={busy || working || !loaded || loadFailed || !runs.length} onClick={() => { void backup() }}>
              Export review backup
            </button>
            <button type="button" disabled={busy || working} onClick={() => backupInput.current?.click()}>
              Import review backup
            </button>
          </div>
          <input ref={backupInput} type="file" accept=".json,application/json" hidden aria-label="Review backup file" onChange={event => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void restoreBackup(file)
          }} />
          <p className="panel-copy small">Up to 50 reviews on this device. A review backup keeps all saved runs, including WDL and timestamps. Import adds missing reviews without replacing existing ones. It is separate from the game library backup.</p>
        </div>
      </details>
    </div>
  )
}
