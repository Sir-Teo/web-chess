import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import {
  buildWdlSeries,
  buildWinrateSeries,
  buildReviewRows,
  formatEvaluation,
  pvToSan,
  scoreToCp,
  summarizeReview,
  type EvalSnapshot,
  type WdlPoint,
  type WinratePoint,
} from './engine/analysis'
import type { AnalyzeMode, UciGoLimits } from './engine/uci'
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
type AnalysisTab = 'analyze' | 'review' | 'engine-lab'
type AnalyzePresetId = 'blunder-check' | 'game-review' | 'deep-candidate' | 'mate-hunt'

const ANALYSIS_SETTINGS_STORAGE_KEY = 'webchess:analysis-settings:v1'
const ANALYZE_MODE_IDS: AnalyzeMode[] = ['quick', 'deep', 'infinite', 'mate', 'review']
const ANALYSIS_TAB_IDS: AnalysisTab[] = ['analyze', 'review', 'engine-lab']

const analyzePresets: Array<{ id: AnalyzePresetId; label: string; summary: string }> = [
  { id: 'blunder-check', label: 'Fast Blunder Check', summary: 'Quick scan after each move.' },
  { id: 'game-review', label: 'Game Review', summary: 'Balanced depth across the line.' },
  { id: 'deep-candidate', label: 'Deep Candidate Search', summary: 'Higher depth and wider MultiPV.' },
  { id: 'mate-hunt', label: 'Mate Hunt', summary: 'Prioritize forced mating lines.' },
]

type PersistedAppSettings = {
  autoAnalyze: boolean
  engineProfile: EngineProfileId
  analysisTab: AnalysisTab
  activePreset: AnalyzePresetId | null
  analyzeMode: AnalyzeMode
  showAdvancedAnalyze: boolean
  searchDepth: number
  quickMovetimeMs: number
  mateTarget: number
  multiPv: number
  hashMb: number
  showWdl: boolean
  limitNodes: number | null
  searchMovesInput: string
  useClockLimits: boolean
  whiteTimeMs: number
  blackTimeMs: number
  whiteIncMs: number
  blackIncMs: number
  movesToGo: number | null
  expertModeEnabled: boolean
  labCommandHistory: string[]
}

const DEFAULT_PERSISTED_SETTINGS: PersistedAppSettings = {
  autoAnalyze: true,
  engineProfile: 'auto',
  analysisTab: 'analyze',
  activePreset: 'game-review',
  analyzeMode: 'deep',
  showAdvancedAnalyze: false,
  searchDepth: 16,
  quickMovetimeMs: 500,
  mateTarget: 4,
  multiPv: 2,
  hashMb: 64,
  showWdl: true,
  limitNodes: null,
  searchMovesInput: '',
  useClockLimits: false,
  whiteTimeMs: 120_000,
  blackTimeMs: 120_000,
  whiteIncMs: 1_000,
  blackIncMs: 1_000,
  movesToGo: null,
  expertModeEnabled: false,
  labCommandHistory: [],
}

function isAnalyzePresetId(value: unknown): value is AnalyzePresetId {
  return typeof value === 'string' && analyzePresets.some(preset => preset.id === value)
}

function isAnalyzeMode(value: unknown): value is AnalyzeMode {
  return typeof value === 'string' && ANALYZE_MODE_IDS.includes(value as AnalyzeMode)
}

function isAnalysisTab(value: unknown): value is AnalysisTab {
  return typeof value === 'string' && ANALYSIS_TAB_IDS.includes(value as AnalysisTab)
}

function isEngineProfileId(value: unknown): value is EngineProfileId {
  if (value === 'auto') return true
  return typeof value === 'string' && engineProfiles.some(profile => profile.id === value)
}

function normalizeInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  if (rounded < minimum || rounded > maximum) return fallback
  return rounded
}

function normalizeOptionalPositiveInteger(value: unknown, maximum: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded <= 0 || rounded > maximum) return null
  return rounded
}

