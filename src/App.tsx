import { Chess, type Move, type Square } from 'chess.js'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from 'react'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import {
  buildWdlSeries,
  buildWinrateSeries,
  buildReviewRows,
  formatCompactWhitePovEvaluation,
  describeAdvantage,
  describeReviewScope,
  normalizeWhitePovCp,
  normalizeWhitePovMate,
  filterReviewRowsByPhase,
  filterReviewRowsBySide,
  formatWhitePovEvaluation,
  pvToSan,
  pvLineMoves,
  type PvMove,
  scoreToCp,
  rankCriticalMoments,
  summarizeAccuracy,
  summarizeReview,
  uciToSan,
  type EvalSnapshot,
  type ReviewLabel,
  type ReviewRow,
  type ReviewSideFilter,
  recordEvaluation,
  engineLineToSnapshot,
  terminalSnapshotForFen,
  reportedCentipawnLoss,
} from './engine/analysis'
import { historicalSampleGames, type HistoricalSampleGame, type HistoricalSampleFormat } from './assets/historicalSamples'
import {
  cloudEvalToSnapshot,
  cloudLineToSideToMoveScore,
} from './engine/cloudEval'
import { shouldFetchCloudEvaluation } from './engine/cloudEvalPolicy'
import {
  fetchOpeningExplorer,
  getCachedOpeningExplorer,
  hasOpeningExplorerAuthToken,
  openingExplorerGameCount,
  openingMoveGameCount,
  openingMoveActionLabel,
  shouldContinueOpeningBookLine,
  type OpeningDatabaseSource,
  type OpeningSpeed,
} from './engine/openingExplorer'
import { parseCandidateMoveInput, describeBestMove } from './engine/candidateMoves'
import { type AnalyzeMode, type UciGoLimits } from './engine/uci'
import { exportAnnotatedPgn, flattenPgnMainLine, parsePgnMoveTree, pgnImportUserErrorMessage } from './engine/pgn'
import { type LibraryGame, extractLibraryMetadata, suggestGameName } from './engine/gameLibrary'
import { libraryStorageIsDurable } from './engine/gameLibraryStorage'
import { narrativeTagToneClass, narrativeTags } from './engine/narrativeTags'
import type { ReviewPhaseFilter } from './engine/analysis'
import { reviewImpactLabel } from './engine/reviewImpact'
import { reviewFaultPosition, reviewFaults, stepToReviewFault } from './engine/reviewNavigation'
import { topArrowColor } from './engine/arrowColors'
import { bestMoveLabel, ponderMoveLabel } from './engine/moveLabels'
import {
  countLabel,
  engineTelemetryLabel,
  formatAccuracyValue,
  formatCentipawnLossValue,
  formatCloudNodes,
  knownPgnHeader,
  percentage,
} from './engine/panelReadings'
import { REVIEW_LABELS } from './engine/reviewLabels'
import { LazyDialogBoundary } from './components/LazyDialogBoundary'
import { PhaseAccuracy } from './components/PhaseAccuracy'
import {
  type AutoSavedGame,
  type AutoSavedPlay,
  autoSaveDelayMs,
  clearAutoSavedGame,
  readAutoSavedGame,
  writeAutoSavedGame,
} from './engine/autoSave'
import { AutoSaveRecoveryDialog } from './components/AutoSaveRecoveryDialog'
import { type LibraryWriteResult, useGameLibrary } from './hooks/useGameLibrary'
import { FEN_PARSE_ERROR, validateFenForAnalysis } from './engine/fen'
import { buildImportSweepTargets, countImportSweepCandidates, type ImportSweepTarget } from './engine/importSweep'
import { type BatchReviewTarget, planBatchReview } from './engine/batchReview'
import {
  normalizeOptionalIntegerInput,
  normalizeRequiredIntegerInput,
  optionalIntegerInputToNullable,
  parseIntegerInputValue,
  type NumericInputValue,
} from './engine/numericInput'
import { engineProfiles, type EngineProfileId } from './engine/profiles'
import { fetchSamplePgn } from './engine/samplePgn'
import { parseFenShareHash } from './engine/shareLink'
import { parseGameShareHash, replaySharedGame } from './engine/shareGame'
import { nullMoveProbe } from './engine/threats'
import {
  tablebaseMoveActionLabel,
  tablebaseMoveSummary,
  tablebaseSummary,
} from './engine/tablebaseLabels'
import { isBoardSquare } from './engine/boardAccessibility'
import { BOARD_A11Y_SYNC_MAX_RETRIES, syncRenderedBoardAccessibility } from './components/boardAccessibilitySync'
import { isBoardInputLocked, isPromotionMove } from './engine/boardInput'
import { boardSizing, isMobileViewport } from './engine/boardSizing'
import {
  applyPremove,
  canPremove,
  isPremoveablePiece,
  premoveFromSquares,
  type Premove,
} from './engine/premove'
import { moveSoundFor } from './engine/moveSound'
import { hasSiblingVariations, siblingVariation } from './engine/moveTree'
import { chessComPositionUrl, lichessAnalysisUrl } from './engine/externalLinks'
import { BOARD_THEMES, boardThemeById } from './engine/boardThemes'
import {
  createClock,
  flagPgnResult,
  flagResultLabel,
  moveEndedGame,
  moveMade,
  remainingMs,
  pauseClock,
  settleFlag,
  startSide,
  timeControlPresetById,
  timeControlTag,
  type ClockState,
} from './engine/chessClock'
import { describeGameEnd, gameResultScore } from './engine/gameEnd'
import { describeCaptures, materialAdvantageLabel, materialBalance } from './engine/material'
import {
  resignDisabledReason,
  resignPgnResult,
  resignResultLabel,
  resigningSide,
  type ResignedBy,
} from './engine/resignation'
import { ChessClock } from './components/ChessClock'
import {
  MARK_COLORS,
  hasSquareMarks,
  markColorForModifiers,
  squareMarkStyle,
  toggleSquareMark,
  type SquareMarks,
} from './engine/boardMarks'
import { coachReadingSource, describeCoachDepth, isExactTablebaseCoachMove, selectCoachBestMove, selectCoachLineSource } from './engine/coach'
import { isReviewPracticeAnswer } from './engine/reviewPractice'
import { engineLabCommandBlockMessage, engineLabCommandSafetyMessage } from './engine/labCommands'
import { aiSearchHistory, defaultOrientationForGameMode, describePlayEngine, hintDisabledReason, sideToMoveColor, takebackDisabledReason, takebackPlyCount, judgeMoveBetweenSearches, type AiSearchReading, type MoveJudgement } from './engine/playMode'
import { useStockfishEngine } from './hooks/useStockfishEngine'
import { DIFFICULTY_LABELS, useAiPlayer, type AiDifficulty } from './hooks/useAiPlayer'
import { useGameTree, type GameNode } from './hooks/useGameTree'
import { useOpening, useOpeningBook } from './hooks/useOpening'
import { useCloudEvaluation } from './hooks/useCloudEvaluation'
import { useOpeningExplorer } from './hooks/useOpeningExplorer'
import { useTablebase } from './hooks/useTablebase'
import {
  CLOCK_INCREMENT_BOUNDS,
  CLOCK_TIME_BOUNDS,
  DEFAULT_PERSISTED_SETTINGS,
  LIMIT_NODES_BOUNDS,
  MATE_TARGET_BOUNDS,
  MOVES_TO_GO_BOUNDS,
  OPENING_SOURCES,
  OPENING_SPEEDS,
  QUICK_MOVETIME_BOUNDS,
  defaultHashMb,
  loadPersistedSettings,
  persistSettings,
  type AnalysisExperience,
  type AnalysisTab,
  type AnalyzePresetId,
  type OpeningRatingPresetId,
  type WorkspaceMode,
  type ThemePreference,
  resolveTheme,
} from './engine/appSettings'
import { ANALYSIS_SETTINGS_STORAGE_KEY } from './storageKeys'
import type { GameMode, PlayerColor } from './components/NewGameDialog'
import { WatchControls } from './components/WatchControls'
import { AI_SPEED_MS, type AiSpeed } from './components/aiSpeed'
import { WdlBar } from './components/WdlBar'
import { HorizontalWdlBar } from './components/HorizontalWdlBar'
import { EngineOptionControl } from './components/EngineOptionControl'
import { MoveListTree } from './components/MoveListTree'
import { ReviewMoveList } from './components/ReviewMoveList'
import { WdlProgressGraph, WinrateGraph } from './components/TrendGraph'
import { useElementHeight } from './hooks/useElementWidth'
import { useModalFocus } from './hooks/useModalFocus'
import { useMoveSound } from './hooks/useMoveSound'
import { IconBot, IconBarChart, IconSearch, IconSwords, IconAlert, IconKing, IconRefresh, IconFlag, IconFlip, IconDownload, IconClipboard, IconUsers, IconZap, IconSettings, IconPlay, IconStop, IconTrendingUp, IconChevronLeft, IconChevronRight } from './components/icons'
import { isPlainShortcut, isTypingTarget } from './components/shortcutKeys'
import { CommandPaletteDialog } from './components/CommandPaletteDialog'
import type { Command } from './components/commandPalette'
import { COMMAND_PALETTE_ARIA_KEYSHORTCUTS, commandPaletteShortcutLabel, isCommandPaletteChord } from './components/commandPalette'
import './App.css'

const NewGameDialog = lazy(() =>
  import('./components/NewGameDialog').then(module => ({ default: module.NewGameDialog })),
)
const PgnDialog = lazy(() =>
  import('./components/PgnDialog').then(module => ({ default: module.PgnDialog })),
)
/** Long enough that a fast sequence of moves writes once, not per move. */
const AUTO_SAVE_DEBOUNCE_MS = 700

const LibraryDialog = lazy(() =>
  import('./components/LibraryDialog').then(module => ({ default: module.LibraryDialog })),
)

type Orientation = 'white' | 'black'
type SampleLibraryFilter = 'all' | HistoricalSampleFormat
type PromotionPiece = 'q' | 'r' | 'b' | 'n'
type PendingPromotion = { from: Square; to: Square }
type ImportSweepProgress = { done: number; total: number; sampledFrom?: number }
type ReviewPracticeState = {
  beforeFen: string
  /** The node the exercise began from -- on the game, which is where Done goes back to. */
  beforeNodeId: string
  expectedUci: string
  expectedSan: string
  moveLabel: string
  attempts: number
  status: 'ready' | 'retry' | 'correct'
  solvedFen?: string
}

// Classic scrollbars take layout width from the stacked mobile layout; overlay
// scrollbars (every touch browser) take none. Measured once — it is a property
// of the browser, not of the page.
let cachedScrollbarWidth: number | null = null
const measureScrollbarWidth = () => {
  if (cachedScrollbarWidth !== null) return cachedScrollbarWidth
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll'
  document.body.append(probe)
  cachedScrollbarWidth = probe.offsetWidth - probe.clientWidth
  probe.remove()
  return cachedScrollbarWidth
}

const readViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
  rem: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
  scrollbar: measureScrollbarWidth(),
})

const LIGHT_SCHEME_QUERY = '(prefers-color-scheme: light)'
const readSystemPrefersLight = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(LIGHT_SCHEME_QUERY).matches)
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const readReducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches)

const LICHESS_TOKEN_PAGE_URL = 'https://lichess.org/account/oauth/token/create?'
const SAMPLE_PGN_CACHE_LIMIT = 12
const DEFAULT_LEFT_PANEL_WIDTH = 320
const OPENING_RATING_PRESETS: Array<{ id: OpeningRatingPresetId; label: string; ratings: number[] }> = [
  { id: 'all', label: 'All ratings', ratings: [] },
  { id: 'club', label: '1600-2200', ratings: [1600, 1800, 2000, 2200] },
  { id: 'advanced', label: '2000+', ratings: [2000, 2200, 2500] },
]
const PROMOTION_OPTIONS: Array<{ piece: PromotionPiece; label: string }> = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
]
const PROMOTION_KEYS: Record<string, PromotionPiece | undefined> = {
  q: 'q', r: 'r', b: 'b', n: 'n',
}
const PROMOTION_GLYPHS: Record<'w' | 'b', Record<PromotionPiece, string>> = {
  w: { q: '♕', r: '♖', b: '♗', n: '♘' },
  b: { q: '♛', r: '♜', b: '♝', n: '♞' },
}
/**
 * A hint answers "what is best here?", so it is asked at full strength rather
 * than at whatever the opponent has been set to.
 */
const HINT_DIFFICULTY: AiDifficulty = 8
const IMPORT_LOAD_MOVETIME_MS = 70
const IMPORT_SHALLOW_MULTIPV = 1
const MOVE_PONDER_MIN_DEPTH = 20
const IMPORT_SWEEP_MOVETIME_MS = 70
const IMPORT_SWEEP_TARGET_LIMIT = 80
const IMPORT_SWEEP_MULTIPV = 1
const AUTO_ANALYZE_DEBOUNCE_MS = 140
// Long enough to be worth trusting on a threat, short enough that the main
// analysis is only interrupted for a moment.
const THREAT_MOVETIME_MS = 700
const REVIEW_BOOK_PREFETCH_LIMIT = 30
const REVIEW_BOOK_VISIBLE_LIMIT = 14
const SEARCH_MOVES_HELP_ID = 'search-moves-help'

const analyzePresets: Array<{ id: AnalyzePresetId; label: string; summary: string }> = [
  { id: 'blunder-check', label: 'Fast Blunder Check', summary: 'Quick scan after each move.' },
  { id: 'game-review', label: 'Game Review', summary: 'Balanced depth across the line.' },
  { id: 'deep-candidate', label: 'Deep Candidate Search', summary: 'Higher depth and wider MultiPV.' },
  { id: 'mate-hunt', label: 'Mate Hunt', summary: 'Prioritize forced mating lines.' },
]

const REVIEW_SIDE_FILTERS: Array<{ id: ReviewSideFilter; label: string }> = [
  { id: 'both', label: 'Both' },
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
]


type AnalysisTarget = {
  fen: string
  rootFen: string
  pathMovesKey: string
}

type PgnImportOptions = {
  analyzeAfterLoad?: boolean
  fromSample?: boolean
}

type FenLoadOptions = {
  forceAnalysis?: boolean
}
















function DialogLoadingFallback({ label }: { label: string }) {
  return (
    <div className="lazy-dialog-backdrop">
      <div className="lazy-dialog-panel" role="dialog" aria-modal="true" aria-label={label} aria-live="polite">
        <span className="lazy-dialog-spinner" aria-hidden="true" />
        <span>{label}</span>
      </div>
    </div>
  )
}

function resultLabel(result: HistoricalSampleGame['result']): string {
  if (result === '1-0') return 'White won'
  if (result === '0-1') return 'Black won'
  return 'Draw'
}

// Defaults draw a 1/5-square arrow from square centre, which buries the piece it
// points at. Narrower, and started at the base of the piece, keeps both readable.
const BOARD_ARROW_OPTIONS = {
  ...defaultArrowOptions,
  arrowWidthDenominator: 7,
  arrowStartOffset: 0.32,
  // Arrows the reader drags with the right button. The library's amber default
  // is the colour this board already uses for the move that was played, so a
  // drawn arrow would have claimed to be something it is not.
  color: MARK_COLORS.primary,
  secondaryColor: MARK_COLORS.alternate,
  tertiaryColor: MARK_COLORS.tertiary,
}

/**
 * What Settings tells the reader they can press. It is the only place in the
 * app that answers the question, so anything the keydown handler claims and
 * this list omits is a shortcut nobody finds — the command palette was exactly
 * that, documented in the README and nowhere the app itself would show it.
 *
 * The palette chord is built rather than written out, so the list cannot say
 * Ctrl on a Mac.
 */
const KEYBOARD_SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['N'], action: 'New game' },
  { keys: ['←', '→'], action: 'Previous / next move' },
  { keys: ['↑', '↓'], action: 'Previous / next variation at this move' },
  { keys: ['Home', 'End'], action: 'First / last position' },
  { keys: ['F'], action: 'Flip the board' },
  { keys: ['T'], action: 'Show what the opponent threatens (Analysis mode)' },
  { keys: ['Z'], action: 'Take back your last move (Play mode)' },
  { keys: ['H'], action: 'Ask the engine for a hint (Play mode)' },
  { keys: ['Space'], action: 'Pause or resume the AI (Play mode)' },
  { keys: [commandPaletteShortcutLabel()], action: 'Open the command palette' },
]

/**
 * A queued premove. Its own colour again: amber is the move that was played,
 * violet the threat, red-to-green the engine's candidates, and blue the
 * reader's own marks — so a move the reader has *committed to* takes the one
 * shape none of those use, a dashed ring in the mark family's blue.
 */
const PREMOVE_SQUARE_STYLE = {
  boxShadow: `inset 0 0 0 4px ${MARK_COLORS.primary}`,
  backgroundColor: 'rgba(59, 130, 246, 0.28)',
}

/**
 * The two squares of a move being previewed. Green, because a previewed move is
 * one the engine put in a line -- the same thing the candidate arrows and the
 * hint mean -- rather than anything the reader claimed about the square.
 */
const PREVIEW_SQUARE_STYLE = {
  boxShadow: 'inset 0 0 0 3px rgba(63, 185, 80, 0.85)',
  backgroundColor: 'rgba(63, 185, 80, 0.22)',
}

const NOTATION_BASE_STYLE = {
  position: 'absolute' as const,
  fontWeight: 700,
  lineHeight: 1,
  userSelect: 'none' as const,
  pointerEvents: 'none' as const,
}

function notationStyle(color: string) {
  return { color }
}

function uniqueSquares(squares: Square[]): Square[] {
  return Array.from(new Set(squares))
}

function playerColorToTurn(color: PlayerColor): 'w' | 'b' {
  return color === 'white' ? 'w' : 'b'
}



function loadSharedFenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const sharedFen = parseFenShareHash(window.location.hash)
  if (!sharedFen) return null

  const validation = validateFenForAnalysis(sharedFen)
  return validation.ok ? validation.fen : null
}

