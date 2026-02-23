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
import { useOpening } from './hooks/useOpening'
import { NewGameDialog, type GameMode, type PlayerColor } from './components/NewGameDialog'
import { PgnDialog } from './components/PgnDialog'
import { WatchControls, AI_SPEED_MS, type AiSpeed } from './components/WatchControls'
import { WdlBar } from './components/WdlBar'
import { HorizontalWdlBar } from './components/HorizontalWdlBar'
import { MoveListTree } from './components/MoveListTree'
import { IconBot, IconBarChart, IconSearch, IconSwords, IconAlert, IconKing, IconRefresh, IconFlip, IconDownload, IconUsers, IconZap, IconSettings, IconPlay, IconStop } from './components/icons'
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
  const [showPgnDialog, setShowPgnDialog] = useState(false)
  const [gameMode, setGameMode] = useState<GameMode>('human-vs-human')
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white')
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>(4)
  const [isAiThinking, setIsAiThinking] = useState(false)
  const aiMoveScheduledRef = useRef(false)

  // ── AI speed (throttle delay between AI moves) ───────
  const [aiSpeed, setAiSpeed] = useState<AiSpeed>('normal')
  const aiSpeedRef = useRef<AiSpeed>('normal')
  const stepPendingRef = useRef(false) // for Step mode: advance one move on demand

  const handleSpeedChange = useCallback((s: AiSpeed) => {
    aiSpeed // suppress lint
    setAiSpeed(s)
    aiSpeedRef.current = s
  }, [aiSpeed])

  // ── Pause state ──────────────────────────────────────
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  const pause = useCallback(() => {
    pausedRef.current = true
    setPaused(true)
    setIsAiThinking(false)
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    setPaused(false)
    aiMoveScheduledRef.current = false
    setFen(f => f) // nudge AI effect
  }, [])

  // ── Game tree ────────────────────────────────────────
  const gameTree = useGameTree()
  // Stable ref so the AI-loop effect can call addMove without
  // including the (ever-changing) gameTree object in its dep array.
  const gameTreeRef = useRef(gameTree)
  gameTreeRef.current = gameTree

  const syncGameToNode = useCallback((chess: Chess) => {
    game.load(chess.fen())
    setFen(chess.fen())
    aiMoveScheduledRef.current = false
  }, [game])

  // Navigate tree + stay paused so user can explore
  const navigateAndPause = useCallback((chess: Chess | null) => {
    if (!chess) return
    syncGameToNode(chess)
    // Don't force-pause when human vs human — navigation is just browsing
    if (gameMode !== 'human-vs-human') {
      pausedRef.current = true
      setPaused(true)
    }
  }, [gameMode, syncGameToNode])

  // ── Playback helpers for WatchControls ───────────────
  const currentPathNodes = gameTree.currentPath()
  const opening = useOpening(currentPathNodes.map(n => n.fen))
  const canGoBack = currentPathNodes.length > 1
  const canGoForward = gameTree.current.children.length > 0

  const goFirst = useCallback(() => {
    const root = gameTree.root
    navigateAndPause(gameTree.navigateTo(root.id))
  }, [gameTree, navigateAndPause])

  const goPrev = useCallback(() => {
    navigateAndPause(gameTree.goBack())
  }, [gameTree, navigateAndPause])

  const goNext = useCallback(() => {
    navigateAndPause(gameTree.goForward())
  }, [gameTree, navigateAndPause])

  const goLast = useCallback(() => {
    // Walk first-child chain to tip
    const nodes = gameTree.mainLine()
    const tip = nodes[nodes.length - 1]
    if (tip) navigateAndPause(gameTree.navigateTo(tip.id))
  }, [gameTree, navigateAndPause])

  // Keyboard shortcuts (← →)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  // ── Batch Review ─────────────────────────────────────
  const [isBatchReviewing, setIsBatchReviewing] = useState(false)
  const batchReviewIdxRef = useRef<number>(0)

  const startBatchReview = useCallback(() => {
    const nodes = gameTreeRef.current.mainLine()
    if (nodes.length <= 1) return
    setIsBatchReviewing(true)
    batchReviewIdxRef.current = 1
    navigateAndPause(gameTreeRef.current.navigateTo(nodes[1]!.id))
  }, [navigateAndPause])

  useEffect(() => {
    if (!isBatchReviewing) return

    // Auto-advance every 500ms for exact timing per requirement
    const timer = setTimeout(() => {
      const nodes = gameTreeRef.current.mainLine()
      const nextIdx = batchReviewIdxRef.current + 1
      if (nextIdx < nodes.length) {
        batchReviewIdxRef.current = nextIdx
        navigateAndPause(gameTreeRef.current.navigateTo(nodes[nextIdx]!.id))
      } else {
        setIsBatchReviewing(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [isBatchReviewing, fen, navigateAndPause])

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
    setEvaluationsByFen(prev => {
      const cur = prev.get(fen)
      // Check if cp and wdl are exactly the same
      const sameCp = cur?.cp === cp
      const sameWdl = cur?.wdl?.w === primaryLine?.wdl?.w && cur?.wdl?.d === primaryLine?.wdl?.d
      if (sameCp && sameWdl) return prev

      const next = new Map(prev)
      next.set(fen, { cp, wdl: primaryLine?.wdl })
      return next
    })
  }, [fen, primaryLine?.cp, primaryLine?.mate, primaryLine?.wdl])

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
  const mainLineNodes = gameTree.mainLine()
  const mainLineMoves = mainLineNodes.slice(1).map(n => n.move!).filter(Boolean)

  const reviewRows = useMemo(() => buildReviewRows(mainLineMoves, evaluationsByFen), [evaluationsByFen, mainLineMoves])
  const reviewSummary = useMemo(() => summarizeReview(reviewRows), [reviewRows])

  // Graph uses active path so it updates on tree navigation
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

  // ── Engine arrows ────────────────────────────────────
  const arrows = useMemo(() => {
    const list: Array<{ startSquare: string; endSquare: string; color: string }> = []

    const currentMove = gameTree.current.move
    if (currentMove) {
      list.push({ startSquare: currentMove.from, endSquare: currentMove.to, color: 'rgba(255, 170, 0, 0.8)' })
    }

    const currentLines = lines.filter(l => !l.fen || l.fen === fen)
    const bestLine = currentLines.find(l => l.multipv === 1)
    if (bestLine) {
      const uci = bestLine.pv[0]
      if (uci) {
        list.push({
          startSquare: uci.slice(0, 2),
          endSquare: uci.slice(2, 4),
          color: 'rgba(63, 185, 80, 0.8)', // Green for best
        })
      }
    }

    return list
  }, [gameTree.current.move, lines, fen])

  // ── AI move loop (with speed throttle) ───────────────
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

    // In Step mode wait for user to request a move
    if (aiSpeedRef.current === 'step' && !stepPendingRef.current) return
    stepPendingRef.current = false

    aiMoveScheduledRef.current = true
    setIsAiThinking(true)

    const delayMs = AI_SPEED_MS[aiSpeedRef.current]

    const doMove = () => {
      aiPlayer.requestMove(fen, aiDifficulty).then(uciMove => {
        aiMoveScheduledRef.current = false
        setIsAiThinking(false)

        if (!uciMove || game.isGameOver() || pausedRef.current) return

        const from = uciMove.slice(0, 2) as Square
        const to = uciMove.slice(2, 4) as Square
        const promo = uciMove[4] as 'q' | 'r' | 'b' | 'n' | undefined

        const move = game.move({ from, to, promotion: promo })
        if (move) {
          const newFen = game.fen()
          setFen(newFen)
          gameTreeRef.current.addMove(move, newFen)
        }
      })
    }

    if (delayMs > 0) {
      const t = setTimeout(doMove, delayMs)
      return () => {
        clearTimeout(t)
        // Reset so the next effect run can schedule a new move
        aiMoveScheduledRef.current = false
        setIsAiThinking(false)
      }
    } else {
      doMove()
    }
    // NOTE: gameTree intentionally omitted — accessed via gameTreeRef to keep
    // this ref stable. aiPlayer (object) omitted too; only aiPlayer.status matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, gameMode, playerColor, aiDifficulty, aiPlayer.status, game, paused])

  // ── Human move ────────────────────────────────────────
  const onPieceDrop = (sourceSquare: Square, targetSquare: Square, pieceType: string) => {
    if (gameMode === 'human-vs-ai' && isAiThinking) return false
    if (gameMode === 'human-vs-ai' && !paused && game.turn() !== playerColor[0]) return false

    const promotion = pieceType.toLowerCase().endsWith('p') && ['1', '8'].includes(targetSquare[1]) ? 'q' : undefined
    const move = game.move({ from: sourceSquare, to: targetSquare, promotion })
    if (!move) return false

    const newFen = game.fen()
    setFen(newFen)
    gameTree.addMove(move, newFen)
    return true
  }

  // ── New game ──────────────────────────────────────────
  const openNewGameDialog = () => setShowNewGameDialog(true)
  const openPgnDialog = () => setShowPgnDialog(true)

  const handlePgnImport = useCallback((pgnText: string) => {
    try {
      const loader = new Chess()
      loader.loadPgn(pgnText)
      game.reset()
      gameTree.reset()
      setFen(game.fen())
      setEvaluationsByFen(new Map())

      const moves = loader.history({ verbose: true })
      for (const m of moves) {
        game.move(m)
        const nextFen = game.fen()
        gameTree.addMove(m, nextFen)
      }
      setFen(game.fen())

      setPaused(true)
      pausedRef.current = true
      setIsAiThinking(false)
      aiMoveScheduledRef.current = false
    } catch (err) {
      alert("Failed to parse PGN.")
    }
  }, [game, gameTree])

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

  // ── Mode switch mid-game ──────────────────────────────
  const handleModeChange = useCallback((mode: GameMode) => {
    setGameMode(mode)
    aiMoveScheduledRef.current = false
    if (pausedRef.current && mode === 'human-vs-human') {
      pausedRef.current = false
      setPaused(false)
    }
    setFen(f => f)
  }, [])

  // ── Step: advance one AI move ─────────────────────────
  const handleStep = useCallback(() => {
    stepPendingRef.current = true
    pausedRef.current = false
    setPaused(false)
    aiMoveScheduledRef.current = false
    setFen(f => f) // nudge loop
    // Re-pause after one move fires (the loop resets stepPendingRef)
    // The loop sets aiMoveScheduledRef = true synchronously, so after the move
    // we re-pause via the game-over guard path
    setTimeout(() => {
      pausedRef.current = true
      setPaused(true)
    }, AI_SPEED_MS.fast + 200)
  }, [])

  // ── Flip ──────────────────────────────────────────────
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

  const isMobile = viewport.width <= 900

  const boardWidth = isMobile
    ? Math.min(viewport.width - 32, viewport.height - (bottomPanelOpen ? 150 : 80) - (topPanelOpen ? 60 : 30))
    : Math.min(
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
              <span className="app-brand-icon"><IconKing /></span>
              <span className="app-brand-text">Web Chess</span>
            </div>
            <button type="button" onClick={openNewGameDialog}>
              <span className="btn-icon"><IconRefresh /></span> New game
            </button>
            <button type="button" onClick={flipBoard}>
              <span className="btn-icon"><IconFlip /></span> Flip
            </button>
            <button type="button" onClick={openPgnDialog}>
              <span className="btn-icon"><IconDownload /></span> PGN
            </button>

            {/* Mode switcher lives in top bar */}
            <span className="toolbar-divider" />
            <div className="top-mode-pills">
              {([
                { id: 'human-vs-human', label: 'H vs H', icon: <IconUsers /> },
                { id: 'human-vs-ai', label: 'H vs AI', icon: <IconBot /> },
                { id: 'ai-vs-ai', label: 'AI vs AI', icon: <IconZap /> },
              ] as const).map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`gc-pill ${gameMode === id ? 'gc-pill-active' : ''}`}
                  onClick={() => id !== gameMode && handleModeChange(id)}
                >
                  <span className="gc-pill-icon">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            <span className="toolbar-divider" />

            <details className="settings-menu">
              <summary><span className="btn-icon"><IconSettings /></span> Settings</summary>
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
          {showWdl && <WdlBar fen={fen} evaluation={evaluationsByFen.get(fen)} orientation={orientation} />}
          {opening && (
            <div className="board-opening-label fade-in-slide">
              <div className="opening-pill">
                <strong>{opening.eco}</strong>
                <span>{opening.name}</span>
              </div>
            </div>
          )}
          <Chessboard
            options={{
              position: fen,
              boardOrientation: orientation,
              onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
                if (!targetSquare) return false
                return onPieceDrop(sourceSquare as Square, targetSquare as Square, piece.pieceType)
              },
              arrows,
              allowDragging: !isAiThinking && !(gameMode === 'human-vs-ai' && !paused && game.turn() !== playerColor[0]),
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
        </div>
      </section>

      {/* ── New Game Dialog ── */}
      <NewGameDialog
        open={showNewGameDialog}
        onStart={handleNewGameStart}
        onCancel={() => setShowNewGameDialog(false)}
      />

      <PgnDialog
        open={showPgnDialog}
        onClose={() => setShowPgnDialog(false)}
        onImport={handlePgnImport}
        mainLineNodes={mainLineNodes}
        evaluations={evaluationsByFen}
      />

      {/* ── Right panel ── */}
      <aside className="panel right" style={{ width: rightWidth }}>
        <div className="resize-handle resize-handle-left" onMouseDown={startRightResize}
          onClick={() => { if (rightWidth === 0) setRightWidth(DEFAULT_RIGHT) }}
          title="Drag to resize · click to expand">
          <span className="resize-pill" />
        </div>
        <div className="panel-inner" style={{ opacity: (!isMobile && rightWidth === 0) ? 0 : 1 }}>
          <header className="panel-header">
            <h2>Analysis</h2>
          </header>
          <div className="panel-content">
            <div className="inline-actions">
              <button type="button" className="btn-primary"
                onClick={() => analyzePosition({ fen, depth: searchDepth, multiPv, hashMb, showWdl })}>
                <IconPlay /> Analyze
              </button>
              <button type="button" onClick={stop}>
                <IconStop /> Stop
              </button>
              <button
                type="button"
                className={`batch-review-btn ${isBatchReviewing ? 'btn-primary pulsing' : ''}`}
                onClick={isBatchReviewing ? () => setIsBatchReviewing(false) : startBatchReview}
              >
                {isBatchReviewing ? (
                  <><IconStop /> Reviewing ({batchReviewIdxRef.current}/{mainLineNodes.length - 1})</>
                ) : (
                  <><IconSearch /> Review Game</>
                )}
              </button>
            </div>

            {/* Move list (tree) */}
            <div className="right-section">
              <h3><span className="section-icon"><IconSwords /></span> Moves</h3>
              <MoveListTree
                tree={gameTree}
                onNavigate={chess => navigateAndPause(chess)}
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
                    {showWdl && line.wdl && (
                      <HorizontalWdlBar wdl={line.wdl} orientation={orientation} />
                    )}
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
        <div className="panel-inner" style={{ opacity: (!isMobile && leftWidth === 0) ? 0 : 1 }}>
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
            {/* Watch controls — playback nav + pause + speed */}
            <WatchControls
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onFirst={goFirst}
              onPrev={goPrev}
              onNext={goNext}
              onLast={goLast}
              gameMode={gameMode}
              paused={paused}
              isGameOver={game.isGameOver()}
              stepMode={aiSpeed === 'step'}
              onPause={pause}
              onResume={resume}
              onStep={handleStep}
              aiSpeed={aiSpeed}
              onSpeedChange={handleSpeedChange}
            />

            <div className="bottom-status-row">
              <span className="bottom-engine-info">
                {engineName} · <strong className={`status ${status}`}>{status}</strong>
              </span>

              {/* Game-over badges */}
              {game.isCheckmate() && <span className="game-over-badge">♟ Checkmate!</span>}
              {game.isStalemate() && <span className="game-over-badge draw">½ Stalemate</span>}
              {game.isDraw() && !game.isStalemate() && <span className="game-over-badge draw">½ Draw</span>}
              {game.isCheck() && !game.isCheckmate() && (
                <span className="game-over-badge check"><IconAlert style={{ marginRight: '3px' }} />Check!</span>
              )}

              {lastBestMove && !game.isGameOver() && (
                <p className="best-move">Best: {lastBestMove}</p>
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