function loadPersistedSettings(): PersistedAppSettings {
  if (typeof window === 'undefined') return DEFAULT_PERSISTED_SETTINGS

  try {
    const raw = window.localStorage.getItem(ANALYSIS_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_PERSISTED_SETTINGS

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const labCommandHistory = Array.isArray(parsed.labCommandHistory)
      ? parsed.labCommandHistory
          .filter((value): value is string => typeof value === 'string')
          .map(item => item.trim())
          .filter(Boolean)
          .slice(0, 20)
      : DEFAULT_PERSISTED_SETTINGS.labCommandHistory

    return {
      autoAnalyze: typeof parsed.autoAnalyze === 'boolean' ? parsed.autoAnalyze : DEFAULT_PERSISTED_SETTINGS.autoAnalyze,
      engineProfile: isEngineProfileId(parsed.engineProfile) ? parsed.engineProfile : DEFAULT_PERSISTED_SETTINGS.engineProfile,
      analysisTab: isAnalysisTab(parsed.analysisTab) ? parsed.analysisTab : DEFAULT_PERSISTED_SETTINGS.analysisTab,
      activePreset: parsed.activePreset === null ? null : (isAnalyzePresetId(parsed.activePreset) ? parsed.activePreset : DEFAULT_PERSISTED_SETTINGS.activePreset),
      analyzeMode: isAnalyzeMode(parsed.analyzeMode) ? parsed.analyzeMode : DEFAULT_PERSISTED_SETTINGS.analyzeMode,
      showAdvancedAnalyze: typeof parsed.showAdvancedAnalyze === 'boolean'
        ? parsed.showAdvancedAnalyze
        : DEFAULT_PERSISTED_SETTINGS.showAdvancedAnalyze,
      searchDepth: normalizeInteger(parsed.searchDepth, 6, 32, DEFAULT_PERSISTED_SETTINGS.searchDepth),
      quickMovetimeMs: normalizeInteger(parsed.quickMovetimeMs, 50, 30_000, DEFAULT_PERSISTED_SETTINGS.quickMovetimeMs),
      mateTarget: normalizeInteger(parsed.mateTarget, 1, 30, DEFAULT_PERSISTED_SETTINGS.mateTarget),
      multiPv: normalizeInteger(parsed.multiPv, 1, 5, DEFAULT_PERSISTED_SETTINGS.multiPv),
      hashMb: normalizeInteger(parsed.hashMb, 16, 512, DEFAULT_PERSISTED_SETTINGS.hashMb),
      showWdl: typeof parsed.showWdl === 'boolean' ? parsed.showWdl : DEFAULT_PERSISTED_SETTINGS.showWdl,
      limitNodes: normalizeOptionalPositiveInteger(parsed.limitNodes, 1_000_000_000),
      searchMovesInput: typeof parsed.searchMovesInput === 'string' ? parsed.searchMovesInput : DEFAULT_PERSISTED_SETTINGS.searchMovesInput,
      useClockLimits: typeof parsed.useClockLimits === 'boolean' ? parsed.useClockLimits : DEFAULT_PERSISTED_SETTINGS.useClockLimits,
      whiteTimeMs: normalizeInteger(parsed.whiteTimeMs, 0, 86_400_000, DEFAULT_PERSISTED_SETTINGS.whiteTimeMs),
      blackTimeMs: normalizeInteger(parsed.blackTimeMs, 0, 86_400_000, DEFAULT_PERSISTED_SETTINGS.blackTimeMs),
      whiteIncMs: normalizeInteger(parsed.whiteIncMs, 0, 60_000, DEFAULT_PERSISTED_SETTINGS.whiteIncMs),
      blackIncMs: normalizeInteger(parsed.blackIncMs, 0, 60_000, DEFAULT_PERSISTED_SETTINGS.blackIncMs),
      movesToGo: normalizeOptionalPositiveInteger(parsed.movesToGo, 500),
      expertModeEnabled: typeof parsed.expertModeEnabled === 'boolean'
        ? parsed.expertModeEnabled
        : DEFAULT_PERSISTED_SETTINGS.expertModeEnabled,
      labCommandHistory,
    }
  } catch {
    return DEFAULT_PERSISTED_SETTINGS
  }
}

function persistSettings(settings: PersistedAppSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ANALYSIS_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore localStorage failures (private mode / quota).
  }
}

function isHeavyCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'bench') return true
  if (normalized.startsWith('perft')) return true
  if (normalized.startsWith('go infinite')) return true
  return false
}

