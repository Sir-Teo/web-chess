import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import {
  buildReviewRows,
  formatEvaluation,
  pvToSan,
  scoreToCp,
  summarizeReview,
  type EvalSnapshot,
} from './engine/analysis'
import { engineProfiles, type EngineProfileId } from './engine/profiles'
import { useStockfishEngine } from './hooks/useStockfishEngine'
import './App.css'

type Orientation = 'white' | 'black'

function App() {
  const game = useMemo(() => new Chess(), [])
  const [fen, setFen] = useState(game.fen())
  const [orientation, setOrientation] = useState<Orientation>('white')
  const [topPanelOpen, setTopPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchDepth, setSearchDepth] = useState(16)
  const [multiPv, setMultiPv] = useState(2)
  const [hashMb, setHashMb] = useState(64)
  const [showWdl, setShowWdl] = useState(true)
  const [autoAnalyze, setAutoAnalyze] = useState(true)
  const [engineProfile, setEngineProfile] = useState<EngineProfileId>('auto')
  const [evaluationsByFen, setEvaluationsByFen] = useState<Map<string, EvalSnapshot>>(new Map())
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })

  const {
    status,
    engineName,
    options,
    lines,
    lastBestMove,
    capabilities,
    activeProfile,
    profileMessage,
    analyzePosition,
    stop,
    setOption,
  } = useStockfishEngine(engineProfile)

  const moveHistory = game.history({ verbose: true })
  const primaryLine = lines.find((line) => line.multipv === 1) ?? lines[0]

  useEffect(() => {
    const cp = scoreToCp(primaryLine?.cp, primaryLine?.mate)
    if (typeof cp !== 'number') return

    queueMicrotask(() => {
      setEvaluationsByFen((previous) => {
        const current = previous.get(fen)
        if (current?.cp === cp) return previous
        const next = new Map(previous)
        next.set(fen, { cp })
        return next
      })
    })
  }, [fen, primaryLine?.cp, primaryLine?.mate])

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!autoAnalyze) return
    analyzePosition({
      fen,
      depth: searchDepth,
      multiPv,
      hashMb,
      showWdl,
    })
  }, [analyzePosition, autoAnalyze, fen, hashMb, multiPv, searchDepth, showWdl])

  const reviewRows = useMemo(() => buildReviewRows(moveHistory, evaluationsByFen), [evaluationsByFen, moveHistory])
  const reviewSummary = useMemo(() => summarizeReview(reviewRows), [reviewRows])

  const undoMove = () => {
    game.undo()
    setFen(game.fen())
  }

  const resetBoard = () => {
    game.reset()
    setFen(game.fen())
  }

  const flipBoard = () => {
    setOrientation((value) => (value === 'white' ? 'black' : 'white'))
  }

  const onPieceDrop = (sourceSquare: Square, targetSquare: Square, pieceType: string) => {
    const promotion = pieceType.toLowerCase().endsWith('p') && ['1', '8'].includes(targetSquare[1]) ? 'q' : undefined
    const move = game.move({
      from: sourceSquare,
      to: targetSquare,
      promotion,
    })

    if (!move) return false

    setFen(game.fen())
    return true
  }

  const boardWidth = Math.min(
    viewport.width < 900 ? viewport.width - 32 : viewport.width - (rightPanelOpen ? 420 : 80),
    viewport.height - (bottomPanelOpen ? 230 : 70),
    760,
  )

  return (
    <main className="app-shell">
      <section className={`panel top-left ${topPanelOpen ? '' : 'hidden'}`}>
        <header className="panel-header">
          <h2>Quick Controls</h2>
          <button type="button" className="panel-toggle" onClick={() => setTopPanelOpen(false)}>
            Hide
          </button>
        </header>
        <div className="panel-content compact-grid">
          <button type="button" onClick={resetBoard}>
            New game
          </button>
          <button type="button" onClick={undoMove}>
            Undo
          </button>
          <button type="button" onClick={flipBoard}>
            Flip board
          </button>
          <button type="button" onClick={() => setBottomPanelOpen((value) => !value)}>
            {bottomPanelOpen ? 'Hide moves' : 'Show moves'}
          </button>
        </div>
      </section>

      {!topPanelOpen && (
        <button type="button" className="floating-toggle top-left-toggle" onClick={() => setTopPanelOpen(true)}>
          Show controls
        </button>
      )}

      <section className="board-stage" aria-label="Chessboard">
        <div className="board-wrap">
          <Chessboard
            options={{
              position: fen,
              boardOrientation: orientation,
              onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
                if (!targetSquare) return false
                return onPieceDrop(sourceSquare as Square, targetSquare as Square, piece.pieceType)
              },
              darkSquareStyle: { backgroundColor: '#6f695f' },
              lightSquareStyle: { backgroundColor: '#e7dbc9' },
              boardStyle: {
                width: `${Math.max(260, boardWidth)}px`,
                borderRadius: 14,
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
              },
            }}
          />
        </div>
      </section>

      <aside className={`panel right ${rightPanelOpen ? '' : 'hidden'}`}>
        <header className="panel-header">
          <h2>Analysis</h2>
          <button type="button" className="panel-toggle" onClick={() => setRightPanelOpen(false)}>
            Hide
          </button>
        </header>
        <div className="panel-content">
          <p className="panel-copy">
            Beginner mode is active. You can analyze right away, then open advanced controls when needed.
          </p>

          <div className="status-strip">
            <span>{engineName} ({activeProfile.name})</span>
            <strong className={`status ${status}`}>{status}</strong>
          </div>
          <p className="panel-copy small">{profileMessage}</p>

          <div className="inline-actions">
            <button type="button" onClick={() => analyzePosition({ fen, depth: searchDepth, multiPv, hashMb, showWdl })}>
              Analyze now
            </button>
            <button type="button" onClick={stop}>
              Stop
            </button>
          </div>

          <label className="switch-control">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(event) => setAutoAnalyze(event.target.checked)}
            />
            <span>Auto-analyze after every move</span>
          </label>

          <label className="control">
            <span>Search depth</span>
            <input
              type="range"
              min={8}
              max={30}
              step={1}
              value={searchDepth}
              onChange={(event) => setSearchDepth(Number(event.target.value))}
            />
            <strong>{searchDepth}</strong>
          </label>

          <label className="control">
            <span>MultiPV</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={multiPv}
              onChange={(event) => setMultiPv(Number(event.target.value))}
            />
            <strong>{multiPv} lines</strong>
          </label>

          <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}>
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>

          {showAdvanced && (
            <div className="advanced-section">
              <label className="control">
                <span>Hash</span>
                <input
                  type="range"
                  min={16}
                  max={512}
                  step={16}
                  value={hashMb}
                  onChange={(event) => setHashMb(Number(event.target.value))}
                />
                <strong>{hashMb} MB</strong>
              </label>
              <label className="switch-control">
                <input type="checkbox" checked={showWdl} onChange={(event) => setShowWdl(event.target.checked)} />
                <span>Show WDL values</span>
              </label>
              <label className="engine-option-row profile-picker">
                <span>Engine profile</span>
                <select value={engineProfile} onChange={(event) => setEngineProfile(event.target.value as EngineProfileId)}>
                  <option value="auto">Auto (recommended)</option>
                  {engineProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="panel-copy small">
                Isolation: {capabilities.crossOriginIsolated ? 'yes' : 'no'} / SharedArrayBuffer:{' '}
                {capabilities.sharedArrayBuffer ? 'yes' : 'no'} / Cores: {capabilities.hardwareConcurrency}
              </p>
              <div className="engine-options">
                <h3>Engine options</h3>
                {options.map((option) => (
                  <EngineOptionControl key={option.name} option={option} onSetOption={setOption} />
                ))}
              </div>
              <p className="panel-copy small">
                Options are discovered from Stockfish UCI output and applied live through setoption.
              </p>
            </div>
          )}

          <div className="pv-list">
            <h3>Lines</h3>
            {lines.length === 0 && <p className="panel-copy small">No line yet. Start analysis to populate principal variations.</p>}
            {lines
              .filter((line) => !line.fen || line.fen === fen)
              .map((line) => (
              <article key={`${line.multipv}-${line.depth}-${line.pv[0] ?? 'pv'}`}>
                <header>
                  <strong>#{line.multipv}</strong>
                  <span>D{line.depth}</span>
                  <span>{formatEvaluation(line.cp, line.mate)}</span>
                </header>
                <p>{pvToSan(line.fen ?? fen, line) || line.pv.slice(0, 8).join(' ')}</p>
                <p className="pv-uci">{line.pv.slice(0, 8).join(' ')}</p>
              </article>
            ))}
            {lastBestMove && <p className="best-move">Best move: {lastBestMove}</p>}
          </div>

          <div className="review-scaffold">
            <h3>Review Scaffold</h3>
            <div className="review-chips">
              <span>Best {reviewSummary.best}</span>
              <span>Good {reviewSummary.good}</span>
              <span>Inaccuracy {reviewSummary.inaccuracy}</span>
              <span>Mistake {reviewSummary.mistake}</span>
              <span>Blunder {reviewSummary.blunder}</span>
              <span>Pending {reviewSummary.pending}</span>
            </div>
          </div>
        </div>
      </aside>

      {!rightPanelOpen && (
        <button type="button" className="floating-toggle right-toggle" onClick={() => setRightPanelOpen(true)}>
          Analysis
        </button>
      )}

      <section className={`panel bottom ${bottomPanelOpen ? '' : 'hidden'}`}>
        <header className="panel-header">
          <h2>Moves</h2>
          <button type="button" className="panel-toggle" onClick={() => setBottomPanelOpen(false)}>
            Hide
          </button>
        </header>
        <div className="panel-content move-list">
          {moveHistory.length === 0 && <p className="panel-copy">Make a move on the board to start the move list.</p>}
          {moveHistory.length > 0 && (
            <ol>
              {reviewRows.map((row) => (
                <li key={`${row.uci}-${row.ply}`} className={`quality-${row.quality}`}>
                  <span>{row.moveNumber}.</span>
                  <strong>{row.san}</strong>
                  <span>{row.uci}</span>
                  <span className="move-quality">
                    {row.quality}
                    {typeof row.deltaCp === 'number' ? ` (${row.deltaCp > 0 ? '+' : ''}${row.deltaCp})` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {!bottomPanelOpen && (
        <button type="button" className="floating-toggle bottom-toggle" onClick={() => setBottomPanelOpen(true)}>
          Show moves
        </button>
      )}
    </main>
  )
}

export default App

type EngineOptionControlProps = {
  option: {
    name: string
    type: 'check' | 'spin' | 'string' | 'button'
    defaultValue?: string
    min?: number
    max?: number
  }
  onSetOption: (name: string, value?: string | number | boolean) => void
}

function EngineOptionControl({ option, onSetOption }: EngineOptionControlProps) {
  const [value, setValue] = useState(option.defaultValue ?? '')

  if (option.type === 'button') {
    return (
      <div className="engine-option-row">
        <button type="button" onClick={() => onSetOption(option.name)}>
          {option.name}
        </button>
      </div>
    )
  }

  if (option.type === 'check') {
    const checked = value === 'true'
    return (
      <label className="switch-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            const nextValue = event.target.checked ? 'true' : 'false'
            setValue(nextValue)
            onSetOption(option.name, event.target.checked)
          }}
        />
        <span>{option.name}</span>
      </label>
    )
  }

  if (option.type === 'spin') {
    return (
      <label className="engine-option-row">
        <span>{option.name}</span>
        <input
          type="number"
          min={option.min}
          max={option.max}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => onSetOption(option.name, Number(value))}
        />
      </label>
    )
  }

  return (
    <label className="engine-option-row">
      <span>{option.name}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onSetOption(option.name, value)}
      />
    </label>
  )
}
