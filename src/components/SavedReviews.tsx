import { useLayoutEffect, useRef, useState } from 'react'
import type { GameNode } from '../hooks/useGameTree'
import { evaluationEngineLabel } from '../engine/evaluationSource'
import { createSavedReview, filterSavedReviewSummaries, reviewLineKey, type SavedReview, type SavedReviewSummary } from '../engine/savedReviews'
import { deleteSavedReview, listSavedReviews, loadSavedReview, renameSavedReview, saveReview } from '../engine/savedReviewStorage'
import type { ReviewSnapshot } from '../engine/reviewSession'
import { ReviewComparison } from './ReviewComparison'
import { SavedReviewNameEditor } from './SavedReviewNameEditor'
import { exportReviewBackup, importReviewBackup } from '../engine/reviewBackupClient'
import { formatLocalDate } from '../engine/localDate'
import { MAX_SEARCH_QUERY_LENGTH } from '../engine/searchTerms'
import './SavedReviews.css'

type Props = {
  line: GameNode[]
  report: ReviewSnapshot | null
  headers: Record<string, string>
  openingName?: string
  qualities: Array<GameNode['quality']>
  busy: boolean
  onOpen: (saved: SavedReview) => void
  onNavigate: (node: GameNode) => void
}

type ActionFocus = { trigger: HTMLButtonElement; destination: 'trigger' | 'remaining' | 'comparison' }

function failure(error: unknown, action: string): string {
  if (error instanceof Error && error.name === 'Error') return error.message
  return `The browser could not ${action}. Export the current review before closing this tab.`
}

