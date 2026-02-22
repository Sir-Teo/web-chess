import { Chess, type Square } from 'chess.js'
import { useEffect, useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import {
  buildWinrateSeries,
  buildReviewRows,
  formatEvaluation,
  pvToSan,
  scoreToCp,
  summarizeReview,
  type EvalSnapshot,
  type WinratePoint,
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
  const [leftWidth, setLeftWidth] = useState(280)
  const [rightWidth, setRightWidth] = useState(320)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true)
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
  const winratePoints = useMemo(
    () => buildWinrateSeries(moveHistory, evaluationsByFen),
    [evaluationsByFen, moveHistory],
  )

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

  const MIN_WIDTH = 60
  const DEFAULT_LEFT = 280
  const DEFAULT_RIGHT = 320

  const startLeftResize = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.classList.add('resizing')
    const startX = e.clientX
    const startW = leftWidth
    const onMove = (mv: MouseEvent) => {
      const w = startW + mv.clientX - startX
      setLeftWidth(w < MIN_WIDTH ? 0 : Math.min(w, 600))
    }
    const onUp = () => {
      document.body.classList.remove('resizing')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const startRightResize = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.classList.add('resizing')
    const startX = e.clientX
    const startW = rightWidth
    const onMove = (mv: MouseEvent) => {
      const w = startW - (mv.clientX - startX)
      setRightWidth(w < MIN_WIDTH ? 0 : Math.min(w, 600))
    }
    const onUp = () => {
      document.body.classList.remove('resizing')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const boardWidth = Math.min(
    viewport.width - leftWidth - rightWidth - 32,
    viewport.height - (bottomPanelOpen ? 120 : 50) - (topPanelOpen ? 50 : 30),
    760,
  )

  return (
    <main className="app-shell">
      <section className={`panel top ${topPanelOpen ? '' : 'hidden'}`}>
        <div className="panel-inner">
          <div className="panel-content compact-grid">
            <div className="app-brand">
              <span className="app-brand-icon">♔</span>
              <span className="app-brand-text">Web Chess</span>
            </div>
            <button type="button" onClick={resetBoard}>
              <span className="btn-icon">⟳</span> New game
            </button>
            <button type="button" onClick={undoMove}>
              <span className="btn-icon">↩</span> Undo
            </button>
            <button type="button" onClick={flipBoard}>
              <span className="btn-icon">⇅</span> Flip
            </button>

            <span className="toolbar-divider" />

            <details className="settings-menu">
              <summary><span className="btn-icon">⚙</span> Settings</summary>
              <div className="settings-body">
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

                <details className="advanced-settings">
                  <summary>Advanced engine options</summary>
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
                </details>
              </div>
            </details>
          </div>
        </div>
        <div
          className="resize-handle resize-handle-bottom"
          onClick={() => setTopPanelOpen(!topPanelOpen)}
          title="Toggle top bar"
        >
          <span className="resize-pill horizontal" />
        </div>
      </section>



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

      <aside
        className="panel right"
        style={{ width: rightWidth }}
      >
        <div
          className="resize-handle resize-handle-left"
          onMouseDown={startRightResize}
          onClick={() => { if (rightWidth === 0) setRightWidth(DEFAULT_RIGHT) }}
          title="Drag to resize · click to expand"
        >
          <span className="resize-pill" />
        </div>
        <div className="panel-inner" style={{ opacity: rightWidth === 0 ? 0 : 1 }}>
          <header className="panel-header">
            <h2>Analysis</h2>
          </header>
          <div className="panel-content">
            <div className="inline-actions">
              <button type="button" className="btn-primary" onClick={() => analyzePosition({ fen, depth: searchDepth, multiPv, hashMb, showWdl })}>
                ▶ Analyze
              </button>
              <button type="button" onClick={stop}>
                ■ Stop
              </button>
            </div>

            <div className="right-section">
              <h3><span className="section-icon">♟</span> Moves</h3>
              {reviewRows.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-icon">♟</span>
                  <p>Play some moves and they'll appear here with analysis.</p>
                </div>
              )}
              {reviewRows.length > 0 && (
                <ol className="moves-list">
                  {reviewRows.map((row) => (
                    <li key={`${row.uci}-${row.ply}`} className={`quality-${row.quality}`}>
                      <span className="move-index">{row.moveNumber}.</span>
                      <strong>{row.san}</strong>
                      <span className="move-uci">{row.uci}</span>
                      <span className="move-quality">
                        {row.quality}
                        {typeof row.deltaCp === 'number' ? ` (${row.deltaCp > 0 ? '+' : ''}${row.deltaCp})` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="review-scaffold">
              <h3><span className="section-icon">📊</span> Review</h3>
              <div className="review-chips">
                <span className="chip-best">Best {reviewSummary.best}</span>
                <span className="chip-good">Good {reviewSummary.good}</span>
                <span className="chip-inaccuracy">Inaccuracy {reviewSummary.inaccuracy}</span>
                <span className="chip-mistake">Mistake {reviewSummary.mistake}</span>
                <span className="chip-blunder">Blunder {reviewSummary.blunder}</span>
                <span className="chip-pending">Pending {reviewSummary.pending}</span>
              </div>
            </div>

            <div className="pv-list">
              <h3><span className="section-icon">🔍</span> Lines</h3>
              {lines.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-icon">🔍</span>
                  <p>Start analysis to see principal variation lines here.</p>
                </div>
              )}
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
          </div>
        </div>
      </aside>



      <section
        className="panel left"
        style={{ width: leftWidth }}
      >
        <div
          className="resize-handle resize-handle-right"
          onMouseDown={startLeftResize}
          onClick={() => { if (leftWidth === 0) setLeftWidth(DEFAULT_LEFT) }}
          title="Drag to resize · click to expand"
        >
          <span className="resize-pill" />
        </div>
        <div className="panel-inner" style={{ opacity: leftWidth === 0 ? 0 : 1 }}>

          <div className="panel-content">
            <WinrateGraph points={winratePoints} />
            {winratePoints.length > 0 && (
              <div className="graph-legend">
                <span>White win chance</span>
                <strong>{winratePoints[winratePoints.length - 1]!.whiteWinrate.toFixed(1)}%</strong>
              </div>
            )}
          </div>
        </div>
      </section>



      <section className={`panel bottom ${bottomPanelOpen ? '' : 'hidden'}`}>
        <div
          className="resize-handle resize-handle-top"
          onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
          title="Toggle bottom bar"
        >
          <span className="resize-pill horizontal" />
        </div>
        <div className="panel-inner">
          <div className={`analyzing-bar ${status === 'analyzing' ? 'active' : ''}`} />
          <div className="panel-content">
            <div className="status-strip">
              <span>{engineName} ({activeProfile.name})</span>
              <strong className={`status ${status}`}>{status}</strong>
            </div>
            {lastBestMove && <p className="best-move">Best move: {lastBestMove}</p>}
          </div>
        </div>
      </section>

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

type WinrateGraphProps = {
  points: WinratePoint[]
}

function WinrateGraph({ points }: WinrateGraphProps) {
  if (points.length < 2) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">📈</span>
        <p>Play and analyze moves to build the live winrate graph.</p>
      </div>
    )
  }

  const width = 980
  const height = 180
  const pad = 18
  const innerWidth = width - pad * 2
  const innerHeight = height - pad * 2
  const lastIndex = points.length - 1

  const toX = (index: number) => pad + (index / lastIndex) * innerWidth
  const toY = (whiteWinrate: number) => pad + ((100 - whiteWinrate) / 100) * innerHeight

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(point.index).toFixed(2)} ${toY(point.whiteWinrate).toFixed(2)}`)
    .join(' ')

  const area = `${path} L ${toX(points[lastIndex]!.index).toFixed(2)} ${(height - pad).toFixed(2)} L ${toX(points[0]!.index).toFixed(2)} ${(height - pad).toFixed(2)} Z`
  const markers = [0, 25, 50, 75, 100]

  return (
    <div className="graph-wrap" aria-label="Real-time white winrate graph">
      <svg className="winrate-graph" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="graph-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(74, 124, 104, 0.25)" />
            <stop offset="100%" stopColor="rgba(74, 124, 104, 0.02)" />
          </linearGradient>
        </defs>
        {markers.map((value) => {
          const y = toY(value)
          return (
            <g key={value}>
              <line x1={pad} x2={width - pad} y1={y} y2={y} className="graph-grid-line" />
              <text x={pad + 4} y={y - 2} className="graph-grid-text">
                {value}%
              </text>
            </g>
          )
        })}
        <path d={area} className="graph-area" />
        <path d={path} className="graph-line" />
      </svg>
    </div>
  )
}