function App() {
  // ── Chess game instance ──────────────────────────────
  const game = useMemo(() => new Chess(), [])
  const [fen, setFen] = useState(game.fen())
  const [orientation, setOrientation] = useState<Orientation>('white')
  const persistedSettings = useMemo(loadPersistedSettings, [])

  // ── Layout ───────────────────────────────────────────
  const [topPanelOpen, setTopPanelOpen] = useState(true)
  const [leftWidth, setLeftWidth] = useState(320)
  const [rightWidth, setRightWidth] = useState(320)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })

  // ── Engine settings ──────────────────────────────────
  const [searchDepth, setSearchDepth] = useState(persistedSettings.searchDepth)
  const [multiPv, setMultiPv] = useState(persistedSettings.multiPv)
  const [hashMb, setHashMb] = useState(persistedSettings.hashMb)
  const [showWdl, setShowWdl] = useState(persistedSettings.showWdl)
  const [autoAnalyze, setAutoAnalyze] = useState(persistedSettings.autoAnalyze)
  const [engineProfile, setEngineProfile] = useState<EngineProfileId>(persistedSettings.engineProfile)
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>(persistedSettings.analysisTab)
  const [activePreset, setActivePreset] = useState<AnalyzePresetId | null>(persistedSettings.activePreset)
  const [analyzeMode, setAnalyzeMode] = useState<AnalyzeMode>(persistedSettings.analyzeMode)
  const [showAdvancedAnalyze, setShowAdvancedAnalyze] = useState(persistedSettings.showAdvancedAnalyze)
  const [quickMovetimeMs, setQuickMovetimeMs] = useState(persistedSettings.quickMovetimeMs)
  const [mateTarget, setMateTarget] = useState(persistedSettings.mateTarget)
  const [limitNodes, setLimitNodes] = useState<number | ''>(persistedSettings.limitNodes ?? '')
  const [searchMovesInput, setSearchMovesInput] = useState(persistedSettings.searchMovesInput)
  const [useClockLimits, setUseClockLimits] = useState(persistedSettings.useClockLimits)
  const [whiteTimeMs, setWhiteTimeMs] = useState(persistedSettings.whiteTimeMs)
  const [blackTimeMs, setBlackTimeMs] = useState(persistedSettings.blackTimeMs)
  const [whiteIncMs, setWhiteIncMs] = useState(persistedSettings.whiteIncMs)
  const [blackIncMs, setBlackIncMs] = useState(persistedSettings.blackIncMs)
  const [movesToGo, setMovesToGo] = useState<number | ''>(persistedSettings.movesToGo ?? '')
  const [engineLabCommand, setEngineLabCommand] = useState('')
  const [engineLabError, setEngineLabError] = useState<string | null>(null)
  const [rawLogOffset, setRawLogOffset] = useState(0)
  const [expertModeEnabled, setExpertModeEnabled] = useState(persistedSettings.expertModeEnabled)
  const [labCommandHistory, setLabCommandHistory] = useState<string[]>(persistedSettings.labCommandHistory)
  const [lastLabRun, setLastLabRun] = useState<{ command: string; durationMs: number } | null>(null)

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
    setAiSpeed(s)
    aiSpeedRef.current = s
  }, [])

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
  const currentPathMoves = useMemo(
    () => currentPathNodes.slice(1).map(node => node.uci).filter(Boolean),
    [currentPathNodes],
  )
  const currentPathMovesKey = currentPathMoves.join(' ')
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
    lastPonderMove,
    activeGoCommand,
    queueLength,
    rawLines,
    capabilities,
    analyze,
    sendCommand,
    newGame,
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
    analyze({
      fen,
      mode: 'custom',
      limits: { depth: searchDepth },
      multiPv,
      hashMb,
      showWdl,
      historyMoves: currentPathMovesKey ? currentPathMovesKey.split(' ') : [],
    })
  }, [analyze, autoAnalyze, currentPathMovesKey, fen, hashMb, multiPv, searchDepth, showWdl])

  const parsedSearchMoves = useMemo(
    () =>
      searchMovesInput
        .split(/[,\s]+/g)
        .map(move => move.trim())
        .filter(Boolean),
    [searchMovesInput],
  )

  const resetSavedWorkspace = useCallback(() => {
    try {
      window.localStorage.removeItem(ANALYSIS_SETTINGS_STORAGE_KEY)
    } catch {
      // Ignore localStorage failures (private mode / quota).
    }

    setSearchDepth(DEFAULT_PERSISTED_SETTINGS.searchDepth)
    setMultiPv(DEFAULT_PERSISTED_SETTINGS.multiPv)
    setHashMb(DEFAULT_PERSISTED_SETTINGS.hashMb)
    setShowWdl(DEFAULT_PERSISTED_SETTINGS.showWdl)
    setAutoAnalyze(DEFAULT_PERSISTED_SETTINGS.autoAnalyze)
    setEngineProfile(DEFAULT_PERSISTED_SETTINGS.engineProfile)
    setAnalysisTab(DEFAULT_PERSISTED_SETTINGS.analysisTab)
    setActivePreset(DEFAULT_PERSISTED_SETTINGS.activePreset)
    setAnalyzeMode(DEFAULT_PERSISTED_SETTINGS.analyzeMode)
    setShowAdvancedAnalyze(DEFAULT_PERSISTED_SETTINGS.showAdvancedAnalyze)
    setQuickMovetimeMs(DEFAULT_PERSISTED_SETTINGS.quickMovetimeMs)
    setMateTarget(DEFAULT_PERSISTED_SETTINGS.mateTarget)
    setLimitNodes(DEFAULT_PERSISTED_SETTINGS.limitNodes ?? '')
    setSearchMovesInput(DEFAULT_PERSISTED_SETTINGS.searchMovesInput)
    setUseClockLimits(DEFAULT_PERSISTED_SETTINGS.useClockLimits)
    setWhiteTimeMs(DEFAULT_PERSISTED_SETTINGS.whiteTimeMs)
    setBlackTimeMs(DEFAULT_PERSISTED_SETTINGS.blackTimeMs)
    setWhiteIncMs(DEFAULT_PERSISTED_SETTINGS.whiteIncMs)
    setBlackIncMs(DEFAULT_PERSISTED_SETTINGS.blackIncMs)
    setMovesToGo(DEFAULT_PERSISTED_SETTINGS.movesToGo ?? '')
    setExpertModeEnabled(DEFAULT_PERSISTED_SETTINGS.expertModeEnabled)
    setLabCommandHistory(DEFAULT_PERSISTED_SETTINGS.labCommandHistory)
    setEngineLabError(null)
  }, [])

  const applyPreset = useCallback((presetId: AnalyzePresetId) => {
    setActivePreset(presetId)
    setShowAdvancedAnalyze(false)
    setUseClockLimits(false)
    setLimitNodes('')
    setSearchMovesInput('')
    setMovesToGo('')

    if (presetId === 'blunder-check') {
      setAnalyzeMode('quick')
      setQuickMovetimeMs(350)
      setSearchDepth(12)
      setMultiPv(1)
      return
    }

    if (presetId === 'game-review') {
      setAnalyzeMode('review')
      setSearchDepth(16)
      setMultiPv(2)
      return
    }

    if (presetId === 'deep-candidate') {
      setAnalyzeMode('deep')
      setSearchDepth(24)
      setMultiPv(4)
      setShowAdvancedAnalyze(true)
      setLimitNodes(2_000_000)
      return
    }

    setAnalyzeMode('mate')
    setMateTarget(6)
    setMultiPv(1)
  }, [])

  const runAnalyze = useCallback(() => {
    const limits: UciGoLimits = {}
    if (analyzeMode === 'quick') limits.movetime = quickMovetimeMs
    if (analyzeMode === 'deep' || analyzeMode === 'review') limits.depth = searchDepth
    if (analyzeMode === 'mate') limits.mate = mateTarget
    if (analyzeMode === 'infinite') limits.infinite = true

    if (showAdvancedAnalyze && typeof limitNodes === 'number' && limitNodes > 0) {
      limits.nodes = limitNodes
    }
    if (showAdvancedAnalyze && useClockLimits) {
      limits.wtime = whiteTimeMs
      limits.btime = blackTimeMs
      limits.winc = whiteIncMs
      limits.binc = blackIncMs
      if (typeof movesToGo === 'number' && movesToGo > 0) limits.movestogo = movesToGo
    }

    analyze({
      fen,
      mode: analyzeMode,
      limits,
      multiPv,
      hashMb,
      showWdl,
      searchMoves: showAdvancedAnalyze ? parsedSearchMoves : [],
      historyMoves: currentPathMovesKey ? currentPathMovesKey.split(' ') : [],
    })
  }, [
    analyze,
    analyzeMode,
    blackIncMs,
    blackTimeMs,
    fen,
    hashMb,
    limitNodes,
    mateTarget,
    movesToGo,
    multiPv,
    parsedSearchMoves,
    quickMovetimeMs,
    searchDepth,
    showAdvancedAnalyze,
    showWdl,
    useClockLimits,
    whiteIncMs,
    whiteTimeMs,
    currentPathMovesKey,
  ])

  const runLabCommand = useCallback(
    async (command: string) => {
      const trimmed = command.trim()
      if (!trimmed) return
      setEngineLabError(null)
      if (!expertModeEnabled && isHeavyCommand(trimmed)) {
        setEngineLabError('Enable expert mode before running heavy commands (bench/perft/go infinite).')
        return
      }

      setLabCommandHistory(previous => [trimmed, ...previous.filter(item => item !== trimmed)].slice(0, 20))
      const startTime = performance.now()
      try {
        await sendCommand(trimmed)
        setLastLabRun({ command: trimmed, durationMs: Math.round(performance.now() - startTime) })
        setEngineLabCommand('')
      } catch (error) {
        setLastLabRun({ command: trimmed, durationMs: Math.round(performance.now() - startTime) })
        setEngineLabError(error instanceof Error ? error.message : String(error))
      }
    },
    [expertModeEnabled, sendCommand],
  )

  const clearRawConsole = useCallback(() => {
    setRawLogOffset(rawLines.length)
    setEngineLabError(null)
  }, [rawLines.length])

  const visibleRawLines = useMemo(() => rawLines.slice(rawLogOffset).slice(-300), [rawLines, rawLogOffset])

  const copyRawConsole = useCallback(async () => {
    try {
      if (!visibleRawLines.length) return
      await navigator.clipboard.writeText(visibleRawLines.join('\n'))
      setEngineLabError(null)
    } catch (error) {
      setEngineLabError(error instanceof Error ? error.message : 'Failed to copy console output.')
    }
  }, [visibleRawLines])

  useEffect(() => {
    persistSettings({
      autoAnalyze,
      engineProfile,
      analysisTab,
      activePreset,
      analyzeMode,
      showAdvancedAnalyze,
      searchDepth,
      quickMovetimeMs,
      mateTarget,
      multiPv,
      hashMb,
      showWdl,
      limitNodes: typeof limitNodes === 'number' ? limitNodes : null,
      searchMovesInput,
      useClockLimits,
      whiteTimeMs,
      blackTimeMs,
      whiteIncMs,
      blackIncMs,
      movesToGo: typeof movesToGo === 'number' ? movesToGo : null,
      expertModeEnabled,
      labCommandHistory,
    })
  }, [
    activePreset,
    analysisTab,
    analyzeMode,
    autoAnalyze,
    blackIncMs,
    blackTimeMs,
    engineProfile,
    expertModeEnabled,
    hashMb,
    labCommandHistory,
    limitNodes,
    mateTarget,
    movesToGo,
    multiPv,
    quickMovetimeMs,
    searchDepth,
    searchMovesInput,
    showAdvancedAnalyze,
    showWdl,
    useClockLimits,
    whiteIncMs,
    whiteTimeMs,
  ])

  // ── Derived move data ─────────────────────────────────
  const mainLineNodes = gameTree.mainLine()
  const mainLineMoves = mainLineNodes.slice(1).map(n => n.move!).filter(Boolean)

  const reviewRows = useMemo(() => buildReviewRows(mainLineMoves, evaluationsByFen), [evaluationsByFen, mainLineMoves])
  const reviewSummary = useMemo(() => summarizeReview(reviewRows), [reviewRows])

  // Graph uses active path up to its deepest child to show the entire branch history
  const currentLineNodes = useMemo(() => {
    const nodes = [...currentPathNodes]
    let cur = nodes[nodes.length - 1]
    while (cur && cur.children.length > 0) {
      const firstChild = gameTree.nodesSnapshot.get(cur.children[0]!)
      if (firstChild) {
        nodes.push(firstChild)
        cur = firstChild
      } else {
        break
      }
    }
    return nodes
  }, [currentPathNodes, gameTree.nodesSnapshot])

  const winratePoints = useMemo(
    () => {
      const moves = currentLineNodes.slice(1).map(n => n.move!).filter(Boolean)
      return buildWinrateSeries(moves, evaluationsByFen)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaluationsByFen, currentLineNodes.length, currentLineNodes[currentLineNodes.length - 1]?.id],
  )

  const wdlPoints = useMemo(
    () => {
      const moves = currentLineNodes.slice(1).map(n => n.move!).filter(Boolean)
      return buildWdlSeries(moves, evaluationsByFen)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaluationsByFen, currentLineNodes.length, currentLineNodes[currentLineNodes.length - 1]?.id],
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
      newGame()
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
    } catch {
      alert("Failed to parse PGN.")
    }
  }, [game, gameTree, newGame])

  const handleNewGameStart = useCallback(
    ({ mode, playerColor: color, difficulty }: { mode: GameMode; playerColor: PlayerColor; difficulty: AiDifficulty }) => {
      setShowNewGameDialog(false)
      setGameMode(mode)
      setPlayerColor(color)
      setAiDifficulty(difficulty)
      aiPlayer.setDifficulty(difficulty)

      newGame()
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
    [aiPlayer, game, gameTree, newGame],
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
  const DEFAULT_LEFT = 320
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
                    <button type="button" onClick={resetSavedWorkspace}>
                      Reset saved workspace
                    </button>
                    <p className="panel-copy small">
                      Clears persisted analyze/lab controls for this browser.
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
        <div className="board-wrap">
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
          <header className="panel-header analysis-header">
            <h2>Analysis</h2>
            <div className="analysis-tab-strip">
              {([
                { id: 'analyze', label: 'Analyze' },
                { id: 'review', label: 'Review' },
                { id: 'engine-lab', label: 'Engine Lab' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className={`analysis-tab-btn ${analysisTab === tab.id ? 'active' : ''}`}
                  onClick={() => setAnalysisTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </header>
          <div className="panel-content">
            {analysisTab === 'analyze' && (
              <>
                <div className="inline-actions">
                  <button type="button" className="btn-primary" onClick={runAnalyze}>
                    <IconPlay /> Analyze
                  </button>
                  <button type="button" onClick={stop}>
                    <IconStop /> Stop
                  </button>
                </div>
                <div className="preset-grid">
                  {analyzePresets.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`preset-card ${activePreset === preset.id ? 'active' : ''}`}
                      onClick={() => applyPreset(preset.id)}
                    >
                      <strong>{preset.label}</strong>
                      <span>{preset.summary}</span>
                    </button>
                  ))}
                </div>
                <div className="analysis-mode-pills">
                  {([
                    { id: 'quick', label: 'Quick' },
                    { id: 'deep', label: 'Deep' },
                    { id: 'infinite', label: 'Infinite' },
                    { id: 'mate', label: 'Mate' },
                    { id: 'review', label: 'Review' },
                  ] as const).map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      className={`mode-pill ${analyzeMode === mode.id ? 'active' : ''}`}
                      onClick={() => {
                        setActivePreset(null)
                        setAnalyzeMode(mode.id)
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <p className="panel-copy small command-summary">
                  {activeGoCommand ? `Command: ${activeGoCommand}` : 'Command: idle'} {queueLength > 0 ? `· queue ${queueLength}` : ''}
                </p>

                {(analyzeMode === 'deep' || analyzeMode === 'review') && (
                  <label className="control">
                    <span>Depth</span>
                    <input
                      type="range"
                      min={6}
                      max={32}
                      step={1}
                      value={searchDepth}
                      onChange={e => {
                        setActivePreset(null)
                        setSearchDepth(Number(e.target.value))
                      }}
                    />
                    <strong>{searchDepth}</strong>
                  </label>
                )}
                {analyzeMode === 'quick' && (
                  <label className="engine-option-row">
                    <span>Move time (ms)</span>
                    <input
                      type="number"
                      min={50}
                      max={30000}
                      step={50}
                      value={quickMovetimeMs}
                      onChange={e => {
                        setActivePreset(null)
                        setQuickMovetimeMs(Number(e.target.value))
                      }}
                    />
                  </label>
                )}
                {analyzeMode === 'mate' && (
                  <label className="engine-option-row">
                    <span>Mate target (plies)</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      value={mateTarget}
                      onChange={e => {
                        setActivePreset(null)
                        setMateTarget(Number(e.target.value))
                      }}
                    />
                  </label>
                )}
                <label className="control">
                  <span>MultiPV</span>
                  <input type="range" min={1} max={5} step={1} value={multiPv}
                    onChange={e => {
                      setActivePreset(null)
                      setMultiPv(Number(e.target.value))
                    }} />
                  <strong>{multiPv} lines</strong>
                </label>
                <label className="switch-control">
                  <input
                    type="checkbox"
                    checked={showAdvancedAnalyze}
                    onChange={e => {
                      setActivePreset(null)
                      setShowAdvancedAnalyze(e.target.checked)
                    }}
                  />
                  <span>Advanced search limits</span>
                </label>
                {showAdvancedAnalyze && (
                  <div className="engine-lab-card">
                    <label className="engine-option-row">
                      <span>Nodes limit</span>
                      <input
                        type="number"
                        min={1}
                        step={1000}
                        value={limitNodes}
                        onChange={e => setLimitNodes(e.target.value ? Number(e.target.value) : '')}
                      />
                    </label>
                    <label className="engine-option-row">
                      <span>Search moves (UCI)</span>
                      <input
                        type="text"
                        value={searchMovesInput}
                        onChange={e => setSearchMovesInput(e.target.value)}
                        placeholder="e2e4 g1f3"
                      />
                    </label>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={useClockLimits}
                        onChange={e => setUseClockLimits(e.target.checked)}
                      />
                      <span>Use clock-style limits</span>
                    </label>
                    {useClockLimits && (
                      <>
                        <label className="engine-option-row">
                          <span>White time (ms)</span>
                          <input type="number" min={0} step={100} value={whiteTimeMs}
                            onChange={e => setWhiteTimeMs(Number(e.target.value))} />
                        </label>
                        <label className="engine-option-row">
                          <span>Black time (ms)</span>
                          <input type="number" min={0} step={100} value={blackTimeMs}
                            onChange={e => setBlackTimeMs(Number(e.target.value))} />
                        </label>
                        <label className="engine-option-row">
                          <span>White increment (ms)</span>
                          <input type="number" min={0} step={50} value={whiteIncMs}
                            onChange={e => setWhiteIncMs(Number(e.target.value))} />
                        </label>
                        <label className="engine-option-row">
                          <span>Black increment (ms)</span>
                          <input type="number" min={0} step={50} value={blackIncMs}
                            onChange={e => setBlackIncMs(Number(e.target.value))} />
                        </label>
                        <label className="engine-option-row">
                          <span>Moves to go</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={movesToGo}
                            onChange={e => setMovesToGo(e.target.value ? Number(e.target.value) : '')}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}

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
                  {lastPonderMove && <p className="best-move">Ponder: {lastPonderMove}</p>}
                </div>
              </>
            )}

            {analysisTab === 'review' && (
              <>
                <div className="inline-actions">
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
                <div className="right-section">
                  <h3><span className="section-icon"><IconSwords /></span> Moves</h3>
                  <MoveListTree
                    tree={gameTree}
                    onNavigate={chess => navigateAndPause(chess)}
                  />
                </div>
              </>
            )}

            {analysisTab === 'engine-lab' && (
              <>
                <div className="engine-lab-card">
                  <h3><span className="section-icon"><IconSettings /></span> Runtime</h3>
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
                  <p className="panel-copy small command-summary">
                    Active: {activeGoCommand || 'none'}
                  </p>
                  <label className="switch-control expert-toggle">
                    <input
                      type="checkbox"
                      checked={expertModeEnabled}
                      onChange={e => setExpertModeEnabled(e.target.checked)}
                    />
                    <span>Enable expert commands (bench/perft/infinite)</span>
                  </label>
                  {!expertModeEnabled && (
                    <p className="panel-copy small warning-copy">
                      Heavy diagnostics are locked to keep the UI responsive.
                    </p>
                  )}
                </div>

                <div className="engine-lab-card">
                  <h3><span className="section-icon"><IconPlay /></span> UCI Console</h3>
                  <form
                    className="engine-lab-console"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void runLabCommand(engineLabCommand)
                    }}
                  >
                    <input
                      type="text"
                      value={engineLabCommand}
                      onChange={e => setEngineLabCommand(e.target.value)}
                      placeholder="go depth 16"
                    />
                    <button type="submit">Send</button>
                    <button type="button" onClick={() => void copyRawConsole()}>Copy</button>
                    <button type="button" onClick={clearRawConsole}>Clear</button>
                  </form>
                  {lastLabRun && (
                    <p className="panel-copy small command-summary">
                      Last run: <strong>{lastLabRun.command}</strong> ({lastLabRun.durationMs} ms)
                    </p>
                  )}
                  <div className="inline-actions diagnostics-actions">
                    <button type="button" onClick={() => void runLabCommand('d')}>d</button>
                    <button type="button" onClick={() => void runLabCommand('eval')}>eval</button>
                    <button
                      type="button"
                      className="danger-lite"
                      disabled={!expertModeEnabled}
                      onClick={() => void runLabCommand('bench')}
                    >
                      bench
                    </button>
                    <button
                      type="button"
                      className="danger-lite"
                      disabled={!expertModeEnabled}
                      onClick={() => void runLabCommand('perft 3')}
                    >
                      perft 3
                    </button>
                  </div>
                  {labCommandHistory.length > 0 && (
                    <div className="lab-history">
                      <h4>History</h4>
                      <div className="lab-history-list">
                        {labCommandHistory.map(item => (
                          <button key={item} type="button" onClick={() => setEngineLabCommand(item)}>
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {engineLabError && <p className="panel-copy small error-copy">{engineLabError}</p>}
                  <pre className="engine-lab-output">
                    {(visibleRawLines.join('\n')) || 'No engine output yet.'}
                  </pre>
                </div>

                <div className="engine-lab-card">
                  <h3><span className="section-icon"><IconSettings /></span> Engine options</h3>
                  <div className="engine-options">
                    {options.map(option => (
                      <EngineOptionControl key={option.name} option={option} onSetOption={setOption} />
                    ))}
                  </div>
                  <p className="panel-copy small">
                    Discovered from UCI handshake; applied immediately.
                  </p>
                </div>
              </>
            )}
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
            <WinrateGraph
              points={winratePoints}
              currentIndex={currentPathNodes.length - 1}
              onNavigate={(idx) => {
                const targetNode = currentLineNodes[idx] || currentLineNodes[currentLineNodes.length - 1]
                if (targetNode) navigateAndPause(gameTree.navigateTo(targetNode.id))
              }}
            />
            {winratePoints.length > 0 && (
              <div className="graph-legend">
                <span>White win chance</span>
                <strong>{winratePoints[winratePoints.length - 1]!.whiteWinrate.toFixed(1)}%</strong>
              </div>
            )}
            <WdlProgressGraph
              points={wdlPoints}
              currentIndex={currentPathNodes.length - 1}
              onNavigate={(idx) => {
                const targetNode = currentLineNodes[idx] || currentLineNodes[currentLineNodes.length - 1]
                if (targetNode) navigateAndPause(gameTree.navigateTo(targetNode.id))
              }}
            />
            {wdlPoints.length > 0 && (
              <div className="graph-legend wdl">
                <span className="wdl-white-label">White {wdlPoints[wdlPoints.length - 1]!.white.toFixed(1)}%</span>
                <span className="wdl-draw-label">Draw {wdlPoints[wdlPoints.length - 1]!.draw.toFixed(1)}%</span>
                <span className="wdl-black-label">Black {wdlPoints[wdlPoints.length - 1]!.black.toFixed(1)}%</span>
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
              {activeGoCommand && (
                <span className="engine-command-inline">{activeGoCommand}</span>
              )}

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

const GRAPH_HEIGHT = 220
const GRAPH_PAD_LEFT = 52
const GRAPH_PAD_RIGHT = 20
const GRAPH_PAD_TOP = 16
const GRAPH_PAD_BOTTOM = 34
const GRAPH_BASE_WIDTH = 440
const GRAPH_PX_PER_PLY = 16

function graphWidthForIndex(maxIndex: number): number {
  return Math.max(GRAPH_BASE_WIDTH, GRAPH_PAD_LEFT + GRAPH_PAD_RIGHT + (maxIndex * GRAPH_PX_PER_PLY))
}

function graphTickStep(maxIndex: number): number {
  if (maxIndex <= 20) return 4
  const roughStep = Math.max(4, Math.round(maxIndex / 10))
  return roughStep % 2 === 0 ? roughStep : roughStep + 1
}

function formatMoveAxisLabel(index: number): string {
  const moveNumber = index / 2
  return Number.isInteger(moveNumber) ? String(moveNumber) : moveNumber.toFixed(1)
}

type WinrateGraphProps = {
  points: WinratePoint[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

function WinrateGraph({ points, currentIndex, onNavigate }: WinrateGraphProps) {
  if (points.length < 2) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">📈</span>
        <p>Play and analyze moves to build the live winrate graph.</p>
      </div>
    )
  }

  const maxIndex = points.length > 0 ? points[points.length - 1]!.index : 0
  const width = graphWidthForIndex(maxIndex)
  const height = GRAPH_HEIGHT
  const padLeft = GRAPH_PAD_LEFT
  const padRight = GRAPH_PAD_RIGHT
  const padTop = GRAPH_PAD_TOP
  const padBottom = GRAPH_PAD_BOTTOM
  const innerWidth = width - padLeft - padRight
  const innerHeight = height - padTop - padBottom

  const toX = (idx: number) => padLeft + (maxIndex > 0 ? (idx / maxIndex) * innerWidth : 0)
  const toY = (wr: number) => padTop + ((100 - wr) / 100) * innerHeight

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(p.whiteWinrate).toFixed(2)}`)
    .join(' ')

  const area = `${path} L ${toX(maxIndex).toFixed(2)} ${(height - padBottom).toFixed(2)} L ${toX(points[0]?.index ?? 0).toFixed(2)} ${(height - padBottom).toFixed(2)} Z`
  const markers = [0, 25, 50, 75, 100]
  const xTickStep = graphTickStep(maxIndex)

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onNavigate || maxIndex === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const scaleX = width / rect.width
    const xInsideSvg = (e.clientX - rect.left) * scaleX

    let targetIdx = Math.round(((xInsideSvg - padLeft) / innerWidth) * maxIndex)
    if (targetIdx < 0) targetIdx = 0
    if (targetIdx > maxIndex) targetIdx = maxIndex

    onNavigate(targetIdx)
  }

  const currentLineX = currentIndex !== undefined && maxIndex > 0
    ? toX(Math.min(currentIndex, maxIndex))
    : null

  return (
    <div className="graph-wrap" aria-label="White winrate graph">
      <div className="graph-scroll">
        <svg
          className="winrate-graph"
          width={width}
          viewBox={`0 0 ${width} ${height}`}
          onClick={handleClick}
          style={{ cursor: onNavigate ? 'pointer' : 'default' }}
        >
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
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="graph-grid-line" />
                <text x={padLeft - 8} y={y + 4} className="graph-grid-text" textAnchor="end">{v}%</text>
              </g>
            )
          })}
          <path d={area} className="graph-area" />
          <path d={path} className="graph-line" />

          {points.map((p) => {
            if (p.index > 0 && p.index % xTickStep === 0) {
              const x = toX(p.index)
              return (
                <g key={`x-${p.index}`}>
                  <line x1={x} x2={x} y1={height - padBottom} y2={height - padBottom + 6} stroke="rgba(240, 246, 252, 0.2)" strokeWidth="1" />
                  <text x={x} y={height - padBottom + 20} className="graph-grid-text" textAnchor="middle">{formatMoveAxisLabel(p.index)}</text>
                </g>
              )
            }
            return null
          })}

          {currentLineX !== null && (
            <line
              x1={currentLineX}
              x2={currentLineX}
              y1={padTop}
              y2={height - padBottom}
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="2"
              strokeDasharray="4 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
      </div>
    </div>
  )
}

type WdlProgressGraphProps = {
  points: WdlPoint[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

function WdlProgressGraph({ points, currentIndex, onNavigate }: WdlProgressGraphProps) {
  if (points.length < 2) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">📊</span>
        <p>Analyze moves with WDL enabled to build the W/D/B progression graph.</p>
      </div>
    )
  }

  const maxIndex = points.length > 0 ? points[points.length - 1]!.index : 0
  const width = graphWidthForIndex(maxIndex)
  const height = GRAPH_HEIGHT
  const padLeft = GRAPH_PAD_LEFT
  const padRight = GRAPH_PAD_RIGHT
  const padTop = GRAPH_PAD_TOP
  const padBottom = GRAPH_PAD_BOTTOM
  const innerWidth = width - padLeft - padRight
  const innerHeight = height - padTop - padBottom
  const markers = [0, 25, 50, 75, 100]
  const xTickStep = graphTickStep(maxIndex)

  const toX = (idx: number) => padLeft + (maxIndex > 0 ? (idx / maxIndex) * innerWidth : 0)
  const toY = (pct: number) => padTop + ((100 - pct) / 100) * innerHeight

  const buildPath = (selector: (point: WdlPoint) => number): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(selector(p)).toFixed(2)}`).join(' ')

  const whitePath = buildPath((p) => p.white)
  const drawPath = buildPath((p) => p.draw)
  const blackPath = buildPath((p) => p.black)

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onNavigate || maxIndex === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const scaleX = width / rect.width
    const xInsideSvg = (e.clientX - rect.left) * scaleX

    let targetIdx = Math.round(((xInsideSvg - padLeft) / innerWidth) * maxIndex)
    if (targetIdx < 0) targetIdx = 0
    if (targetIdx > maxIndex) targetIdx = maxIndex

    onNavigate(targetIdx)
  }

  const currentLineX = currentIndex !== undefined && maxIndex > 0
    ? toX(Math.min(currentIndex, maxIndex))
    : null

  return (
    <div className="graph-wrap" aria-label="WDL progression graph">
      <div className="graph-scroll">
        <svg
          className="winrate-graph"
          width={width}
          viewBox={`0 0 ${width} ${height}`}
          onClick={handleClick}
          style={{ cursor: onNavigate ? 'pointer' : 'default' }}
        >
          {markers.map(v => {
            const y = toY(v)
            return (
              <g key={v}>
                <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="graph-grid-line" />
                <text x={padLeft - 8} y={y + 4} className="graph-grid-text" textAnchor="end">{v}%</text>
              </g>
            )
          })}

          <path d={whitePath} className="graph-line graph-line-white" />
          <path d={drawPath} className="graph-line graph-line-draw" />
          <path d={blackPath} className="graph-line graph-line-black" />

          {points.map((p) => {
            if (p.index > 0 && p.index % xTickStep === 0) {
              const x = toX(p.index)
              return (
                <g key={`wdl-x-${p.index}`}>
                  <line x1={x} x2={x} y1={height - padBottom} y2={height - padBottom + 6} stroke="rgba(240, 246, 252, 0.2)" strokeWidth="1" />
                  <text x={x} y={height - padBottom + 20} className="graph-grid-text" textAnchor="middle">{formatMoveAxisLabel(p.index)}</text>
                </g>
              )
            }
            return null
          })}

          {currentLineX !== null && (
            <line
              x1={currentLineX}
              x2={currentLineX}
              y1={padTop}
              y2={height - padBottom}
              stroke="rgba(255, 255, 255, 0.8)"
              strokeWidth="2"
              strokeDasharray="4 4"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
      </div>
    </div>
  )
}