export function SavedReviews({ line, report, headers, openingName, qualities, busy, onOpen, onNavigate }: Props) {
  const [runs, setRuns] = useState<SavedReviewSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
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
  const summary = useRef<HTMLElement>(null)
  const choice = useRef<HTMLSelectElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const compareTrigger = useRef<HTMLButtonElement>(null)
  const actionFocus = useRef<ActionFocus | null>(null)

  useLayoutEffect(() => {
    if (working || !actionFocus.current) return
    const request = actionFocus.current
    actionFocus.current = null
    // Disabling or removing the button can leave focus on the document.
    // Preserve any new destination chosen while the storage write was pending.
    if (document.activeElement !== document.body && document.activeElement !== request.trigger) return
    const target = request.destination === 'remaining'
      ? (details.current?.open ? (choice.current?.disabled ? search.current : choice.current) ?? summary.current : summary.current)
      : request.destination === 'comparison'
        ? details.current?.querySelector<HTMLElement>('.review-comparison h4') ?? request.trigger
        : request.trigger
    target?.focus()
  }, [working])
  const backupInput = useRef<HTMLInputElement>(null)
  const visibleRuns = filterSavedReviewSummaries(runs, query)
  const selected = visibleRuns.find(run => run.id === selectedId) ?? visibleRuns[0]
  const visibleSelectedId = selected?.id ?? ''
  const sameLine = selected?.lineKey === reviewLineKey(line)

  async function refresh(preferredId?: string) {
    const version = ++loadingVersion.current
    try {
      const next = await listSavedReviews()
      if (version !== loadingVersion.current) return
      setRuns(next)
      if (preferredId) setQuery('')
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

  function changeQuery(value: string) {
    setQuery(value)
    const matches = filterSavedReviewSummaries(runs, value)
    setSelectedId(previous => !matches.length || matches.some(run => run.id === previous) ? previous : matches[0].id)
  }

  async function save() {
    if (!report || busy || workingRef.current) return
    if (!beginWork()) return
    setNotice('Saving review…')
    try {
      const saved = createSavedReview(line, report, headers, qualities, undefined, openingName)
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

  async function remove(trigger: HTMLButtonElement) {
    if (!selected || workingRef.current) return
    if (!beginWork()) return
    trigger.focus({ preventScroll: true })
    const focusRequest: ActionFocus = { trigger, destination: 'trigger' }
    actionFocus.current = focusRequest
    try {
      await deleteSavedReview(selected.id)
      focusRequest.destination = 'remaining'
      setLastSavedReport(null)
      setNotice('Saved copy deleted. The review currently on screen is still available.')
      await refresh()
    } catch (error) { setNotice(failure(error, 'delete this saved review')) }
    finally { endWork() }
  }

  async function rename(title: string): Promise<string | null> {
    if (!selected || busy || workingRef.current || !beginWork()) return 'Wait for the current operation to finish, then try again.'
    try {
      await renameSavedReview(selected.id, title)
      setNotice('Saved review renamed.')
      await refresh(selected.id)
      return null
    } catch (error) {
      return failure(error, 'rename this saved review')
    } finally { endWork() }
  }

  async function compare(trigger: HTMLButtonElement) {
    if (!selected || !report || !sameLine || busy || workingRef.current) return
    if (!beginWork()) return
    trigger.focus({ preventScroll: true })
    const focusRequest: ActionFocus = { trigger, destination: 'trigger' }
    actionFocus.current = focusRequest
    try {
      const saved = await loadSavedReview(selected.id)
      focusRequest.destination = 'comparison'
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
        link.download = `web-chess-reviews-${formatLocalDate()}.json`
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
        <summary ref={summary}>Saved reviews{loaded ? ` (${runs.length})` : ''}</summary>
        <div className="saved-reviews-content">
          {loadFailed ? <div className="review-report-actions">
            <button type="button" onClick={() => { setNotice(''); void refresh() }}>Retry saved reviews</button>
          </div> : !loaded ? <p className="panel-copy">Loading saved reviews…</p> : runs.length === 0
            ? <p className="panel-copy">No saved reviews yet. Finish a review, then choose Save review.</p>
            : <>
              <label htmlFor="saved-review-search">Search saved reviews</label>
              <input ref={search} id="saved-review-search" type="search" value={query} maxLength={MAX_SEARCH_QUERY_LENGTH}
                placeholder="Name, engine, depth or complete/partial" disabled={working}
                aria-controls="saved-review-choice" aria-describedby="saved-review-search-count"
                onChange={event => changeQuery(event.target.value)} />
              <p id="saved-review-search-count" className="panel-copy small" role="status">
                {visibleRuns.length ? `${visibleRuns.length} of ${runs.length} saved reviews` : 'No saved reviews match your search.'}
              </p>
              {query && <div className="review-report-actions">
                <button type="button" disabled={working} onClick={() => { changeQuery(''); search.current?.focus() }}>Clear search</button>
              </div>}
              <label htmlFor="saved-review-choice">Choose a saved review</label>
              <select ref={choice} id="saved-review-choice" value={visibleSelectedId} disabled={working || !visibleRuns.length} onChange={event => setSelectedId(event.target.value)}>
                {!visibleRuns.length && <option value="">No matching reviews</option>}
                {visibleRuns.map(run => <option key={run.id} value={run.id}>
                  {run.title} · {run.settings.engine.name} · D{run.settings.depth} · {new Date(run.finishedAt).toLocaleString()}{run.complete ? '' : ' · Partial'}
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
                <SavedReviewNameEditor key={selected.id} title={selected.title} disabled={busy || working} onRename={rename} />
                <div className="review-report-actions">
                  <button type="button" disabled={busy || working} onClick={() => { void open() }}>
                    {sameLine ? 'Use saved review' : 'Open reviewed line'}
                  </button>
                  <button type="button" disabled={working} onClick={event => { void remove(event.currentTarget) }}>Delete saved review</button>
                  <button ref={compareTrigger} type="button" disabled={busy || working || !report || !sameLine} onClick={event => { void compare(event.currentTarget) }}
                    title={sameLine && report ? 'Compare position readings with the report currently open.' : 'Open or review this same line first.'}>
                    Compare with open review
                  </button>
                </div>
                {comparison && comparison.report === report && comparison.saved.id === visibleSelectedId && sameLine && !busy && (
                  <ReviewComparison key={`${comparison.saved.id}:${report.finishedAt}`} line={line} report={report}
                    saved={comparison.saved} onNavigate={onNavigate} onClose={() => { setComparison(null); compareTrigger.current?.focus() }} />
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
