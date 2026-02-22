import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useAiPlayer, type AiDifficulty } from './hooks/useAiPlayer'
import { useGameTree } from './hooks/useGameTree'
import { NewGameDialog, type GameMode, type PlayerColor } from './components/NewGameDialog'
import { GameControls } from './components/GameControls'
import { MoveListTree } from './components/MoveListTree'
import { IconBot, IconBarChart, IconSearch, IconSwords, IconAlert } from './components/icons'
import './App.css'

type Orientation = 'white' | 'black'

function App() {
  // ── Chess game instance ──────────────────────────────
  const game = useMemo(() => new Chess(), [])
  const [fen, setFen] = useState(game.fen())
  const [orientation, setOrientation] = useState<Orientation>('white')

  // ── Layout ───────────────────────────────────────────
  const [topPanelOpen, setTopPanelOpen] = useState(true)
  const [leftWidth, setLeftWidth] = useState(280)
  const [rightWidth, setRightWidth] = useState(320)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })

  // ── Engine settings ──────────────────────────────────
  const [searchDepth, setSearchDepth] = useState(16)
  const [multiPv, setMultiPv] = useState(2)
  const [hashMb, setHashMb] = useState(64)
  const [showWdl, setShowWdl] = useState(true)
  const [autoAnalyze, setAutoAnalyze] = useState(true)
  const [engineProfile, setEngineProfile] = useState<EngineProfileId>('auto')

  // ── Evaluations ──────────────────────────────────────
  const [evaluationsByFen, setEvaluationsByFen] = useState<Map<string, EvalSnapshot>>(new Map())

  // ── Game mode ────────────────────────────────────────
  const [showNewGameDialog, setShowNewGameDialog] = useState(false)
  const [gameMode, setGameMode] = useState<GameMode>('human-vs-human')
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white')
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>(4)
  const [isAiThinking, setIsAiThinking] = useState(false)
  const aiMoveScheduledRef = useRef(false)

  // ── Pause state ──────────────────────────────────────
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  const pause = useCallback(() => {
    pausedRef.current = true
    setPaused(true)
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    setPaused(false)
    // Nudge the AI loop by clearing the scheduled flag so it retries
    aiMoveScheduledRef.current = false
    setFen(f => f) // trigger re-render to restart AI effect
  }, [])

  // ── Game tree ────────────────────────────────────────
  const gameTree = useGameTree()

  // Called whenever we need to sync chess game state from a tree navigation
  const syncGameToNode = useCallback((chess: Chess) => {
    // Reconstruct our shared `game` from the given chess instance
    game.load(chess.fen())
    setFen(chess.fen())
    aiMoveScheduledRef.current = false
  }, [game])

  // ── Engine ───────────────────────────────────────────
  const {
    status,
    engineName,
    options,
    lines,
    lastBestMove,
    capabilities,
    analyzePosition,
    stop,
    setOption,
  } = useStockfishEngine(engineProfile)

  const aiPlayer = useAiPlayer()

  const primaryLine = lines.find(l => l.multipv === 1) ?? lines[0]

  // ── Capture evaluations ──────────────────────────────
  useEffect(() => {
    const cp = scoreToCp(primaryLine?.cp, primaryLine?.mate)
    if (typeof cp !== 'number') return
    queueMicrotask(() => {
      setEvaluationsByFen(prev => {
        const cur = prev.get(fen)
        if (cur?.cp === cp) return prev
        const next = new Map(prev)
        next.set(fen, { cp })
        return next
      })
    })
  }, [fen, primaryLine?.cp, primaryLine?.mate])

  // ── Viewport ─────────────────────────────────────────
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Auto-analyze ─────────────────────────────────────
  useEffect(() => {
    if (!autoAnalyze) return
    analyzePosition({ fen, depth: searchDepth, multiPv, hashMb, showWdl })
  }, [analyzePosition, autoAnalyze, fen, hashMb, multiPv, searchDepth, showWdl])

  // ── Derived move data ─────────────────────────────────
  // mainLine: full first-child chain root→tip — used for review quality annotation
  const mainLineNodes = gameTree.mainLine()
  const mainLineMoves = mainLineNodes.slice(1).map(n => n.move!).filter(Boolean)

  // currentPath: root → currently-viewed node — used for the winrate graph
  // This re-derives on every tree navigation so the graph updates immediately.
  const currentPathNodes = gameTree.currentPath()

  const reviewRows = useMemo(() => buildReviewRows(mainLineMoves, evaluationsByFen), [evaluationsByFen, mainLineMoves])
  const reviewSummary = useMemo(() => summarizeReview(reviewRows), [reviewRows])

  // Graph uses the active path (updates when navigating the tree)
  const winratePoints = useMemo(
    () => {
      const moves = currentPathNodes.slice(1).map(n => n.move!).filter(Boolean)
      return buildWinrateSeries(moves, evaluationsByFen)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaluationsByFen, gameTree.current.id],
  )

  // ── Move quality → annotate tree nodes ───────────────
  useEffect(() => {
    reviewRows.forEach((row, idx) => {
      const node = mainLineNodes[idx + 1]
      if (node && row.quality && row.quality !== 'pending') {
        gameTree.setNodeQuality(node.id, row.quality)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewRows])


  // ── AI move loop ──────────────────────────────────────
  useEffect(() => {
    if (game.isGameOver()) return
    if (aiPlayer.status !== 'ready') return
    if (aiMoveScheduledRef.current) return
    if (pausedRef.current) return

    const currentTurn = game.turn()
    const isAiTurn =
      gameMode === 'ai-vs-ai' ||
      (gameMode === 'human-vs-ai' && currentTurn !== playerColor[0])

    if (!isAiTurn) return

    aiMoveScheduledRef.current = true
    setIsAiThinking(true)

    aiPlayer.requestMove(fen, aiDifficulty).then(uciMove => {
      aiMoveScheduledRef.current = false
      setIsAiThinking(false)

      if (!uciMove || game.isGameOver() || pausedRef.current) return

      const from = uciMove.slice(0, 2) as Square
      const to = uciMove.slice(2, 4) as Square
      const promoChar = uciMove[4]
      const promotion = promoChar ? promoChar as 'q' | 'r' | 'b' | 'n' : undefined

      const move = game.move({ from, to, promotion })
      if (move) {
        const newFen = game.fen()
        setFen(newFen)
        gameTree.addMove(move, newFen)
      }
    })
  }, [fen, gameMode, playerColor, aiDifficulty, aiPlayer, aiPlayer.status, game, gameTree, paused])

  // ── Human move ────────────────────────────────────────
  const onPieceDrop = (sourceSquare: Square, targetSquare: Square, pieceType: string) => {
    if (gameMode === 'human-vs-ai' && isAiThinking) return false
    if (gameMode === 'human-vs-ai' && game.turn() !== playerColor[0]) return false
    if (paused && gameMode !== 'human-vs-human') {
      // In paused AI mode only allow moves if we're manually analyzing
    }

    const promotion = pieceType.toLowerCase().endsWith('p') && ['1', '8'].includes(targetSquare[1]) ? 'q' : undefined
    const move = game.move({ from: sourceSquare, to: targetSquare, promotion })
    if (!move) return false

    const newFen = game.fen()
    setFen(newFen)
    gameTree.addMove(move, newFen)
    return true
  }

  // ── Undo ──────────────────────────────────────────────
  const undoMove = () => {
    const chess = gameTree.goBack()
    if (chess) {
      game.load(chess.fen())
      setFen(chess.fen())
      aiMoveScheduledRef.current = false
    }
  }

  // ── New game ──────────────────────────────────────────
  const openNewGameDialog = () => setShowNewGameDialog(true)

  const handleNewGameStart = useCallback(
    ({ mode, playerColor: color, difficulty }: { mode: GameMode; playerColor: PlayerColor; difficulty: AiDifficulty }) => {
      setShowNewGameDialog(false)
      setGameMode(mode)
      setPlayerColor(color)
      setAiDifficulty(difficulty)
      aiPlayer.setDifficulty(difficulty)

      game.reset()
      const startFen = game.fen()
      setFen(startFen)
      setIsAiThinking(false)
      aiMoveScheduledRef.current = false
      setEvaluationsByFen(new Map())
      pausedRef.current = false
      setPaused(false)
      gameTree.reset()

      setOrientation(mode === 'human-vs-ai' ? color : 'white')
    },
    [aiPlayer, game, gameTree],
  )

  // ── Mode switch mid-game (preserves board, changes who controls) ──────────
  const handleModeChange = useCallback((mode: GameMode) => {
    setGameMode(mode)
    aiMoveScheduledRef.current = false
    // If resuming from pause after mode switch, auto-resume
    if (pausedRef.current && mode === 'human-vs-human') {
      pausedRef.current = false
      setPaused(false)
    }
    // Kick the AI loop
    setFen(f => f)
  }, [])

  // ── Flip / controls ───────────────────────────────────
  const flipBoard = () => setOrientation(v => v === 'white' ? 'black' : 'white')

  // ── Resize ────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────
  return (
    <main className="app-shell">
      {/* ── Top bar ── */}
      <section className={`panel top ${topPanelOpen ? '' : 'hidden'}`}>
        <div className="panel-inner">
          <div className="panel-content compact-grid">
            <div className="app-brand">
              <span className="app-brand-icon">♔</span>
              <span className="app-brand-text">Web Chess</span>
            </div>
            <button type="button" onClick={openNewGameDialog}>
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
                    onChange={e => setAutoAnalyze(e.target.checked)}
                  />
                  <span>Auto-analyze after every move</span>
                </label>
                <label className="control">
                  <span>Search depth</span>
                  <input type="range" min={8} max={30} step={1} value={searchDepth}
                    onChange={e => setSearchDepth(Number(e.target.value))} />
                  <strong>{searchDepth}</strong>
                </label>
                <label className="control">
                  <span>MultiPV</span>
                  <input type="range" min={1} max={5} step={1} value={multiPv}
                    onChange={e => setMultiPv(Number(e.target.value))} />
                  <strong>{multiPv} lines</strong>
                </label>

                <details className="advanced-settings">
                  <summary>Advanced engine options</summary>
                  <div className="advanced-section">
                    <label className="control">
                      <span>Hash</span>
                      <input type="range" min={16} max={512} step={16} value={hashMb}
                        onChange={e => setHashMb(Number(e.target.value))} />
                      <strong>{hashMb} MB</strong>
                    </label>
                    <label className="switch-control">
                      <input type="checkbox" checked={showWdl}
                        onChange={e => setShowWdl(e.target.checked)} />
                      <span>Show WDL values</span>
                    </label>
                    <label className="engine-option-row profile-picker">
                      <span>Engine profile</span>
                      <select value={engineProfile}
                        onChange={e => setEngineProfile(e.target.value as EngineProfileId)}>
                        <option value="auto">Auto (recommended)</option>
                        {engineProfiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <p className="panel-copy small">
                      Isolation: {capabilities.crossOriginIsolated ? 'yes' : 'no'} / SharedArrayBuffer:{' '}
                      {capabilities.sharedArrayBuffer ? 'yes' : 'no'} / Cores: {capabilities.hardwareConcurrency}
                    </p>
                    <div className="engine-options">
                      <h3>Engine options</h3>
                      {options.map(option => (
                        <EngineOptionControl key={option.name} option={option} onSetOption={setOption} />
                      ))}
                    </div>
                    <p className="panel-copy small">
                      Options discovered from Stockfish UCI output and applied live.
                    </p>
                  </div>
                </details>
              </div>
            </details>
          </div>
        </div>
        <div className="resize-handle resize-handle-bottom"
          onClick={() => setTopPanelOpen(!topPanelOpen)} title="Toggle top bar">
          <span className="resize-pill horizontal" />
        </div>
      </section>

      {/* ── Board ── */}
      <section className="board-stage" aria-label="Chessboard">
        <div className="board-wrap" style={{ position: 'relative' }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: orientation,
              onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
                if (!targetSquare) return false
                return onPieceDrop(sourceSquare as Square, targetSquare as Square, piece.pieceType)
              },
              allowDragging: !isAiThinking && !(gameMode === 'human-vs-ai' && game.turn() !== playerColor[0]),
              darkSquareStyle: { backgroundColor: '#b58863' },
              lightSquareStyle: { backgroundColor: '#f0d9b5' },
              boardStyle: {
                width: `${Math.max(260, boardWidth)}px`,
                borderRadius: 12,
                boxShadow: '0 8px 40px rgba(0, 0, 0, 0.60), 0 2px 8px rgba(0, 0, 0, 0.40)',
              },
            }}
          />
          {/* AI thinking badge */}
          {isAiThinking && (
            <div className="ai-thinking-overlay">
              <div className="ai-thinking-badge">
                <IconBot style={{ marginRight: '4px', fontSize: '1.1em', transform: 'translateY(1px)' }} />
                AI thinking
                <div className="thinking-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
          {/* Paused badge */}
          {paused && gameMode !== 'human-vs-human' && (
            <div className="paused-overlay">
              <div className="paused-badge">
                <span>⏸</span> Analysis Mode
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── New Game Dialog ── */}
      <NewGameDialog
        open={showNewGameDialog}
        onStart={handleNewGameStart}
        onCancel={() => setShowNewGameDialog(false)}
      />

      {/* ── Right panel ── */}
      <aside className="panel right" style={{ width: rightWidth }}>
        <div className="resize-handle resize-handle-left" onMouseDown={startRightResize}
          onClick={() => { if (rightWidth === 0) setRightWidth(DEFAULT_RIGHT) }}
          title="Drag to resize · click to expand">
          <span className="resize-pill" />
        </div>
        <div className="panel-inner" style={{ opacity: rightWidth === 0 ? 0 : 1 }}>
          <header className="panel-header">
            <h2>Analysis</h2>
          </header>
          <div className="panel-content">
            <div className="inline-actions">
              <button type="button" className="btn-primary"
                onClick={() => analyzePosition({ fen, depth: searchDepth, multiPv, hashMb, showWdl })}>
                ▶ Analyze
              </button>
              <button type="button" onClick={stop}>
                ■ Stop
              </button>
            </div>

            {/* Move list (tree) */}
            <div className="right-section">
              <h3><span className="section-icon"><IconSwords /></span> Moves</h3>
              <MoveListTree
                tree={gameTree}
                onNavigate={chess => syncGameToNode(chess)}
              />
            </div>

            {/* Review summary */}
            <div className="review-scaffold">
              <h3><span className="section-icon"><IconBarChart /></span> Review</h3>
              <div className="review-chips">
                <span className="chip-best">Best {reviewSummary.best}</span>
                <span className="chip-good">Good {reviewSummary.good}</span>
                <span className="chip-inaccuracy">Inaccuracy {reviewSummary.inaccuracy}</span>
                <span className="chip-mistake">Mistake {reviewSummary.mistake}</span>
                <span className="chip-blunder">Blunder {reviewSummary.blunder}</span>
                <span className="chip-pending">Pending {reviewSummary.pending}</span>
              </div>
            </div>

            {/* Engine lines */}
            <div className="pv-list">
              <h3><span className="section-icon"><IconSearch /></span> Lines</h3>
              {lines.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-icon"><IconSearch /></span>
                  <p>Start analysis to see principal variation lines here.</p>
                </div>
              )}
              {lines
                .filter(l => !l.fen || l.fen === fen)
                .map(line => (
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

      {/* ── Left panel (winrate graph) ── */}
      <section className="panel left" style={{ width: leftWidth }}>
        <div className="resize-handle resize-handle-right" onMouseDown={startLeftResize}
          onClick={() => { if (leftWidth === 0) setLeftWidth(DEFAULT_LEFT) }}
          title="Drag to resize · click to expand">
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

      {/* ── Bottom bar ── */}
      <section className={`panel bottom ${bottomPanelOpen ? '' : 'hidden'}`}>
        <div className="resize-handle resize-handle-top"
          onClick={() => setBottomPanelOpen(!bottomPanelOpen)} title="Toggle bottom bar">
          <span className="resize-pill horizontal" />
        </div>
        <div className="panel-inner">
          <div className={`analyzing-bar ${status === 'analyzing' ? 'active' : ''}`} />
          <div className="panel-content">
            {/* Game controls — pause + mode switch */}
            <GameControls
              gameMode={gameMode}
              paused={paused}
              isGameOver={game.isGameOver()}
              onPause={pause}
              onResume={resume}
              onModeChange={handleModeChange}
            />

            <div className="bottom-status-row">
              <span className="bottom-engine-info">
                {engineName} · <strong className={`status ${status}`}>{status}</strong>
              </span>

              {/* Game-over status */}
              {game.isCheckmate() && <span className="game-over-badge">♟ Checkmate!</span>}
              {game.isStalemate() && <span className="game-over-badge draw">½ Stalemate</span>}
              {game.isDraw() && !game.isStalemate() && <span className="game-over-badge draw">½ Draw</span>}
              {game.isCheck() && !game.isCheckmate() && (
                <span className="game-over-badge check"><IconAlert style={{ marginRight: '3px' }} />Check!</span>
              )}

              {lastBestMove && !game.isGameOver() && (
                <p className="best-move">Best move: {lastBestMove}</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App

// ── Engine option control ──────────────────────────────────────────────────────

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
        <input type="checkbox" checked={checked}
          onChange={e => {
            const nv = e.target.checked ? 'true' : 'false'
            setValue(nv)
            onSetOption(option.name, e.target.checked)
          }} />
        <span>{option.name}</span>
      </label>
    )
  }

  if (option.type === 'spin') {
    return (
      <label className="engine-option-row">
        <span>{option.name}</span>
        <input type="number" min={option.min} max={option.max} value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => onSetOption(option.name, Number(value))} />
      </label>
    )
  }

  return (
    <label className="engine-option-row">
      <span>{option.name}</span>
      <input type="text" value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={() => onSetOption(option.name, value)} />
    </label>
  )
}

// ── Winrate graph ──────────────────────────────────────────────────────────────

type WinrateGraphProps = { points: WinratePoint[] }

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

  const toX = (i: number) => pad + (i / lastIndex) * innerWidth
  const toY = (wr: number) => pad + ((100 - wr) / 100) * innerHeight

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(p.whiteWinrate).toFixed(2)}`)
    .join(' ')

  const area = `${path} L ${toX(points[lastIndex]!.index).toFixed(2)} ${(height - pad).toFixed(2)} L ${toX(points[0]!.index).toFixed(2)} ${(height - pad).toFixed(2)} Z`
  const markers = [0, 25, 50, 75, 100]

  return (
    <div className="graph-wrap" aria-label="White winrate graph">
      <svg className="winrate-graph" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="graph-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(63, 185, 80, 0.24)" />
            <stop offset="100%" stopColor="rgba(63, 185, 80, 0.02)" />
          </linearGradient>
        </defs>
        {markers.map(v => {
          const y = toY(v)
          return (
            <g key={v}>
              <line x1={pad} x2={width - pad} y1={y} y2={y} className="graph-grid-line" />
              <text x={pad + 4} y={y - 2} className="graph-grid-text">{v}%</text>
            </g>
          )
        })}
        <path d={area} className="graph-area" />
        <path d={path} className="graph-line" />
      </svg>
    </div>
  )
}