function App() {
  // ── Chess game instance ──────────────────────────────
  const sharedInitialFen = useMemo(() => loadSharedFenFromUrl(), [])
  const game = useMemo(() => sharedInitialFen ? new Chess(sharedInitialFen) : new Chess(), [sharedInitialFen])
  const [fen, setFen] = useState(game.fen())
  const [orientation, setOrientation] = useState<Orientation>('white')
  const persistedSettings = useMemo(() => loadPersistedSettings(), [])
  const initialWorkspaceMode: WorkspaceMode = sharedInitialFen ? 'analysis' : persistedSettings.workspaceMode
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialWorkspaceMode)
  const engineEnabled = workspaceMode === 'analysis'

  // ── Layout ───────────────────────────────────────────
  const [topPanelOpen, setTopPanelOpen] = useState(true)
  const [leftWidth, setLeftWidth] = useState(initialWorkspaceMode === 'play' ? 0 : DEFAULT_LEFT_PANEL_WIDTH)
  const [rightWidth, setRightWidth] = useState(320)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsBodyRef = useRef<HTMLDivElement>(null)
  const openingIntelRef = useRef<HTMLDivElement>(null)
  const mainContainerRef = useRef<HTMLDivElement>(null)
  const boardStageRef = useRef<HTMLElement>(null)
  const analysisPanelRef = useRef<HTMLElement>(null)
  const revealOpeningIntelRef = useRef(false)
  const [viewport, setViewport] = useState(readViewport)
  /**
   * The OS-level request for less motion. The app's own scrolling already
   * honoured it; the board animated every move at the library's default
   * regardless, which is the one animation on the page a reader cannot avoid.
   */
  const [reduceMotion, setReduceMotion] = useState(readReducedMotion)
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION_QUERY)
    if (!query) return
    const onChange = () => setReduceMotion(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  /**
   * Whether the layout is stacked. Derived once and depended on by name: the
   * effects below used `viewport.width`, which changes on every pixel of a
   * window drag, to answer a question that changes twice.
   */
  const isMobileLayout = isMobileViewport(viewport)
  // The stage is sized by the row it sits in, never by the board inside it, so
  // it is safe to measure and size the board from.
  const stageHeight = useElementHeight(boardStageRef, viewport.height)
  const hasAutoOpenedAnalysisLeftRef = useRef(initialWorkspaceMode === 'analysis')

  // ── Engine settings ──────────────────────────────────
  const [searchDepth, setSearchDepth] = useState(persistedSettings.searchDepth)
  const [multiPv, setMultiPv] = useState(persistedSettings.multiPv)
  const [hashMb, setHashMb] = useState(persistedSettings.hashMb)
  const [showWdl, setShowWdl] = useState(persistedSettings.showWdl)
  const [autoAnalyze, setAutoAnalyze] = useState(persistedSettings.autoAnalyze)
  const [engineProfile, setEngineProfile] = useState<EngineProfileId>(persistedSettings.engineProfile)
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>(persistedSettings.analysisTab)
  const [analysisExperience, setAnalysisExperience] = useState<AnalysisExperience>(persistedSettings.analysisExperience)
  const [reviewSideFilter, setReviewSideFilter] = useState<ReviewSideFilter>('both')
  const [reviewPhaseFilter, setReviewPhaseFilter] = useState<ReviewPhaseFilter>('all')
  const [activePreset, setActivePreset] = useState<AnalyzePresetId | null>(persistedSettings.activePreset)
  const [analyzeMode, setAnalyzeMode] = useState<AnalyzeMode>(persistedSettings.analyzeMode)
  const [showAdvancedAnalyze, setShowAdvancedAnalyze] = useState(persistedSettings.showAdvancedAnalyze)
  const [quickMovetimeMs, setQuickMovetimeMs] = useState<NumericInputValue>(persistedSettings.quickMovetimeMs)
  const [mateTarget, setMateTarget] = useState<NumericInputValue>(persistedSettings.mateTarget)
  const [limitNodes, setLimitNodes] = useState<NumericInputValue>(persistedSettings.limitNodes ?? '')
  const [searchMovesInput, setSearchMovesInput] = useState(persistedSettings.searchMovesInput)
  const searchMovesFenRef = useRef(fen)
  const [useClockLimits, setUseClockLimits] = useState(persistedSettings.useClockLimits)
  const [whiteTimeMs, setWhiteTimeMs] = useState<NumericInputValue>(persistedSettings.whiteTimeMs)
  const [blackTimeMs, setBlackTimeMs] = useState<NumericInputValue>(persistedSettings.blackTimeMs)
  const [whiteIncMs, setWhiteIncMs] = useState<NumericInputValue>(persistedSettings.whiteIncMs)
  const [blackIncMs, setBlackIncMs] = useState<NumericInputValue>(persistedSettings.blackIncMs)
  const [movesToGo, setMovesToGo] = useState<NumericInputValue>(persistedSettings.movesToGo ?? '')
  const [engineLabCommand, setEngineLabCommand] = useState('')
  const [engineLabError, setEngineLabError] = useState<string | null>(null)
  const [engineLabOutputLines, setEngineLabOutputLines] = useState<string[]>([])
  const [engineLabCopyStatus, setEngineLabCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [expertModeEnabled, setExpertModeEnabled] = useState(persistedSettings.expertModeEnabled)
  const [labCommandHistory, setLabCommandHistory] = useState<string[]>(persistedSettings.labCommandHistory)
  const [lastLabRun, setLastLabRun] = useState<{ command: string; durationMs: number } | null>(null)
  const [openingSource, setOpeningSource] = useState<OpeningDatabaseSource>(persistedSettings.openingSource)
  const [openingSpeeds, setOpeningSpeeds] = useState<OpeningSpeed[]>(persistedSettings.openingSpeeds)
  const [openingRatingPreset, setOpeningRatingPreset] = useState<OpeningRatingPresetId>(persistedSettings.openingRatingPreset)
  const [openingAuthToken, setOpeningAuthToken] = useState('')
  const [reviewBookError, setReviewBookError] = useState<string | null>(null)
  const [reviewBookTerminalPly, setReviewBookTerminalPly] = useState<number | null>(null)
  const [showBoardArrows, setShowBoardArrows] = useState<boolean>(persistedSettings.showBoardArrows)
  const [showTopMoveArrows, setShowTopMoveArrows] = useState<boolean>(persistedSettings.showTopMoveArrows)
  const [topMoveArrowCount, setTopMoveArrowCount] = useState<number>(persistedSettings.topMoveArrowCount)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(persistedSettings.soundEnabled)
  const [blunderNudges, setBlunderNudges] = useState<boolean>(persistedSettings.blunderNudges)
  // Read by the AI loop, which must not re-install when the switch changes.
  const blunderNudgesRef = useRef(blunderNudges)
  blunderNudgesRef.current = blunderNudges
  /**
   * The opponent's reading before its previous move, so the one after the
   * human's reply can be compared with it. Null whenever the two would not be
   * consecutive: a new game, a takeback, a navigation, a position handed over.
   */
  const lastAiSearchRef = useRef<AiSearchReading | null>(null)
  /** The human's last move, when the opponent's searches say it was a mistake. */
  const [blunderNudge, setBlunderNudge] = useState<(MoveJudgement & { san: string; fen: string }) | null>(null)
  const [timeControlId, setTimeControlId] = useState<string>(persistedSettings.timeControlId)
  const [boardThemeId, setBoardThemeId] = useState<string>(persistedSettings.boardThemeId)
  const boardTheme = useMemo(() => boardThemeById(boardThemeId), [boardThemeId])
  const [theme, setTheme] = useState<ThemePreference>(persistedSettings.theme)
  const [systemPrefersLight, setSystemPrefersLight] = useState(readSystemPrefersLight)
  useEffect(() => {
    const query = window.matchMedia?.(LIGHT_SCHEME_QUERY)
    if (!query) return
    const onChange = () => setSystemPrefersLight(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  const resolvedTheme = resolveTheme(theme, systemPrefersLight)
  /**
   * The theme is a document-level fact -- the tokens live on :root and the
   * browser draws its own scrollbars and form controls from color-scheme --
   * so it is written to the root element and the meta tag rather than to any
   * component. Dark is the app's own look and the default; nothing here runs
   * for a reader who never touched the switch except writing "dark" where
   * "dark" already was.
   */
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    if (meta) meta.content = resolvedTheme
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor) themeColor.content = resolvedTheme === 'light' ? '#f3f4f6' : '#0d1117'
  }, [resolvedTheme])
  /** Null whenever the game is untimed, which is the default and most of the time. */
  const [clock, setClock] = useState<ClockState | null>(null)
  /**
   * Who has given up, if anyone. Held beside the board rather than in it,
   * because a resignation leaves an ordinary position -- the same reason the
   * clock's flag lives out here.
   */
  const [resignedBy, setResignedBy] = useState<ResignedBy | null>(null)
  /**
   * Whether Resign is one click from happening. Two clicks rather than a
   * modal: a misclick that ends a game is worth guarding against, and a dialog
   * for it would be heavier than the action deserves.
   */
  const [resignArmed, setResignArmed] = useState(false)
  // The AI loop is an effect that must not re-install on every clock change,
  // and a clock changes on every move. Same shape as gameTreeRef.
  const endedOffBoardRef = useRef<'w' | 'b' | null>(null)
  const clockFlagged = clock?.flagged ?? null
  // A flag and a resignation end the game identically as far as the board is
  // concerned: the position stays legal, so everything that asks "is there
  // still a game here" has to be told separately.
  const endedOffBoard = clockFlagged ?? resignedBy
  endedOffBoardRef.current = endedOffBoard
  // Read by the auto-save, which must not list the clock as a dependency: the
  // clock changes on every move and the save is already debounced on the tree.
  const clockRef = useRef<ClockState | null>(null)
  const playSessionRef = useRef<AutoSavedPlay | undefined>(undefined)
  const timeControlIdRef = useRef(timeControlId)
  timeControlIdRef.current = timeControlId
  const [openingPrefetchTick, setOpeningPrefetchTick] = useState(0)
  const [sampleFilter, setSampleFilter] = useState<SampleLibraryFilter>('all')
  const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null)
  const [sampleLoadError, setSampleLoadError] = useState<string | null>(null)
  const [isImportingGame, setIsImportingGame] = useState(false)
  const [boardRevealTick, setBoardRevealTick] = useState(0)
  const [analysisPanelRevealTick, setAnalysisPanelRevealTick] = useState(0)
  const [pendingShallowAnalyzeFen, setPendingShallowAnalyzeFen] = useState<string | null>(null)
  const [pendingPonderFen, setPendingPonderFen] = useState<string | null>(null)
  // The null-move position the "What is threatened?" probe is asking about, and
  // the board position it was asked for. Kept apart so a stale answer is never
  // shown against a position it was not computed for.
  const [threatRequest, setThreatRequest] = useState<{ boardFen: string; probeFen: string } | null>(null)
  const [threatResult, setThreatResult] = useState<
    { boardFen: string; uci: string; san: string; evaluation: string } | null
  >(null)
  const [threatError, setThreatError] = useState<string | null>(null)
  const threatSettledRef = useRef<string | null>(null)
  // A review asked for from Play mode, which cannot start until the workspace
  // has actually switched and the analysis engine is up.
  const [pendingGameReview, setPendingGameReview] = useState(false)
  const [reviewPractice, setReviewPractice] = useState<ReviewPracticeState | null>(null)
  const [importSweepProgress, setImportSweepProgress] = useState<ImportSweepProgress>({ done: 0, total: 0 })
  const skipFullAnalyzeFenRef = useRef<string | null>(null)
  const importSweepQueueRef = useRef<ImportSweepTarget[]>([])
  const activeImportSweepRef = useRef<ImportSweepTarget | null>(null)
  const samplePgnCacheRef = useRef<Map<string, string>>(new Map())
  const sampleFetchControllerRef = useRef<AbortController | null>(null)
  const sampleLoadSeqRef = useRef(0)

  // ── Evaluations ──────────────────────────────────────
  const [evaluationsByFen, setEvaluationsByFen] = useState<Map<string, EvalSnapshot>>(new Map())
  const [pgnHeaders, setPgnHeaders] = useState<Record<string, string>>({})

  // ── Game mode ────────────────────────────────────────
  const [showNewGameDialog, setShowNewGameDialog] = useState(false)
  const [showPgnDialog, setShowPgnDialog] = useState(false)
  const [showLibraryDialog, setShowLibraryDialog] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  /**
   * A word about what just happened -- "FEN copied" -- for the commands that
   * otherwise finish in silence. One at a time and gone in a moment; it is a
   * receipt, not a log.
   */
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const announce = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null
      setNotice(null)
    }, 2400)
  }, [])
  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
  }, [])
  const [autoSaveRecovery, setAutoSaveRecovery] = useState<AutoSavedGame | null>(null)
  const [autoSaveRestoreError, setAutoSaveRestoreError] = useState<string | null>(null)
  const [autoSaveCopyLabel, setAutoSaveCopyLabel] = useState('Copy PGN')
  const [gameMode, setGameMode] = useState<GameMode>('human-vs-human')
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white')
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>(4)
  const [isAiThinking, setIsAiThinking] = useState(false)
  const aiMoveScheduledRef = useRef(false)
  const gameModeRef = useRef<GameMode>('human-vs-human')
  const playerColorRef = useRef<PlayerColor>('white')
  const modalTriggerRef = useRef<HTMLElement | null>(null)
  gameModeRef.current = gameMode
  playerColorRef.current = playerColor

  // ── Click-to-move (tap support) ───────────────────────
  const restoreBoardFocusRef = useRef<Square | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [legalTargets, setLegalTargets] = useState<Square[]>([])
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  // Squares the reader right-clicked. Arrows they drag are the library's own
  // state; only the squares are ours, because it has no notion of them.
  const [markedSquares, setMarkedSquares] = useState<SquareMarks>({})
  /** A move queued while the engine is thinking. One at a time, like everywhere else. */
  const [premove, setPremove] = useState<Premove | null>(null)
  /** The move a hint suggested, and whether one is being searched for. */
  const [hintMove, setHintMove] = useState<string | null>(null)
  const [isHinting, setIsHinting] = useState(false)
  /**
   * A position from an engine line, shown on the board while the reader points
   * at the move -- and gone when they point somewhere else.
   *
   * Clicking a principal variation walks into it for real, as a variation that
   * can be reviewed or discarded. That is the right thing to *do* with a line
   * and the wrong thing to do to *read* one: a reader comparing three lines had
   * to commit to each and navigate back out, leaving three branches behind.
   * Nibbler answers it by playing the line out on the board without changing
   * the position being analysed, which is what this is. Nothing else moves --
   * not the evaluation, not the move list, not the engine.
   */
  const [linePreview, setLinePreview] = useState<{ fen: string; uci: string; label: string } | null>(null)
  const rightClickAnchorRef = useRef<string | null>(null)
  const promotionDialogRef = useRef<HTMLDivElement>(null)

  // ── AI speed (throttle delay between AI moves) ───────
  const [aiSpeed, setAiSpeed] = useState<AiSpeed>('normal')
  const aiSpeedRef = useRef<AiSpeed>('normal')
  const stepPendingRef = useRef(false) // for Step mode: advance one move on demand
  const [stepRequestTick, setStepRequestTick] = useState(0)

  const handleSpeedChange = useCallback((s: AiSpeed) => {
    setAiSpeed(s)
    aiSpeedRef.current = s
  }, [])

  // ── Pause state ──────────────────────────────────────
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  /**
   * Pause stops the clock as well as the AI. It is the only way to step away
   * from a timed game, and a pause that left the clock running would be worse
   * than no pause at all.
   *
   * The side to move is read back from the board on resume rather than
   * remembered, because navigating the move list while paused can move it.
   */
  const pause = useCallback(() => {
    pausedRef.current = true
    setPaused(true)
    setIsAiThinking(false)
    setClock(previous => (previous ? pauseClock(previous, Date.now()) : previous))
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    setPaused(false)
    aiMoveScheduledRef.current = false
    setClock(previous => (previous && !previous.flagged ? startSide(previous, game.turn(), Date.now()) : previous))
    // `setPaused(false)` is what re-enters the AI loop: `paused` is one of that
    // effect's dependencies. This used to also call `setFen(f => f)`, commented
    // "nudge AI effect", which cannot do that -- React bails out of a state
    // update to an Object.is-equal value, so no dependency changed and no
    // effect re-ran. It was doing nothing, next to the line that does the job.
  }, [game])

  // ── Game tree ────────────────────────────────────────
  const gameTree = useGameTree(sharedInitialFen ?? undefined)
  // Stable ref so the AI-loop effect can call addMove without
  // including the (ever-changing) gameTree object in its dep array.
  const gameTreeRef = useRef(gameTree)
  gameTreeRef.current = gameTree

  const clearImportSweep = useCallback(() => {
    importSweepQueueRef.current = []
    activeImportSweepRef.current = null
    setImportSweepProgress({ done: 0, total: 0 })
    setPendingPonderFen(null)
  }, [])

  const syncGameToNode = useCallback((chess: Chess) => {
    game.load(chess.fen())
    setFen(chess.fen())
    aiMoveScheduledRef.current = false
    setPendingPromotion(null)
    setSelectedSquare(null)
    setLegalTargets([])
    // A premove was queued against the position you were looking at. Take the
    // board anywhere else -- navigate, take a move back -- and it is a move for
    // a game that no longer exists: without this, a takeback played the queued
    // move the instant it handed you the turn. A hint is the same: it answers a
    // question about one position and means nothing at another.
    setPremove(null)
    setHintMove(null)
    // The nudge is about the move that got the board here, and the readings
    // it compares are consecutive only while the game goes forward.
    setBlunderNudge(null)
    lastAiSearchRef.current = null
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

  const navigateAndPonder = useCallback((chess: Chess | null) => {
    if (!chess) return
    if (!engineEnabled) {
      navigateAndPause(chess)
      return
    }
    setPendingPonderFen(chess.fen())
    navigateAndPause(chess)
  }, [engineEnabled, navigateAndPause])

  // ── Playback helpers for WatchControls ───────────────
  const currentPathNodes = useMemo(() => gameTree.currentPath(), [gameTree])
  const currentPathMoves = useMemo(
    () => currentPathNodes.slice(1).map(node => node.uci).filter(Boolean),
    [currentPathNodes],
  )
  const currentPathMovesKey = currentPathMoves.join(' ')
  const currentRootFen = gameTree.root.fen
  const [settledAnalysisTarget, setSettledAnalysisTarget] = useState<AnalysisTarget>(() => ({
    fen: game.fen(),
    rootFen: currentRootFen,
    pathMovesKey: '',
  }))
  const openingRatings = useMemo(
    () => OPENING_RATING_PRESETS.find(preset => preset.id === openingRatingPreset)?.ratings ?? [],
    [openingRatingPreset],
  )
  const openingRequestSpeeds = openingSource === 'lichess' ? openingSpeeds : undefined
  const openingRequestRatings = openingSource === 'lichess' ? openingRatings : undefined
  const hasOpeningExplorerToken = hasOpeningExplorerAuthToken(openingAuthToken)
  const openingExplorer = useOpeningExplorer({
    source: openingSource,
    fen: currentRootFen,
    moves: currentPathMoves,
    speeds: openingRequestSpeeds,
    ratings: openingRequestRatings,
    authToken: openingAuthToken,
    enabled: workspaceMode === 'analysis'
      && (analysisTab === 'analyze' || (analysisTab === 'engine-lab' && hasOpeningExplorerToken)),
  })
  const filteredSampleGames = useMemo(
    () => historicalSampleGames.filter(sample => sampleFilter === 'all' || sample.format === sampleFilter),
    [sampleFilter],
  )
  const isImportSweepActive = importSweepProgress.total > 0 && importSweepProgress.done < importSweepProgress.total
  const openingFenPath = useMemo(() => currentPathNodes.map(n => n.fen), [currentPathNodes])
  const shouldLoadOpeningNames = currentPathNodes.length > 1
  const opening = useOpening(openingFenPath, shouldLoadOpeningNames)
  // For the review's Book label: the same table the opening name reads,
  // loaded whenever the engine is, which is the only time a review can run.
  const isBookPosition = useOpeningBook(engineEnabled)
  const canGoBack = currentPathNodes.length > 1
  const canGoForward = gameTree.current.children.length > 0
  const appModalOpen = showNewGameDialog || showPgnDialog || showLibraryDialog || autoSaveRecovery !== null
  const promotionDialogOpen = pendingPromotion !== null
  const topChromeHidden = appModalOpen || promotionDialogOpen
  const backgroundUiHidden = appModalOpen || settingsOpen || promotionDialogOpen
  const dialogLoadingLabel = showNewGameDialog
    ? 'Loading new game...'
    : showLibraryDialog
      ? 'Loading library...'
      : 'Loading import tools...'
  const shortcutsSuspended =
    appModalOpen || settingsOpen || promotionDialogOpen

  useEffect(() => {
    if (workspaceMode !== 'analysis') return
    if (hasAutoOpenedAnalysisLeftRef.current) return
    hasAutoOpenedAnalysisLeftRef.current = true
    setLeftWidth(width => width === 0 ? DEFAULT_LEFT_PANEL_WIDTH : width)
  }, [workspaceMode])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Keep the identity when nothing changed. The auto-analyze effect
      // depends on this object, and on mount the target is already the
      // board position: switching to Analysis inside these 140ms fired that
      // effect once against the initial value and once more against an
      // identical replacement, which asked the engine for the same search
      // twice. A real engine is still booting and takes the second request
      // quietly; one that had already started answered with a stop and a
      // restart, which is how the browser harness found it.
      setSettledAnalysisTarget(previous => (
        previous.fen === fen
          && previous.rootFen === currentRootFen
          && previous.pathMovesKey === currentPathMovesKey
          ? previous
          : { fen, rootFen: currentRootFen, pathMovesKey: currentPathMovesKey }
      ))
    }, AUTO_ANALYZE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [currentPathMovesKey, currentRootFen, fen])

  const goFirst = useCallback(() => {
    const root = gameTree.root
    navigateAndPonder(gameTree.navigateTo(root.id))
  }, [gameTree, navigateAndPonder])

  const goPrev = useCallback(() => {
    navigateAndPonder(gameTree.goBack())
  }, [gameTree, navigateAndPonder])

  const goNext = useCallback(() => {
    navigateAndPonder(gameTree.goForward())
  }, [gameTree, navigateAndPonder])

  const goLast = useCallback(() => {
    // Walk first-child chain to tip
    const nodes = gameTree.mainLine()
    const tip = nodes[nodes.length - 1]
    if (tip) navigateAndPonder(gameTree.navigateTo(tip.id))
  }, [gameTree, navigateAndPonder])

  /**
   * Step to the variation beside this one at the same fork -- what ↑ and ↓
   * do in every desktop GUI, and what this app had no key for: the only way
   * from 2. Nf3 to the 2. Nc3 beside it was the mouse.
   *
   * Returns whether there was a fork to step within at all, because that is
   * what decides whether the key is the app's: with nothing to step between,
   * ↑ and ↓ stay the browser's and scroll the panel the reader is in.
   */
  const goSiblingVariation = useCallback((direction: -1 | 1): boolean => {
    const tree = gameTreeRef.current
    if (!hasSiblingVariations(tree.nodesSnapshot, tree.current.id)) return false
    const target = siblingVariation(tree.nodesSnapshot, tree.current.id, direction)
    if (target) navigateAndPonder(tree.navigateTo(target))
    return true
  }, [navigateAndPonder])
  const atVariationFork = hasSiblingVariations(gameTree.nodesSnapshot, gameTree.current.id)

  /**
   * Assigned on every render so the global keydown handler, installed well
   * before `requestThreat` is declared, can reach the current one without
   * listing it as a dependency. The same shape `gameTreeRef` uses, and for the
   * same reason: re-installing the handler on every render of a component that
   * re-renders several times a second is not free.
   */
  const requestThreatRef = useRef<() => void>(() => {})
  /** Same reason as `requestThreatRef`: the keydown handler predates it. */
  const takebackMoveRef = useRef<() => void>(() => {})
  /** Same again: New Game is declared with the other dialog openers, below. */
  const openNewGameDialogRef = useRef<() => void>(() => {})

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (shortcutsSuspended) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      // The one chord this app claims. Command/Control+K is the near-universal
      // binding for a command palette, and no browser owns it. Declared before
      // the typing-target check on purpose: it should open from a text field
      // too, which is where a reader often is when they reach for it.
      if (isCommandPaletteChord(e)) {
        e.preventDefault()
        setShowCommandPalette(open => !open)
        return
      }
      if (isTypingTarget(target)) return
      // Every other shortcut below is a bare key, so a chord belongs to the browser.
      // Without this, Command+F flipped the board and swallowed Find, and
      // Alt/Command with an arrow stepped through the game instead of going
      // back. web-katrain's registry matches modifiers per binding; this is the
      // same rule for an app with six shortcuts.
      if (!isPlainShortcut(e)) return

      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      // Claimed only at a fork; see goSiblingVariation for why.
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (goSiblingVariation(e.key === 'ArrowUp' ? -1 : 1)) e.preventDefault()
      }
      if (e.key === 'Home') { e.preventDefault(); goFirst() }
      if (e.key === 'End') { e.preventDefault(); goLast() }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOrientation(value => value === 'white' ? 'black' : 'white')
      }
      // The command palette printed "N" beside New game from the day it landed
      // and nothing here answered it. A shortcut a reader is shown and cannot
      // press is worse than one that is not offered: the palette, this handler
      // and the Settings list are the app's three answers to "what can I
      // press", and they have to agree. It opens a dialog with a Cancel, which
      // is the whole reason it is safe to bind a bare letter to.
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openNewGameDialogRef.current()
      }
      if (e.key.toLowerCase() === 't' && workspaceMode === 'analysis') {
        e.preventDefault()
        requestThreatRef.current()
      }
      // Z rather than Ctrl+Z: the chord belongs to the browser, and
      // `isPlainShortcut` above is what keeps it there.
      if (e.key.toLowerCase() === 'z' && workspaceMode === 'play') {
        e.preventDefault()
        takebackMoveRef.current()
      }
      if (e.key.toLowerCase() === 'h' && workspaceMode === 'play') {
        e.preventDefault()
        requestHintRef.current()
      }
      if (e.key === ' ' && workspaceMode === 'play') {
        if (tag === 'BUTTON') return
        e.preventDefault()
        if (pausedRef.current) resume()
        else pause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goFirst, goLast, goPrev, goNext, goSiblingVariation, pause, resume, shortcutsSuspended, workspaceMode])

  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const closeCommandPalette = useCallback(() => setShowCommandPalette(false), [])
  const openCommandPalette = useCallback(() => setShowCommandPalette(true), [])
  useModalFocus(settingsOpen, settingsBodyRef, closeSettings)

  // No wheel-to-navigate; it conflicts with trackpads and touch.

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
    capabilities,
    activeProfile,
    profileMessage,
    analyze,
    sendCommand,
    newGame,
    stop,
    setOption,
    lastBestMoveFen,
    lastPonderMoveFen,
  } = useStockfishEngine(engineProfile, engineEnabled)
  const analysisStatusAnnouncement = `${engineName}. ${status}. ${analysisExperience === 'beginner' ? 'Coach view' : 'Pro view'}.`

  // ── Batch Review ─────────────────────────────────────
  const [isBatchReviewing, setIsBatchReviewing] = useState(false)
  const [batchReviewProgress, setBatchReviewProgress] = useState({ done: 0, total: 0 })
  // A percentage, because the Evaluated tile beside it shows a fraction of a
  // different thing — moves on the visible side, against this button's engine
  // searches — and two bare n/m readouts that disagree read as a bug.
  const batchReviewPercent = batchReviewProgress.total > 0
    ? Math.round((batchReviewProgress.done / batchReviewProgress.total) * 100)
    : 0
  const batchReviewQueueRef = useRef<BatchReviewTarget[]>([])
  const activeBatchReviewRef = useRef<BatchReviewTarget | null>(null)
  const tablebase = useTablebase({
    fen,
    enabled: workspaceMode === 'analysis',
  })
  const {
    error: cloudEvalError,
    multiPv: cloudEvalMultiPv,
    result: currentCloudEval,
    status: cloudEvalStatus,
  } = useCloudEvaluation({
    fen,
    multiPv,
    enabled: shouldFetchCloudEvaluation({
      engineEnabled,
      isBatchReviewing,
      isImportingGame,
      tablebaseEligible: tablebase.eligible,
      tablebaseStatus: tablebase.status,
    }),
  })

  const clearBatchReview = useCallback(() => {
    batchReviewQueueRef.current = []
    activeBatchReviewRef.current = null
    setIsBatchReviewing(false)
    setBatchReviewProgress({ done: 0, total: 0 })
  }, [])

  const stopBatchReview = useCallback(() => {
    clearBatchReview()
    stop()
  }, [clearBatchReview, stop])

  const cancelStaleBackgroundAnalysis = useCallback(() => {
    const hadImportSweep = importSweepProgress.total > 0
      || importSweepQueueRef.current.length > 0
      || activeImportSweepRef.current !== null
    const hadBatchReview = isBatchReviewing
      || batchReviewQueueRef.current.length > 0
      || activeBatchReviewRef.current !== null

    if (hadImportSweep) clearImportSweep()
    if (hadBatchReview) clearBatchReview()
    if (hadImportSweep || hadBatchReview) stop()
  }, [clearBatchReview, clearImportSweep, importSweepProgress.total, isBatchReviewing, stop])

  const startBatchReview = useCallback(() => {
    if (!engineEnabled) return
    // The line being read, not the game's main line -- see `reviewLineNodes`.
    const nodes = reviewLineNodesRef.current
    if (nodes.length <= 1) return

    const rootFen = gameTreeRef.current.root.fen
    const plan = planBatchReview(nodes, rootFen, evaluationsByFen, searchDepth)
    const targets = plan.queue
    clearImportSweep()
    setBatchReviewProgress({ done: plan.done, total: plan.total })
    if (!targets.length) {
      batchReviewQueueRef.current = []
      activeBatchReviewRef.current = null
      setIsBatchReviewing(false)
      stop()
      return
    }

    batchReviewQueueRef.current = targets
    activeBatchReviewRef.current = null
    setIsBatchReviewing(true)
    stop()
  }, [clearImportSweep, engineEnabled, evaluationsByFen, searchDepth, stop])

  useEffect(() => {
    if (!isBatchReviewing) return

    if (!engineEnabled || status === 'disabled' || status === 'error') {
      batchReviewQueueRef.current = []
      activeBatchReviewRef.current = null
      setIsBatchReviewing(false)
      return
    }

    if (activeBatchReviewRef.current && status === 'ready') {
      activeBatchReviewRef.current = null
      setBatchReviewProgress(previous => ({
        total: previous.total,
        done: Math.min(previous.total, previous.done + 1),
      }))
    }

    if (status !== 'ready') return
    if (activeBatchReviewRef.current) return

    const nextTarget = batchReviewQueueRef.current.shift()
    if (!nextTarget) {
      setIsBatchReviewing(false)
      return
    }

    activeBatchReviewRef.current = nextTarget
    analyze({
      fen: nextTarget.fen,
      purpose: 'batch-review',
      mode: 'review',
      limits: { depth: searchDepth },
      multiPv: 1,
      hashMb,
      showWdl,
      rootFen: nextTarget.rootFen,
      historyMoves: nextTarget.historyMoves,
    })
  }, [
    analyze,
    engineEnabled,
    hashMb,
    isBatchReviewing,
    searchDepth,
    showWdl,
    status,
  ])

  const aiEnabled = workspaceMode === 'play' && (gameMode === 'human-vs-ai' || gameMode === 'ai-vs-ai')
  const aiPlayer = useAiPlayer(aiEnabled)
  const aiPlayerStatus = aiPlayer.status
  const cancelAiRequest = aiPlayer.cancelRequest
  const requestAiMove = aiPlayer.requestMove
  const setAiPlayerDifficulty = aiPlayer.setDifficulty
  const readAiSearch = aiPlayer.readLastSearch
  const aiPlayerStatusRef = useRef(aiPlayerStatus)
  const [aiReadyTick, setAiReadyTick] = useState(0)

  /**
   * What the side to move in `searchFen` has on the clock, or null in an
   * untimed game. Read at the moment the search is asked for, so the speed
   * throttle's delay -- which is real time off that side's clock -- has already
   * come out of it.
   */
  const readClockForSearch = useCallback((searchFen: string) => {
    const clock = clockRef.current
    if (!clock) return null
    const side = searchFen.split(/\s+/)[1] === 'b' ? 'b' : 'w'
    return {
      remainingMs: remainingMs(clock, side, Date.now()),
      incrementMs: clock.control.incrementMs,
    }
  }, [])

  const cancelPendingAiMove = useCallback(() => {
    cancelAiRequest()
    aiMoveScheduledRef.current = false
    setIsAiThinking(false)
  }, [cancelAiRequest])

  /**
   * "How did I do?" — the question at the end of every game, which the app made
   * you answer in three steps: switch to Analysis, find the Review tab, press
   * Review Game. Play mode showed the result in the meta strip and offered
   * nothing to do about it.
   *
   * The review cannot start here: the engine is off in Play mode, and
   * `engineEnabled` only becomes true once the workspace switch has rendered.
   * So this asks, and the effect below starts it when the engine is actually up.
   */
  /**
   * Undo back to the last position the human was asked to move from.
   *
   * Reachable before this only as: left arrow, left arrow, play, space -- and
   * only correct at all since a played move started replacing the one it was
   * taken back over. Four keystrokes and a rule about variations is not a
   * takeback; a beginner who has just hung a queen needs a button.
   *
   * The clock is not refunded. Time spent is spent, which is what a takeback
   * does everywhere else it exists.
   */
  const takebackMove = useCallback(() => {
    const tree = gameTreeRef.current
    // The path to where the board *is*, not the whole main line: a takeback
    // undoes from the position in front of you, and after one the moves ahead
    // of the cursor are a line you already left.
    const line = tree.currentPath()
    const plies = takebackPlyCount({
      gameMode,
      playerColor,
      pliesPlayed: line.length - 1,
      turn: game.turn() === 'w' ? 'white' : 'black',
    })
    if (plies <= 0) return

    const target = line[line.length - 1 - plies]
    if (!target) return

    cancelPendingAiMove()
    const chess = tree.navigateTo(target.id)
    syncGameToNode(chess)
    // Straight back to playing: a takeback that leaves the game paused makes
    // the reader find the pause control before they can try again.
    pausedRef.current = false
    setPaused(false)
  }, [cancelPendingAiMove, game, gameMode, playerColor, syncGameToNode])
  takebackMoveRef.current = takebackMove

  /**
   * "What should I play here?", answered without leaving the game.
   *
   * At full strength rather than at the opponent's: the question is what the
   * best move is, not what a 1500 would find. `requestMove` re-applies the
   * difficulty whenever it changes, so the engine is back at the opponent's
   * setting by its own next move — no restore needed here, and none that could
   * be missed.
   */
  const requestHint = useCallback(() => {
    if (hintDisabledReason({
      workspaceMode,
      gameMode,
      turn: game.turn() === 'w' ? 'white' : 'black',
      playerColor,
      gameOver: game.isGameOver() || Boolean(endedOffBoardRef.current),
      engineReady: aiPlayerStatusRef.current === 'ready',
      busy: isHinting,
    })) return

    const askedFor = game.fen()
    setIsHinting(true)
    setHintMove(null)
    const tree = gameTreeRef.current
    const history = aiSearchHistory(
      askedFor,
      tree.current.fen,
      tree.root.fen,
      tree.currentPath().slice(1).map(node => node.uci),
    )
    // The clock is passed here too: a hint asked with eight seconds left
    // should answer in well under eight seconds, and it is your clock running
    // while it thinks.
    void requestAiMove(askedFor, HINT_DIFFICULTY, history, readClockForSearch(askedFor))
      .then(uci => {
        setIsHinting(false)
        // The board may have moved on while the engine was looking.
        if (!uci || game.fen() !== askedFor) return
        setHintMove(uci)
      })
      .catch(() => setIsHinting(false))
  }, [game, gameMode, isHinting, playerColor, readClockForSearch, requestAiMove, workspaceMode])
  const requestHintRef = useRef(requestHint)
  requestHintRef.current = requestHint

  const hintReason = hintDisabledReason({
    workspaceMode,
    gameMode,
    turn: game.turn() === 'w' ? 'white' : 'black',
    playerColor,
    gameOver: game.isGameOver() || Boolean(endedOffBoard),
    engineReady: aiPlayerStatus === 'ready',
    busy: isHinting,
  })
  const hintSan = hintMove ? uciToSan(fen, hintMove) : null

  const takebackPlies = takebackPlyCount({
    gameMode,
    playerColor,
    pliesPlayed: currentPathNodes.length - 1,
    turn: game.turn() === 'w' ? 'white' : 'black',
  })
  const takebackReason = takebackDisabledReason({
    gameMode,
    pliesPlayed: currentPathNodes.length - 1,
    plies: takebackPlies,
  })


  const reviewFinishedGame = useCallback(() => {
    cancelPendingAiMove()
    pause()
    setSettingsOpen(false)
    setWorkspaceMode('analysis')
    setAnalysisTab('review')
    setAnalysisPanelRevealTick(tick => tick + 1)
    setPendingGameReview(true)
  }, [cancelPendingAiMove, pause])

  useEffect(() => {
    if (!pendingGameReview) return
    // Going back to Play, or anywhere the engine is not, cancels the request
    // rather than leaving it armed for the next time Analysis is opened.
    if (!engineEnabled) {
      setPendingGameReview(false)
      return
    }
    if (status === 'error') {
      setPendingGameReview(false)
      return
    }
    // 'disabled' is precisely what the engine reports on the way out of Play
    // mode: the worker for Analysis has not booted yet. Treating it as a
    // failure -- which this did -- cancelled every request on the render right
    // after the click, so the button switched tabs and silently reviewed
    // nothing. Waiting through 'disabled' and 'loading' is the whole job.
    if (status !== 'ready') return
    setPendingGameReview(false)
    startBatchReview()
  }, [engineEnabled, pendingGameReview, startBatchReview, status])


  useEffect(() => {
    aiPlayerStatusRef.current = aiPlayerStatus
    if (aiPlayerStatus === 'ready') {
      setAiReadyTick(tick => tick + 1)
    }
  }, [aiPlayerStatus])

  useEffect(() => {
    if (workspaceMode !== 'play') return
    // Stop in-flight engine work, but keep the results. Evaluations are keyed by
    // FEN and the position has not changed — only the view has. Discarding them
    // threw away a whole game review the moment someone glanced at Play.
    stop()
    clearImportSweep()
    clearBatchReview()
    setPendingShallowAnalyzeFen(null)
  }, [clearBatchReview, clearImportSweep, stop, workspaceMode])

  const primaryLine = lines.find(l => l.multipv === 1) ?? lines[0]
  const currentLastBestMove = lastBestMoveFen === fen ? lastBestMove : null
  const currentLastPonderMove = lastPonderMoveFen === fen ? lastPonderMove : null

  // ── Capture evaluations ──────────────────────────────
  useEffect(() => {
    if (!engineEnabled) return
    // A threat search is a null-move position that is not in the game, so its
    // reading does not belong in a map keyed by positions that are.
    if (primaryLine?.purpose === 'threat') return
    const recorded = engineLineToSnapshot(primaryLine, fen, Date.now())
    if (!recorded) return

    setEvaluationsByFen(prev => recordEvaluation(prev, recorded.fen, recorded.snapshot))
    // Depends on the whole line rather than a dozen of its fields. That runs the
    // effect on every flush instead of only on a relevant change, and it is
    // safe because `recordEvaluation` returns the very same map when nothing
    // improves -- `sameEvaluationSnapshot` ignores `searchedAt`, so a repeated
    // reading is a no-op rather than a new identity. The map identity is what
    // auto-save debounces on, and there is a test for exactly that burst.
  }, [engineEnabled, fen, primaryLine])

  useEffect(() => {
    if (!engineEnabled || !currentCloudEval) return
    const snapshot = cloudEvalToSnapshot(fen, currentCloudEval)
    if (!snapshot) return

    setEvaluationsByFen(previous => recordEvaluation(previous, fen, snapshot))
  }, [currentCloudEval, engineEnabled, fen])

  // ── Viewport ─────────────────────────────────────────
  useEffect(() => {
    let resizeFrame: number | null = null
    const onResize = () => {
      if (resizeFrame !== null) return
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null
        setViewport(readViewport())
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // ── Auto-analyze ─────────────────────────────────────
  useEffect(() => {
    if (!engineEnabled) return
    if (isImportingGame) return
    if (isBatchReviewing) return
    if (skipFullAnalyzeFenRef.current && skipFullAnalyzeFenRef.current !== fen) {
      skipFullAnalyzeFenRef.current = null
    }

    if (pendingShallowAnalyzeFen && pendingShallowAnalyzeFen === fen) {
      analyze({
        fen,
        purpose: 'import-load',
        mode: 'custom',
        limits: { movetime: IMPORT_LOAD_MOVETIME_MS },
        multiPv: IMPORT_SHALLOW_MULTIPV,
        hashMb,
        showWdl,
        rootFen: currentRootFen,
        historyMoves: currentPathMovesKey ? currentPathMovesKey.split(' ') : [],
      })
      // Prevent immediately kicking off a full-depth pass on the same imported position.
      skipFullAnalyzeFenRef.current = fen
      setPendingShallowAnalyzeFen(null)
      return
    }

    if (pendingPonderFen && pendingPonderFen === fen) {
      analyze({
        fen,
        purpose: 'review-ponder',
        mode: 'custom',
        limits: { depth: Math.max(searchDepth, MOVE_PONDER_MIN_DEPTH) },
        multiPv,
        hashMb,
        showWdl,
        rootFen: currentRootFen,
        historyMoves: currentPathMovesKey ? currentPathMovesKey.split(' ') : [],
      })
      skipFullAnalyzeFenRef.current = fen
      setPendingPonderFen(null)
      return
    }

    if (!autoAnalyze) return
    if (settledAnalysisTarget.fen !== fen) return
    if (settledAnalysisTarget.rootFen !== currentRootFen) return
    if (settledAnalysisTarget.pathMovesKey !== currentPathMovesKey) return
    if (skipFullAnalyzeFenRef.current === settledAnalysisTarget.fen) return

    analyze({
      fen: settledAnalysisTarget.fen,
      purpose: 'auto',
      mode: 'custom',
      limits: { depth: searchDepth },
      multiPv,
      hashMb,
      showWdl,
      rootFen: settledAnalysisTarget.rootFen,
      historyMoves: settledAnalysisTarget.pathMovesKey ? settledAnalysisTarget.pathMovesKey.split(' ') : [],
    })
  }, [
    analyze,
    autoAnalyze,
    currentPathMovesKey,
    currentRootFen,
    engineEnabled,
    fen,
    hashMb,
    isBatchReviewing,
    isImportingGame,
    multiPv,
    pendingPonderFen,
    pendingShallowAnalyzeFen,
    searchDepth,
    settledAnalysisTarget,
    showWdl,
  ])

  // ── Imported game background sweep ───────────────────
  useEffect(() => {
    if (!engineEnabled) return
    if (isImportingGame) return
    if (isBatchReviewing) return

    if (activeImportSweepRef.current && status === 'ready') {
      activeImportSweepRef.current = null
      setImportSweepProgress(previous => ({
        total: previous.total,
        sampledFrom: previous.sampledFrom,
        done: Math.min(previous.total, previous.done + 1),
      }))
    }

    if (status !== 'ready') return
    if (pendingPonderFen) return
    if (pendingShallowAnalyzeFen) return
    if (activeImportSweepRef.current) return

    const nextTarget = importSweepQueueRef.current.shift()
    if (!nextTarget) return

    activeImportSweepRef.current = nextTarget
    analyze({
      fen: nextTarget.fen,
      purpose: 'import-sweep',
      mode: 'custom',
      limits: { movetime: IMPORT_SWEEP_MOVETIME_MS },
      multiPv: IMPORT_SWEEP_MULTIPV,
      hashMb,
      showWdl,
      rootFen: nextTarget.rootFen,
      historyMoves: nextTarget.historyMoves,
    })
  }, [
    analyze,
    engineEnabled,
    hashMb,
    isBatchReviewing,
    isImportingGame,
    pendingPonderFen,
    pendingShallowAnalyzeFen,
    showWdl,
    status,
  ])

  const parsedSearchMoveInput = useMemo(() => parseCandidateMoveInput(searchMovesInput, fen), [fen, searchMovesInput])
  const parsedSearchMoves = parsedSearchMoveInput.validMoves
  const invalidSearchMoveTokens = parsedSearchMoveInput.invalidTokens
  const invalidSearchMovePreview = invalidSearchMoveTokens.slice(0, 3).join(', ')
  const openingTotals = openingExplorer.data
    ? {
      white: openingExplorer.data.white,
      draws: openingExplorer.data.draws,
      black: openingExplorer.data.black,
    }
    : null
  const openingTotalGames = openingTotals
    ? openingTotals.white + openingTotals.draws + openingTotals.black
    : 0
  const openingTopMoves = useMemo(() => (openingExplorer.data?.moves ?? []).slice(0, 5), [openingExplorer.data?.moves])
  const openingTopBookMove = openingTopMoves[0]
  const currentFenLines = useMemo(() => lines.filter(line => !line.fen || line.fen === fen), [fen, lines])
  const coachLine = currentFenLines.find(line => line.multipv === 1) ?? currentFenLines[0] ?? null
  const coachCloudScore = currentCloudEval?.pvs[0]
    ? cloudLineToSideToMoveScore(fen, currentCloudEval.pvs[0])
    : null
  /**
   * The stored reading for the board position, or the result when there is
   * none because the game is over.
   *
   * The engine answers a mated position with `score mate 0`, which is not a
   * score, so the last position of a game never reached the map: the eval bar
   * sat at an even split under the mated king and the Coach card read "...".
   * The review rows had a fallback for exactly this; the bar and the card
   * read the map directly and did not.
   */
  const currentEvaluation = useMemo(
    () => evaluationsByFen.get(fen) ?? terminalSnapshotForFen(fen) ?? undefined,
    [evaluationsByFen, fen],
  )
  /** How the game ended on the board, or null while it is still on. */
  const boardEnding = describeGameEnd(game)
  /**
   * The score to print where a number would be. The terminal snapshot above
   * carries the mate sentinel, which formats as "-100.00" -- a number, but
   * not one anybody means under a checkmate.
   */
  const endingScore = boardEnding ? gameResultScore(boardEnding.result) : null
  const coachEvaluation = endingScore ?? (coachLine
    ? formatWhitePovEvaluation(coachLine.fen ?? fen, coachLine.cp, coachLine.mate)
    : coachCloudScore
      ? formatWhitePovEvaluation(fen, coachCloudScore.cp, coachCloudScore.mate)
      : currentEvaluation
        ? formatWhitePovEvaluation(fen, currentEvaluation.cp, currentEvaluation.mate)
        : tablebase.result
          ? tablebaseSummary(tablebase.result)
          : '...')
  /**
   * The same reading as `coachEvaluation`, in words.
   *
   * Coach mode exists to say things in plain language, and the one number at
   * the top of it was the least plain thing on the panel. Whichever source the
   * evaluation came from, this is that reading turned White-relative and
   * described; `describeAdvantage` uses `winPercentFromCp`, so the sentence
   * cannot disagree with the trend graph beside it.
   */
  const coachVerdict = (() => {
    // A finished game is described by how it finished. "White is completely
    // winning · 100% for White" under a checkmate is true and beside the point.
    if (boardEnding) return boardEnding.label
    const source = coachLine
      ? { fen: coachLine.fen ?? fen, cp: coachLine.cp, mate: coachLine.mate }
      : coachCloudScore
        ? { fen, cp: coachCloudScore.cp, mate: coachCloudScore.mate }
        : currentEvaluation
          ? { fen, cp: currentEvaluation.cp, mate: currentEvaluation.mate }
          : null
    if (!source) return null
    return describeAdvantage(
      typeof source.cp === 'number' ? normalizeWhitePovCp(source.fen, source.cp) : undefined,
      typeof source.mate === 'number' ? normalizeWhitePovMate(source.fen, source.mate) : undefined,
    )
  })()

  const tablebaseTopMove = tablebase.result?.moves[0]?.uci ?? null
  const coachBestMove = selectCoachBestMove({
    engine: coachLine?.pv[0],
    cloud: currentCloudEval?.pvs[0]?.moves[0],
    stored: currentEvaluation?.bestMove,
    last: currentLastBestMove,
    tablebase: tablebaseTopMove,
  })
  const coachBestMoveIsTablebase = isExactTablebaseCoachMove(coachBestMove, tablebaseTopMove)
  const coachBestMoveText = bestMoveLabel(fen, coachBestMove)
  const coachReplyMove = coachBestMoveIsTablebase
    ? null
    : coachLine?.pv[1] ?? currentCloudEval?.pvs[0]?.moves[1] ?? currentLastPonderMove ?? null
  const coachReplyMoveText = ponderMoveLabel(fen, coachBestMove, coachReplyMove)
  const coachDepth = coachLine?.depth ?? currentCloudEval?.depth ?? currentEvaluation?.depth
  // A tile labelled Depth reports a depth or nothing. It used to fall back to
  // the engine status, so it read "analyzing" in a row of numbers -- and then,
  // once cloud evals arrived, it reported theirs as though this app had reached
  // 75 plies. It says whose depth it is.
  const coachSource = coachReadingSource({
    gameOver: Boolean(boardEnding),
    hasEngineLine: Boolean(coachLine),
    hasCloudScore: Boolean(coachCloudScore),
    hasStored: Boolean(currentEvaluation),
    storedPurpose: currentEvaluation?.purpose,
    hasTablebase: Boolean(tablebase.result),
  })
  const coachDepthReading = describeCoachDepth(
    coachSource,
    coachDepth,
    coachBestMoveIsTablebase || Boolean(tablebase.result),
  )
  const engineTelemetry = engineTelemetryLabel(coachLine)
  const coachTablebaseLine = tablebaseTopMove
    ? [
      bestMoveLabel(fen, tablebaseTopMove),
      tablebase.result?.moves[0] ? tablebaseMoveSummary(tablebase.result.moves[0]) : null,
    ].filter(Boolean).join(' · ')
    : ''
  const coachLineSan = coachBestMoveIsTablebase
    ? coachTablebaseLine
    : coachLine
      ? pvToSan(coachLine.fen ?? fen, coachLine, 6)
      : currentCloudEval?.pvs[0]
        ? pvToSan(fen, { multipv: 1, depth: currentCloudEval.depth, pv: currentCloudEval.pvs[0].moves }, 6)
        : coachTablebaseLine
  /**
   * "What is the opponent threatening?" — a null-move search, which is how
   * every GUI answers it: hand the engine the same position with the other side
   * to move and its best move is the thing you have to stop.
   *
   * Run on demand rather than live, because there is one engine and one queue:
   * a standing threat search would be fighting the analysis of the position the
   * reader is actually looking at.
   */
  const requestThreat = useCallback(() => {
    if (!engineEnabled) return

    const probe = nullMoveProbe(fen)
    if (!probe.ok) {
      setThreatError(probe.reason)
      setThreatRequest(null)
      setThreatResult(null)
      return
    }

    setThreatError(null)
    setThreatResult(null)
    threatSettledRef.current = null
    setThreatRequest({ boardFen: fen, probeFen: probe.fen })
    cancelStaleBackgroundAnalysis()
    analyze({
      fen: probe.fen,
      purpose: 'threat',
      mode: 'custom',
      limits: { movetime: THREAT_MOVETIME_MS },
      multiPv: 1,
      hashMb,
      showWdl: false,
    })
  }, [analyze, cancelStaleBackgroundAnalysis, engineEnabled, fen, hashMb])
  requestThreatRef.current = requestThreat

  /**
   * Take the answer as it lands, then put the engine back on the position the
   * reader is looking at.
   *
   * Keyed off `lastBestMoveFen` rather than the engine status: it is set
   * exactly when a `bestmove` arrives for a given search, so there is no window
   * where a not-yet-started search looks finished.
   */
  useEffect(() => {
    if (!threatRequest) return
    if (lastBestMoveFen !== threatRequest.probeFen) return
    if (threatSettledRef.current === threatRequest.probeFen) return
    threatSettledRef.current = threatRequest.probeFen

    const line = lines.find(item => item.fen === threatRequest.probeFen && item.multipv === 1)
    const uci = line?.pv[0] ?? lastBestMove

    if (uci) {
      setThreatResult({
        boardFen: threatRequest.boardFen,
        uci,
        san: uciToSan(threatRequest.probeFen, uci) ?? uci,
        evaluation: formatWhitePovEvaluation(threatRequest.probeFen, line?.cp, line?.mate),
      })
    } else {
      setThreatError('The engine did not name a threat in this position.')
    }

    setThreatRequest(null)
    // The threat search replaced whatever was running, so hand the engine back
    // the board position rather than leaving the Coach card reading "...".
    if (threatRequest.boardFen === fen) setPendingPonderFen(threatRequest.boardFen)
  }, [fen, lastBestMove, lastBestMoveFen, lines, threatRequest])

  // A threat belongs to the position it was asked about, and nothing else.
  useEffect(() => {
    setThreatResult(previous => (previous && previous.boardFen !== fen ? null : previous))
    setThreatError(null)
    setThreatRequest(null)
  }, [fen])

  const activeThreat = threatResult && threatResult.boardFen === fen ? threatResult : null
  const isProbingThreat = threatRequest !== null

  const currentEngineBestUci = currentFenLines.find(line => line.multipv === 1)?.pv[0] ?? null
  const engineBookAgreement = currentEngineBestUci && openingTopBookMove
    ? currentEngineBestUci === openingTopBookMove.uci
    : null
  const coachMoveInsight = describeBestMove(
    fen,
    coachBestMove,
    currentFenLines,
    openingTopBookMove?.uci,
    tablebaseTopMove,
  )

  const toggleOpeningSpeed = useCallback((speed: OpeningSpeed) => {
    setOpeningSpeeds(previous => {
      const alreadySelected = previous.includes(speed)
      if (alreadySelected) {
        const next = previous.filter(item => item !== speed)
        return next.length ? next : previous
      }

      const ordered = [...previous, speed]
      return OPENING_SPEEDS.filter(item => ordered.includes(item))
    })
  }, [])

  const applyBookMovesToSearch = useCallback(() => {
    const topMoves = openingTopMoves.slice(0, 3).map(move => move.uci)
    if (!topMoves.length) return
    setShowAdvancedAnalyze(true)
    setSearchMovesInput(topMoves.join(' '))
    setActivePreset(null)
    setAnalysisTab('analyze')
  }, [openingTopMoves])

  const openOpeningIntel = useCallback(() => {
    revealOpeningIntelRef.current = true
    setAnalysisExperience('pro')
    setAnalysisTab('analyze')
  }, [])

  useEffect(() => {
    if (!revealOpeningIntelRef.current) return
    if (analysisTab !== 'analyze' || analysisExperience !== 'pro') return
    revealOpeningIntelRef.current = false

    let settleTimer: ReturnType<typeof window.setTimeout> | null = null
    let finalTimer: ReturnType<typeof window.setTimeout> | null = null
    const revealOpeningIntel = () => {
      const openingIntel = openingIntelRef.current
      if (!openingIntel) return
      const panelContent = openingIntel.closest('.panel-content') as HTMLElement | null
      const scrollContainer = isMobileLayout ? mainContainerRef.current : panelContent
      if (!scrollContainer) {
        openingIntel.scrollIntoView({ block: 'start' })
        return
      }

      const containerRect = scrollContainer.getBoundingClientRect()
      const targetRect = openingIntel.getBoundingClientRect()
      const top = scrollContainer.scrollTop + targetRect.top - containerRect.top - 12
      scrollContainer.scrollTo({
        top: Math.max(0, top),
        behavior: 'auto',
      })
    }

    revealOpeningIntel()
    settleTimer = window.setTimeout(revealOpeningIntel, 120)
    finalTimer = window.setTimeout(revealOpeningIntel, 320)

    return () => {
      if (settleTimer) window.clearTimeout(settleTimer)
      if (finalTimer) window.clearTimeout(finalTimer)
    }
  }, [analysisExperience, analysisTab, isMobileLayout])

  const resetSavedWorkspace = useCallback(() => {
    try {
      window.localStorage.removeItem(ANALYSIS_SETTINGS_STORAGE_KEY)
    } catch {
      // Ignore localStorage failures (private mode / quota).
    }

    setWorkspaceMode(DEFAULT_PERSISTED_SETTINGS.workspaceMode)
    hasAutoOpenedAnalysisLeftRef.current = false
    setLeftWidth(0)
    setSearchDepth(DEFAULT_PERSISTED_SETTINGS.searchDepth)
    setMultiPv(DEFAULT_PERSISTED_SETTINGS.multiPv)
    setHashMb(defaultHashMb())
    setShowWdl(DEFAULT_PERSISTED_SETTINGS.showWdl)
    setAutoAnalyze(DEFAULT_PERSISTED_SETTINGS.autoAnalyze)
    setEngineProfile(DEFAULT_PERSISTED_SETTINGS.engineProfile)
    setAnalysisTab(DEFAULT_PERSISTED_SETTINGS.analysisTab)
    setAnalysisExperience(DEFAULT_PERSISTED_SETTINGS.analysisExperience)
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
    setOpeningSource(DEFAULT_PERSISTED_SETTINGS.openingSource)
    setOpeningSpeeds(DEFAULT_PERSISTED_SETTINGS.openingSpeeds)
    setOpeningRatingPreset(DEFAULT_PERSISTED_SETTINGS.openingRatingPreset)
    setOpeningAuthToken('')
    setReviewBookError(null)
    setReviewBookTerminalPly(null)
    setShowBoardArrows(DEFAULT_PERSISTED_SETTINGS.showBoardArrows)
    setShowTopMoveArrows(DEFAULT_PERSISTED_SETTINGS.showTopMoveArrows)
    setTopMoveArrowCount(DEFAULT_PERSISTED_SETTINGS.topMoveArrowCount)
    setBlunderNudges(DEFAULT_PERSISTED_SETTINGS.blunderNudges)
    setTheme(DEFAULT_PERSISTED_SETTINGS.theme)
    setOpeningPrefetchTick(0)
    setEngineLabError(null)
    setEngineLabCommand('')
    setEngineLabOutputLines([])
    setEngineLabCopyStatus('idle')
    setLastLabRun(null)
    setPendingPromotion(null)
    clearBatchReview()
  }, [clearBatchReview])

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
    if (!engineEnabled) return
    cancelStaleBackgroundAnalysis()
    const limits: UciGoLimits = {}
    if (analyzeMode === 'quick') {
      limits.movetime = normalizeRequiredIntegerInput(quickMovetimeMs, QUICK_MOVETIME_BOUNDS)
    }
    if (analyzeMode === 'deep' || analyzeMode === 'review') limits.depth = searchDepth
    if (analyzeMode === 'mate') {
      limits.mate = normalizeRequiredIntegerInput(mateTarget, MATE_TARGET_BOUNDS)
    }
    if (analyzeMode === 'infinite') limits.infinite = true

    const normalizedLimitNodes = normalizeOptionalIntegerInput(limitNodes, LIMIT_NODES_BOUNDS)
    if (showAdvancedAnalyze && typeof normalizedLimitNodes === 'number') {
      limits.nodes = normalizedLimitNodes
    }
    if (showAdvancedAnalyze && useClockLimits) {
      limits.wtime = normalizeRequiredIntegerInput(whiteTimeMs, CLOCK_TIME_BOUNDS)
      limits.btime = normalizeRequiredIntegerInput(blackTimeMs, CLOCK_TIME_BOUNDS)
      limits.winc = normalizeRequiredIntegerInput(whiteIncMs, CLOCK_INCREMENT_BOUNDS)
      limits.binc = normalizeRequiredIntegerInput(blackIncMs, CLOCK_INCREMENT_BOUNDS)
      const normalizedMovesToGo = normalizeOptionalIntegerInput(movesToGo, MOVES_TO_GO_BOUNDS)
      if (typeof normalizedMovesToGo === 'number') limits.movestogo = normalizedMovesToGo
    }

    analyze({
      fen,
      purpose: 'manual',
      mode: analyzeMode,
      limits,
      multiPv,
      hashMb,
      showWdl,
      rootFen: currentRootFen,
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
    engineEnabled,
    useClockLimits,
    whiteIncMs,
    whiteTimeMs,
    currentPathMovesKey,
    currentRootFen,
    cancelStaleBackgroundAnalysis,
  ])

  /**
   * The mode strip scrolls sideways on a narrow screen; keep the pill you just
   * chose inside it, so the mode you are in is never parked off the edge.
   *
   * Two things had to be true for this to work, and neither was.
   *
   * The ref belongs on `.mobile-modes-wrapper`, which is the element the
   * stylesheet gives `overflow-x: auto`. It was attached to nothing, so
   * `scroller` was always null and this returned on its first line.
   *
   * And the pill to scroll to is the one in the group that *changed*. There
   * are two active pills in the strip at all times -- one per group -- and
   * asking the scroller for `.gc-pill-active` returns the first, which is
   * always the workspace pill at the far left. It is already in view, so even
   * with the ref attached this scrolled nowhere: on a landscape phone,
   * choosing AI vs AI left the pill saying so 62px past the right edge.
   *
   * Both halves are checked in the browser harness at 844x390 rather than
   * believed, because a ref that is not attached looks exactly like one that
   * is, and a scroll of zero looks exactly like a strip that already fits.
   *
   * `smooth` only while the page is on screen. A smooth scroll is an animation
   * and a hidden document runs none: measured at 0px moved with `smooth` and
   * 63px with `auto`, in the same tab, one line apart. This is a layout
   * correction rather than a flourish -- the mode you chose has to be legible
   * whenever you next look -- so it is not left to something the browser is
   * free to skip. Every other reveal in this file scrolls with `auto` already.
   */
  const modeScrollerRef = useRef<HTMLDivElement | null>(null)
  const previousModesRef = useRef({ workspaceMode, gameMode })
  useEffect(() => {
    const previous = previousModesRef.current
    const changedGroup = previous.workspaceMode !== workspaceMode
      ? 'workspace'
      : previous.gameMode !== gameMode
        ? 'game'
        : null
    previousModesRef.current = { workspaceMode, gameMode }

    const scroller = modeScrollerRef.current
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return
    // On the first run nothing has changed yet, and the reader is looking at
    // the strip as it loaded: the game mode is the half that can be off-screen.
    const group = scroller.querySelector(`[data-mode-group="${changedGroup ?? 'game'}"]`)
    const active = (group ?? scroller).querySelector('.gc-pill-active')
    const animate = !reduceMotion && typeof document !== 'undefined' && document.visibilityState === 'visible'
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: animate ? 'smooth' : 'auto' })
  }, [gameMode, reduceMotion, workspaceMode])

  const handleWorkspaceModeChange = useCallback((mode: WorkspaceMode) => {
    if (mode !== 'play') cancelPendingAiMove()
    if (mode === 'play') cancelStaleBackgroundAnalysis()
    if (mode === 'analysis') pause()
    setSettingsOpen(false)
    setWorkspaceMode(mode)
  }, [cancelPendingAiMove, cancelStaleBackgroundAnalysis, pause])

  const handleAnalysisTabChange = useCallback((tab: AnalysisTab) => {
    pause()
    setAnalysisTab(tab)
    setAnalysisPanelRevealTick(tick => tick + 1)
  }, [pause])

  const runLabCommand = useCallback(
    async (command: string) => {
      if (!engineEnabled) {
        setEngineLabError('Engine Lab is available only in Analysis mode.')
        return
      }
      const trimmed = command.trim()
      if (!trimmed) return
      setEngineLabError(null)
      if (status === 'analyzing' && trimmed.toLowerCase() !== 'stop') {
        setEngineLabError('Stop the active analysis before sending Engine Lab commands.')
        return
      }
      const blockMessage = engineLabCommandBlockMessage(trimmed)
      if (blockMessage) {
        setEngineLabError(blockMessage)
        return
      }
      const safetyMessage = !expertModeEnabled ? engineLabCommandSafetyMessage(trimmed) : null
      if (safetyMessage) {
        setEngineLabError(safetyMessage)
        return
      }

      setLabCommandHistory(previous => [trimmed, ...previous.filter(item => item !== trimmed)].slice(0, 20))
      const startTime = performance.now()
      const outputLines = [`> ${trimmed}`]
      setEngineLabOutputLines(outputLines)
      setEngineLabCopyStatus('idle')
      try {
        const lines = await sendCommand(trimmed, {
          stream: line => {
            outputLines.push(line)
            setEngineLabOutputLines(outputLines.slice(-300))
          },
        })
        if (!lines.length) setEngineLabOutputLines([`> ${trimmed}`, '(no direct response)'])
        setLastLabRun({ command: trimmed, durationMs: Math.round(performance.now() - startTime) })
        setEngineLabCommand('')
      } catch (error) {
        if (outputLines.length === 1) setEngineLabOutputLines([`> ${trimmed}`, '(no response before error)'])
        setLastLabRun({ command: trimmed, durationMs: Math.round(performance.now() - startTime) })
        setEngineLabError(error instanceof Error ? error.message : String(error))
      }
    },
    [engineEnabled, expertModeEnabled, sendCommand, status],
  )

  const clearLabConsole = useCallback(() => {
    setEngineLabOutputLines([])
    setEngineLabError(null)
    setEngineLabCopyStatus('idle')
  }, [])

  const copyLabConsole = useCallback(async () => {
    try {
      if (!engineLabOutputLines.length) return
      await navigator.clipboard.writeText(engineLabOutputLines.join('\n'))
      setEngineLabError(null)
      setEngineLabCopyStatus('copied')
    } catch {
      setEngineLabCopyStatus('failed')
      setEngineLabError('Clipboard access failed. Select the console output and copy it manually.')
    }
  }, [engineLabOutputLines])

  useEffect(() => {
    persistSettings({
      workspaceMode,
      autoAnalyze,
      engineProfile,
      analysisTab,
      analysisExperience,
      activePreset,
      analyzeMode,
      showAdvancedAnalyze,
      searchDepth,
      quickMovetimeMs: normalizeRequiredIntegerInput(quickMovetimeMs, QUICK_MOVETIME_BOUNDS),
      mateTarget: normalizeRequiredIntegerInput(mateTarget, MATE_TARGET_BOUNDS),
      multiPv,
      hashMb,
      showWdl,
      limitNodes: optionalIntegerInputToNullable(limitNodes, LIMIT_NODES_BOUNDS),
      searchMovesInput: DEFAULT_PERSISTED_SETTINGS.searchMovesInput,
      useClockLimits,
      whiteTimeMs: normalizeRequiredIntegerInput(whiteTimeMs, CLOCK_TIME_BOUNDS),
      blackTimeMs: normalizeRequiredIntegerInput(blackTimeMs, CLOCK_TIME_BOUNDS),
      whiteIncMs: normalizeRequiredIntegerInput(whiteIncMs, CLOCK_INCREMENT_BOUNDS),
      blackIncMs: normalizeRequiredIntegerInput(blackIncMs, CLOCK_INCREMENT_BOUNDS),
      movesToGo: optionalIntegerInputToNullable(movesToGo, MOVES_TO_GO_BOUNDS),
      expertModeEnabled,
      labCommandHistory,
      openingSource,
      openingSpeeds,
      openingRatingPreset,
      showBoardArrows,
      showTopMoveArrows,
      topMoveArrowCount,
      soundEnabled,
      blunderNudges,
      timeControlId,
      boardThemeId,
      theme,
    })
  }, [
    workspaceMode,
    activePreset,
    analysisTab,
    analysisExperience,
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
    openingRatingPreset,
    openingSource,
    openingSpeeds,
    showBoardArrows,
    showTopMoveArrows,
    topMoveArrowCount,
    soundEnabled,
    blunderNudges,
    timeControlId,
    boardThemeId,
    theme,
    quickMovetimeMs,
    searchDepth,
    showAdvancedAnalyze,
    showWdl,
    useClockLimits,
    whiteIncMs,
    whiteTimeMs,
  ])

  useEffect(() => {
    if (searchMovesFenRef.current === fen) return
    searchMovesFenRef.current = fen
    setSearchMovesInput(value => value ? '' : value)
  }, [fen])

  useEffect(() => {
    setReviewPractice(previous => {
      if (!previous) return previous
      if (fen === previous.beforeFen || fen === previous.solvedFen) return previous
      return null
    })
  }, [fen])

  useEffect(() => {
    if (workspaceMode === 'analysis' && analysisTab === 'review') return
    setReviewPractice(previous => previous ? null : previous)
  }, [analysisTab, workspaceMode])

  // ── Derived move data ─────────────────────────────────
  const mainLineNodes = useMemo(() => gameTree.mainLine(), [gameTree])

  // The whole branch the board is standing in: the path down to the current
  // node, then its first-child chain to the tip. Equal to the main line
  // whenever the current node is on it, which is most of the time.
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

  const currentLineMoves = useMemo(
    () => currentLineNodes.slice(1).map(n => n.move!).filter(Boolean),
    [currentLineNodes],
  )

  /**
   * The line the review reports on.
   *
   * It used to be the main line, always, while both trend graphs plotted
   * `currentLineNodes` -- so standing in a variation gave a graph of the branch
   * you were looking at, an accuracy summary of a different line, and critical
   * moments pointing at moves that were not on the board. Nothing said which
   * was which.
   *
   * They are one line now, and it is the branch you are standing in. That also
   * makes a variation reviewable at all, which it was not: `Review Game` would
   * quietly search the main line instead. Evaluations are keyed by position, so
   * moving between branches re-uses everything already searched rather than
   * starting again.
   *
   * What stays on the main line is everything that is about the *game* rather
   * than about what is being read: the PGN export, the auto-save, the library,
   * and the result in the header.
   */
  const reviewLineNodes = currentLineNodes
  const reviewLineMoves = currentLineMoves
  const reviewLineUciMoves = useMemo(
    () => reviewLineNodes.slice(1).map(node => node.uci).filter(Boolean),
    [reviewLineNodes],
  )
  // Read by `startBatchReview`, which is reached from an effect and from the
  // command palette and must not take a new identity on every navigation.
  const reviewLineNodesRef = useRef(reviewLineNodes)
  reviewLineNodesRef.current = reviewLineNodes
  /**
   * The rows the review is reporting, for the fault stepping. Same shape and
   * same reason as `reviewLineNodesRef`: the command palette memoises a list
   * that reaches it, so the callback must not take a new identity per render.
   */
  const reviewRowsRef = useRef<ReviewRow[]>([])
  const reviewsAVariation = reviewLineNodes.length > 1
    && mainLineNodes.length > 1
    && reviewLineNodes[reviewLineNodes.length - 1]!.id !== mainLineNodes[mainLineNodes.length - 1]!.id
  // How the game ended, as opposed to what is on the board right now: a mate
  // found while exploring a variation is not the game's result, and neither is
  // the quiet position you navigated back to. Replaying the line rather than
  // reading its last FEN is what makes threefold repetition visible at all --
  // a position alone cannot show that it has occurred before.
  const mainLineEnd = useMemo(() => {
    if (mainLineNodes.length < 2) return null
    try {
      const replay = new Chess(mainLineNodes[0].fen)
      for (const node of mainLineNodes.slice(1)) {
        if (!node.move) return null
        replay.move({ from: node.move.from, to: node.move.to, promotion: node.move.promotion })
      }
      return describeGameEnd(replay)
    } catch {
      return null
    }
  }, [mainLineNodes])
  // How far into the game the opening book is consulted: the prefetch loop, the
  // row list and the summary line all have to agree on this number.
  const reviewBookPrefixLength = Math.min(reviewLineUciMoves.length, REVIEW_BOOK_PREFETCH_LIMIT)

  const reviewRows = useMemo(
    () => buildReviewRows(reviewLineMoves, evaluationsByFen, currentRootFen, { isBookPosition }),
    [currentRootFen, evaluationsByFen, isBookPosition, reviewLineMoves],
  )
  const visibleReviewRows = useMemo(
    () => filterReviewRowsBySide(reviewRows, reviewSideFilter),
    [reviewRows, reviewSideFilter],
  )
  /**
   * What the review actually reports on. The phase breakdown deliberately reads
   * the unfiltered rows instead, so every phase stays visible and switchable —
   * the same split katrain's report makes.
   */
  const reportedReviewRows = useMemo(
    () => filterReviewRowsByPhase(visibleReviewRows, reviewPhaseFilter),
    [visibleReviewRows, reviewPhaseFilter],
  )
  reviewRowsRef.current = reportedReviewRows
  const reviewSummary = useMemo(() => summarizeReview(reportedReviewRows), [reportedReviewRows])
  const reviewAccuracy = useMemo(() => summarizeAccuracy(reportedReviewRows), [reportedReviewRows])
  // Only rendered inside the analysis workspace, which is exactly when the
  // engine is on, so the game length is the only thing left to check.
  const reviewGameDisabledReason = reviewLineNodes.length <= 1
    ? 'Add moves or import a PGN before running review.'
    : null
  // Same shape as the reason above: shown rather than hidden, so a reader
  // looking for the button learns why it will not do anything.
  const playFromHereDisabledReason = game.isGameOver()
    ? 'This game is already over.'
    : null
  // The Engine Lab greys controls out behind two gates. Both used to be silent.
  const engineBusyDisabledReason = status === 'analyzing'
    ? 'The engine is mid-search. Stop the analysis first.'
    : null
  const expertCommandDisabledReason = expertModeEnabled
    ? engineBusyDisabledReason
    : 'Expert mode only: these commands take the engine over for a while.'
  const reviewGameButtonLabel = isBatchReviewing
    ? `Stop game review. ${batchReviewProgress.done} of ${batchReviewProgress.total} positions reviewed.`
    : reviewGameDisabledReason
      ? `Review Game unavailable. ${reviewGameDisabledReason}`
      : 'Review Game'
  const criticalReviewRows = useMemo(
    () => rankCriticalMoments(reportedReviewRows, 5),
    [reportedReviewRows],
  )
  /**
   * Stepping through every fault the review found, not only the five Critical
   * Moments ranks. A 116-move game can hold twenty inaccuracies and the sixth
   * was reachable only by scrolling the move list for a coloured dot.
   *
   * Node index rather than ply: a fault at ply p was played from node p-1, and
   * that is where the reader wants to stand -- the position with the decision
   * still in it, which is also where a Critical Moment lands them.
   */
  const boardNodeIndex = currentPathNodes.length - 1
  const reviewFaultCount = useMemo(() => reviewFaults(reportedReviewRows).length, [reportedReviewRows])
  const nextReviewFaultRow = useMemo(
    () => stepToReviewFault(reportedReviewRows, boardNodeIndex, 1),
    [boardNodeIndex, reportedReviewRows],
  )
  const previousReviewFaultRow = useMemo(
    () => stepToReviewFault(reportedReviewRows, boardNodeIndex, -1),
    [boardNodeIndex, reportedReviewRows],
  )
  const reviewFaultAt = useMemo(
    () => reviewFaultPosition(reportedReviewRows, boardNodeIndex),
    [boardNodeIndex, reportedReviewRows],
  )
  const goToReviewFault = useCallback((direction: 1 | -1) => {
    const tree = gameTreeRef.current
    const target = stepToReviewFault(reviewRowsRef.current, tree.currentPath().length - 1, direction)
    if (!target) return
    const beforeNode = reviewLineNodesRef.current[target.ply - 1]
    if (!beforeNode) return
    setReviewPractice(null)
    navigateAndPonder(tree.navigateTo(beforeNode.id))
    // The stacked layout puts the board above this panel; jumping to a mistake
    // that stays off-screen is a jump the reader cannot see. The setter rather
    // than `requestBoardReveal`, which is declared further down.
    setBoardRevealTick(tick => tick + 1)
  }, [navigateAndPonder])
  /**
   * The move list's empty state has two quite different causes and used to give
   * one answer. `reportedReviewRows` is `reviewRows` narrowed by the side and
   * phase filters, and the phase chips read the *unfiltered* rows on purpose —
   * so a phase that exists for White can be selected while Black filters to
   * nothing, and a reader who has just imported a game is told to import one.
   */
  const reviewListEmptyCopy = reviewRows.length === 0
    ? 'Add moves or import a PGN, then run Review Game.'
    : `Nothing to show for ${describeReviewScope(reviewSideFilter, reviewPhaseFilter)}.`
  const criticalMomentsEmptyCopy = reportedReviewRows.length === 0
    ? 'Run Review Game after a line is analyzed to surface the biggest turning points.'
    : reviewAccuracy.pendingMoves > 0
      ? 'Review Game is still collecting enough depth to identify the biggest turning points.'
      // Says what is actually on screen: with a filter on, "this reviewed line"
      // would claim more than the review is showing.
      : `No major swings found in ${describeReviewScope(reviewSideFilter, reviewPhaseFilter)}.`

  useEffect(() => {
    setReviewBookError(null)
    setReviewBookTerminalPly(null)
    if (workspaceMode !== 'analysis') return
    if (analysisTab !== 'review') return
    // Coach mode does not render the card these rows fill, so a review there
    // was walking thirty positions past Lichess for nothing.
    if (analysisExperience !== 'pro') return
    if (!reviewLineUciMoves.length) return
    if (!hasOpeningExplorerToken) return

    let cancelled = false
    const controller = new AbortController()
    const maxPlyToPrefetch = reviewBookPrefixLength

    const run = async () => {
      for (let idx = 0; idx < maxPlyToPrefetch; idx += 1) {
        if (cancelled) return
        try {
          const bookPosition = await fetchOpeningExplorer({
            source: openingSource,
            fen: currentRootFen,
            moves: reviewLineUciMoves.slice(0, idx),
            speeds: openingSource === 'lichess' ? openingSpeeds : undefined,
            ratings: openingSource === 'lichess' ? openingRatings : undefined,
            authToken: openingAuthToken,
          }, controller.signal)
          if (!shouldContinueOpeningBookLine(bookPosition, reviewLineUciMoves[idx] ?? '')) {
            setReviewBookTerminalPly(idx + 1)
            setOpeningPrefetchTick(tick => tick + 1)
            return
          }
        } catch (error) {
          if (cancelled || controller.signal.aborted) return
          const message = error instanceof Error ? error.message : String(error)
          setReviewBookError(message)
          setOpeningPrefetchTick(tick => tick + 1)
          return
        }
        if (cancelled) return
        setOpeningPrefetchTick(tick => tick + 1)
      }
    }

    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [analysisExperience, analysisTab, currentRootFen, hasOpeningExplorerToken, openingAuthToken, openingRatings, openingSource, openingSpeeds, reviewBookPrefixLength, reviewLineUciMoves, workspaceMode])

  const reviewBookRows = useMemo(() => {
    void openingPrefetchTick
    const maxRows = reviewBookPrefixLength
    return reviewLineUciMoves.slice(0, maxRows).map((uci, index) => {
      const beforeMoves = reviewLineUciMoves.slice(0, index)
      const fromCache = getCachedOpeningExplorer({
        source: openingSource,
        fen: currentRootFen,
        moves: beforeMoves,
        speeds: openingSource === 'lichess' ? openingSpeeds : undefined,
        ratings: openingSource === 'lichess' ? openingRatings : undefined,
      })
      const san = reviewLineNodes[index + 1]?.san ?? uci
      const sideToMove = reviewLineNodes[index]?.fen.split(/\s+/g)[1] === 'b' ? 'b' : 'w'

      if (reviewBookTerminalPly !== null && index + 1 > reviewBookTerminalPly) {
        return {
          ply: index + 1,
          sideToMove,
          san,
          uci,
          status: 'after-novelty' as const,
        }
      }

      if (!fromCache) {
        return {
          ply: index + 1,
          sideToMove,
          san,
          uci,
          status: hasOpeningExplorerToken
            ? reviewBookError
              ? 'error' as const
              : 'loading' as const
            : 'auth-required' as const,
        }
      }

      const totalGames = openingExplorerGameCount(fromCache)
      if (!totalGames) {
        return {
          ply: index + 1,
          sideToMove,
          san,
          uci,
          status: 'unknown' as const,
        }
      }

      const move = fromCache.moves.find(item => item.uci === uci)
      if (!move) {
        return {
          ply: index + 1,
          sideToMove,
          san,
          uci,
          status: 'out-of-book' as const,
          games: 0,
          popularityPct: 0,
        }
      }

      const moveGames = openingMoveGameCount(move)
      return {
        ply: index + 1,
        sideToMove,
        san,
        uci,
        status: 'in-book' as const,
        games: moveGames,
        popularityPct: percentage(moveGames, totalGames),
      }
    })
  }, [
    reviewLineUciMoves,
    reviewLineNodes,
    currentRootFen,
    hasOpeningExplorerToken,
    openingPrefetchTick,
    openingRatings,
    openingSource,
    openingSpeeds,
    reviewBookPrefixLength,
    reviewBookTerminalPly,
    reviewBookError,
  ])

  const visibleReviewBookRows = useMemo(() => {
    if (reviewSideFilter === 'both') return reviewBookRows
    const side = reviewSideFilter === 'white' ? 'w' : 'b'
    return reviewBookRows.filter(row => row.sideToMove === side)
  }, [reviewBookRows, reviewSideFilter])
  const reviewBookRowsAllAwaitingToken = visibleReviewBookRows.length > 0
    && visibleReviewBookRows.slice(0, REVIEW_BOOK_VISIBLE_LIMIT).every(row => row.status === 'auth-required')

  const reviewBookSummary = useMemo(() => {
    const inBook = visibleReviewBookRows.filter(row => row.status === 'in-book').length
    const outOfBook = visibleReviewBookRows.filter(row => row.status === 'out-of-book').length
    const loading = visibleReviewBookRows.filter(row => row.status === 'loading').length
    const afterNovelty = visibleReviewBookRows.filter(row => row.status === 'after-novelty').length
    const authRequired = visibleReviewBookRows.filter(row => row.status === 'auth-required').length
    const failed = visibleReviewBookRows.filter(row => row.status === 'error').length
    const firstOutOfBook = visibleReviewBookRows.find(row => row.status === 'out-of-book') ?? null
    return { inBook, outOfBook, loading, afterNovelty, authRequired, failed, firstOutOfBook }
  }, [visibleReviewBookRows])

  // Both trend graphs navigate identically; they had a character-identical copy
  // of this closure each.
  const navigateToGraphPoint = useCallback((idx: number) => {
    const targetNode = currentLineNodes[idx] || currentLineNodes[currentLineNodes.length - 1]
    if (!targetNode) return
    const chess = gameTree.navigateTo(targetNode.id)
    if (workspaceMode === 'analysis') {
      navigateAndPonder(chess)
      return
    }
    navigateAndPause(chess)
  }, [currentLineNodes, gameTree, navigateAndPause, navigateAndPonder, workspaceMode])

  const winratePoints = useMemo(
    () => buildWinrateSeries(currentLineMoves, evaluationsByFen, currentRootFen),
    [currentLineMoves, currentRootFen, evaluationsByFen],
  )

  const gameNarrativeTags = useMemo(
    () => narrativeTags(winratePoints, pgnHeaders.Result),
    [winratePoints, pgnHeaders.Result],
  )

  // In Play mode the engine is off, so an empty winrate/WDL card can never fill —
  // it is 250px of permanent blank. They stay whenever there is data to plot.
  const wdlPoints = useMemo(
    () => buildWdlSeries(currentLineMoves, evaluationsByFen, currentRootFen),
    [currentLineMoves, currentRootFen, evaluationsByFen],
  )

  const showEvaluationGraphs = engineEnabled || winratePoints.length > 0 || wdlPoints.length > 0

  // ── Move quality → annotate tree nodes ───────────────
  const setTreeNodeQualities = gameTree.setNodeQualities
  useEffect(() => {
    const qualityUpdates = reviewRows.flatMap((row, idx): Array<{ id: string; quality?: ReviewLabel }> => {
      const node = reviewLineNodes[idx + 1]
      if (!node) return []
      return [{
        id: node.id,
        quality: row.quality === 'pending' ? undefined : row.quality,
      }]
    })
    setTreeNodeQualities(qualityUpdates)
  }, [reviewLineNodes, reviewRows, setTreeNodeQualities])

  // The board is told to clear its drawn arrows when the position changes; the
  // squares have to follow, or a mark from two moves ago outlives the arrow it
  // was drawn beside.
  useEffect(() => {
    setMarkedSquares(marks => (hasSquareMarks(marks) ? {} : marks))
  }, [fen])

  /**
   * Notice a flag.
   *
   * Nothing else can: the display is derived from `Date.now()` inside the clock
   * component, so running out of time produces no state change on its own. The
   * check is `settleFlag`, which returns the very same object while there is
   * nothing to report — so this interval costs one comparison four times a
   * second and re-renders exactly once, when the flag falls.
   */
  useEffect(() => {
    if (!clock || clock.flagged || clock.running === null) return
    const id = window.setInterval(() => {
      setClock(previous => (previous ? settleFlag(previous, Date.now()) : previous))
    }, 250)
    return () => window.clearInterval(id)
  }, [clock])

  clockRef.current = clock
  playSessionRef.current = workspaceMode === 'play'
    ? { gameMode, playerColor, difficulty: aiDifficulty, resignedBy: resignedBy ?? undefined }
    : undefined

  /**
   * Whether the board is taking a premove right now.
   *
   * The board is locked while the engine moves, which is exactly when a premove
   * is made, so this is what lets dragging back for that one case.
   */
  const premoveAllowed = canPremove({
    workspaceMode,
    gameMode,
    turn: game.turn(),
    playerColor: playerColorToTurn(playerColor),
    gameOver: game.isGameOver(),
    endedOffBoard: Boolean(endedOffBoard),
    paused,
  })

  /**
   * Stepping out to Analysis stops the clock, and says so.
   *
   * The alternative is a clock that runs while you consult the engine, which is
   * either cheating or a lost game depending on how you look at it. Coming back
   * leaves it paused: resuming is a decision, and Space makes it.
   */
  useEffect(() => {
    if (workspaceMode === 'play') return
    if (!clock || clock.running === null) return
    setClock(pauseClock(clock, Date.now()))
    pausedRef.current = true
    setPaused(true)
  }, [clock, workspaceMode])

  // A flag stops the AI as surely as a checkmate does, and it is how the game
  // ended -- so it goes into the headers the PGN, the auto-save and the library
  // all read, rather than living only in the panel's result line.
  useEffect(() => {
    if (!clockFlagged) return
    cancelPendingAiMove()
    const result = flagPgnResult(clockFlagged)
    setPgnHeaders(previous => (previous.Result === result ? previous : { ...previous, Result: result }))
  }, [cancelPendingAiMove, clockFlagged, setPgnHeaders])

  const resignGame = useCallback(() => {
    const side = resigningSide({ gameMode, playerColor, turn: game.turn() })
    if (!side) return
    setResignedBy(side)
    // Everything a finished game stops doing. The clock is paused for the same
    // reason a checkmate pauses it: the game is over, so nobody is on move.
    setClock(previous => (previous ? pauseClock(previous, Date.now()) : previous))
    cancelPendingAiMove()
    setPremove(null)
    setHintMove(null)
  }, [cancelPendingAiMove, game, gameMode, playerColor])

  // The result a resignation earns, written the way a flag's is.
  useEffect(() => {
    if (clockFlagged || !resignedBy) return
    const result = resignPgnResult(resignedBy)
    setPgnHeaders(previous => (previous.Result === result ? previous : { ...previous, Result: result }))
  }, [clockFlagged, resignedBy, setPgnHeaders])

  // Checkmate, stalemate and the three drawing rules end a game just as
  // finally, and until this existed only the clock ever wrote a Result. Every
  // other ending exported as `*`, which every other program reads as
  // "unfinished" -- and the review's narrative tags, which take the winner from
  // this header, could not tell a won game from a drawn one. A flag wins if
  // both happen, because it is the later of the two.
  useEffect(() => {
    if (endedOffBoard || !mainLineEnd) return
    setPgnHeaders(previous => (
      previous.Result === mainLineEnd.result ? previous : { ...previous, Result: mainLineEnd.result }
    ))
  }, [endedOffBoard, mainLineEnd, setPgnHeaders])

  // ── Engine arrows ────────────────────────────────────
  const currentBoardMove = gameTree.current.move
  const arrows = useMemo(() => {
    if (!showBoardArrows) return []

    const list: Array<{ startSquare: string; endSquare: string; color: string }> = []

    // Every arrow below is about the position on the game board, and none of
    // them is true of the one being previewed. The move that got there is.
    if (linePreview) {
      return [{
        startSquare: linePreview.uci.slice(0, 2),
        endSquare: linePreview.uci.slice(2, 4),
        color: 'rgba(63, 185, 80, 0.9)',
      }]
    }

    if (currentBoardMove) {
      list.push({ startSquare: currentBoardMove.from, endSquare: currentBoardMove.to, color: 'rgba(255, 170, 0, 0.8)' })
    }

    // A retry that draws the engine answer on the board is only theatre. Keep
    // the move that reached the position for orientation, but hide every hint
    // and candidate until two misses reveal the answer or the move is solved.
    if (reviewPractice && reviewPractice.status !== 'correct' && reviewPractice.attempts < 2) {
      return list
    }

    // Violet, so it reads as neither the move that was played (amber) nor a move
    // the engine recommends (the red-to-green candidate scale). It is the move
    // the *other* side wants to make.
    if (activeThreat) {
      list.push({
        startSquare: activeThreat.uci.slice(0, 2),
        endSquare: activeThreat.uci.slice(2, 4),
        color: 'rgba(167, 139, 250, 0.85)',
      })
    }

    // A hint is the engine recommending a move, so it takes the colour the
    // analysis board already uses for exactly that -- the top of the candidate
    // scale -- rather than inventing a sixth meaning.
    if (hintMove && hintMove.length >= 4) {
      list.push({
        startSquare: hintMove.slice(0, 2),
        endSquare: hintMove.slice(2, 4),
        color: 'rgba(63, 185, 80, 0.9)',
      })
    }

    if (!engineEnabled || !showTopMoveArrows) return list

    const currentLines = lines
      .filter(line => !line.fen || line.fen === fen)
      .filter(line => typeof line.pv[0] === 'string' && line.pv[0]!.length >= 4)

    if (!currentLines.length) return list

    const bestByMove = new Map<string, { uci: string; score: number }>()
    for (const line of currentLines) {
      const uci = line.pv[0]
      if (!uci || uci.length < 4) continue
      const score = scoreToCp(line.cp, line.mate) ?? -12_000
      const existing = bestByMove.get(uci)
      if (!existing || score > existing.score) {
        bestByMove.set(uci, { uci, score })
      }
    }

    const ranked = [...bestByMove.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topMoveArrowCount)

    if (!ranked.length) return list

    const bestScore = ranked[0]!.score

    for (const candidate of ranked) {
      list.push({
        startSquare: candidate.uci.slice(0, 2),
        endSquare: candidate.uci.slice(2, 4),
        color: topArrowColor(bestScore - candidate.score),
      })
    }

    return list
  }, [activeThreat, currentBoardMove, engineEnabled, fen, hintMove, linePreview, lines, reviewPractice, showBoardArrows, showTopMoveArrows, topMoveArrowCount])

  const playSound = useMoveSound(soundEnabled)
  /**
   * Sound a move that has *already* been applied to `game` — the flags and SAN
   * come from the move, and whether the game ended has to be read from the
   * position it created.
   *
   * Only moves that are made, not moves that are navigated to. Stepping through
   * a review with the arrow keys is a scrub, and key repeat over a 60-move game
   * would be a hundred knocks in three seconds.
   */
  const playMoveSound = useCallback((move: Move) => {
    playSound(moveSoundFor({ flags: move.flags, san: move.san, isGameOver: game.isGameOver() }))
  }, [game, playSound])

  /**
   * Everything that happens because a move landed on the board: it makes a
   * noise and it presses the clock. One function so the two cannot drift apart,
   * and so the AI loop has one thing to reach for.
   */
  const registerMovePlayed = useCallback((move: Move) => {
    playMoveSound(move)
    setHintMove(null)
    // Read once, from the position the move created: a move that mates or
    // stalemates hands over to nobody, and the clock has to be told.
    const ended = game.isGameOver()
    setClock(previous => {
      if (!previous) return previous
      const now = Date.now()
      return ended ? moveEndedGame(previous, move.color, now) : moveMade(previous, move.color, now)
    })
  }, [game, playMoveSound])
  // Reached from the AI loop, which is an effect that must not re-install
  // whenever the sound setting changes mid-game. Same shape as requestThreatRef.
  const playMoveSoundRef = useRef(registerMovePlayed)
  playMoveSoundRef.current = registerMovePlayed

  // ── AI move loop (with speed throttle) ───────────────
  useEffect(() => {
    if (workspaceMode !== 'play') return
    if (game.isGameOver()) return
    if (endedOffBoardRef.current) return
    void aiReadyTick
    void stepRequestTick
    if (aiPlayerStatusRef.current !== 'ready') return
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

    const stepModeMove = aiSpeedRef.current === 'step'
    const delayMs = AI_SPEED_MS[aiSpeedRef.current]
    const requestFen = fen

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finishAiMove = () => {
      aiMoveScheduledRef.current = false
      setIsAiThinking(false)
    }

    // Read from the tree rather than from a dependency, the way addMove below
    // does: the tree ref is current, and aiSearchHistory checks the path
    // actually leads to the position being searched before it is sent.
    const treeAtRequest = gameTreeRef.current
    const searchHistory = aiSearchHistory(
      requestFen,
      treeAtRequest.current.fen,
      treeAtRequest.root.fen,
      treeAtRequest.currentPath().slice(1).map(node => node.uci),
    )

    const doMove = () => {
      // Read here rather than above: the speed throttle's delay has run by now,
      // and it came off this side's clock.
      requestAiMove(requestFen, aiDifficulty, searchHistory, readClockForSearch(requestFen)).then(uciMove => {
        if (cancelled) return
        finishAiMove()

        const liveGameMode = gameModeRef.current
        const livePlayerColor = playerColorRef.current
        const stillAiTurn =
          liveGameMode === 'ai-vs-ai' ||
          (liveGameMode === 'human-vs-ai' && game.turn() !== livePlayerColor[0])
        if (!uciMove || game.isGameOver() || pausedRef.current || game.fen() !== requestFen || !stillAiTurn) {
          return
        }

        const from = uciMove.slice(0, 2) as Square
        const to = uciMove.slice(2, 4) as Square
        const promo = uciMove[4] as 'q' | 'r' | 'b' | 'n' | undefined

        let move: Move | null
        try {
          move = game.move({ from, to, promotion: promo })
        } catch {
          return
        }
        if (move) {
          const newFen = game.fen()
          setFen(newFen)
          // The AI loop only runs in Play mode, so its moves are always the game.
          gameTreeRef.current.addMove(move, newFen, {
            mainLine: true,
            clockMs: clockRef.current ? remainingMs(clockRef.current, move.color, Date.now()) : undefined,
          })
          playMoveSoundRef.current(move)

          // What the engine's search of this position says about the human
          // move that reached it, against its search before its last move.
          // The node the search started from is the human's move.
          const reading = readAiSearch()
          const humanNode = treeAtRequest.current
          if (reading && reading.fen === requestFen) {
            const previous = lastAiSearchRef.current
            const verdict = previous && liveGameMode === 'human-vs-ai' && blunderNudgesRef.current && humanNode.move
              ? judgeMoveBetweenSearches(previous, reading)
              : null
            setBlunderNudge(verdict ? { ...verdict, san: humanNode.san, fen: humanNode.fen } : null)
            lastAiSearchRef.current = reading
          }
        }

        if (stepModeMove && aiSpeedRef.current === 'step') {
          pausedRef.current = true
          setPaused(true)
        }
      }).catch(() => {
        if (!cancelled) finishAiMove()
      })
    }

    if (delayMs > 0) {
      timer = setTimeout(doMove, delayMs)
    } else {
      doMove()
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      cancelAiRequest()
      finishAiMove()
    }
  }, [aiDifficulty, aiReadyTick, cancelAiRequest, fen, game, gameMode, paused, playerColor, readAiSearch, readClockForSearch, requestAiMove, stepRequestTick, workspaceMode])

  // ── Human move ────────────────────────────────────────
  const clearBoardSelection = useCallback(() => {
    setSelectedSquare(null)
    setLegalTargets([])
  }, [])

  const applyHumanMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const beforeFen = game.fen()
      let move: Move | null
      try {
        move = game.move({ from, to, promotion })
      } catch {
        return false
      }
      if (!move) return false

      const activePractice = reviewPractice
        && reviewPractice.beforeFen === beforeFen
        && reviewPractice.status !== 'correct'
        ? reviewPractice
        : null
      if (activePractice && !isReviewPracticeAnswer(activePractice.expectedUci, move)) {
        game.undo()
        setReviewPractice(previous => previous && previous.beforeFen === beforeFen
          ? { ...previous, attempts: previous.attempts + 1, status: 'retry' }
          : previous)
        clearBoardSelection()
        setPendingPromotion(null)
        return false
      }

      // An empty square is only focusable while it is a legal target, so the
      // square the reader just pressed Enter on stops being focusable the
      // moment the move lands and focus drops to <body>. Play a move from the
      // keyboard and you were back at the top of the document, 32 piece stops
      // away from the board.
      restoreBoardFocusRef.current = to
      // A new move answers the nudge about the last one, whichever way.
      setBlunderNudge(null)

      cancelStaleBackgroundAnalysis()
      stop()
      const newFen = game.fen()
      setFen(newFen)
      // In a game the move you just played is the game, even if you took one
      // back to play it. In analysis it is a variation, which is the point.
      //
      // The clock is read *before* `registerMovePlayed` presses it, so the node
      // carries what the mover had left when they moved -- which is what
      // `[%clk]` means everywhere else.
      gameTree.addMove(move, newFen, {
        mainLine: workspaceMode === 'play',
        clockMs: clockRef.current ? remainingMs(clockRef.current, move.color, Date.now()) : undefined,
      })
      registerMovePlayed(move)
      if (activePractice) {
        setReviewPractice(previous => previous && previous.beforeFen === beforeFen
          ? {
            ...previous,
            attempts: previous.attempts + 1,
            status: 'correct',
            solvedFen: newFen,
          }
          : previous)
      }
      clearBoardSelection()
      setPendingPromotion(null)
      return true
    },
    [cancelStaleBackgroundAnalysis, clearBoardSelection, game, gameTree, registerMovePlayed, reviewPractice, stop, workspaceMode],
  )

  /**
   * Play the queued premove, the moment the position it was waiting for exists.
   *
   * Legality is settled here and nowhere earlier: the premove was made against
   * a guess about the reply, and a guess that turned out wrong is dropped
   * without comment. That is what every board with premoves does — the
   * alternative is holding it and playing it two moves later, into a position
   * it was never meant for.
   */
  useEffect(() => {
    if (!premove) return
    if (workspaceMode !== 'play' || gameMode !== 'human-vs-ai') { setPremove(null); return }
    if (game.turn() !== playerColorToTurn(playerColor)) return
    if (game.isGameOver() || endedOffBoard || pausedRef.current) { setPremove(null); return }

    setPremove(null)
    const probe = new Chess(game.fen())
    if (!applyPremove(probe, premove)) return
    applyHumanMove(premove.from, premove.to, premove.promotion)
  }, [applyHumanMove, endedOffBoard, fen, game, gameMode, playerColor, premove, workspaceMode])


  /**
   * Walk into an engine line, up to and including the move that was clicked.
   *
   * The panel used to render the principal variation as a sentence, which left
   * the reader replaying it on the board by hand to see the position it was
   * describing. The moves become tree nodes like any other, so the line lands
   * as a variation that can be reviewed, promoted to the main line, or
   * discarded — rather than as a preview with nowhere to go.
   *
   * `lineFen` is checked against the board rather than assumed: a flush can
   * arrive for a position the reader has already navigated away from, and the
   * moves would then be applied to the wrong one.
   */
  const playPvLine = useCallback(
    (lineFen: string, pv: string[], throughIndex: number) => {
      if (lineFen !== game.fen()) return
      const moves = pvLineMoves(lineFen, pv, throughIndex + 1)
      if (!moves.length) return

      cancelStaleBackgroundAnalysis()
      stop()

      let landed: Move | null = null
      for (const step of moves) {
        let move: Move | null
        try {
          move = game.move({ from: step.uci.slice(0, 2), to: step.uci.slice(2, 4), promotion: step.uci[4] })
        } catch {
          break
        }
        if (!move) break
        gameTree.addMove(move, game.fen())
        landed = move
      }

      const reached = game.fen()
      // One sound for the walk, not one per ply: six knocks in as many
      // milliseconds is a noise, not six moves.
      if (landed) playMoveSound(landed)
      setFen(reached)
      clearBoardSelection()
      setPendingPromotion(null)
      // Analyse where we landed, the same way stepping through the move list does.
      if (engineEnabled) setPendingPonderFen(reached)
    },
    [cancelStaleBackgroundAnalysis, clearBoardSelection, engineEnabled, game, gameTree, playMoveSound, stop],
  )

  /**
   * Hover or focus a move in a line: show where it lands.
   *
   * `fenAfter` is already on the step -- `pvLineMoves` replays the line to
   * build the SAN, so the position after each move is a by-product rather than
   * work this repeats.
   */
  const showLinePreview = useCallback((step: PvMove) => {
    setLinePreview({ fen: step.fenAfter, uci: step.uci, label: step.numbered })
  }, [])
  const clearLinePreview = useCallback(() => setLinePreview(null), [])

  // A preview belongs to the position it was previewed from. Same rule as the
  // premove, the hint and the drawn marks.
  useEffect(() => {
    setLinePreview(null)
  }, [fen])

  const previewChess = useMemo(() => {
    if (!linePreview) return null
    try {
      return new Chess(linePreview.fen)
    } catch {
      return null
    }
  }, [linePreview])
  const isPreviewingLine = previewChess !== null

  const beginPromotion = useCallback(
    (from: Square, to: Square) => {
      setPendingPromotion({ from, to })
      clearBoardSelection()
    },
    [clearBoardSelection],
  )

  const onPieceDrop = (sourceSquare: Square, targetSquare: Square, pieceType: string) => {
    if (pendingPromotion) return false
    if (sourceSquare === targetSquare) return false
    if (premoveAllowed) {
      // Not a move: the position it belongs to has not happened yet. Held, and
      // played the moment it does.
      setPremove(premoveFromSquares(game.fen(), sourceSquare, targetSquare, playerColorToTurn(playerColor)))
      return false
    }
    if (isBoardInputLocked({
      workspaceMode,
      gameMode,
      isAiThinking,
      paused,
      turn: game.turn(),
      playerColor: playerColorToTurn(playerColor),
      endedOffBoard: Boolean(endedOffBoard),
    })) return false

    if (pieceType.toLowerCase().endsWith('p') && isPromotionMove(game, sourceSquare, targetSquare)) {
      beginPromotion(sourceSquare, targetSquare)
      return false
    }

    return applyHumanMove(sourceSquare, targetSquare)
  }

  /**
   * The reader's own square marks, on the right button.
   *
   * A right press and release on the *same* square is a mark; anywhere else is
   * the start of an arrow, which the board draws itself. The anchor is what
   * tells the two apart, so it has to be recorded on the way down.
   */
  const handleSquareMouseDown = useCallback(
    ({ square }: { square: string }, event: { button: number }) => {
      if (event.button === 2) {
        rightClickAnchorRef.current = square
        return
      }
      // The board clears its own drawn arrows on a left press; the squares are
      // ours to clear, and leaving them behind would strand half the annotation.
      if (event.button === 0) {
        setMarkedSquares(marks => (hasSquareMarks(marks) ? {} : marks))
      }
    },
    [],
  )

  const handleSquareMouseUp = useCallback(
    ({ square }: { square: string }, event: { button: number } & Parameters<typeof markColorForModifiers>[0]) => {
      if (event.button !== 2) return
      const anchor = rightClickAnchorRef.current
      rightClickAnchorRef.current = null
      if (anchor !== square) return
      setMarkedSquares(marks => toggleSquareMark(marks, square, markColorForModifiers(event)))
    },
    [],
  )

  const onSquareClick = useCallback((square: Square) => {
    if (pendingPromotion) return
    if (premoveAllowed) {
      // Same two-tap shape as an ordinary move, so the gesture does not change
      // just because it is the engine's turn.
      if (selectedSquare) {
        setPremove(premoveFromSquares(game.fen(), selectedSquare, square, playerColorToTurn(playerColor)))
        clearBoardSelection()
        return
      }
      if (isPremoveablePiece(game.fen(), square, playerColorToTurn(playerColor))) {
        setSelectedSquare(square)
        setLegalTargets([])
      } else {
        // Anywhere else cancels, the way it does on every other board.
        setPremove(null)
      }
      return
    }
    if (isBoardInputLocked({
      workspaceMode,
      gameMode,
      isAiThinking,
      paused,
      turn: game.turn(),
      playerColor: playerColorToTurn(playerColor),
      endedOffBoard: Boolean(endedOffBoard),
    })) return

    // If a source square is already selected, try to move there
    if (selectedSquare) {
      // Deselect if same square clicked
      if (square === selectedSquare) {
        clearBoardSelection()
        return
      }
      // If clicking another own piece, re-select it
      const clickedPiece = game.get(square)
      if (clickedPiece && clickedPiece.color === game.turn()) {
        const moves = game.moves({ square, verbose: true })
        setSelectedSquare(square)
        setLegalTargets(uniqueSquares(moves.map(m => m.to as Square)))
        return
      }
      // Attempt the move
      if (isPromotionMove(game, selectedSquare, square)) {
        beginPromotion(selectedSquare, square)
        return
      }
      applyHumanMove(selectedSquare, square)
      clearBoardSelection()
      return
    }

    // First tap: select if it's a piece of the current player
    const piece = game.get(square)
    if (!piece || piece.color !== game.turn()) return
    const moves = game.moves({ square, verbose: true })
    setSelectedSquare(square)
    setLegalTargets(uniqueSquares(moves.map(m => m.to as Square)))
  }, [
    applyHumanMove,
    beginPromotion,
    clearBoardSelection,
    game,
    gameMode,
    endedOffBoard,
    isAiThinking,
    paused,
    pendingPromotion,
    playerColor,
    premoveAllowed,
    selectedSquare,
    workspaceMode,
  ])

  useEffect(() => {
    // Only ever reclaims focus the move itself disturbed — focus still on the
    // board, or already dropped to <body> because the square it was on stopped
    // being focusable. Anywhere else and the reader moved on deliberately.
    const restoreBoardFocus = (settled: boolean) => {
      const square = restoreBoardFocusRef.current
      if (!square) return
      const active = document.activeElement as HTMLElement | null
      const stillOnBoard = Boolean(active?.closest?.('.board-surface'))
      if (active !== document.body && !stillOnBoard) {
        restoreBoardFocusRef.current = null
        return
      }
      // Focus the square, not the piece inside it: the board replaces the piece
      // element as it animates in, which would drop focus straight back to
      // <body>, while the square itself persists. It already carries the label
      // a screen reader should hear ("e4, White pawn"), and -1 keeps it out of
      // the tab order — the sync above only strips tabindex from squares it
      // marked itself, so this survives.
      const squareEl = document.getElementById(`chessboard-square-${square}`)
      if (!squareEl) return
      if (!squareEl.hasAttribute('tabindex')) squareEl.setAttribute('tabindex', '-1')
      squareEl.focus()
      if (settled) restoreBoardFocusRef.current = null
    }

    const sync = (settled = false) => {
      // The board as drawn, which is the previewed position while one is up:
      // labelling e4 "empty" under a pawn the reader can see is worse than no
      // label. A preview has no selection and no legal targets, because
      // nothing can be moved in a position that is not the game.
      const applied = syncRenderedBoardAccessibility(
        previewChess ?? game,
        previewChess ? null : selectedSquare,
        previewChess ? [] : legalTargets,
      )
      restoreBoardFocus(settled)
      return applied
    }

    // Keep looking until there is a board to label. The three fixed attempts
    // this used to make were all spent before `<Chessboard>` mounted on a cold
    // load, and nothing here re-runs until the reader moves -- so the board
    // stayed unlabelled for exactly the reader who cannot move it.
    let retryFrame: number | null = null
    let retries = 0
    const syncUntilBoardExists = () => {
      retryFrame = null
      if (sync() || retries >= BOARD_A11Y_SYNC_MAX_RETRIES) return
      retries += 1
      retryFrame = window.requestAnimationFrame(syncUntilBoardExists)
    }

    const frame = window.requestAnimationFrame(syncUntilBoardExists)
    const settleTimer = window.setTimeout(() => sync(true), 360)

    sync()

    return () => {
      window.cancelAnimationFrame(frame)
      if (retryFrame !== null) window.cancelAnimationFrame(retryFrame)
      window.clearTimeout(settleTimer)
    }
  }, [fen, game, legalTargets, previewChess, selectedSquare])

  const handleBoardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return

      const target = event.target as HTMLElement | null
      const squareEl = target?.closest<HTMLElement>('[id^="chessboard-square-"]')
      if (!squareEl) return

      const square = squareEl.id.replace('chessboard-square-', '')
      if (!isBoardSquare(square)) return

      const isEmptyTarget = squareEl.getAttribute('data-webchess-a11y-target') === 'true'
      const isInteractiveSquare = Boolean(target?.closest('button, [role="button"]')) || isEmptyTarget
      if (event.key === ' ' && !isInteractiveSquare) return

      event.preventDefault()
      onSquareClick(square)
    },
    [onSquareClick],
  )

  const promotionColor = pendingPromotion
    ? game.get(pendingPromotion.from)?.color ?? game.turn()
    : game.turn()

  const completePromotion = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return
      if (!applyHumanMove(pendingPromotion.from, pendingPromotion.to, piece)) {
        setPendingPromotion(null)
      }
    },
    [applyHumanMove, pendingPromotion],
  )

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null)
  }, [])

  useModalFocus(promotionDialogOpen, promotionDialogRef, cancelPromotion)

  // The chooser prints a key on every option, and those keys reached the global
  // shortcut handler only after it had already returned — `shortcutsSuspended`
  // covers `promotionDialogOpen`, so Q/R/B/N did nothing at all. They belong to
  // the dialog anyway, which is the only thing that can act on them.
  useEffect(() => {
    if (!pendingPromotion) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const piece = PROMOTION_KEYS[event.key.toLowerCase()]
      if (!piece) return
      event.preventDefault()
      completePromotion(piece)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [completePromotion, pendingPromotion])

  // ── New game ──────────────────────────────────────────
  const rememberModalTrigger = useCallback(() => {
    modalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [])

  const restoreModalTriggerFocus = useCallback(() => {
    const trigger = modalTriggerRef.current
    modalTriggerRef.current = null
    if (!trigger) return

    window.requestAnimationFrame(() => {
      if (document.contains(trigger)) {
        trigger.focus()
      }
    })
  }, [])

  // Wrapped rather than plain functions because the command palette memoises a
  // list that calls them; a new identity each render made that memo useless.
  const openNewGameDialog = useCallback(() => {
    rememberModalTrigger()
    setSettingsOpen(false)
    setShowPgnDialog(false)
    setShowLibraryDialog(false)
    setShowNewGameDialog(true)
  }, [rememberModalTrigger])
  openNewGameDialogRef.current = openNewGameDialog
  const openPgnDialog = useCallback(() => {
    rememberModalTrigger()
    setSettingsOpen(false)
    setShowNewGameDialog(false)
    setShowLibraryDialog(false)
    setShowPgnDialog(true)
  }, [rememberModalTrigger])
  const openLibraryDialog = useCallback(() => {
    rememberModalTrigger()
    setSettingsOpen(false)
    setShowNewGameDialog(false)
    setShowPgnDialog(false)
    setShowLibraryDialog(true)
  }, [rememberModalTrigger])


  const closeNewGameDialog = useCallback(() => {
    setShowNewGameDialog(false)
    restoreModalTriggerFocus()
  }, [restoreModalTriggerFocus])
  const closePgnDialog = useCallback(() => {
    setShowPgnDialog(false)
    restoreModalTriggerFocus()
  }, [restoreModalTriggerFocus])
  const library = useGameLibrary()
  // Built only while the dialog is open; exportAnnotatedPgn walks the whole tree.
  const libraryPgn = useMemo(
    () => (showLibraryDialog && mainLineNodes.length > 1
      ? exportAnnotatedPgn(mainLineNodes, evaluationsByFen, pgnHeaders, gameTree.nodesSnapshot)
      : ''),
    [showLibraryDialog, mainLineNodes, evaluationsByFen, pgnHeaders, gameTree.nodesSnapshot],
  )
  const librarySuggestedName = useMemo(
    () => (libraryPgn ? suggestGameName(libraryPgn) : ''),
    [libraryPgn],
  )
  const closeLibraryDialog = useCallback(() => {
    setShowLibraryDialog(false)
    restoreModalTriggerFocus()
  }, [restoreModalTriggerFocus])
  const handleSettingsToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open
    setSettingsOpen(nextOpen)
    if (!nextOpen) return
    setShowNewGameDialog(false)
    setShowPgnDialog(false)
    setShowLibraryDialog(false)
  }

  const abortSampleFetch = useCallback(() => {
    sampleFetchControllerRef.current?.abort()
    sampleFetchControllerRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      sampleLoadSeqRef.current += 1
      abortSampleFetch()
    }
  }, [abortSampleFetch])

  const cancelSampleLoad = useCallback(() => {
    sampleLoadSeqRef.current += 1
    abortSampleFetch()
    setSampleLoadingId(null)
  }, [abortSampleFetch])

  const requestBoardReveal = useCallback(() => {
    setBoardRevealTick(tick => tick + 1)
  }, [])

  useEffect(() => {
    if (boardRevealTick === 0) return
    if (!isMobileLayout) return

    let settleTimer: ReturnType<typeof window.setTimeout> | null = null
    let finalTimer: ReturnType<typeof window.setTimeout> | null = null
    let longSettleTimer: ReturnType<typeof window.setTimeout> | null = null
    const scrollBoardToTop = () => {
      const mainContainer = mainContainerRef.current
      const boardStage = boardStageRef.current
      if (!mainContainer || !boardStage) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) activeElement.blur()
      boardStage.focus({ preventScroll: true })
      mainContainer.scrollTo({
        top: boardStage.offsetTop,
        behavior: 'auto',
      })
    }

    scrollBoardToTop()
    settleTimer = window.setTimeout(scrollBoardToTop, 160)
    finalTimer = window.setTimeout(scrollBoardToTop, 360)
    longSettleTimer = window.setTimeout(scrollBoardToTop, 1200)

    return () => {
      if (settleTimer) window.clearTimeout(settleTimer)
      if (finalTimer) window.clearTimeout(finalTimer)
      if (longSettleTimer) window.clearTimeout(longSettleTimer)
    }
  }, [boardRevealTick, isMobileLayout])

  useEffect(() => {
    if (analysisPanelRevealTick === 0) return
    if (!isMobileLayout) return
    if (workspaceMode !== 'analysis') return

    let settleTimer: ReturnType<typeof window.setTimeout> | null = null
    let finalTimer: ReturnType<typeof window.setTimeout> | null = null
    const scrollAnalysisPanelToTop = () => {
      const mainContainer = mainContainerRef.current
      const analysisPanel = analysisPanelRef.current
      if (!mainContainer || !analysisPanel) return
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) activeElement.blur()
      analysisPanel.focus({ preventScroll: true })
      mainContainer.scrollTo({
        top: analysisPanel.offsetTop,
        behavior: 'auto',
      })
    }

    scrollAnalysisPanelToTop()
    settleTimer = window.setTimeout(scrollAnalysisPanelToTop, 120)
    finalTimer = window.setTimeout(scrollAnalysisPanelToTop, 320)

    return () => {
      if (settleTimer) window.clearTimeout(settleTimer)
      if (finalTimer) window.clearTimeout(finalTimer)
    }
  }, [analysisPanelRevealTick, isMobileLayout, workspaceMode])

  useEffect(() => {
    if (importSweepProgress.total <= 0) return
    requestBoardReveal()
  }, [importSweepProgress.total, requestBoardReveal])

  const readCachedSamplePgn = useCallback((sampleId: string): string | null => {
    const cached = samplePgnCacheRef.current.get(sampleId)
    if (!cached) return null
    samplePgnCacheRef.current.delete(sampleId)
    samplePgnCacheRef.current.set(sampleId, cached)
    return cached
  }, [])

  const writeCachedSamplePgn = useCallback((sampleId: string, pgnText: string) => {
    const cache = samplePgnCacheRef.current
    cache.delete(sampleId)
    cache.set(sampleId, pgnText)

    while (cache.size > SAMPLE_PGN_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value
      if (typeof oldestKey !== 'string') break
      cache.delete(oldestKey)
    }
  }, [])

  const handlePgnImport = useCallback((pgnText: string, options?: PgnImportOptions) => {
    try {
      const importedGame = parsePgnMoveTree(pgnText)
      if (!options?.fromSample) {
        cancelSampleLoad()
      }
      const shouldAnalyzeAfterLoad = options?.analyzeAfterLoad ?? engineEnabled
      if (shouldAnalyzeAfterLoad) {
        setWorkspaceMode('analysis')
        setAnalysisTab('analyze')
      }

      setIsImportingGame(true)
      clearImportSweep()
      clearBatchReview()
      cancelPendingAiMove()
      const rootFen = importedGame.rootFen
      newGame()
      game.load(rootFen)
      setFen(game.fen())
      setEvaluationsByFen(new Map())
      setClock(null)
      setResignedBy(null)
      setPremove(null)
      setHintMove(null)
      setPendingShallowAnalyzeFen(null)
      setSampleLoadError(null)
      setPendingPromotion(null)
      clearBoardSelection()
      setPgnHeaders(importedGame.headers)

      const mainLineEntries = flattenPgnMainLine(importedGame.moves)
      gameTree.loadTree(importedGame.moves, rootFen)

      const finalFen = mainLineEntries.at(-1)?.fen ?? rootFen
      game.load(finalFen)
      setFen(finalFen)
      setEvaluationsByFen(importedGame.evaluations)
      if (shouldAnalyzeAfterLoad) {
        setPendingShallowAnalyzeFen(finalFen)
        const sweepTargets = buildImportSweepTargets(mainLineEntries, rootFen, IMPORT_SWEEP_TARGET_LIMIT)
        const sweepCandidateCount = countImportSweepCandidates(mainLineEntries)
        importSweepQueueRef.current = sweepTargets
        setImportSweepProgress({
          done: 0,
          total: sweepTargets.length,
          sampledFrom: sweepCandidateCount > sweepTargets.length ? sweepCandidateCount : undefined,
        })
      } else {
        setPendingShallowAnalyzeFen(null)
        clearImportSweep()
      }

      setPaused(true)
      pausedRef.current = true
      cancelPendingAiMove()
      setIsImportingGame(false)
      requestBoardReveal()
      return { ok: true }
    } catch (error) {
      setIsImportingGame(false)
      return { ok: false, error: pgnImportUserErrorMessage(error) ?? 'Failed to parse PGN. Check the move text, headers, and move numbers.' }
    }
  }, [cancelPendingAiMove, cancelSampleLoad, clearBatchReview, clearBoardSelection, clearImportSweep, engineEnabled, game, gameTree, newGame, requestBoardReveal, setPgnHeaders])

  const handleAnalysisPgnImport = useCallback(
    (pgnText: string) => handlePgnImport(pgnText, { analyzeAfterLoad: true }),
    [handlePgnImport],
  )

  const handleLibraryLoad = useCallback(
    (game: LibraryGame): LibraryWriteResult => {
      const result = handleAnalysisPgnImport(game.pgn)
      if (result.ok) {
        closeLibraryDialog()
        return { ok: true }
      }
      return { ok: false, error: result.error ?? 'That saved game could not be loaded.' }
    },
    [handleAnalysisPgnImport, closeLibraryDialog],
  )

  // ── Auto-save ──────────────────────────────────────────
  // Offer whatever the last session left behind, then keep the slot current.
  // The check is mount-only and runs before the first debounced write, so a
  // fresh board cannot clear the snapshot it is about to offer.
  const autoSaveCheckedRef = useRef(false)

  useEffect(() => {
    if (autoSaveCheckedRef.current) return
    autoSaveCheckedRef.current = true
    const snapshot = readAutoSavedGame()
    if (!snapshot) return
    if (mainLineNodes.length > 1) {
      // A share link already put a game on the board, so the snapshot is stale.
      clearAutoSavedGame()
      return
    }
    setAutoSaveRecovery(snapshot)
    // Deliberately mount-only: a one-shot check against the board as it loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Evaluations are a dependency on purpose: as the engine improves them the
  // snapshot is rewritten, so a recovered game carries the analysis it had
  // rather than whatever was known 700ms after the last move.
  //
  // Which is also why the delay is not a plain debounce. The evaluation map
  // takes a new identity on every engine flush, so while a search runs this
  // effect re-runs about ten times a second and a 700ms timer never elapses:
  // a game review could grind through a hundred positions with nothing
  // written. autoSaveDelayMs keeps the debounce for the quiet case and adds a
  // deadline for the noisy one.
  const autoSaveLastWriteAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (autoSaveRecovery) return
    const delay = autoSaveDelayMs(Date.now(), autoSaveLastWriteAtRef.current, AUTO_SAVE_DEBOUNCE_MS)
    const timeout = window.setTimeout(() => {
      autoSaveLastWriteAtRef.current = Date.now()
      const plies = mainLineNodes.length - 1
      if (plies <= 0) {
        clearAutoSavedGame()
        return
      }
      writeAutoSavedGame(
        exportAnnotatedPgn(mainLineNodes, evaluationsByFen, pgnHeaders, gameTree.nodesSnapshot),
        plies,
        undefined,
        undefined,
        // Banked times, read at the moment of writing, so a clock that is
        // running is stored as what it would show if it stopped now.
        clockRef.current
          ? {
            control: clockRef.current.control,
            whiteMs: remainingMs(clockRef.current, 'w', Date.now()),
            blackMs: remainingMs(clockRef.current, 'b', Date.now()),
            flagged: clockRef.current.flagged,
          }
          : undefined,
        // Only for a game being played. An imported PGN under analysis has no
        // side to take, and restoring one into Play mode would invent one.
        playSessionRef.current,
      )
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [autoSaveRecovery, mainLineNodes, evaluationsByFen, pgnHeaders, gameTree.nodesSnapshot])

  const dismissAutoSaveRecovery = useCallback(() => {
    clearAutoSavedGame()
    setAutoSaveRestoreError(null)
    setAutoSaveRecovery(null)
  }, [])

  /**
   * A failed restore used to delete the slot and close the dialog without a
   * word, so the reader pressed Restore and watched their unfinished game
   * vanish into an empty board. Nothing here is recoverable once the slot is
   * gone, so the failure now says what went wrong, keeps the snapshot, and
   * offers the moves to the clipboard before anything is discarded.
   */
  const restoreAutoSavedGame = useCallback(() => {
    if (!autoSaveRecovery) return
    const result = handleAnalysisPgnImport(autoSaveRecovery.pgn)
    if (!result.ok) {
      setAutoSaveRestoreError(result.error ?? 'The saved moves could not be read.')
      return
    }
    setAutoSaveRestoreError(null)
    setAutoSaveRecovery(null)
    // Everything below runs after the import, which resets the board and the
    // clock and sends the workspace to Analysis.
    const session = autoSaveRecovery.play
    if (session) {
      // It was a game. Restoring it into the analysis board loses the opponent,
      // which is most of what was in progress.
      setWorkspaceMode('play')
      setGameMode(session.gameMode)
      setPlayerColor(session.playerColor)
      setAiDifficulty(session.difficulty as AiDifficulty)
      setAiPlayerDifficulty(session.difficulty as AiDifficulty)
      setOrientation(defaultOrientationForGameMode(session.gameMode, session.playerColor))
      pausedRef.current = true
      setPaused(true)
      // Restored after the import, which cleared it along with the board.
      if (session.resignedBy) setResignedBy(session.resignedBy)
    }
    // Stopped, not running: the reader was not thinking while the page was
    // closed, and starting a countdown under a board they have not looked at
    // yet would take time off them for the reload.
    const saved = autoSaveRecovery.clock
    if (saved) {
      setClock({
        control: saved.control,
        whiteMs: saved.whiteMs,
        blackMs: saved.blackMs,
        running: null,
        since: null,
        flagged: saved.flagged,
      })
    }
  }, [autoSaveRecovery, handleAnalysisPgnImport, setAiPlayerDifficulty])

  const copyAutoSavedPgn = useCallback(() => {
    const pgn = autoSaveRecovery?.pgn
    if (!pgn) return
    navigator.clipboard?.writeText(pgn).then(
      () => setAutoSaveCopyLabel('Copied'),
      () => setAutoSaveCopyLabel('Copy failed'),
    )
  }, [autoSaveRecovery])

  const handleFenLoad = useCallback((fenText: string, options?: FenLoadOptions) => {
    const validation = validateFenForAnalysis(fenText)
    if (!validation.ok) {
      return { ok: false, error: validation.error }
    }

    try {
      cancelSampleLoad()
      const rootFen = validation.fen

      const shouldAnalyzeAfterLoad = options?.forceAnalysis ?? engineEnabled
      if (options?.forceAnalysis) {
        setWorkspaceMode('analysis')
        setAnalysisTab('analyze')
      }

      cancelPendingAiMove()
      newGame()
      game.load(rootFen)
      setFen(rootFen)
      gameTree.reset(rootFen)
      setPgnHeaders({})
      setEvaluationsByFen(new Map())
      setClock(null)
      setResignedBy(null)
      setPremove(null)
      setHintMove(null)
      setPgnHeaders({})
      clearImportSweep()
      clearBatchReview()
      setPendingShallowAnalyzeFen(shouldAnalyzeAfterLoad ? rootFen : null)
      setSampleLoadError(null)
      setPendingPromotion(null)
      setSelectedSquare(null)
      setLegalTargets([])
      setIsImportingGame(false)
      pausedRef.current = true
      setPaused(true)
      cancelPendingAiMove()
      requestBoardReveal()
      return { ok: true }
    } catch {
      return { ok: false, error: FEN_PARSE_ERROR }
    }
  }, [cancelPendingAiMove, cancelSampleLoad, clearBatchReview, clearImportSweep, engineEnabled, game, gameTree, newGame, requestBoardReveal, setPgnHeaders])

  const handleAnalysisFenLoad = useCallback(
    (fenText: string) => handleFenLoad(fenText, { forceAnalysis: true }),
    [handleFenLoad],
  )

  /**
   * Open a game somebody sent as a link.
   *
   * The FEN share below carries where a game got to; this carries how it got
   * there. Built through `loadMainLine` rather than move by move, for the same
   * reason a PGN import is: one tree publish instead of one per ply.
   *
   * A link that has been truncated or edited plays as far as it really goes —
   * `replaySharedGame` stops at the first move the position will not take —
   * rather than being thrown away whole.
   */
  const loadSharedGame = useCallback((shared: { rootFen: string; moves: string[] }): boolean => {
    const played = replaySharedGame(shared)
    if (!played.length) return false

    cancelSampleLoad()
    cancelPendingAiMove()
    cancelStaleBackgroundAnalysis()
    setShowPgnDialog(false)
    setShowNewGameDialog(false)
    setShowLibraryDialog(false)
    setSettingsOpen(false)
    setWorkspaceMode('analysis')

    newGame()
    setEvaluationsByFen(new Map())
    setClock(null)
    setResignedBy(null)
    setPremove(null)
    setPgnHeaders({})
    clearImportSweep()
    clearBatchReview()
    setPendingPromotion(null)
    clearBoardSelection()

    gameTree.loadMainLine(played.map(entry => ({ move: entry.move, fen: entry.fen })), shared.rootFen)
    const finalFen = played[played.length - 1]!.fen
    game.load(finalFen)
    setFen(finalFen)
    setPendingPonderFen(finalFen)
    requestBoardReveal()
    return true
  }, [
    cancelPendingAiMove, cancelSampleLoad, cancelStaleBackgroundAnalysis, clearBatchReview,
    clearBoardSelection, clearImportSweep, game, gameTree, newGame, requestBoardReveal, setPgnHeaders,
  ])

  useEffect(() => {
    const loadSharedHash = () => {
      const sharedGame = parseGameShareHash(window.location.hash)
      if (sharedGame && loadSharedGame(sharedGame)) return
      const sharedFen = loadSharedFenFromUrl()
      if (!sharedFen) return
      setShowPgnDialog(false)
      setShowNewGameDialog(false)
      setShowLibraryDialog(false)
      setSettingsOpen(false)
      if (sharedFen === game.fen()) {
        requestBoardReveal()
        return
      }
      handleFenLoad(sharedFen, { forceAnalysis: true })
    }

    // Also on mount: a link opened cold has its hash before the first render,
    // and only the FEN half was read there.
    loadSharedHash()

    window.addEventListener('hashchange', loadSharedHash)
    return () => window.removeEventListener('hashchange', loadSharedHash)
    // Mount-and-hashchange only. Re-running this on every render of the
    // callbacks it uses would re-open the link under whatever the reader has
    // since done with the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadHistoricalSample = useCallback(
    async (sample: HistoricalSampleGame) => {
      abortSampleFetch()
      const requestId = sampleLoadSeqRef.current + 1
      sampleLoadSeqRef.current = requestId
      const controller = new AbortController()
      sampleFetchControllerRef.current = controller
      setSampleLoadingId(sample.id)
      setSampleLoadError(null)
      try {
        let pgnText = readCachedSamplePgn(sample.id)
        if (!pgnText) {
          pgnText = await fetchSamplePgn(sample, controller.signal)
          if (controller.signal.aborted || requestId !== sampleLoadSeqRef.current) return
          writeCachedSamplePgn(sample.id, pgnText)
        }
        if (requestId !== sampleLoadSeqRef.current) return
        const result = handlePgnImport(pgnText, { analyzeAfterLoad: true, fromSample: true })
        if (!result.ok) {
          setSampleLoadError(result.error ?? 'Failed to load sample game.')
        }
      } catch (error) {
        if (requestId !== sampleLoadSeqRef.current) return
        setSampleLoadError(error instanceof Error ? error.message : 'Failed to load sample game.')
      } finally {
        if (requestId === sampleLoadSeqRef.current) {
          sampleFetchControllerRef.current = null
          setSampleLoadingId(null)
        }
      }
    },
    [abortSampleFetch, handlePgnImport, readCachedSamplePgn, writeCachedSamplePgn],
  )

  const handleNewGameStart = useCallback(
    ({ mode, playerColor: color, difficulty, timeControlId: chosenTimeControlId }: {
      mode: GameMode
      playerColor: PlayerColor
      difficulty: AiDifficulty
      timeControlId: string
    }) => {
      cancelSampleLoad()
      setShowNewGameDialog(false)
      cancelPendingAiMove()
      setWorkspaceMode('play')
      setGameMode(mode)
      setPlayerColor(color)
      setAiDifficulty(difficulty)
      setAiPlayerDifficulty(difficulty)

      newGame()
      game.reset()
      const startFen = game.fen()
      setFen(startFen)
      cancelPendingAiMove()
      setEvaluationsByFen(new Map())
      setClock(null)
      setResignedBy(null)
      setPremove(null)
      setHintMove(null)
      setPgnHeaders({})
      clearImportSweep()
      clearBatchReview()
      setPendingShallowAnalyzeFen(null)
      setIsImportingGame(false)
      setPendingPromotion(null)
      clearBoardSelection()
      pausedRef.current = false
      setPaused(false)
      gameTree.reset()

      setTimeControlId(chosenTimeControlId)
      const control = timeControlPresetById(chosenTimeControlId)?.control ?? null
      // White's clock runs from the start of the game, the way a clock does.
      // The alternative -- starting it on the first move -- gives White an
      // untimed think that Black never gets. Space pauses if you are not ready.
      setClock(control ? startSide(createClock(control), 'w', Date.now()) : null)
      setResignedBy(null)
      // The header the per-move `[%clk]` readings count down from. Without it
      // an exported timed game says how much time was left and never what of.
      if (control) setPgnHeaders({ TimeControl: timeControlTag(control) })

      setOrientation(defaultOrientationForGameMode(mode, color))
      requestBoardReveal()
    },
    [cancelPendingAiMove, cancelSampleLoad, clearBatchReview, clearBoardSelection, clearImportSweep, game, gameTree, newGame, requestBoardReveal, setAiPlayerDifficulty, setPgnHeaders],
  )

  /**
   * Hand the position on the board to Play mode and take the move.
   *
   * The gap this closes: New Game always resets to the starting position, so
   * there was no way to try a critical moment again, or to convert an endgame
   * the review just called a mistake. Both siblings of this app and every
   * desktop GUI have it -- Nibbler calls it playing from any position -- and it
   * is the one place beginners and players who are actually studying want the
   * same button.
   *
   * The human takes whichever side is on move, because the point is to find
   * *that* move rather than watch the reply. Evaluations are deliberately kept:
   * they are keyed by position, not by game, so a line that comes back to a
   * position already searched keeps its reading.
   */
  const playFromCurrentPosition = useCallback(() => {
    const startFen = game.fen()
    const humanColor = sideToMoveColor(startFen)
    if (!humanColor) return
    if (game.isGameOver()) return

    cancelSampleLoad()
    cancelPendingAiMove()
    cancelStaleBackgroundAnalysis()
    setSettingsOpen(false)

    setWorkspaceMode('play')
    setGameMode('human-vs-ai')
    setPlayerColor(humanColor)
    setAiPlayerDifficulty(aiDifficulty)

    newGame()
    game.load(startFen)
    setFen(startFen)
    gameTree.reset(startFen)
    setPgnHeaders({})
    clearImportSweep()
    clearBatchReview()
    setPendingShallowAnalyzeFen(null)
    setPendingPonderFen(null)
    setIsImportingGame(false)
    setPendingPromotion(null)
    clearBoardSelection()
    pausedRef.current = false
    setPaused(false)

    // A game against the engine from here is still a game, so it gets the
    // clock the reader last chose -- and the side to move starts on it.
    const control = timeControlPresetById(timeControlIdRef.current)?.control ?? null
    setClock(control
      ? startSide(createClock(control), sideToMoveColor(startFen) === 'white' ? 'w' : 'b', Date.now())
      : null)
    setResignedBy(null)
    if (control) setPgnHeaders({ TimeControl: timeControlTag(control) })

    setOrientation(defaultOrientationForGameMode('human-vs-ai', humanColor))
    requestBoardReveal()
  }, [
    aiDifficulty,
    cancelPendingAiMove,
    cancelSampleLoad,
    cancelStaleBackgroundAnalysis,
    clearBatchReview,
    clearBoardSelection,
    clearImportSweep,
    game,
    gameTree,
    newGame,
    requestBoardReveal,
    setAiPlayerDifficulty,
    setPgnHeaders,
  ])

  /**
   * The three things a reader with a position wants to do with it somewhere
   * else, and had to open the PGN dialog for: put the FEN or the PGN on the
   * clipboard, or take the line to Lichess for a second opinion.
   */
  const copyFen = useCallback(() => {
    const clipboard = navigator.clipboard
    if (!clipboard) {
      announce('Clipboard unavailable — copy the FEN from the PGN dialog')
      return
    }
    clipboard.writeText(fen).then(
      () => announce('FEN copied'),
      () => announce('Clipboard blocked — copy the FEN from the PGN dialog'),
    )
  }, [announce, fen])
  const copyPgn = useCallback(() => {
    if (mainLineNodes.length <= 1) return
    const clipboard = navigator.clipboard
    if (!clipboard) {
      announce('Clipboard unavailable — copy the PGN from the PGN dialog')
      return
    }
    const pgn = exportAnnotatedPgn(mainLineNodes, evaluationsByFen, pgnHeaders, gameTree.nodesSnapshot)
    clipboard.writeText(pgn).then(
      () => announce('PGN copied'),
      () => announce('Clipboard blocked — copy the PGN from the PGN dialog'),
    )
  }, [announce, evaluationsByFen, gameTree.nodesSnapshot, mainLineNodes, pgnHeaders])
  const openInLichess = useCallback(() => {
    // The line the reader is standing in, up to where they stand -- not the
    // main line, which may be a different game by now.
    const url = lichessAnalysisUrl({
      rootFen: currentRootFen,
      sanMoves: currentPathNodes.slice(1).map(node => node.san),
      fen,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [currentPathNodes, currentRootFen, fen])
  /** The position only: chess.com's route has no documented way to carry a line. */
  const openInChessCom = useCallback(() => {
    window.open(chessComPositionUrl(fen), '_blank', 'noopener,noreferrer')
  }, [fen])

  const paletteCommands = useMemo<Command[]>(() => [
    { id: 'new-game', label: 'New game', shortcut: 'N', keywords: ['restart', 'reset'], run: openNewGameDialog },
    { id: 'flip-board', label: 'Flip board', shortcut: 'F', keywords: ['orientation', 'rotate', 'side'],
      run: () => setOrientation(value => (value === 'white' ? 'black' : 'white')) },
    { id: 'pgn', label: 'PGN and FEN', hint: 'Import, export, share', keywords: ['paste', 'copy', 'link', 'position'],
      run: openPgnDialog },
    { id: 'copy-fen', label: 'Copy FEN', hint: 'The position on the board', keywords: ['clipboard', 'position', 'share'],
      run: copyFen },
    {
      id: 'copy-pgn',
      label: 'Copy PGN',
      hint: mainLineNodes.length > 1 ? 'The whole game, variations and all' : 'No moves to copy yet',
      keywords: ['clipboard', 'game', 'export', 'share'],
      disabled: mainLineNodes.length <= 1,
      run: copyPgn,
    },
    {
      id: 'open-lichess',
      label: 'Open in Lichess',
      hint: 'This line, on the Lichess analysis board',
      keywords: ['lichess', 'external', 'explorer', 'study', 'second opinion'],
      run: openInLichess,
    },
    {
      id: 'open-chess-com',
      label: 'Open in chess.com',
      hint: 'This position, on the chess.com analysis board',
      keywords: ['chess.com', 'chesscom', 'external', 'second opinion'],
      run: openInChessCom,
    },
    { id: 'library', label: 'Library', hint: 'Saved games', keywords: ['save', 'open', 'backup'],
      run: openLibraryDialog },
    { id: 'mode-play', label: 'Play mode', keywords: ['workspace'], run: () => handleWorkspaceModeChange('play') },
    { id: 'mode-analysis', label: 'Analysis mode', keywords: ['workspace', 'engine'],
      run: () => handleWorkspaceModeChange('analysis') },
    { id: 'tab-analyze', label: 'Analyze', keywords: ['engine', 'evaluation'], run: () => handleAnalysisTabChange('analyze') },
    { id: 'tab-review', label: 'Review', keywords: ['accuracy', 'mistakes'], run: () => handleAnalysisTabChange('review') },
    { id: 'tab-lab', label: 'Engine Lab', keywords: ['uci', 'options'], run: () => handleAnalysisTabChange('engine-lab') },
    {
      id: 'review-game',
      label: 'Review game',
      hint: reviewGameDisabledReason ?? undefined,
      keywords: ['accuracy', 'blunders', 'report'],
      // Shown disabled rather than hidden, with the reason as the hint: a
      // reader looking for it should learn what it needs, not wonder whether
      // they misremembered the name.
      disabled: Boolean(reviewGameDisabledReason),
      run: startBatchReview,
    },
    {
      id: 'take-back',
      label: 'Take back',
      shortcut: 'Z',
      hint: takebackReason ?? 'Undo back to your last turn',
      keywords: ['undo', 'takeback', 'revert', 'oops'],
      disabled: Boolean(takebackReason),
      run: takebackMove,
    },
    {
      id: 'hint',
      label: 'Hint',
      shortcut: 'H',
      hint: hintReason ?? 'Ask the engine what it would play',
      keywords: ['help', 'suggest', 'stuck', 'best move', 'advice'],
      disabled: Boolean(hintReason),
      run: requestHint,
    },
    {
      id: 'threats',
      label: 'What is threatened?',
      shortcut: 'T',
      hint: workspaceMode === 'analysis' ? undefined : 'Analysis mode only',
      keywords: ['threat', 'danger', 'null move', 'opponent'],
      disabled: workspaceMode !== 'analysis' || isProbingThreat,
      run: () => requestThreatRef.current(),
    },
    {
      id: 'toggle-sound',
      label: soundEnabled ? 'Turn move sounds off' : 'Turn move sounds on',
      keywords: ['audio', 'sound', 'mute', 'quiet'],
      run: () => setSoundEnabled(value => !value),
    },
    { id: 'go-first', label: 'Go to first position', shortcut: 'Home', keywords: ['start', 'beginning'], run: goFirst },
    { id: 'go-last', label: 'Go to last position', shortcut: 'End', keywords: ['end', 'latest'], run: goLast },
    {
      id: 'prev-variation',
      label: 'Previous variation',
      shortcut: '↑',
      hint: atVariationFork ? undefined : 'No other line at this move',
      keywords: ['line', 'branch', 'alternative', 'sibling'],
      disabled: !atVariationFork,
      run: () => goSiblingVariation(-1),
    },
    {
      id: 'next-variation',
      label: 'Next variation',
      shortcut: '↓',
      hint: atVariationFork ? undefined : 'No other line at this move',
      keywords: ['line', 'branch', 'alternative', 'sibling'],
      disabled: !atVariationFork,
      run: () => goSiblingVariation(1),
    },
    {
      id: 'next-mistake',
      label: 'Next mistake',
      hint: reviewFaultCount > 0
        ? `${countLabel(reviewFaultCount, 'mistake')} in the reviewed line`
        : 'Run Review Game first',
      keywords: ['blunder', 'inaccuracy', 'error', 'jump', 'skip', 'review'],
      disabled: !nextReviewFaultRow,
      run: () => goToReviewFault(1),
    },
    {
      id: 'previous-mistake',
      label: 'Previous mistake',
      hint: reviewFaultCount > 0
        ? `${countLabel(reviewFaultCount, 'mistake')} in the reviewed line`
        : 'Run Review Game first',
      keywords: ['blunder', 'inaccuracy', 'error', 'jump', 'back', 'review'],
      disabled: !previousReviewFaultRow,
      run: () => goToReviewFault(-1),
    },
    {
      id: 'play-from-here',
      label: 'Play from this position',
      hint: playFromHereDisabledReason ?? 'Take the move against the engine',
      keywords: ['practice', 'train', 'convert', 'try again', 'engine'],
      disabled: Boolean(playFromHereDisabledReason),
      run: playFromCurrentPosition,
    },
    { id: 'settings', label: 'Settings', keywords: ['preferences', 'engine', 'options'],
      run: () => { rememberModalTrigger(); setSettingsOpen(true) } },
  ], [atVariationFork, copyFen, copyPgn, goToReviewFault, handleAnalysisTabChange, handleWorkspaceModeChange, goFirst, goLast,
      goSiblingVariation, hintReason, isProbingThreat, mainLineNodes.length, nextReviewFaultRow, openInChessCom, openInLichess,
      previousReviewFaultRow, requestHint, openLibraryDialog,
      openNewGameDialog, openPgnDialog, playFromCurrentPosition, playFromHereDisabledReason, rememberModalTrigger,
      reviewFaultCount, reviewGameDisabledReason, soundEnabled, startBatchReview, takebackMove, takebackReason, workspaceMode])

  // ── Mode switch mid-game ──────────────────────────────
  const handleModeChange = useCallback((mode: GameMode) => {
    cancelPendingAiMove()
    setGameMode(mode)
    setOrientation(defaultOrientationForGameMode(mode, playerColor))
    if (workspaceMode !== 'play') {
      cancelStaleBackgroundAnalysis()
      setWorkspaceMode('play')
    }
    if (mode === 'ai-vs-ai') clearBoardSelection()
    if (pausedRef.current) {
      pausedRef.current = false
      setPaused(false)
    }
    // Same as `resume`: the AI loop is re-entered by `gameMode`, by
    // `workspaceMode`, or by `paused` above -- one of the three has always
    // changed by the time this returns, since the caller only reaches here for
    // a different mode or a different workspace.
  }, [cancelPendingAiMove, cancelStaleBackgroundAnalysis, clearBoardSelection, playerColor, workspaceMode])

  const navigateMoveListAndPause = useCallback((chess: Chess) => {
    navigateAndPause(chess)
  }, [navigateAndPause])

  const navigateMoveListAndPonder = useCallback((chess: Chess) => {
    navigateAndPonder(chess)
  }, [navigateAndPonder])

  const navigateReviewNode = useCallback((node: GameNode) => {
    setReviewPractice(null)
    navigateAndPonder(gameTreeRef.current.navigateTo(node.id))
  }, [navigateAndPonder])

  const startReviewPractice = useCallback((
    beforeNode: GameNode,
    expectedUci: string,
    expectedSan: string,
    moveLabel: string,
  ) => {
    const chess = gameTreeRef.current.navigateTo(beforeNode.id)
    setReviewPractice({
      beforeFen: beforeNode.fen,
      beforeNodeId: beforeNode.id,
      expectedUci,
      expectedSan,
      moveLabel,
      attempts: 0,
      status: 'ready',
    })
    navigateAndPonder(chess)
    requestBoardReveal()
  }, [navigateAndPonder, requestBoardReveal])

  /**
   * Leave the exercise.
   *
   * A solved one leaves the board inside the variation the answer became,
   * and the review follows the line you are standing in -- so the panel read
   * "No major swings found in this reviewed line" with no Practice button on
   * it, while the game's critical moments, and the next one to practise, sat
   * one node back on the main line. Done goes back to the position the
   * exercise began from, which is on the game. The solved line stays in the
   * tree for anyone who wants to walk it.
   */
  const exitReviewPractice = useCallback(() => {
    const active = reviewPractice
    setReviewPractice(null)
    if (active?.status !== 'correct') return
    const tree = gameTreeRef.current
    if (!tree.getNode(active.beforeNodeId)) return
    navigateAndPonder(tree.navigateTo(active.beforeNodeId))
  }, [navigateAndPonder, reviewPractice])

  const tryReviewBestMove = useCallback((beforeNode: GameNode, bestMove?: string) => {
    setReviewPractice(null)
    const chess = gameTreeRef.current.navigateTo(beforeNode.id)
    if (!bestMove || bestMove.length < 4) {
      navigateAndPonder(chess)
      return
    }

    let move: Move | null
    try {
      move = chess.move({
        from: bestMove.slice(0, 2) as Square,
        to: bestMove.slice(2, 4) as Square,
        promotion: bestMove[4] as PromotionPiece | undefined,
      })
    } catch {
      navigateAndPonder(chess)
      return
    }

    if (!move) {
      navigateAndPonder(chess)
      return
    }

    clearImportSweep()
    gameTreeRef.current.addMove(move, chess.fen())
    navigateAndPonder(chess)
  }, [clearImportSweep, navigateAndPonder])

  // ── Step: advance one AI move ─────────────────────────
  const handleStep = useCallback(() => {
    if (game.isGameOver() || aiMoveScheduledRef.current) return
    const currentTurn = game.turn()
    const isAiTurn =
      gameMode === 'ai-vs-ai' ||
      (gameMode === 'human-vs-ai' && currentTurn !== playerColor[0])
    if (!isAiTurn) return

    stepPendingRef.current = true
    pausedRef.current = false
    setPaused(false)
    aiMoveScheduledRef.current = false
    setStepRequestTick(tick => tick + 1)
  }, [game, gameMode, playerColor])

  // ── Flip ──────────────────────────────────────────────
  const flipBoard = () => setOrientation(v => v === 'white' ? 'black' : 'white')

  // ── Resize ────────────────────────────────────────────
  const MIN_WIDTH = 60
  const MAX_SIDE_PANEL_WIDTH = 600
  const DEFAULT_LEFT = DEFAULT_LEFT_PANEL_WIDTH
  const DEFAULT_RIGHT = 320
  const keyboardResizeStep = 40

  const activateOnKeyboard = (event: ReactKeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    action()
  }

  const clampSidePanelWidth = (width: number) => (width < MIN_WIDTH ? 0 : Math.min(width, MAX_SIDE_PANEL_WIDTH))

  const toggleTopPanel = () => setTopPanelOpen(value => !value)
  const toggleBottomPanel = () => setBottomPanelOpen(value => !value)
  const toggleLeftPanel = () => setLeftWidth(value => (value === 0 ? DEFAULT_LEFT : 0))
  const toggleRightPanel = () => setRightWidth(value => (value === 0 ? DEFAULT_RIGHT : 0))

  const handleLeftResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleLeftPanel()
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setLeftWidth(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setLeftWidth(DEFAULT_LEFT)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setLeftWidth(value => clampSidePanelWidth(value - keyboardResizeStep))
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setLeftWidth(value => clampSidePanelWidth(value + keyboardResizeStep))
    }
  }

  const handleRightResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleRightPanel()
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setRightWidth(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setRightWidth(DEFAULT_RIGHT)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setRightWidth(value => clampSidePanelWidth(value + keyboardResizeStep))
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setRightWidth(value => clampSidePanelWidth(value - keyboardResizeStep))
    }
  }

  const startLeftResize = (e: React.MouseEvent) => {
    e.preventDefault()
    document.body.classList.add('resizing')
    const startX = e.clientX
    const startW = leftWidth
    const onMove = (mv: MouseEvent) => {
      const w = startW + mv.clientX - startX
      setLeftWidth(clampSidePanelWidth(w))
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
      setRightWidth(clampSidePanelWidth(w))
    }
    const onUp = () => {
      document.body.classList.remove('resizing')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const leftPanelUnavailable = workspaceMode === 'play'
  const layoutLeftWidth = leftPanelUnavailable ? 0 : leftWidth
  const { rendered: renderedBoardWidth, notationFontSizePx } = boardSizing({
    viewport,
    stageHeight,
    leftPanelWidth: layoutLeftWidth,
    rightPanelWidth: rightWidth,
    showEvalColumn: engineEnabled && showWdl,
  })
  const notationFontSize = `${notationFontSizePx}px`
  // The strip says what the position is. Once the game is over there is no side
  // to move, and "Black to move" under a mated king was the loudest wrong thing
  // on the page.
  // The position on the board answers this on its own for every ending a FEN
  // can carry -- including inside a variation, where a mate really is a mate
  // even though it is not the game's result. Threefold repetition is the one
  // exception, because it is a fact about the history rather than the
  // position, so the main line's own verdict is used when that is where we are
  // standing.
  const atMainLineEnd = mainLineNodes.length > 1
    && gameTree.current.id === mainLineNodes[mainLineNodes.length - 1].id
  const gameResultLabel = clockFlagged
    ? flagResultLabel(clockFlagged)
    : resignedBy
    ? resignResultLabel(resignedBy)
    : describeGameEnd(game)?.label
      ?? (atMainLineEnd ? mainLineEnd?.label ?? null : null)
  const resignReason = resignDisabledReason({
    workspaceMode,
    gameMode,
    pliesPlayed: mainLineNodes.length - 1,
    gameAlreadyOver: Boolean(gameResultLabel),
  })
  // The strip describes the board, and while a line is being previewed the
  // board is the previewed position -- so "White to move" over a position where
  // it is Black's turn would be the one thing on screen that is simply wrong.
  // The Preview pill beside it says the position is not the game's.
  const turnLabel = previewChess
    ? `${previewChess.turn() === 'w' ? 'White' : 'Black'} to move${previewChess.isCheck() ? ' · Check' : ''}`
    : gameResultLabel
      ?? `${game.turn() === 'w' ? 'White' : 'Black'} to move${game.isCheck() ? ' · Check' : ''}`
  // An imported game already carries who played it. The app parsed those
  // headers, re-exported them, and never once showed them.
  const importedWhite = knownPgnHeader(pgnHeaders.White)
  const importedBlack = knownPgnHeader(pgnHeaders.Black)
  const importedPlayers = importedWhite && importedBlack
    ? `${importedWhite} vs ${importedBlack}`
    : null
  const importedResult = knownPgnHeader(pgnHeaders.Result)
  const importedGameTitle = [importedPlayers, knownPgnHeader(pgnHeaders.Event), importedResult]
    .filter(Boolean).join(' · ')
  const moveNumberLabel = `Move ${(linePreview?.fen ?? fen).split(/\s+/)[5] ?? '1'}`
  // Counted from the game's own root rather than the standard array, so a
  // position pasted in as a FEN does not open fourteen captures down.
  const material = useMemo(
    () => materialBalance(mainLineNodes[0]?.fen ?? '', fen),
    [fen, mainLineNodes],
  )
  const materialLeader: 'w' | 'b' | null = material.delta > 0 ? 'w' : material.delta < 0 ? 'b' : null
  const materialDetail = useMemo(() => {
    if (!materialLeader) return null
    const lead = `${materialLeader === 'w' ? 'White' : 'Black'} is up ${Math.abs(material.delta)}.`
    const taken = describeCaptures(material.capturedByWhite)
    const lost = describeCaptures(material.capturedByBlack)
    // A position set up from a FEN can start uneven with nothing captured, and
    // "up 5, having taken nothing" reads as a contradiction rather than a fact
    // about where the game began.
    if (!taken && !lost) return lead
    return `${lead} White has taken ${taken || 'nothing'}; Black has taken ${lost || 'nothing'}.`
  }, [material, materialLeader])
  const currentMoveQuality = gameTree.current.quality
  /**
   * The same control on both analysis tabs.
   *
   * It only lived on Analyze, and the reader who most wants it is on Review:
   * they have just been shown the move that lost the game, and "try that again
   * properly" meant navigating to the moment, switching tab, and finding a
   * button. "Try best" beside each critical moment plays the engine's answer;
   * this is the other half, where the reader plays it.
   */
  /**
   * The Coach/Pro switch, on both tabs it governs.
   *
   * It only ever rendered on Analyze, and it decides what Review shows too --
   * the engine columns in the move list, the ACPL tile, the Book vs Engine
   * card. So a reader on Review could see the pro detail appear and disappear
   * with no control in front of them to explain it.
   */
  const experienceToggle = (
    <div className="analysis-experience-toggle" aria-label="Analysis experience">
      {([
        { id: 'beginner', label: 'Coach' },
        { id: 'pro', label: 'Pro' },
      ] as const).map(option => (
        <button
          key={option.id}
          type="button"
          className={`mode-pill ${analysisExperience === option.id ? 'active' : ''}`}
          aria-pressed={analysisExperience === option.id}
          onClick={() => setAnalysisExperience(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  const playFromHereRow = (
    <div className="inline-actions play-from-here-row">
      <button
        type="button"
        className="play-from-here-btn"
        onClick={playFromCurrentPosition}
        disabled={Boolean(playFromHereDisabledReason)}
        title={playFromHereDisabledReason ?? 'Take the move against the engine from this position'}
        aria-label={playFromHereDisabledReason
          ? `Play from this position unavailable. ${playFromHereDisabledReason}`
          : 'Play from this position against the engine'}
      >
        <IconSwords /> Play from here
      </button>
    </div>
  )

  const gameModeLabel = gameMode === 'human-vs-human'
    ? 'Human vs Human'
    : gameMode === 'human-vs-ai'
      ? 'Human vs AI'
      : 'AI vs AI'
  const leftPanelCollapsed = leftPanelUnavailable || leftWidth === 0
  const rightPanelCollapsed = rightWidth === 0
  const playEngineActive = workspaceMode === 'play' && gameMode !== 'human-vs-human'
  const playEngineStatus = isAiThinking ? 'thinking' : aiPlayer.status
  const aiDifficultyLabel = DIFFICULTY_LABELS[aiDifficulty]
  const playEngineReport = describePlayEngine({
    profileName: aiPlayer.profileName,
    status: playEngineStatus,
    difficultyLabel: aiDifficultyLabel,
    threadCount: aiPlayer.threadCount,
  })
  const bottomStatusTitle = engineEnabled
    ? profileMessage
    : playEngineActive
      ? `${aiPlayer.profileName} play engine · ${aiDifficultyLabel} difficulty`
      : 'Engine is on standby in Play mode. Switch to Analysis mode for Stockfish analysis.'
  const bottomStatusPrefix = engineEnabled
    ? `${activeProfile.name} ·`
    : playEngineActive
      ? `${gameModeLabel} · ${aiDifficultyLabel} AI`
      : `${gameModeLabel} · Engine`
  const bottomStatusText = engineEnabled
    ? status
    : playEngineActive && playEngineStatus !== 'disabled'
      ? playEngineStatus
      : 'standby'
  const bottomStatusClass = engineEnabled
    ? status
    : playEngineActive
      ? (playEngineStatus === 'thinking' ? 'analyzing' : playEngineStatus)
      : 'standby'
  const canStepAiMove = playEngineActive && !game.isGameOver() && !endedOffBoard && (
    gameMode === 'ai-vs-ai' || (gameMode === 'human-vs-ai' && game.turn() !== playerColor[0])
  )
  const boardInputLocked = isBoardInputLocked({
    workspaceMode,
    gameMode,
    isAiThinking,
    paused,
    turn: game.turn(),
    playerColor: playerColorToTurn(playerColor),
    endedOffBoard: Boolean(endedOffBoard),
  })

  // ─────────────────────────────────────────────────────
  return (
    <main className="app-shell" data-workspace-mode={workspaceMode}>
      <nav
        className="skip-links"
        aria-label="Skip links"
        aria-hidden={backgroundUiHidden ? true : undefined}
        inert={backgroundUiHidden ? true : undefined}
      >
        <a href="#chessboard-stage">Skip to board</a>
        <a href="#analysis-panel">Skip to analysis</a>
      </nav>

      {/* Always in the tree, so a screen reader is told when it fills. */}
      <div className="app-notice-region" role="status" aria-live="polite">
        {notice && <span className="app-notice">{notice}</span>}
      </div>

      {/* ── Top bar ── */}
      <section
        className={`panel top ${topPanelOpen ? '' : 'hidden'}`}
        aria-hidden={topChromeHidden ? true : undefined}
        inert={topChromeHidden ? true : undefined}
      >
        <div className="panel-inner">
          <div className="panel-content compact-grid">
            <div className="app-brand" aria-hidden={settingsOpen ? true : undefined}>
              <span className="app-brand-icon"><IconKing /></span>
              <span className="app-brand-text">Web Chess</span>
            </div>
            <div
              className="mobile-actions"
              aria-hidden={settingsOpen ? true : undefined}
              inert={settingsOpen ? true : undefined}
            >
              <button type="button" onClick={openNewGameDialog} aria-label="Start new game" title="New game">
                <span className="btn-icon"><IconRefresh /></span> <span className="btn-label">New game</span>
              </button>
              <button type="button" onClick={flipBoard} aria-label="Flip board" aria-keyshortcuts="F" title="Flip board">
                <span className="btn-icon"><IconFlip /></span> <span className="btn-label">Flip</span>
              </button>
              <button type="button" onClick={openPgnDialog} aria-label="Open PGN and FEN dialog" title="PGN and FEN">
                <span className="btn-icon"><IconDownload /></span> <span className="btn-label">PGN</span>
              </button>
              <button type="button" onClick={openLibraryDialog} aria-label="Open saved games library" title="Library">
                <span className="btn-icon"><IconClipboard /></span> <span className="btn-label">Library</span>
              </button>
              {/* The palette was keyboard-only until now, which on a phone means
                  unreachable: there is no Cmd+K on a touch keyboard, and nothing
                  anywhere in the UI said the chord existed. web-katrain surfaces
                  its palette in three places and names the shortcut in each. */}
              <button
                type="button"
                onClick={openCommandPalette}
                aria-label="Open command palette"
                aria-keyshortcuts={COMMAND_PALETTE_ARIA_KEYSHORTCUTS}
                title={`Commands (${commandPaletteShortcutLabel()})`}
                data-testid="command-palette-btn"
              >
                <span className="btn-icon"><IconSearch /></span> <span className="btn-label">Commands</span>
              </button>
            </div>

            {/* Workspace & Game Mode wrappers */}
            <span className="toolbar-divider desktop-only" />
            <div
              className="mobile-modes-wrapper"
              ref={modeScrollerRef}
              aria-hidden={settingsOpen ? true : undefined}
              inert={settingsOpen ? true : undefined}
            >
              <div className="top-mode-pills" data-mode-group="workspace" aria-label="Workspace mode">
                {([
                  { id: 'play', label: 'Play', icon: <IconSwords /> },
                  { id: 'analysis', label: 'Analysis', icon: <IconSearch /> },
                ] as const).map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`gc-pill ${workspaceMode === id ? 'gc-pill-active' : ''}`}
                    aria-pressed={workspaceMode === id}
                    onClick={() => handleWorkspaceModeChange(id)}
                  >
                    <span className="gc-pill-icon">{icon}</span>
                    <span className="gc-pill-label">{label}</span>
                  </button>
                ))}
              </div>

              {/* Game mode switcher */}
              <span className="toolbar-divider desktop-only" />
              <div className="top-mode-pills" data-mode-group="game" aria-label="Game mode">
                {([
                  { id: 'human-vs-human', label: 'Human vs Human', title: 'Local board for two players', icon: <IconUsers /> },
                  { id: 'human-vs-ai', label: 'Human vs AI', title: 'Play against the engine', icon: <IconBot /> },
                  { id: 'ai-vs-ai', label: 'AI vs AI', title: 'Watch two engines play', icon: <IconZap /> },
                ] as const).map(({ id, label, title, icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`gc-pill ${gameMode === id ? 'gc-pill-active' : ''}`}
                    aria-pressed={gameMode === id}
                    title={title}
                    onClick={() => {
                      if (id !== gameMode || workspaceMode !== 'play') handleModeChange(id)
                    }}
                  >
                    <span className="gc-pill-icon">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <span className="toolbar-divider desktop-only" />

            <details
              className="settings-menu"
              open={settingsOpen}
              onToggle={handleSettingsToggle}
            >
              <summary
                role="button"
                aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
                aria-expanded={settingsOpen}
                aria-haspopup="dialog"
              >
                <span className="btn-icon"><IconSettings /></span> Settings
              </summary>
              {settingsOpen && (
                <>
                  <div className="settings-backdrop" onClick={(e) => {
                    e.preventDefault()
                    setSettingsOpen(false)
                  }}></div>
                  <div
                    className="settings-body"
                    ref={settingsBodyRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Settings"
                  >
                <div className="settings-header">
                  <h2>Settings</h2>
                  <button type="button" className="settings-close-btn" onClick={(e) => {
                    e.preventDefault()
                    setSettingsOpen(false)
                  }}>
                    Done
                  </button>
                </div>
                <p className="panel-copy small command-summary">
                  Workspace: <strong>{workspaceMode === 'play' ? 'Play mode' : 'Analysis mode'}</strong>
                </p>
                {engineEnabled && (
                  <p className="panel-copy small command-summary" title={profileMessage}>
                    Engine: <strong>{activeProfile.name}</strong>
                  </p>
                )}
                <h4 className="settings-subhead pointer-fine-only">Keyboard shortcuts</h4>
                <dl className="shortcut-list pointer-fine-only">
                  {KEYBOARD_SHORTCUTS.map(({ keys, action }) => (
                    <div key={action}>
                      <dt>{keys.map(key => <kbd key={key}>{key}</kbd>)}</dt>
                      <dd>{action}</dd>
                    </div>
                  ))}
                </dl>
                <label
                  className="switch-control"
                  title={engineEnabled ? undefined : 'Switch to Analysis mode to analyze automatically.'}
                >
                  <input
                    type="checkbox"
                    checked={autoAnalyze}
                    disabled={!engineEnabled}
                    onChange={e => setAutoAnalyze(e.target.checked)}
                  />
                  <span>Auto-analyze after every move</span>
                </label>
                <label className="switch-control">
                  <input
                    type="checkbox"
                    checked={showBoardArrows}
                    onChange={e => setShowBoardArrows(e.target.checked)}
                  />
                  <span>Show board arrow overlays</span>
                </label>
                {/* Sound and the drawing gestures both work in Play mode, so they
                    sit with the switches that are always here rather than inside
                    the Analyze controls, which Play mode does not render at all. */}
                <label className="switch-control">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={event => setSoundEnabled(event.target.checked)}
                  />
                  <span>Move sounds</span>
                </label>
                <label
                  className="switch-control"
                  title="In a game against the engine, say so when a move gives up a lot, with the take-back one click away."
                >
                  <input
                    type="checkbox"
                    checked={blunderNudges}
                    onChange={event => setBlunderNudges(event.target.checked)}
                  />
                  <span>Point out my mistakes while playing</span>
                </label>
                <div className="board-theme-row">
                  <span className="board-theme-label" id="board-theme-label">Board</span>
                  <div className="board-theme-swatches" role="group" aria-labelledby="board-theme-label">
                    {BOARD_THEMES.map(theme => (
                      <button
                        key={theme.id}
                        type="button"
                        className={`board-theme-swatch ${boardThemeId === theme.id ? 'selected' : ''}`}
                        aria-pressed={boardThemeId === theme.id}
                        aria-label={`${theme.label} board`}
                        title={theme.label}
                        onClick={() => setBoardThemeId(theme.id)}
                      >
                        {/* Two squares and a coordinate: the swatch shows the
                            thing that actually varies, including whether the
                            notation is readable on the dark square. */}
                        <span className="board-theme-chip" aria-hidden="true">
                          <span style={{ background: theme.light }} />
                          <span style={{ background: theme.dark, color: theme.ink }}>a</span>
                        </span>
                        <span className="board-theme-name">{theme.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="panel-copy small">
                  {soundEnabled
                    ? 'A knock for a move, heavier for a capture, and a tone for check, promotion and the end of the game. Moves you navigate to are silent.'
                    : 'Moves are silent.'}
                </p>
                <div className="board-theme-row">
                  <span className="board-theme-label" id="app-theme-label">Theme</span>
                  <div className="analysis-mode-pills" role="group" aria-labelledby="app-theme-label">
                    {([
                      { id: 'dark', label: 'Dark' },
                      { id: 'light', label: 'Light' },
                      { id: 'system', label: 'System' },
                    ] as const).map(option => (
                      <button
                        key={option.id}
                        type="button"
                        className={`mode-pill ${theme === option.id ? 'active' : ''}`}
                        aria-pressed={theme === option.id}
                        onClick={() => setTheme(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* A mouse gesture, so it cannot go in the keyboard list, and an
                    undiscoverable feature is not a feature. The second copy is
                    for a touch device, where the first would promise a gesture
                    that cannot be performed. */}
                <p className="panel-copy small pointer-fine-only">
                  Right-drag on the board to draw your own arrow, right-click a square to mark it.
                  Hold <kbd>Shift</kbd> or <kbd>Ctrl</kbd> for the other two colours. Your marks are
                  blue, so nothing the engine draws can be mistaken for them; they clear on your next
                  move or left click.
                </p>
                <p className="panel-copy small pointer-coarse-only">
                  Drawing arrows and marking squares needs a mouse — they are on the right button, and
                  there is no touch equivalent yet.
                </p>
                {/* Hover has no touch equivalent either, but the click it
                    replaces does, so the coarse-pointer copy says what to press
                    rather than describing a gesture the screen cannot make. */}
                <p className="panel-copy small pointer-fine-only">
                  Point at any move in an engine line to see that position on the board without playing
                  it. Click it to play the line into the game as a variation.
                </p>
                <p className="panel-copy small pointer-coarse-only">
                  Tap any move in an engine line to play the line into the game as a variation.
                </p>
                {engineEnabled && workspaceMode === 'analysis' && (
                  <details className="advanced-settings" open>
                    <summary>Analyze controls</summary>
                    <div className="advanced-section">
                      <div className="analysis-mode-pills" aria-label="Analysis search mode">
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
                            aria-pressed={analyzeMode === mode.id}
                            onClick={() => {
                              setActivePreset(null)
                              setAnalyzeMode(mode.id)
                            }}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                      {(analyzeMode === 'deep' || analyzeMode === 'review') && (
                        <label className="control">
                          <span>Depth</span>
                          <input
                            type="range"
                            min={6}
                            max={32}
                            step={1}
                            value={searchDepth}
                            aria-label="Search depth"
                            aria-valuetext={`${searchDepth} plies`}
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
                              setQuickMovetimeMs(parseIntegerInputValue(e.target.value))
                            }}
                            onBlur={() => setQuickMovetimeMs(value => normalizeRequiredIntegerInput(value, QUICK_MOVETIME_BOUNDS))}
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
                              setMateTarget(parseIntegerInputValue(e.target.value))
                            }}
                            onBlur={() => setMateTarget(value => normalizeRequiredIntegerInput(value, MATE_TARGET_BOUNDS))}
                          />
                        </label>
                      )}
                      <label className="control">
                        <span>MultiPV</span>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={multiPv}
                          aria-label="MultiPV analysis lines"
                          aria-valuetext={`${multiPv} principal ${multiPv === 1 ? 'variation' : 'variations'}`}
                          onChange={e => {
                            setActivePreset(null)
                            setMultiPv(Number(e.target.value))
                          }}
                        />
                        <strong>{multiPv} {multiPv === 1 ? 'line' : 'lines'}</strong>
                      </label>
                      <label
                        className="switch-control"
                        title={showBoardArrows ? undefined : 'Turn on board arrows first.'}
                      >
                        <input
                          type="checkbox"
                          checked={showTopMoveArrows}
                          disabled={!showBoardArrows}
                          onChange={e => setShowTopMoveArrows(e.target.checked)}
                        />
                        <span>Show top move arrows (live score colors)</span>
                      </label>
                      {showBoardArrows && showTopMoveArrows && (
                        <label className="control">
                          <span>Top arrows</span>
                          <input
                            type="range"
                            min={1}
                            max={5}
                            step={1}
                            value={topMoveArrowCount}
                            aria-label="Top move arrow count"
                            aria-valuetext={`${topMoveArrowCount} ${topMoveArrowCount === 1 ? 'arrow' : 'arrows'}`}
                            onChange={e => setTopMoveArrowCount(Number(e.target.value))}
                          />
                          <strong>{topMoveArrowCount}</strong>
                        </label>
                      )}
                      <p className="panel-copy small">
                        {showBoardArrows
                          ? `Better lines render greener and worse lines redder${analyzeMode === 'infinite' ? ' (updates live in infinite mode).' : '.'}`
                          : 'Board arrows are hidden in all game modes.'}
                      </p>
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
                              max={LIMIT_NODES_BOUNDS.max}
                              step={1000}
                              value={limitNodes}
                              onChange={e => setLimitNodes(parseIntegerInputValue(e.target.value))}
                              onBlur={() => setLimitNodes(value => normalizeOptionalIntegerInput(value, LIMIT_NODES_BOUNDS))}
                            />
                          </label>
                          <label className="engine-option-row">
                            <span>Candidate moves</span>
                            <input
                              type="text"
                              value={searchMovesInput}
                              onChange={e => setSearchMovesInput(e.target.value)}
                              placeholder="e4 Nf3 e2e4"
                              aria-describedby={SEARCH_MOVES_HELP_ID}
                              aria-invalid={invalidSearchMoveTokens.length ? true : undefined}
                            />
                          </label>
                          <p
                            id={SEARCH_MOVES_HELP_ID}
                            className={`panel-copy small ${invalidSearchMoveTokens.length ? 'warning-copy' : 'command-summary'}`}
                            role={invalidSearchMoveTokens.length ? 'alert' : undefined}
                          >
                            {invalidSearchMoveTokens.length
                              ? `Ignoring invalid or illegal ${invalidSearchMoveTokens.length === 1 ? 'move' : 'moves'}: ${invalidSearchMovePreview}${invalidSearchMoveTokens.length > 3 ? '...' : ''}`
                              : parsedSearchMoves.length
                                ? `Search limited to ${parsedSearchMoves.join(' ')}.`
                                : 'Optional: limit Stockfish to legal candidates like e4, Nf3, or e2e4.'}
                          </p>
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
                                <input type="number" min={0} max={CLOCK_TIME_BOUNDS.max} step={100} value={whiteTimeMs}
                                  onChange={e => setWhiteTimeMs(parseIntegerInputValue(e.target.value))}
                                  onBlur={() => setWhiteTimeMs(value => normalizeRequiredIntegerInput(value, CLOCK_TIME_BOUNDS))} />
                              </label>
                              <label className="engine-option-row">
                                <span>Black time (ms)</span>
                                <input type="number" min={0} max={CLOCK_TIME_BOUNDS.max} step={100} value={blackTimeMs}
                                  onChange={e => setBlackTimeMs(parseIntegerInputValue(e.target.value))}
                                  onBlur={() => setBlackTimeMs(value => normalizeRequiredIntegerInput(value, CLOCK_TIME_BOUNDS))} />
                              </label>
                              <label className="engine-option-row">
                                <span>White increment (ms)</span>
                                <input type="number" min={0} max={CLOCK_INCREMENT_BOUNDS.max} step={50} value={whiteIncMs}
                                  onChange={e => setWhiteIncMs(parseIntegerInputValue(e.target.value))}
                                  onBlur={() => setWhiteIncMs(value => normalizeRequiredIntegerInput(value, CLOCK_INCREMENT_BOUNDS))} />
                              </label>
                              <label className="engine-option-row">
                                <span>Black increment (ms)</span>
                                <input type="number" min={0} max={CLOCK_INCREMENT_BOUNDS.max} step={50} value={blackIncMs}
                                  onChange={e => setBlackIncMs(parseIntegerInputValue(e.target.value))}
                                  onBlur={() => setBlackIncMs(value => normalizeRequiredIntegerInput(value, CLOCK_INCREMENT_BOUNDS))} />
                              </label>
                              <label className="engine-option-row">
                                <span>Moves to go</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={MOVES_TO_GO_BOUNDS.max}
                                  step={1}
                                  value={movesToGo}
                                  onChange={e => setMovesToGo(parseIntegerInputValue(e.target.value))}
                                  onBlur={() => setMovesToGo(value => normalizeOptionalIntegerInput(value, MOVES_TO_GO_BOUNDS))}
                                />
                              </label>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                )}
                {!engineEnabled && (
                  <p className="panel-copy small">
                    Engine tools are disabled in Play mode. Switch to Analysis mode for engine settings and deep analysis.
                  </p>
                )}
                {engineEnabled && (
                  <details className="advanced-settings">
                    <summary>Advanced engine options</summary>
                    <div className="advanced-section">
                      <label className="control">
                        <span>Hash</span>
                        <input type="range" min={16} max={512} step={16} value={hashMb}
                          aria-label="Engine hash size"
                          aria-valuetext={`${hashMb} megabytes`}
                          onChange={e => setHashMb(Number(e.target.value))} />
                        <strong>{hashMb} MB</strong>
                      </label>
                      <label className="switch-control">
                        <input type="checkbox" checked={showWdl}
                          onChange={e => setShowWdl(e.target.checked)} />
                        <span>Show WDL values</span>
                      </label>
                      <p className="panel-copy small">
                        The engine profile, what the browser supports, and the UCI
                        options live together in Analysis → Engine Lab.
                      </p>
                      <button type="button" onClick={resetSavedWorkspace}>
                        Reset saved workspace
                      </button>
                      <p className="panel-copy small">
                        Clears persisted analyze/lab controls for this browser.
                      </p>
                    </div>
                  </details>
                )}
                  </div>
                </>
              )}
            </details>
          </div>
        </div>
        <div
          className="resize-handle resize-handle-bottom"
          role="button"
          tabIndex={0}
          aria-expanded={topPanelOpen}
          aria-label={topPanelOpen ? 'Collapse top bar' : 'Expand top bar'}
          aria-hidden={settingsOpen || promotionDialogOpen ? true : undefined}
          inert={settingsOpen || promotionDialogOpen ? true : undefined}
          onClick={toggleTopPanel}
          onKeyDown={event => activateOnKeyboard(event, toggleTopPanel)}
          title="Toggle top bar"
        >
          <span className="resize-pill horizontal" />
        </div>
      </section>

      <div
        className="main-container"
        ref={mainContainerRef}
        aria-hidden={settingsOpen ? true : undefined}
        inert={settingsOpen ? true : undefined}
      >
        {/* ── Left panel (winrate graph) ── */}
        <section
          className={`panel left ${leftPanelCollapsed ? 'panel-collapsed' : ''}`}
          aria-hidden={leftPanelUnavailable || appModalOpen || promotionDialogOpen ? true : undefined}
          inert={leftPanelUnavailable || appModalOpen || promotionDialogOpen ? true : undefined}
          style={{ width: layoutLeftWidth }}
        >
          <div
            className="resize-handle resize-handle-right"
            role="separator"
            tabIndex={0}
            aria-label="Resize left panel"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={MAX_SIDE_PANEL_WIDTH}
            aria-valuenow={leftWidth}
            onMouseDown={startLeftResize}
            onClick={() => { if (leftWidth === 0) setLeftWidth(DEFAULT_LEFT) }}
            onKeyDown={handleLeftResizeKeyDown}
            title="Drag to resize · click to expand"
          >
            <span className="resize-pill" />
          </div>
          <div
            className="panel-inner"
            aria-hidden={leftPanelCollapsed ? true : undefined}
            inert={leftPanelCollapsed ? true : undefined}
            style={{ opacity: leftPanelCollapsed ? 0 : 1 }}
          >
            <div className="panel-content">
              {showEvaluationGraphs && (<>
              <section className="analytics-card">
                <header className="section-heading">
                  <h3><span className="section-icon"><IconTrendingUp /></span> Winrate</h3>
                  {winratePoints.length > 0 && (
                    <strong>{winratePoints[winratePoints.length - 1]!.whiteWinrate.toFixed(1)}%</strong>
                  )}
                </header>
                <WinrateGraph
                  points={winratePoints}
                  currentIndex={currentPathNodes.length - 1}
                  lastPlyIndex={currentLineMoves.length}
                  onNavigate={navigateToGraphPoint}
                />
                {winratePoints.length > 0 && (
                  <div className="graph-legend">
                    <span>White win chance</span>
                    <strong>{winratePoints[winratePoints.length - 1]!.whiteWinrate.toFixed(1)}%</strong>
                  </div>
                )}
              </section>
              <section className="analytics-card">
                <header className="section-heading">
                  <h3><span className="section-icon"><IconBarChart /></span> WDL Trend</h3>
                  {wdlPoints.length > 0 && <strong>{countLabel(wdlPoints.length, 'point')}</strong>}
                </header>
                <WdlProgressGraph
                  points={wdlPoints}
                  currentIndex={currentPathNodes.length - 1}
                  lastPlyIndex={currentLineMoves.length}
                  onNavigate={navigateToGraphPoint}
                />
                {wdlPoints.length > 0 && (
                  <div className="graph-legend wdl">
                    <span className="wdl-white-label">White {wdlPoints[wdlPoints.length - 1]!.white.toFixed(1)}%</span>
                    <span className="wdl-draw-label">Draw {wdlPoints[wdlPoints.length - 1]!.draw.toFixed(1)}%</span>
                    <span className="wdl-black-label">Black {wdlPoints[wdlPoints.length - 1]!.black.toFixed(1)}%</span>
                  </div>
                )}
              </section>
              </>)}
              <section className="sample-library-card">
                <header className="sample-library-head">
                  <h3><span className="section-icon"><IconKing /></span> Historical Library</h3>
                  <span>{filteredSampleGames.length} games</span>
                </header>
                <div className="sample-filter-row" aria-label="Historical game filter">
                  {([
                    { id: 'all', label: 'All' },
                    { id: 'classical', label: 'Classical' },
                    { id: 'rapid-blitz', label: 'Rapid/Blitz' },
                  ] as const).map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`mode-pill ${sampleFilter === filter.id ? 'active' : ''}`}
                      aria-pressed={sampleFilter === filter.id}
                      onClick={() => setSampleFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                {sampleLoadError && <p className="panel-copy small error-copy">{sampleLoadError}</p>}
                {isImportSweepActive && (
                  <p className="panel-copy small sample-sweep-copy">
                    Background graph sampling: {importSweepProgress.done}/{importSweepProgress.total}
                    {importSweepProgress.sampledFrom
                      ? ` sampled from ${importSweepProgress.sampledFrom} positions`
                      : ''}
                  </p>
                )}
                <div className="sample-game-list">
                  {filteredSampleGames.map(sample => {
                    const isLoading = sampleLoadingId === sample.id
                    return (
                      <article key={sample.id} className="sample-game-row">
                        <header>
                          <strong>{sample.white} vs {sample.black}</strong>
                          <span>{sample.year}</span>
                        </header>
                        <p>{sample.event}</p>
                        <p className="sample-game-opening">{sample.eco} · {sample.opening}</p>
                        <div className="sample-game-actions">
                          <p className="panel-copy small">
                            {sample.format === 'classical' ? 'Classical' : 'Rapid/Blitz'} · {resultLabel(sample.result)}
                          </p>
                          <button
                            type="button"
                            onClick={() => void loadHistoricalSample(sample)}
                            disabled={isLoading}
                            aria-label={`${isLoading ? 'Loading' : 'Load'} ${sample.white} vs ${sample.black}, ${sample.event}`}
                            title={`${sample.white} vs ${sample.black}, ${sample.event}`}
                          >
                            {isLoading ? 'Loading...' : 'Load'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            </div>
          </div>
        </section>

        {/* ── Board ── */}
        <section
          id="chessboard-stage"
          className="board-stage"
          aria-label="Chessboard"
          aria-hidden={appModalOpen ? true : undefined}
          inert={appModalOpen ? true : undefined}
          ref={boardStageRef}
          tabIndex={-1}
        >
          <div className="board-layout">
            <div className="board-meta-strip" aria-label="Current game state">
              <span className={`turn-pill ${previewChess
                ? previewChess.turn() === 'w' ? 'white' : 'black'
                : gameResultLabel ? 'final' : game.turn() === 'w' ? 'white' : 'black'}`}>
                {turnLabel}
              </span>
              <span className="board-meta-move">{moveNumberLabel}</span>
              {reviewPractice && (
                <div
                  className={`board-meta-practice ${reviewPractice.status}`}
                  data-review-practice
                >
                  <span
                    role="status"
                    aria-live="polite"
                    aria-label={reviewPractice.status === 'correct'
                      ? `Correct. The best move was ${reviewPractice.expectedSan}.`
                      : reviewPractice.attempts >= 2
                        ? `Try again. The best move is ${reviewPractice.expectedSan}.`
                        : reviewPractice.status === 'retry'
                          ? 'Not quite. The position was reset; try another move.'
                          : `Practice the position before ${reviewPractice.moveLabel}. Find a better move.`}
                  >
                    {reviewPractice.status === 'correct'
                      ? `Correct · ${reviewPractice.expectedSan}`
                      : reviewPractice.attempts >= 2
                        ? `Answer · ${reviewPractice.expectedSan}`
                        : reviewPractice.status === 'retry'
                          ? 'Not quite · try again'
                          : `Practice · improve on ${reviewPractice.moveLabel}`}
                  </span>
                  <button type="button" onClick={exitReviewPractice}>
                    {reviewPractice.status === 'correct' ? 'Done' : 'Exit'}
                  </button>
                </div>
              )}
              {/* The board is showing a position the game has not reached, and
                  it has to say so: without this the only difference between a
                  preview and the game is that the reader remembers hovering. */}
              {linePreview && (
                <span className="board-meta-preview" role="status">
                  Preview · {linePreview.label}
                </span>
              )}
              {!reviewPractice && materialLeader && materialDetail && (
                <span className="board-meta-material" title={materialDetail} aria-label={materialDetail}>
                  {materialLeader === 'w' ? 'White' : 'Black'} {materialAdvantageLabel(material.delta, materialLeader)}
                </span>
              )}
              {!reviewPractice && importedPlayers && (
                <span className="board-meta-game" title={importedGameTitle}>
                  {importedResult && <strong>{importedResult}</strong>}
                  <span>{importedPlayers}</span>
                </span>
              )}
              {clock && workspaceMode === 'play' && (
                <ChessClock state={clock} paused={paused} orientation={orientation} />
              )}
              <span className="board-meta-status">{workspaceMode === 'analysis' ? status : gameModeLabel}</span>
              {!reviewPractice && currentMoveQuality && (
                <span className={`board-quality-pill quality-${currentMoveQuality}`}>
                  {REVIEW_LABELS[currentMoveQuality]}
                </span>
              )}
            </div>
            {opening && (
              <div
                className="board-opening-label fade-in-slide"
                aria-label={`Opening ${opening.eco}: ${opening.name}`}
                title={`${opening.eco} ${opening.name}`}
              >
                <div className="opening-pill">
                  <strong>{opening.eco}</strong>
                  <span>{opening.name}</span>
                </div>
              </div>
            )}
            <div className="board-wrap">
              {engineEnabled && showWdl && (() => {
                const evalSnap = currentEvaluation
                const evalLabel = endingScore ?? (evalSnap
                  ? formatCompactWhitePovEvaluation(fen, evalSnap.cp, evalSnap.mate)
                  : null)
                return (
                  <div className="eval-column" aria-hidden="true">
                    <WdlBar fen={fen} evaluation={evalSnap} orientation={orientation} />
                    {evalLabel && <span className="eval-bar-label">{evalLabel}</span>}
                  </div>
                )
              })()}
              <div className="board-area" onKeyDown={handleBoardKeyDown}>
                <div
                  className={`board-surface${isPreviewingLine ? ' previewing' : ''}`}
                  aria-hidden={promotionDialogOpen ? true : undefined}
                  inert={promotionDialogOpen ? true : undefined}
                >
                  {/* react-chessboard measures its own container and throws
                      "Square width not found" from <Piece2> when that container
                      has no width, which takes the whole app to the error
                      boundary. The trigger is a viewport of literally 0x0 -- a
                      hidden or collapsed window, a display:none container, an
                      automation pane that is not on screen. Only the mobile
                      branch of the width maths can reach 0; the desktop branch
                      has a 260px floor. Hit for real while resizing this app's
                      preview, which is what turned a documented curiosity into
                      a guard. */}
                  {renderedBoardWidth > 0 && (
                  <Chessboard
                    options={{
                      position: linePreview ? linePreview.fen : fen,
                      boardOrientation: orientation,
                      onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
                        if (!targetSquare) return false
                        setSelectedSquare(null)
                        setLegalTargets([])
                        return onPieceDrop(sourceSquare as Square, targetSquare as Square, piece.pieceType)
                      },
                      onSquareClick: ({ square }) => onSquareClick(square as Square),
                      onSquareMouseDown: handleSquareMouseDown,
                      onSquareMouseUp: handleSquareMouseUp,
                      squareStyles: linePreview ? {
                        // Nothing the reader put on the board belongs to a
                        // position they are only looking at. The two squares of
                        // the previewed move do.
                        [linePreview.uci.slice(0, 2) as Square]: PREVIEW_SQUARE_STYLE,
                        [linePreview.uci.slice(2, 4) as Square]: PREVIEW_SQUARE_STYLE,
                      } : {
                        // The piece stays where it is and both squares light up:
                        // nothing has been played, and pretending otherwise
                        // would show a position that does not exist.
                        ...(premove
                          ? {
                            [premove.from]: PREMOVE_SQUARE_STYLE,
                            [premove.to]: PREMOVE_SQUARE_STYLE,
                          }
                          : {}),
                        ...Object.fromEntries(
                          Object.entries(markedSquares).map(([square, color]) => [square, squareMarkStyle(color)]),
                        ),
                        ...(selectedSquare ? { [selectedSquare]: { backgroundColor: 'rgba(255,215,0,0.55)', boxShadow: 'inset 0 0 0 3px rgba(255,200,0,0.9)' } } : {}),
                        ...Object.fromEntries(legalTargets.map(sq => [sq, {
                          background: game.get(sq)
                            ? 'radial-gradient(circle, rgba(255,100,0,0.5) 60%, transparent 60%)'
                            : 'radial-gradient(circle, rgba(0,0,0,0.25) 28%, transparent 28%)',
                          borderRadius: '50%',
                        }])),
                      },
                      arrows,
                      arrowOptions: BOARD_ARROW_OPTIONS,
                      darkSquareNotationStyle: notationStyle(boardTheme.ink),
                      lightSquareNotationStyle: notationStyle(boardTheme.ink),
                      alphaNotationStyle: { ...NOTATION_BASE_STYLE, bottom: 2, right: 3, fontSize: notationFontSize },
                      numericNotationStyle: { ...NOTATION_BASE_STYLE, top: 2, left: 3, fontSize: notationFontSize },
                      allowDrawingArrows: !isPreviewingLine,
                      allowDragging: !isPreviewingLine && (!boardInputLocked || premoveAllowed),
                      showAnimations: !reduceMotion,
                      darkSquareStyle: { backgroundColor: boardTheme.dark },
                      lightSquareStyle: { backgroundColor: boardTheme.light },
                      boardStyle: {
                        width: `${renderedBoardWidth}px`,
                        maxWidth: '100%',
                        borderRadius: 12,
                        boxShadow: '0 8px 40px rgba(0, 0, 0, 0.60), 0 2px 8px rgba(0, 0, 0, 0.40)',
                      },
                    }}
                  />
                  )}
                </div>
                {pendingPromotion && (
                  <div
                    className="promotion-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Choose promotion piece"
                    ref={promotionDialogRef}
                    onClick={cancelPromotion}
                  >
                    <div className="promotion-chooser" onClick={event => event.stopPropagation()}>
                      {PROMOTION_OPTIONS.map(option => (
                        <button
                          key={option.piece}
                          type="button"
                          className="promotion-choice"
                          onClick={() => completePromotion(option.piece)}
                          aria-label={`Promote to ${option.label}`}
                          title={`Promote to ${option.label} (${option.piece.toUpperCase()})`}
                        >
                          <span className="promotion-glyph" aria-hidden="true">
                            {PROMOTION_GLYPHS[promotionColor][option.piece]}
                          </span>
                          <span className="promotion-label">{option.label}</span>
                          <kbd aria-hidden="true">{option.piece.toUpperCase()}</kbd>
                        </button>
                      ))}
                      <button type="button" className="promotion-cancel" onClick={cancelPromotion}>
                        Cancel <kbd aria-hidden="true">Esc</kbd>
                      </button>
                    </div>
                  </div>
                )}
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
            </div>
          </div>
        </section>

        <LazyDialogBoundary>
        <Suspense fallback={<DialogLoadingFallback label={dialogLoadingLabel} />}>
          {showNewGameDialog && (
            <NewGameDialog
              key={`${gameMode}-${playerColor}-${aiDifficulty}-${timeControlId}`}
              open
              initialMode={gameMode}
              initialPlayerColor={playerColor}
              initialDifficulty={aiDifficulty}
              initialTimeControlId={timeControlId}
              onStart={handleNewGameStart}
              onCancel={closeNewGameDialog}
            />
          )}

          {showPgnDialog && (
            <PgnDialog
              open
              onClose={closePgnDialog}
              onImport={handleAnalysisPgnImport}
              onLoadFen={handleAnalysisFenLoad}
              currentFen={fen}
              mainLineNodes={mainLineNodes}
              gameNodes={gameTree.nodesSnapshot}
              evaluations={evaluationsByFen}
              pgnHeaders={pgnHeaders}
              onImportManyToLibrary={library.importGames}
            />
          )}

          {autoSaveRecovery && (
            <AutoSaveRecoveryDialog
              savedAt={autoSaveRecovery.savedAt}
              plyCount={autoSaveRecovery.moveCount}
              result={extractLibraryMetadata(autoSaveRecovery.pgn).result}
              onRestore={restoreAutoSavedGame}
              onDismiss={dismissAutoSaveRecovery}
              error={autoSaveRestoreError}
              onCopyPgn={copyAutoSavedPgn}
              copyLabel={autoSaveCopyLabel}
            />
          )}

          {showLibraryDialog && (
            <LibraryDialog
              open
              games={library.games}
              loaded={library.loaded}
              currentPgn={libraryPgn}
              suggestedName={librarySuggestedName}
              onClose={closeLibraryDialog}
              onSave={library.saveGame}
              onLoad={handleLibraryLoad}
              onRename={library.renameGame}
              onDelete={library.deleteGame}
              onToggleFavorite={library.toggleFavorite}
              onExportBackup={library.exportBackup}
              onExportPgn={library.exportPgn}
              onImportBackup={library.importBackup}
              storageIsDurable={libraryStorageIsDurable()}
            />
          )}
        </Suspense>
        </LazyDialogBoundary>

        <CommandPaletteDialog
          open={showCommandPalette}
          commands={paletteCommands}
          onClose={closeCommandPalette}
        />

        {/* ── Right panel ── */}
        <aside
          id="analysis-panel"
          className={`panel right ${rightPanelCollapsed ? 'panel-collapsed' : ''}`}
          ref={analysisPanelRef}
          aria-hidden={appModalOpen || promotionDialogOpen ? true : undefined}
          inert={appModalOpen || promotionDialogOpen ? true : undefined}
          style={{ width: rightWidth }}
          tabIndex={-1}
        >
          <div
            className="resize-handle resize-handle-left"
            role="separator"
            tabIndex={0}
            aria-label="Resize right panel"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={MAX_SIDE_PANEL_WIDTH}
            aria-valuenow={rightWidth}
            onMouseDown={startRightResize}
            onClick={() => { if (rightWidth === 0) setRightWidth(DEFAULT_RIGHT) }}
            onKeyDown={handleRightResizeKeyDown}
            title="Drag to resize · click to expand"
          >
            <span className="resize-pill" />
          </div>
          <div
            className="panel-inner"
            aria-hidden={rightPanelCollapsed ? true : undefined}
            inert={rightPanelCollapsed ? true : undefined}
            style={{ opacity: rightPanelCollapsed ? 0 : 1 }}
          >
            <header className="panel-header analysis-header">
              <h2>{workspaceMode === 'analysis' ? 'Analysis' : 'Play'}</h2>
              {workspaceMode === 'analysis' && (
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
                      aria-pressed={analysisTab === tab.id}
                      onClick={() => handleAnalysisTabChange(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              {workspaceMode === 'analysis' && (
                <div
                  className="analysis-context-row"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={analysisStatusAnnouncement}
                >
                  <span>{engineName}</span>
                  <strong className={`status ${status}`}>{status}</strong>
                </div>
              )}
              {workspaceMode === 'analysis' && status === 'error' && (
                /* An engine that fails to boot takes every analysis tab with it.
                   The reason was only in Settings and Engine Lab, two clicks from
                   where the failure is felt. */
                <p className="panel-copy small error-copy engine-error-copy" role="alert">
                  {profileMessage || 'The engine failed to start. Reload the page to try again.'}
                </p>
              )}
            </header>
            <div className="panel-content">
              {workspaceMode === 'play' && (
                <>
                  {/* The end of a game is where "how did I do?" gets asked, and
                      the result only appeared in the meta strip with nothing to
                      do about it. Getting to a review took three steps. */}
                  {gameResultLabel && (
                    <div className="game-over-card" role="status">
                      <h3>{gameResultLabel}</h3>
                      <p className="panel-copy small">
                        {mainLineNodes.length > 1
                          ? 'Run a review to see the accuracy for both sides and the moves that turned it.'
                          : 'Start a new game to play again.'}
                      </p>
                      {mainLineNodes.length > 1 && (
                        <button
                          type="button"
                          className="btn-primary game-over-review-btn"
                          onClick={reviewFinishedGame}
                          disabled={pendingGameReview}
                          aria-label="Review this finished game"
                        >
                          <IconBarChart /> {pendingGameReview ? 'Starting review...' : 'Review this game'}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="engine-lab-card">
                    <h3><span className="section-icon"><IconSwords /></span> Play Focus</h3>
                    <p
                      className={`panel-copy small${playEngineActive && playEngineReport.failed ? ' error-copy' : ''}`}
                      role={playEngineActive && playEngineReport.failed ? 'alert' : undefined}
                    >
                      {playEngineActive
                        ? playEngineReport.message
                        : 'Analysis engine is on standby. Use this view for clean gameplay and move navigation.'}
                    </p>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={showBoardArrows}
                        onChange={event => setShowBoardArrows(event.target.checked)}
                      />
                      <span>Show board arrow overlays</span>
                    </label>
                    <div className="inline-actions hint-row">
                      <button
                        type="button"
                        className="hint-btn"
                        onClick={requestHint}
                        disabled={Boolean(hintReason)}
                        title={hintReason ?? 'Ask the engine what it would play'}
                        aria-label={hintReason ? `Hint unavailable. ${hintReason}` : 'Ask the engine for a hint'}
                      >
                        <IconZap /> {isHinting ? 'Looking...' : 'Hint'}
                      </button>
                    </div>
                    {hintSan && (
                      <p className="panel-copy small hint-answer" role="status">
                        Try <strong>{hintSan}</strong> — drawn on the board in green.
                      </p>
                    )}
                    {/* The review says this afterwards; a learner needs it now,
                        while the take-back is one click away. Judged from the
                        opponent's own two searches, so it costs no search of
                        its own and can miss a mistake but not invent one. */}
                    {blunderNudge && !gameResultLabel && (
                      <div className={`blunder-nudge ${blunderNudge.quality}`} role="status">
                        <p>
                          <strong>{blunderNudge.san}</strong>
                          {blunderNudge.intoMate
                            ? ' walks into a forced mate.'
                            : ` looks like a ${blunderNudge.quality}: it gave up about ${(reportedCentipawnLoss(blunderNudge.deltaCp) / 100).toFixed(1)} pawns.`}
                        </p>
                        <div className="blunder-nudge-actions">
                          <button
                            type="button"
                            className="takeback-btn"
                            onClick={takebackMove}
                            disabled={Boolean(takebackReason)}
                            aria-label={`Take back ${blunderNudge.san} and the reply`}
                          >
                            <IconRefresh /> Take it back
                          </button>
                          <button type="button" onClick={() => setBlunderNudge(null)}>
                            Play on
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="inline-actions takeback-row">
                      <button
                        type="button"
                        className="takeback-btn"
                        onClick={takebackMove}
                        disabled={Boolean(takebackReason)}
                        title={takebackReason ?? 'Undo back to your last turn'}
                        aria-label={takebackReason
                          ? `Take back unavailable. ${takebackReason}`
                          : `Take back ${takebackPlies === 1 ? 'your move' : 'the last move and the reply'}`}
                      >
                        <IconRefresh /> Take back
                      </button>
                      <button
                        type="button"
                        className={`takeback-btn resign-btn${resignArmed ? ' armed' : ''}`}
                        onClick={() => {
                          if (!resignArmed) { setResignArmed(true); return }
                          setResignArmed(false)
                          resignGame()
                        }}
                        onBlur={() => setResignArmed(false)}
                        disabled={Boolean(resignReason)}
                        title={resignReason ?? (resignArmed ? 'Click again to resign' : 'Concede the game')}
                        aria-label={resignReason
                          ? `Resign unavailable. ${resignReason}`
                          : resignArmed ? 'Confirm resignation' : 'Resign the game'}
                      >
                        <IconFlag /> {resignArmed ? 'Confirm?' : 'Resign'}
                      </button>
                    </div>
                  </div>
                  <div className="right-section">
                    <h3><span className="section-icon"><IconSwords /></span> Moves</h3>
                    <MoveListTree
                      tree={gameTree}
                      onNavigate={navigateMoveListAndPause}
                      allowCommentEditing={false}
                    />
                  </div>
                </>
              )}

              {workspaceMode === 'analysis' && analysisTab === 'analyze' && (
                <>
                  <div className="inline-actions">
                    <button type="button" className="btn-primary" aria-label="Run analysis" onClick={runAnalyze}>
                      <IconPlay /> Analyze
                    </button>
                    <button type="button" aria-label="Stop analysis" onClick={stop}>
                      <IconStop /> Stop
                    </button>
                  </div>
                  {/* Its own row rather than a third column beside Analyze and
                      Stop. Those two are engine commands and this is a mode
                      change, and at the panel's default 320px a three-way split
                      cut the label off mid-word. */}
                  {playFromHereRow}
                  {experienceToggle}
                  <div className="coach-card">
                    <h3><span className="section-icon"><IconKing /></span> Coach</h3>
                    {analysisExperience === 'beginner' && coachVerdict && (
                      <p className="coach-verdict" role="status">{coachVerdict}</p>
                    )}
                    <div className="coach-grid">
                      <div>
                        <span>Position</span>
                        <strong>{coachEvaluation}</strong>
                      </div>
                      <div>
                        <span>Best move</span>
                        <strong title={coachBestMove ?? undefined}>{coachBestMoveText}</strong>
                      </div>
                      <div>
                        <span>Reply</span>
                        <strong title={coachReplyMove ?? undefined}>{coachReplyMoveText}</strong>
                      </div>
                      <div title={coachDepthReading.title}>
                        <span>Depth</span>
                        <strong>{coachDepthReading.label}</strong>
                      </div>
                    </div>
                    {/* The Coach line is the one a beginner is most likely to
                        want to see played out, and it was the same dead text as
                        the Pro panel's. Same buttons, shorter line. */}
                    {(() => {
                      // See `selectCoachLineSource` for why a stored best move
                      // counts as a line: the card used to name one and ask for
                      // an analysis in the same breath.
                      const source = selectCoachLineSource({
                        fen,
                        engineLine: coachLine,
                        cloudMoves: currentCloudEval?.pvs[0]?.moves,
                        storedBestMove: coachBestMove,
                        bestMoveIsTablebase: coachBestMoveIsTablebase,
                      })
                      const steps = source ? pvLineMoves(source.fen, source.pv, 6) : []
                      if (!steps.length) {
                        // Under a checkmate the card used to ask for an analysis
                        // that has nothing to find.
                        return (
                          <p>
                            {coachLineSan
                              || (boardEnding ? 'The game is over here. There is no line to play.' : 'Start analysis to get a candidate line.')}
                          </p>
                        )
                      }
                      const lineFen = source!.fen
                      return (
                        <p className="pv-moves coach-line-moves">
                          {steps.map(step => (
                            <button
                              key={`${step.index}-${step.uci}`}
                              type="button"
                              className="pv-move"
                              onClick={() => playPvLine(lineFen, source!.pv, step.index)}
                              onMouseEnter={() => showLinePreview(step)}
                              onMouseLeave={clearLinePreview}
                              onFocus={() => showLinePreview(step)}
                              onBlur={clearLinePreview}
                              title={`Point at ${step.san} to see the position; click to play the line here`}
                              aria-label={`Play this line up to ${step.numbered}`}
                            >
                              {step.prefix && <span className="pv-move-number">{step.prefix}</span>}
                              {step.san}
                            </button>
                          ))}
                        </p>
                      )
                    })()}
                    {/* The question a player asks before every move, and the one
                        thing the panel could not answer. A null-move search:
                        the same position with the other side to move. */}
                    <div className="coach-threat">
                      <button
                        type="button"
                        className="coach-threat-btn"
                        onClick={requestThreat}
                        disabled={isProbingThreat}
                        aria-label="Show what the opponent is threatening"
                      >
                        <IconAlert /> {isProbingThreat ? 'Reading the threat...' : 'What is threatened?'}
                      </button>
                      {activeThreat && (
                        <p className="coach-threat-answer" role="status">
                          <strong>{activeThreat.san}</strong>
                          <span>
                            {' is the threat'}
                            {analysisExperience === 'pro' ? ` · ${activeThreat.evaluation} after it` : ''}
                          </span>
                        </p>
                      )}
                      {threatError && (
                        <p className="coach-threat-answer error-copy" role="status">{threatError}</p>
                      )}
                    </div>
                    {coachMoveInsight && (
                      <div className="coach-insight">
                        <div className="coach-tags" aria-label="Best move traits">
                          {coachMoveInsight.tags.map(tag => <span key={tag}>{tag}</span>)}
                        </div>
                        <p>{coachMoveInsight.summary}</p>
                        {analysisExperience === 'pro' && (
                          <div className="coach-metrics">
                            {coachMoveInsight.gapLabel && <span>Margin {coachMoveInsight.gapLabel}</span>}
                            {engineBookAgreement !== null && (
                              <span>Book {engineBookAgreement ? 'match' : 'differs'}</span>
                            )}
                            {tablebase.result?.moves[0]?.uci === coachBestMove && <span>TB exact</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {opening && (
                      <p className="coach-opening">
                        <strong>{opening.eco}</strong> {opening.name}
                      </p>
                    )}
                  </div>
                  {mainLineNodes.length > 1 && (
                    <div className="right-section analyze-move-card">
                      <h3><span className="section-icon"><IconSwords /></span> Moves</h3>
                      <MoveListTree
                        tree={gameTree}
                        onNavigate={navigateMoveListAndPonder}
                      />
                    </div>
                  )}
                  {tablebase.eligible && (
                    <div className="tablebase-card">
                      <h3><span className="section-icon"><IconKing /></span> Endgame Tablebase</h3>
                      <p className={`panel-copy small command-summary ${tablebase.error ? 'error-copy' : ''}`}>
                        {tablebase.status === 'loading'
                          ? `${tablebase.pieceCount} pieces · checking exact result...`
                          : tablebase.result
                            ? `${tablebase.pieceCount} pieces · ${tablebaseSummary(tablebase.result)}`
                            : tablebase.error
                              ? `Tablebase: ${tablebase.error}`
                              : `${tablebase.pieceCount} pieces · no tablebase result`}
                      </p>
                      {tablebase.result?.moves.length ? (
                        <div className="tablebase-move-list">
                          {tablebase.result.moves.slice(0, 4).map(move => (
                            <button
                              key={move.uci}
                              type="button"
                              className={`tablebase-move-row ${analysisExperience === 'pro' ? '' : 'compact'}`}
                              aria-label={tablebaseMoveActionLabel(move)}
                              title={tablebaseMoveActionLabel(move)}
                              onClick={() => {
                                setShowAdvancedAnalyze(true)
                                setActivePreset(null)
                                setSearchMovesInput(move.uci)
                              }}
                            >
                              <strong>{move.san}</strong>
                              <span>{tablebaseMoveSummary(move)}</span>
                              {analysisExperience === 'pro' && <span>{move.uci}</span>}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {analysisExperience === 'pro' && (
                    <>
                      <div className="preset-grid">
                        {analyzePresets.map(preset => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`preset-card ${activePreset === preset.id ? 'active' : ''}`}
                            aria-label={`${preset.label}. ${preset.summary}`}
                            aria-pressed={activePreset === preset.id}
                            onClick={() => applyPreset(preset.id)}
                          >
                            <strong>{preset.label}</strong>
                            <span>{preset.summary}</span>
                          </button>
                        ))}
                      </div>
                      <p className="panel-copy small command-summary">
                        {activeGoCommand ? `Command: ${activeGoCommand}` : 'Command: idle'} {queueLength > 0 ? `· queue ${queueLength}` : ''}
                      </p>
                    </>
                  )}
                  {analysisExperience === 'pro' && (currentCloudEval || cloudEvalStatus === 'loading' || cloudEvalStatus === 'missing' || cloudEvalStatus === 'error') && (
                    <div className="cloud-eval-card">
                      <h3><span className="section-icon"><IconZap /></span> Cloud Eval</h3>
                      <p className={`panel-copy small command-summary ${cloudEvalStatus === 'error' ? 'error-copy' : ''}`}>
                        {currentCloudEval
                          ? `Lichess cache · D${currentCloudEval.depth} · ${formatCloudNodes(currentCloudEval.knodes)}`
                          : cloudEvalStatus === 'loading'
                            ? 'Checking Lichess cache...'
                            : cloudEvalStatus === 'missing'
                              ? 'No cloud eval for this position.'
                              : `Cloud eval: ${cloudEvalError ?? 'unavailable'}`}
                      </p>
                      {currentCloudEval && (
                        <div className="cloud-line-list">
                          {currentCloudEval.pvs.slice(0, cloudEvalMultiPv).map((line, index) => {
                            const score = cloudLineToSideToMoveScore(fen, line)
                            return (
                              <article key={`${index}-${line.moves.join(' ')}`} className="cloud-line-row">
                                <header>
                                  <strong>#{index + 1}</strong>
                                  <span>D{currentCloudEval.depth}</span>
                                  <span>{formatWhitePovEvaluation(fen, score.cp, score.mate)}</span>
                                </header>
                                <p>{pvToSan(fen, { multipv: index + 1, depth: currentCloudEval.depth, pv: line.moves }) || line.moves.slice(0, 8).join(' ')}</p>
                                <p className="pv-uci">{line.moves.slice(0, 8).join(' ')}</p>
                              </article>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {analysisExperience === 'pro' && (
                  <div className="opening-intel-card" ref={openingIntelRef}>
                    <div className="opening-intel-head">
                      <h3><span className="section-icon"><IconBarChart /></span> Opening Intel</h3>
                      <div className="opening-source-toggle" aria-label="Opening database source">
                        {OPENING_SOURCES.map(source => (
                          <button
                            key={source}
                            type="button"
                            className={`mode-pill ${openingSource === source ? 'active' : ''}`}
                            aria-pressed={openingSource === source}
                            onClick={() => setOpeningSource(source)}
                          >
                            {source === 'masters' ? 'Masters' : 'Lichess'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="engine-option-row">
                      <span>Lichess token</span>
                      <input
                        className="opening-token-input"
                        type="password"
                        value={openingAuthToken}
                        aria-label="Lichess API token"
                        onChange={event => setOpeningAuthToken(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Session-only API token"
                      />
                    </label>
                    <div className="opening-token-meta">
                      <span>Session only; never saved.</span>
                      <a href={LICHESS_TOKEN_PAGE_URL} target="_blank" rel="noreferrer">
                        Create token
                      </a>
                    </div>
                    {openingSource === 'lichess' && (
                      <>
                        <div className="opening-speed-toggle" aria-label="Lichess time controls">
                          {OPENING_SPEEDS.map(speed => (
                            <button
                              key={speed}
                              type="button"
                              className={`mode-pill ${openingSpeeds.includes(speed) ? 'active' : ''}`}
                              aria-pressed={openingSpeeds.includes(speed)}
                              onClick={() => toggleOpeningSpeed(speed)}
                            >
                              {speed}
                            </button>
                          ))}
                        </div>
                        <label className="engine-option-row">
                          <span>Rating bucket</span>
                          <select
                            value={openingRatingPreset}
                            aria-label="Opening rating bucket"
                            onChange={event => setOpeningRatingPreset(event.target.value as OpeningRatingPresetId)}
                          >
                            {OPENING_RATING_PRESETS.map(preset => (
                              <option key={preset.id} value={preset.id}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    {openingExplorer.loading && !openingExplorer.data && (
                      <p className="panel-copy small">Loading opening database...</p>
                    )}
                    {openingExplorer.authRequired && !openingExplorer.data && (
                      <p className="panel-copy small warning-copy">
                        Opening Explorer requires a Lichess token. Create a personal token with no scopes; local ECO names stay available offline.
                      </p>
                    )}
                    {openingExplorer.error && (
                      <p className="panel-copy small error-copy">Opening DB: {openingExplorer.error}</p>
                    )}
                    {openingExplorer.data && (
                      <>
                        <p className="panel-copy small">
                          {openingExplorer.data.opening
                            ? `${openingExplorer.data.opening.eco} · ${openingExplorer.data.opening.name}`
                            : 'No named opening at this position.'}
                        </p>
                        <p className="panel-copy small command-summary">
                          Games {openingTotalGames.toLocaleString()} · White {percentage(openingTotals?.white ?? 0, openingTotalGames).toFixed(1)}% ·
                          Draw {percentage(openingTotals?.draws ?? 0, openingTotalGames).toFixed(1)}% ·
                          Black {percentage(openingTotals?.black ?? 0, openingTotalGames).toFixed(1)}%
                        </p>
                        {engineBookAgreement !== null && (
                          <p className="panel-copy small">
                            Engine/book agreement: {engineBookAgreement ? 'yes' : 'no'}{currentEngineBestUci ? ` (${currentEngineBestUci})` : ''}
                          </p>
                        )}
                        {openingTopMoves.length > 0 && (
                          <div className="opening-move-list">
                            {openingTopMoves.map(move => {
                              const games = openingMoveGameCount(move)
                              return (
                                <button
                                  key={move.uci}
                                  type="button"
                                  className="opening-move-row"
                                  aria-label={openingMoveActionLabel(
                                    move.san,
                                    games,
                                    percentage(games, openingTotalGames),
                                  )}
                                  title={openingMoveActionLabel(
                                    move.san,
                                    games,
                                    percentage(games, openingTotalGames),
                                  )}
                                  onClick={() => {
                                    setShowAdvancedAnalyze(true)
                                    setActivePreset(null)
                                    setSearchMovesInput(move.uci)
                                  }}
                                >
                                  <strong>{move.san}</strong>
                                  <span>{percentage(games, openingTotalGames).toFixed(1)}%</span>
                                  <span>{games.toLocaleString()}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {openingTopMoves.length > 0 && (
                          <button type="button" onClick={applyBookMovesToSearch}>
                            Analyze top book moves
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  )}
                  <div className="pv-list">
                    <h3><span className="section-icon"><IconSearch /></span> Lines</h3>
                    {currentFenLines.length === 0 && !activeGoCommand && !currentLastBestMove && (
                      <div className="empty-state">
                        <span className="empty-state-icon" aria-hidden="true"><IconSearch /></span>
                        {/* Two quite different empty states. With a cloud eval
                            in hand the Coach card above is already showing a
                            line, and "start analysis" reads as a contradiction
                            rather than as an offer. */}
                        <p>
                          {coachSource === 'cloud'
                            ? 'Lichess had this position analysed already, and the Coach card is showing it. Analyze to search it here.'
                            : 'Start analysis to see principal variation lines here.'}
                        </p>
                      </div>
                    )}
                    {currentFenLines
                      .slice(0, analysisExperience === 'beginner' ? 2 : undefined)
                      .map(line => (
                        <article key={`${line.multipv}-${line.depth}-${line.pv[0] ?? 'pv'}`}>
                          <header>
                            <strong>#{line.multipv}</strong>
                            <span>D{line.depth}</span>
                            <span>{formatWhitePovEvaluation(line.fen ?? fen, line.cp, line.mate)}</span>
                          </header>
                          {(() => {
                            const lineFen = line.fen ?? fen
                            const steps = pvLineMoves(lineFen, line.pv, 8)
                            if (!steps.length) {
                              return <p>{line.pv.slice(0, 8).join(' ')}</p>
                            }
                            return (
                              <p className="pv-moves">
                                {steps.map(step => (
                                  <button
                                    key={`${step.index}-${step.uci}`}
                                    type="button"
                                    className="pv-move"
                                    onClick={() => playPvLine(lineFen, line.pv, step.index)}
                                    onMouseEnter={() => showLinePreview(step)}
                                    onMouseLeave={clearLinePreview}
                                    onFocus={() => showLinePreview(step)}
                                    onBlur={clearLinePreview}
                                    title={`Point at ${step.san} to see the position; click to play the line here`}
                                    aria-label={`Play this line up to ${step.numbered}`}
                                  >
                                    {step.prefix && <span className="pv-move-number">{step.prefix}</span>}
                                    {step.san}
                                  </button>
                                ))}
                              </p>
                            )
                          })()}
                          {analysisExperience === 'pro' && (
                            <p className="pv-uci">{line.pv.slice(0, 8).join(' ')}</p>
                          )}
                          {showWdl && line.wdl && (
                            <HorizontalWdlBar fen={line.fen ?? fen} wdl={line.wdl} orientation={orientation} />
                          )}
                        </article>
                      ))}
                    {currentLastPonderMove && (
                      <p className="best-move" title={currentLastPonderMove}>
                        Expected reply: {ponderMoveLabel(fen, currentLastBestMove, currentLastPonderMove)}
                      </p>
                    )}
                  </div>
                </>
              )}

              {workspaceMode === 'analysis' && analysisTab === 'review' && (
                <>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className={`batch-review-btn ${isBatchReviewing ? 'btn-primary pulsing' : ''}`}
                      onClick={isBatchReviewing ? stopBatchReview : startBatchReview}
                      disabled={Boolean(reviewGameDisabledReason)}
                      title={reviewGameDisabledReason ?? undefined}
                      aria-label={reviewGameButtonLabel}
                    >
                      {isBatchReviewing ? (
                        <><IconStop /> Reviewing {batchReviewPercent}%</>
                      ) : (
                        <><IconSearch /> Review Game</>
                      )}
                    </button>
                  </div>
                  {playFromHereRow}
                  {experienceToggle}
                  <div className="review-scaffold">
                    <h3><span className="section-icon"><IconBarChart /></span> Review</h3>
                    {/* The reviewed line is the branch on the board, and when
                        that is not the main line the reader has to be told --
                        the accuracy, the critical moments and the graphs are
                        all about a line the game does not contain. */}
                    {reviewsAVariation && (
                      <p className="panel-copy small warning-copy" role="status">
                        Reviewing the variation you are standing in, not the game's main line.
                        Promote it in the move list below to make it the game.
                      </p>
                    )}
                    <div className="review-filter-row" aria-label="Review side filter">
                      {REVIEW_SIDE_FILTERS.map(filter => (
                        <button
                          key={filter.id}
                          type="button"
                          className={`mode-pill ${reviewSideFilter === filter.id ? 'active' : ''}`}
                          aria-pressed={reviewSideFilter === filter.id}
                          onClick={() => {
                            setReviewSideFilter(filter.id)
                            setReviewPhaseFilter('all')
                          }}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                    <div className="accuracy-summary" aria-label="Accuracy summary">
                      <div>
                        <span>Overall</span>
                        <strong>{formatAccuracyValue(reviewAccuracy.overall)}</strong>
                      </div>
                      <div>
                        <span>White</span>
                        <strong>{formatAccuracyValue(reviewAccuracy.white)}</strong>
                      </div>
                      <div>
                        <span>Black</span>
                        <strong>{formatAccuracyValue(reviewAccuracy.black)}</strong>
                      </div>
                      {/* Average centipawn loss is a number you have to already
                          know to read, and the three accuracy percentages beside
                          it say the same thing in a scale a beginner has. Same
                          split Analyze already makes with MultiPV and WDL. */}
                      {analysisExperience === 'pro' && (
                        <div>
                          <span>ACPL</span>
                          <strong>{formatCentipawnLossValue(reviewAccuracy.averageCentipawnLoss)}</strong>
                        </div>
                      )}
                      <div>
                        <span>Evaluated</span>
                        <strong>{reviewAccuracy.evaluatedMoves}/{reportedReviewRows.length}</strong>
                      </div>
                    </div>
                    <PhaseAccuracy
                      rows={visibleReviewRows}
                      formatAccuracy={formatAccuracyValue}
                      selected={reviewPhaseFilter}
                      onSelect={setReviewPhaseFilter}
                    />
                    {reviewAccuracy.pendingMoves > 0 && (
                      <p className="panel-copy small command-summary">
                        {reviewAccuracy.pendingMoves} move{reviewAccuracy.pendingMoves === 1 ? '' : 's'} still need{reviewAccuracy.pendingMoves === 1 ? 's' : ''} deeper evaluation before accuracy is final.
                      </p>
                    )}
                    <div className="review-chips">
                      <span className="chip-book">Book {reviewSummary.book}</span>
                      <span className="chip-best">Best {reviewSummary.best}</span>
                      <span className="chip-excellent">Excellent {reviewSummary.excellent}</span>
                      <span className="chip-good">Good {reviewSummary.good}</span>
                      <span className="chip-inaccuracy">Inaccuracy {reviewSummary.inaccuracy}</span>
                      <span className="chip-mistake">Mistake {reviewSummary.mistake}</span>
                      <span className="chip-blunder">Blunder {reviewSummary.blunder}</span>
                      <span className="chip-pending">Pending {reviewSummary.pending}</span>
                    </div>
                    {/* The counts above say how many faults there are; this is
                        how a reader visits them. Critical Moments ranks the
                        five costliest, and everything past the fifth used to
                        be reachable only by scrolling the move list for a
                        coloured dot. Reads the filtered rows, so narrowing to
                        Black's middlegame steps Black's middlegame mistakes. */}
                    {reviewFaultCount > 0 && (
                      <div className="review-jump-row" role="group" aria-label="Step through the mistakes">
                        <span className="review-jump-count">
                          {reviewFaultAt
                            ? `Mistake ${reviewFaultAt.index} of ${reviewFaultAt.total}`
                            : countLabel(reviewFaultCount, 'mistake')}
                        </span>
                        <div className="review-jump-actions">
                        <button
                          type="button"
                          className="review-jump-btn"
                          onClick={() => goToReviewFault(-1)}
                          disabled={!previousReviewFaultRow}
                          title={previousReviewFaultRow
                            ? `Go to ${previousReviewFaultRow.moveNumber}${previousReviewFaultRow.sideToMove === 'w' ? '.' : '...'} ${previousReviewFaultRow.san}`
                            : 'No mistake before this position'}
                          aria-label={previousReviewFaultRow
                            ? `Go to the previous mistake, ${previousReviewFaultRow.san}`
                            : 'Previous mistake unavailable. No mistake before this position.'}
                        >
                          <IconChevronLeft aria-hidden="true" /> Previous
                        </button>
                        <button
                          type="button"
                          className="review-jump-btn"
                          onClick={() => goToReviewFault(1)}
                          disabled={!nextReviewFaultRow}
                          title={nextReviewFaultRow
                            ? `Go to ${nextReviewFaultRow.moveNumber}${nextReviewFaultRow.sideToMove === 'w' ? '.' : '...'} ${nextReviewFaultRow.san}`
                            : 'No mistake after this position'}
                          aria-label={nextReviewFaultRow
                            ? `Go to the next mistake, ${nextReviewFaultRow.san}`
                            : 'Next mistake unavailable. No mistake after this position.'}
                        >
                          Next <IconChevronRight aria-hidden="true" />
                        </button>
                        </div>
                      </div>
                    )}
                    {gameNarrativeTags.length > 0 && (
                      <div className="review-chips" aria-label="Game summary">
                        {gameNarrativeTags.map(tag => (
                          <span key={tag.id} className={narrativeTagToneClass(tag.tone)} title={tag.title}>
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {reportedReviewRows.length > 0 ? (
                      <ReviewMoveList
                        rows={reportedReviewRows}
                        nodes={reviewLineNodes}
                        currentNodeId={gameTree.current.id}
                        showEngineDetail={analysisExperience === 'pro'}
                        hideBestMoves={Boolean(
                          reviewPractice
                          && reviewPractice.status !== 'correct'
                          && reviewPractice.attempts < 2
                        )}
                        onSelectNode={navigateReviewNode}
                      />
                    ) : (
                      <div className="empty-state review-empty-state">
                        <span className="empty-state-icon"><IconSearch /></span>
                        <p>{reviewListEmptyCopy}</p>
                      </div>
                    )}
                  </div>
                  <div className="critical-moments-card">
                    <h3><span className="section-icon"><IconAlert /></span> Critical Moments</h3>
                    {criticalReviewRows.length > 0 ? (
                      <div className="critical-moment-list">
                        {criticalReviewRows.map(row => {
                          const beforeNode = reviewLineNodes[row.ply - 1]
                          const movePrefix = row.sideToMove === 'w' ? `${row.moveNumber}.` : `${row.moveNumber}...`
                          const bestMoveHint =
                            row.bestMove && row.bestMove !== row.uci ? `Best ${row.bestMoveSan ?? row.bestMove}` : null
                          const bestMoveLabel = row.bestMoveSan ?? row.bestMove
                          const practiceHidesAnswer = analysisExperience === 'beginner'
                            && (!reviewPractice || (reviewPractice.status !== 'correct' && reviewPractice.attempts < 2))
                          return (
                            <div
                              key={`${row.ply}-${row.uci}`}
                              className={`critical-moment-row quality-${row.quality}`}
                              role="group"
                              aria-label={`Critical moment before ${movePrefix} ${row.san}`}
                            >
                              <button
                                type="button"
                                className="critical-moment-main"
                                disabled={!beforeNode}
                                aria-label={`Review position before ${movePrefix} ${row.san}`}
                                title={practiceHidesAnswer ? undefined : bestMoveHint ?? undefined}
                                onClick={() => {
                                  if (!beforeNode) return
                                  navigateAndPonder(gameTree.navigateTo(beforeNode.id))
                                }}
                              >
                                <span className="critical-moment-move">
                                  <strong>{movePrefix} {row.san}</strong>
                                  <span>{REVIEW_LABELS[row.quality]}</span>
                                </span>
                                <span className="critical-moment-impact">
                                  {reviewImpactLabel(row.deltaCp)}
                                </span>
                                {bestMoveHint && !practiceHidesAnswer && (
                                  <span className="critical-moment-best">
                                    {bestMoveHint}
                                  </span>
                                )}
                              </button>
                              {bestMoveHint && beforeNode && (
                                <button
                                  type="button"
                                  className="critical-moment-best-action"
                                  aria-label={analysisExperience === 'beginner'
                                    ? `Practice the position before ${movePrefix} ${row.san}`
                                    : `Try best move ${bestMoveLabel} before ${movePrefix} ${row.san}`}
                                  title={analysisExperience === 'beginner'
                                    ? 'Hide the answer and retry this position'
                                    : `Try ${bestMoveLabel}`}
                                  onClick={() => {
                                    if (analysisExperience === 'beginner') {
                                      startReviewPractice(
                                        beforeNode,
                                        row.bestMove!,
                                        bestMoveLabel!,
                                        `${movePrefix} ${row.san}`,
                                      )
                                      return
                                    }
                                    tryReviewBestMove(beforeNode, row.bestMove)
                                  }}
                                >
                                  <IconPlay aria-hidden="true" />
                                  {analysisExperience === 'beginner' ? 'Practice' : 'Try best'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="panel-copy small">
                        {criticalMomentsEmptyCopy}
                      </p>
                    )}
                  </div>
                  {/* Pro only, like Opening Intel and Cloud Eval on the Analyze
                      tab, and for the same reason: it is a Lichess explorer
                      panel that needs a personal API token. Coach mode never
                      offers the token field, so this card's whole content there
                      was a summary reading "token needed", a paragraph asking
                      for one, and a button that switches to Pro. */}
                  {analysisExperience === 'pro' && (
                  <div className="opening-intel-card review-book-card">
                    <h3><span className="section-icon"><IconSearch /></span> Book vs Engine</h3>
                    <p className="panel-copy small command-summary">
                      First {reviewBookPrefixLength} {reviewBookPrefixLength === 1 ? 'ply' : 'plies'} · In book {reviewBookSummary.inBook} · Out of book {reviewBookSummary.outOfBook}
                      {reviewBookSummary.loading > 0 ? ` · checking ${reviewBookSummary.loading}` : ''}
                      {reviewBookSummary.afterNovelty > 0 ? ` · after novelty ${reviewBookSummary.afterNovelty}` : ''}
                      {reviewBookSummary.authRequired > 0 ? ' · token needed' : ''}
                      {reviewBookSummary.failed > 0 ? ' · book unavailable' : ''}
                    </p>
                    {reviewBookError && reviewBookSummary.failed > 0 && (
                      <p className="panel-copy small error-copy">Book lookup: {reviewBookError}</p>
                    )}
                    {reviewBookSummary.firstOutOfBook && (
                      <p className="panel-copy small">
                        First novelty: ply {reviewBookSummary.firstOutOfBook.ply} ({reviewBookSummary.firstOutOfBook.san})
                      </p>
                    )}
                    {reviewBookSummary.authRequired > 0 && (
                      <>
                        <p className="panel-copy small warning-copy">
                          Add a session-only Lichess token in Pro Opening Intel to compare the line against cloud book stats.
                        </p>
                        <button
                          type="button"
                          className="review-book-token-btn"
                          onClick={openOpeningIntel}
                        >
                          <span className="btn-icon"><IconBarChart /></span>
                          Open Opening Intel
                        </button>
                      </>
                    )}
                    {/* With nothing to compare against, every row says "Token" —
                        the summary, the explanation and the button above have
                        said it already, once each. */}
                    {!reviewBookRowsAllAwaitingToken && (
                    <div className="review-book-list">
                      {visibleReviewBookRows.slice(0, REVIEW_BOOK_VISIBLE_LIMIT).map(row => (
                        <div key={`${row.ply}-${row.uci}`} className={`review-book-row ${row.status}`}>
                          <span>#{row.ply}</span>
                          <strong>{row.san}</strong>
                          <span>
                            {row.status === 'in-book' && typeof row.popularityPct === 'number'
                              ? `${row.popularityPct.toFixed(1)}%`
                              : row.status === 'out-of-book'
                                ? 'Novelty'
                                : row.status === 'loading'
                                  ? '...'
                                  : row.status === 'auth-required'
                                    ? 'Token'
                                    : row.status === 'error'
                                      ? 'Error'
                                      : row.status === 'after-novelty'
                                        ? 'After novelty'
                                        : 'n/a'}
                          </span>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                  )}
                  <div className="right-section">
                    <h3><span className="section-icon"><IconSwords /></span> Moves</h3>
                    <p className="panel-copy small">Click any move to run a deeper local ponder at that position.</p>
                    <MoveListTree
                      tree={gameTree}
                      onNavigate={navigateMoveListAndPonder}
                    />
                  </div>
                </>
              )}

              {workspaceMode === 'analysis' && analysisTab === 'engine-lab' && (
                <>
                  <div className="engine-lab-card">
                    <h3><span className="section-icon"><IconSettings /></span> Runtime</h3>
                    <label className="engine-option-row profile-picker">
                      <span>Engine profile</span>
                      <select
                        aria-label="Engine profile in Engine Lab"
                        value={engineProfile}
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
                      Loaded: <strong>{activeProfile.name}</strong> · {profileMessage}
                    </p>
                    <p className="panel-copy small command-summary">
                      Active: {activeGoCommand || 'none'}
                    </p>
                    <label className="switch-control expert-toggle">
                      <input
                        type="checkbox"
                        aria-label="Enable expert engine commands"
                        checked={expertModeEnabled}
                        onChange={e => setExpertModeEnabled(e.target.checked)}
                      />
                      <span>Enable expert commands (bench/perft/unbounded go)</span>
                    </label>
                    {openingExplorer.data && (
                      <div className="engine-lab-inline">
                        <p className="panel-copy small">
                          Book moves available: {openingExplorer.data.moves.length} · games {openingTotalGames.toLocaleString()}
                        </p>
                        <button
                          type="button"
                          onClick={applyBookMovesToSearch}
                          disabled={openingTopMoves.length === 0}
                          title={openingTopMoves.length === 0 ? 'No book moves are ranked at this position.' : undefined}
                        >
                          Use top book moves in Analyze
                        </button>
                      </div>
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
                        aria-label="UCI command"
                        value={engineLabCommand}
                        onChange={e => setEngineLabCommand(e.target.value)}
                        placeholder="go depth 16"
                      />
                      <button type="submit">Send</button>
                      <button
                        type="button"
                        onClick={() => void copyLabConsole()}
                        disabled={!engineLabOutputLines.length}
                      >
                        {engineLabCopyStatus === 'copied' ? 'Copied' : 'Copy'}
                      </button>
                      <button type="button" onClick={clearLabConsole}>Clear</button>
                    </form>
                    {lastLabRun && (
                      <p className="panel-copy small command-summary">
                        Last run: <strong>{lastLabRun.command}</strong> ({lastLabRun.durationMs} ms)
                      </p>
                    )}
                    <div className="inline-actions diagnostics-actions">
                      <button
                        type="button"
                        aria-label="Run display board command"
                        disabled={status === 'analyzing'}
                        title={engineBusyDisabledReason ?? undefined}
                        onClick={() => void runLabCommand('d')}
                      >
                        d
                      </button>
                      <button
                        type="button"
                        aria-label="Run static evaluation command"
                        disabled={status === 'analyzing'}
                        title={engineBusyDisabledReason ?? undefined}
                        onClick={() => void runLabCommand('eval')}
                      >
                        eval
                      </button>
                      <button
                        type="button"
                        className="danger-lite"
                        disabled={!expertModeEnabled || status === 'analyzing'}
                        title={expertCommandDisabledReason ?? undefined}
                        onClick={() => void runLabCommand('bench')}
                      >
                        bench
                      </button>
                      <button
                        type="button"
                        className="danger-lite"
                        disabled={!expertModeEnabled || status === 'analyzing'}
                        title={expertCommandDisabledReason ?? undefined}
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
                    <pre className="engine-lab-output" aria-label="UCI console output" aria-live="polite">
                      {(engineLabOutputLines.join('\n')) || 'No command output yet.'}
                    </pre>
                  </div>

                  <div className="engine-lab-card">
                    <h3><span className="section-icon"><IconSettings /></span> Engine options</h3>
                    <div className="engine-options">
                      {options.map(option => (
                        <EngineOptionControl
                          key={option.name}
                          option={option}
                          disabled={status === 'analyzing'}
                          onSetOption={setOption}
                        />
                      ))}
                    </div>
                    <p className="panel-copy small">
                      Discovered from UCI handshake; applied immediately.
                      {status === 'analyzing' && ' Locked while a search is running.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── Bottom bar ── */}
      <section
        className={`panel bottom ${bottomPanelOpen ? '' : 'hidden'}`}
        aria-hidden={backgroundUiHidden ? true : undefined}
        inert={backgroundUiHidden ? true : undefined}
      >
        <div
          className="resize-handle resize-handle-top"
          role="button"
          tabIndex={0}
          aria-expanded={bottomPanelOpen}
          aria-label={bottomPanelOpen ? 'Collapse bottom bar' : 'Expand bottom bar'}
          onClick={toggleBottomPanel}
          onKeyDown={event => activateOnKeyboard(event, toggleBottomPanel)}
          title="Toggle bottom bar"
        >
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
              aiActive={playEngineActive}
              paused={paused}
              isGameOver={game.isGameOver() || Boolean(endedOffBoard)}
              stepMode={aiSpeed === 'step'}
              canStep={canStepAiMove}
              onPause={pause}
              onResume={resume}
              onStep={handleStep}
              aiSpeed={aiSpeed}
              onSpeedChange={handleSpeedChange}
            />

            <div className="bottom-status-row">
              <span className="bottom-engine-info" title={bottomStatusTitle}>
                {bottomStatusPrefix} <strong className={`status ${bottomStatusClass}`}>{bottomStatusText}</strong>
              </span>
              {analysisExperience === 'pro' && activeGoCommand && (
                <span className="engine-command-inline">{activeGoCommand}</span>
              )}
              {analysisExperience === 'pro' && engineTelemetry && (
                <span className="engine-telemetry-inline">{engineTelemetry}</span>
              )}

              {currentLastBestMove
                && !game.isGameOver()
                && (!reviewPractice || reviewPractice.status === 'correct' || reviewPractice.attempts >= 2)
                && (
                  <p className="best-move" title={currentLastBestMove}>Best: {bestMoveLabel(fen, currentLastBestMove)}</p>
                )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
