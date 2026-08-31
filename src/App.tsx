import { Chess, type Move, type Square } from 'chess.js'
import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from 'react'
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
  scoreToCp,
  rankCriticalMoments,
  summarizeAccuracy,
  summarizeReview,
  uciToSan,
  type EvalSnapshot,
  type ReviewRow,
  type ReviewLabel,
  type ReviewSideFilter,
  type WdlPoint,
  type WinratePoint,
  recordEvaluation,
  engineLineToSnapshot,
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
  shouldContinueOpeningBookLine,
  type OpeningDatabaseSource,
  type OpeningExplorerMove,
  type OpeningSpeed,
} from './engine/openingExplorer'
import { parseCandidateMoveInput, describeBestMove } from './engine/candidateMoves'
import { type AnalyzeMode, type UciGoLimits } from './engine/uci'
import { exportAnnotatedPgn, flattenPgnMainLine, parsePgnMoveTree, pgnImportUserErrorMessage } from './engine/pgn'
import { type LibraryGame, extractLibraryMetadata, suggestGameName } from './engine/gameLibrary'
import { narrativeTagToneClass, narrativeTags } from './engine/narrativeTags'
import type { ReviewPhaseFilter } from './engine/analysis'
import { reviewImpactLabel } from './engine/reviewImpact'
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
import { normalizeSpinOptionInput } from './engine/options'
import { engineProfiles, type EngineProfileId } from './engine/profiles'
import { fetchSamplePgn } from './engine/samplePgn'
import { parseFenShareHash } from './engine/shareLink'
import { parseGameShareHash, replaySharedGame } from './engine/shareGame'
import { nullMoveProbe } from './engine/threats'
import { tablebaseMoveAriaLabel, tablebaseMoveSummary, tablebaseSummary } from './engine/tablebaseLabels'
import { BOARD_SQUARES, describeBoardSquare, isBoardSquare } from './engine/boardAccessibility'
import { isBoardInputLocked } from './engine/boardInput'
import {
  applyPremove,
  canPremove,
  isPremoveablePiece,
  premoveFromSquares,
  type Premove,
} from './engine/premove'
import { moveSoundFor } from './engine/moveSound'
import { BOARD_THEMES, boardThemeById } from './engine/boardThemes'
import {
  createClock,
  flagPgnResult,
  flagResultLabel,
  describeClockTime,
  formatClockTime,
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
import { describeGameEnd } from './engine/gameEnd'
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
import { isExactTablebaseCoachMove, selectCoachBestMove } from './engine/coach'
import { engineLabCommandBlockMessage, engineLabCommandSafetyMessage } from './engine/labCommands'
import { aiSearchHistory, defaultOrientationForGameMode, hintDisabledReason, sideToMoveColor, takebackDisabledReason, takebackPlyCount } from './engine/playMode'
import { useStockfishEngine } from './hooks/useStockfishEngine'
import { DIFFICULTY_LABELS, useAiPlayer, type AiDifficulty } from './hooks/useAiPlayer'
import { useGameTree, type GameNode } from './hooks/useGameTree'
import { useOpening } from './hooks/useOpening'
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
} from './engine/appSettings'
import { ANALYSIS_SETTINGS_STORAGE_KEY } from './storageKeys'
import type { GameMode, PlayerColor } from './components/NewGameDialog'
import { WatchControls } from './components/WatchControls'
import { AI_SPEED_MS, type AiSpeed } from './components/aiSpeed'
import { WdlBar } from './components/WdlBar'
import { HorizontalWdlBar } from './components/HorizontalWdlBar'
import { MoveListTree } from './components/MoveListTree'
import { graphTickStep } from './components/graphLayout'
import { useElementHeight, useElementWidth } from './hooks/useElementWidth'
import { useModalFocus } from './hooks/useModalFocus'
import { useMoveSound } from './hooks/useMoveSound'
import { formatGraphAxisLabel, formatGraphPositionLabel } from './components/graphLabels'
import { IconBot, IconBarChart, IconSearch, IconSwords, IconAlert, IconKing, IconRefresh, IconFlag, IconFlip, IconDownload, IconClipboard, IconUsers, IconZap, IconSettings, IconPlay, IconStop, IconTrendingUp } from './components/icons'
import { isPlainShortcut, isTypingTarget } from './components/shortcutKeys'
import { CommandPaletteDialog } from './components/CommandPaletteDialog'
import type { Command } from './components/commandPalette'
import { COMMAND_PALETTE_ARIA_KEYSHORTCUTS, commandPaletteShortcutLabel } from './components/commandPalette'
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

// Board chrome, in rem — keep in sync with --stage-pad-x, --board-frame,
// --eval-col-w and --eval-col-gap in index.css. The board is sized in JS, so
// anything that sits beside it has to be subtracted here or the board overflows
// its stage; the mobile figures are the @media (max-width: 900px) overrides.
const BOARD_CHROME = {
  desktop: { stagePadX: 1.25, stagePadY: 1.35, frame: 0.55 },
  mobile: { stagePadX: 0.5, stagePadY: 0.35, frame: 0.25 },
  landscape: { stagePadX: 0.5, stagePadY: 0.5, frame: 0.25 },
} as const
const EVAL_COLUMN_REM = 1.625 + 0.5
const BOARD_FRAME_BORDER = 1
// Everything stacked with the board inside the stage: the meta strip and the
// gap above it. The stage's own padding is per-breakpoint, so it lives in
// BOARD_CHROME beside the horizontal figures.
const BOARD_STACK_REM = 2.25 + 0.55

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

const REVIEW_LABELS: Record<ReviewLabel, string> = {
  best: 'Best',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  pending: 'Pending',
}

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


/**
 * Read once, lazily: detectEngineCapabilities touches navigator, which is not
 * there at module scope in a test or a prerender.
 */



/**
 * Command+K on a Mac, Control+K elsewhere, with nothing else held.
 *
 * The one chord this app claims. It is declared as a chord rather than by
 * loosening `isPlainShortcut`, which exists precisely to keep the browser's own
 * combinations — Find, Back — out of the app's hands. No browser owns Ctrl/Cmd+K
 * and it is the near-universal palette binding.
 */
function isCommandPaletteChord(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'k'
    && (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
}














function moveGamesCount(move: OpeningExplorerMove): number {
  return move.white + move.draws + move.black
}

function percentage(part: number, total: number): number {
  if (!total) return 0
  return (part / total) * 100
}

function reviewConfidenceLabel(confidence: 'pending' | 'shallow' | 'standard' | 'deep', depth: number | undefined): string {
  if (confidence === 'pending') return 'Needs eval'
  if (confidence === 'shallow') return depth ? `Shallow d${depth}` : 'Shallow'
  if (confidence === 'deep') return depth ? `Deep d${depth}` : 'Deep'
  return depth ? `D${depth}` : 'Evaluated'
}

function formatAccuracyValue(value: number | null): string {
  return typeof value === 'number' ? value.toFixed(1) : '--'
}

function formatCentipawnLossValue(value: number | null): string {
  return typeof value === 'number' ? value.toFixed(0) : '--'
}

function formatCloudNodes(knodes: number): string {
  if (knodes >= 1000) return `${(knodes / 1000).toFixed(1)}M nodes`
  return `${knodes.toLocaleString()}k nodes`
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function engineTelemetryLabel(line: { depth?: number; nodes?: number; nps?: number; time?: number } | null | undefined): string | null {
  if (!line) return null

  const parts = [
    typeof line.depth === 'number' && line.depth > 0 ? `D${line.depth}` : null,
    typeof line.nodes === 'number' && line.nodes > 0 ? `${formatCompactNumber(line.nodes)} nodes` : null,
    typeof line.nps === 'number' && line.nps > 0 ? `${formatCompactNumber(line.nps)} nps` : null,
    typeof line.time === 'number' && line.time > 0 ? `${line.time} ms` : null,
  ].filter(Boolean)

  return parts.length ? parts.join(' · ') : null
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

function bestMoveLabel(fen: string, uci: string | null | undefined): string {
  if (!uci) return '...'
  return uciToSan(fen, uci) ?? uci
}

function ponderMoveLabel(fen: string, bestMove: string | null | undefined, ponderMove: string | null | undefined): string {
  if (!ponderMove) return '...'
  if (!bestMove) return bestMoveLabel(fen, ponderMove)

  const replay = new Chess(fen)
  try {
    const move = replay.move({
      from: bestMove.slice(0, 2),
      to: bestMove.slice(2, 4),
      promotion: bestMove[4],
    })
    if (!move) return ponderMove
  } catch {
    return ponderMove
  }

  return uciToSan(replay.fen(), ponderMove) ?? ponderMove
}

function resultLabel(result: HistoricalSampleGame['result']): string {
  if (result === '1-0') return 'White won'
  if (result === '0-1') return 'Black won'
  return 'Draw'
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

// Colour a candidate arrow by how much worse it is than the engine's best move,
// in absolute centipawns. Relative ranking alone would paint a near-equal second
// choice blunder-red, which misreads the position.
const ARROW_LOSS_SCALE_CP = 150

function topArrowColor(centipawnLoss: number): string {
  const t = 1 - clamp01(Math.max(0, centipawnLoss) / ARROW_LOSS_SCALE_CP)
  const from = { r: 248, g: 81, b: 73 } // Red (clearly worse)
  const to = { r: 63, g: 185, b: 80 } // Green (as good as best)
  const r = Math.round(from.r + (to.r - from.r) * t)
  const g = Math.round(from.g + (to.g - from.g) * t)
  const b = Math.round(from.b + (to.b - from.b) * t)
  const alpha = (0.5 + 0.4 * t).toFixed(2)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
  { keys: ['←', '→'], action: 'Previous / next move' },
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

const NOTATION_BASE_STYLE = {
  position: 'absolute' as const,
  fontWeight: 700,
  lineHeight: 1,
  userSelect: 'none' as const,
  pointerEvents: 'none' as const,
}

/**
 * A PGN header value, or null when it says nothing. The standard fills unknown
 * Seven Tag Roster fields with "?" and an unfinished result with "*", so a
 * generated or anonymised game would otherwise be labelled "? vs ?".
 */
function knownPgnHeader(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed !== '?' && trimmed !== '*' ? trimmed : null
}

function notationStyle(color: string) {
  return { color }
}

function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const piece = chess.get(from)
  if (!piece || piece.type !== 'p') return false
  return chess.moves({ square: from, verbose: true }).some(move => move.to === to && move.flags.includes('p'))
}

function syncRenderedBoardAccessibility(chess: Chess, selectedSquare: Square | null, legalTargets: Square[]) {
  const legalTargetSet = new Set(legalTargets)

  for (const square of BOARD_SQUARES) {
    const squareEl = document.getElementById(`chessboard-square-${square}`)
    if (!squareEl) continue

    const label = describeBoardSquare(chess, square, { selectedSquare, legalTargets })
    squareEl.setAttribute('aria-label', label)
    squareEl.setAttribute('title', label)

    for (const interactiveEl of squareEl.querySelectorAll<HTMLElement>('button, [role="button"]')) {
      interactiveEl.setAttribute('aria-label', label)
      interactiveEl.setAttribute('title', label)
    }

    const shouldExposeEmptyTarget = !squareEl.querySelector('button, [role="button"]')
      && Boolean(selectedSquare)
      && legalTargetSet.has(square)
    if (shouldExposeEmptyTarget) {
      squareEl.setAttribute('role', 'button')
      squareEl.setAttribute('tabindex', '0')
      squareEl.setAttribute('data-webchess-a11y-target', 'true')
    } else if (squareEl.getAttribute('data-webchess-a11y-target') === 'true') {
      squareEl.removeAttribute('role')
      squareEl.removeAttribute('tabindex')
      squareEl.removeAttribute('data-webchess-a11y-target')
    }
  }
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
  const [timeControlId, setTimeControlId] = useState<string>(persistedSettings.timeControlId)
  const [boardThemeId, setBoardThemeId] = useState<string>(persistedSettings.boardThemeId)
  const boardTheme = useMemo(() => boardThemeById(boardThemeId), [boardThemeId])
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
    setFen(f => f) // nudge AI effect
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
      setSettledAnalysisTarget({
        fen,
        rootFen: currentRootFen,
        pathMovesKey: currentPathMovesKey,
      })
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
   * Assigned on every render so the global keydown handler, installed well
   * before `requestThreat` is declared, can reach the current one without
   * listing it as a dependency. The same shape `gameTreeRef` uses, and for the
   * same reason: re-installing the handler on every render of a component that
   * re-renders several times a second is not free.
   */
  const requestThreatRef = useRef<() => void>(() => {})
  /** Same reason as `requestThreatRef`: the keydown handler predates it. */
  const takebackMoveRef = useRef<() => void>(() => {})

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
      if (e.key === 'Home') { e.preventDefault(); goFirst() }
      if (e.key === 'End') { e.preventDefault(); goLast() }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOrientation(value => value === 'white' ? 'black' : 'white')
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
  }, [goFirst, goLast, goPrev, goNext, pause, resume, shortcutsSuspended, workspaceMode])

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
    const nodes = gameTreeRef.current.mainLine()
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
  const aiPlayerStatusRef = useRef(aiPlayerStatus)
  const [aiReadyTick, setAiReadyTick] = useState(0)

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
      gameOver: game.isGameOver(),
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
    void requestAiMove(askedFor, HINT_DIFFICULTY, history)
      .then(uci => {
        setIsHinting(false)
        // The board may have moved on while the engine was looking.
        if (!uci || game.fen() !== askedFor) return
        setHintMove(uci)
      })
      .catch(() => setIsHinting(false))
  }, [game, gameMode, isHinting, playerColor, requestAiMove, workspaceMode])
  const requestHintRef = useRef(requestHint)
  requestHintRef.current = requestHint

  const hintReason = hintDisabledReason({
    workspaceMode,
    gameMode,
    turn: game.turn() === 'w' ? 'white' : 'black',
    playerColor,
    gameOver: game.isGameOver(),
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
  const coachEvaluation = coachLine
    ? formatWhitePovEvaluation(coachLine.fen ?? fen, coachLine.cp, coachLine.mate)
    : coachCloudScore
      ? formatWhitePovEvaluation(fen, coachCloudScore.cp, coachCloudScore.mate)
      : evaluationsByFen.get(fen)
        ? formatWhitePovEvaluation(fen, evaluationsByFen.get(fen)?.cp, evaluationsByFen.get(fen)?.mate)
        : tablebase.result
          ? tablebaseSummary(tablebase.result)
          : '...'
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
    const source = coachLine
      ? { fen: coachLine.fen ?? fen, cp: coachLine.cp, mate: coachLine.mate }
      : coachCloudScore
        ? { fen, cp: coachCloudScore.cp, mate: coachCloudScore.mate }
        : evaluationsByFen.get(fen)
          ? { fen, cp: evaluationsByFen.get(fen)!.cp, mate: evaluationsByFen.get(fen)!.mate }
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
    last: currentLastBestMove,
    tablebase: tablebaseTopMove,
  })
  const coachBestMoveIsTablebase = isExactTablebaseCoachMove(coachBestMove, tablebaseTopMove)
  const coachBestMoveText = bestMoveLabel(fen, coachBestMove)
  const coachReplyMove = coachBestMoveIsTablebase
    ? null
    : coachLine?.pv[1] ?? currentCloudEval?.pvs[0]?.moves[1] ?? currentLastPonderMove ?? null
  const coachReplyMoveText = ponderMoveLabel(fen, coachBestMove, coachReplyMove)
  const coachDepth = coachLine?.depth ?? currentCloudEval?.depth
  // A tile labelled Depth reports a depth or nothing. It used to fall back to
  // the engine status, so it read "analyzing" in a row of numbers.
  const coachDepthLabel = coachBestMoveIsTablebase || tablebase.result
    ? 'TB exact'
    : coachDepth ? `D${coachDepth}` : '...'
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
      const scrollContainer = viewport.width <= 900 ? mainContainerRef.current : panelContent
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
  }, [analysisExperience, analysisTab, viewport.width])

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

  // The mode groups scroll horizontally on narrow screens; keep whichever pill is
  // active in view so the current mode is never parked off-screen.
  const modeScrollerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const scroller = modeScrollerRef.current
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return
    const active = scroller.querySelector('.gc-pill-active')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [gameMode, workspaceMode])

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
      timeControlId,
      boardThemeId,
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
    timeControlId,
    boardThemeId,
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

  // ── Derived move data ─────────────────────────────────
  const mainLineNodes = useMemo(() => gameTree.mainLine(), [gameTree])
  const mainLineMoves = useMemo(() => mainLineNodes.slice(1).map(n => n.move!).filter(Boolean), [mainLineNodes])
  const mainLineUciMoves = useMemo(() => mainLineNodes.slice(1).map(node => node.uci).filter(Boolean), [mainLineNodes])
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
  const reviewBookPrefixLength = Math.min(mainLineUciMoves.length, REVIEW_BOOK_PREFETCH_LIMIT)

  const reviewRows = useMemo(
    () => buildReviewRows(mainLineMoves, evaluationsByFen, currentRootFen),
    [currentRootFen, evaluationsByFen, mainLineMoves],
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
  const reviewSummary = useMemo(() => summarizeReview(reportedReviewRows), [reportedReviewRows])
  const reviewAccuracy = useMemo(() => summarizeAccuracy(reportedReviewRows), [reportedReviewRows])
  // Only rendered inside the analysis workspace, which is exactly when the
  // engine is on, so the game length is the only thing left to check.
  const reviewGameDisabledReason = mainLineNodes.length <= 1
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
    if (!mainLineUciMoves.length) return
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
            moves: mainLineUciMoves.slice(0, idx),
            speeds: openingSource === 'lichess' ? openingSpeeds : undefined,
            ratings: openingSource === 'lichess' ? openingRatings : undefined,
            authToken: openingAuthToken,
          }, controller.signal)
          if (!shouldContinueOpeningBookLine(bookPosition, mainLineUciMoves[idx] ?? '')) {
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
  }, [analysisTab, currentRootFen, hasOpeningExplorerToken, mainLineUciMoves, openingAuthToken, openingRatings, openingSource, openingSpeeds, reviewBookPrefixLength, workspaceMode])

  const reviewBookRows = useMemo(() => {
    void openingPrefetchTick
    const maxRows = reviewBookPrefixLength
    return mainLineUciMoves.slice(0, maxRows).map((uci, index) => {
      const beforeMoves = mainLineUciMoves.slice(0, index)
      const fromCache = getCachedOpeningExplorer({
        source: openingSource,
        fen: currentRootFen,
        moves: beforeMoves,
        speeds: openingSource === 'lichess' ? openingSpeeds : undefined,
        ratings: openingSource === 'lichess' ? openingRatings : undefined,
      })
      const san = mainLineNodes[index + 1]?.san ?? uci
      const sideToMove = mainLineNodes[index]?.fen.split(/\s+/g)[1] === 'b' ? 'b' : 'w'

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

      const moveGames = moveGamesCount(move)
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
    mainLineUciMoves,
    mainLineNodes,
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

  const currentLineMoves = useMemo(
    () => currentLineNodes.slice(1).map(n => n.move!).filter(Boolean),
    [currentLineNodes],
  )

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
      const node = mainLineNodes[idx + 1]
      if (!node) return []
      return [{
        id: node.id,
        quality: row.quality === 'pending' ? undefined : row.quality,
      }]
    })
    setTreeNodeQualities(qualityUpdates)
  }, [mainLineNodes, reviewRows, setTreeNodeQualities])

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

  const clockFlagged = clock?.flagged ?? null
  // A flag and a resignation end the game identically as far as the board is
  // concerned: the position stays legal, so every "can this move be made"
  // question has to be told separately that the game is over.
  const endedOffBoard = clockFlagged ?? resignedBy
  endedOffBoardRef.current = endedOffBoard
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

    if (currentBoardMove) {
      list.push({ startSquare: currentBoardMove.from, endSquare: currentBoardMove.to, color: 'rgba(255, 170, 0, 0.8)' })
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
  }, [activeThreat, currentBoardMove, engineEnabled, fen, hintMove, lines, showBoardArrows, showTopMoveArrows, topMoveArrowCount])

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
      requestAiMove(requestFen, aiDifficulty, searchHistory).then(uciMove => {
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
  }, [aiDifficulty, aiReadyTick, cancelAiRequest, fen, game, gameMode, paused, playerColor, requestAiMove, stepRequestTick, workspaceMode])

  // ── Human move ────────────────────────────────────────
  const clearBoardSelection = useCallback(() => {
    setSelectedSquare(null)
    setLegalTargets([])
  }, [])

  const applyHumanMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      let move: Move | null
      try {
        move = game.move({ from, to, promotion })
      } catch {
        return false
      }
      if (!move) return false

      // An empty square is only focusable while it is a legal target, so the
      // square the reader just pressed Enter on stops being focusable the
      // moment the move lands and focus drops to <body>. Play a move from the
      // keyboard and you were back at the top of the document, 32 piece stops
      // away from the board.
      restoreBoardFocusRef.current = to

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
      clearBoardSelection()
      setPendingPromotion(null)
      return true
    },
    [cancelStaleBackgroundAnalysis, clearBoardSelection, game, gameTree, registerMovePlayed, stop, workspaceMode],
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
      syncRenderedBoardAccessibility(game, selectedSquare, legalTargets)
      restoreBoardFocus(settled)
    }
    const frame = window.requestAnimationFrame(() => sync())
    const settleTimer = window.setTimeout(() => sync(true), 360)

    sync()

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
    }
  }, [fen, game, legalTargets, selectedSquare])

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
    if (viewport.width > 900) return

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
  }, [boardRevealTick, viewport.width])

  useEffect(() => {
    if (analysisPanelRevealTick === 0) return
    if (viewport.width > 900) return
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
  }, [analysisPanelRevealTick, viewport.width, workspaceMode])

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

  const paletteCommands = useMemo<Command[]>(() => [
    { id: 'new-game', label: 'New game', shortcut: 'N', keywords: ['restart', 'reset'], run: openNewGameDialog },
    { id: 'flip-board', label: 'Flip board', shortcut: 'F', keywords: ['orientation', 'rotate', 'side'],
      run: () => setOrientation(value => (value === 'white' ? 'black' : 'white')) },
    { id: 'pgn', label: 'PGN and FEN', hint: 'Import, export, share', keywords: ['paste', 'copy', 'link', 'position'],
      run: openPgnDialog },
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
      disabled: Boolean(reviewGameDisabledReason) || mainLineNodes.length <= 1,
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
      id: 'play-from-here',
      label: 'Play from this position',
      hint: playFromHereDisabledReason ?? 'Take the move against the engine',
      keywords: ['practice', 'train', 'convert', 'try again', 'engine'],
      disabled: Boolean(playFromHereDisabledReason),
      run: playFromCurrentPosition,
    },
    { id: 'settings', label: 'Settings', keywords: ['preferences', 'engine', 'options'],
      run: () => { rememberModalTrigger(); setSettingsOpen(true) } },
  ], [handleAnalysisTabChange, handleWorkspaceModeChange, goFirst, goLast, hintReason, isProbingThreat, mainLineNodes.length, requestHint,
      openLibraryDialog, openNewGameDialog, openPgnDialog, playFromCurrentPosition, playFromHereDisabledReason,
      rememberModalTrigger, reviewGameDisabledReason, soundEnabled, startBatchReview, takebackMove, takebackReason,
      workspaceMode])

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
    setFen(f => f)
  }, [cancelPendingAiMove, cancelStaleBackgroundAnalysis, clearBoardSelection, playerColor, workspaceMode])

  const navigateMoveListAndPause = useCallback((chess: Chess) => {
    navigateAndPause(chess)
  }, [navigateAndPause])

  const navigateMoveListAndPonder = useCallback((chess: Chess) => {
    navigateAndPonder(chess)
  }, [navigateAndPonder])

  const navigateReviewNode = useCallback((node: GameNode) => {
    navigateAndPonder(gameTreeRef.current.navigateTo(node.id))
  }, [navigateAndPonder])

  const tryReviewBestMove = useCallback((beforeNode: GameNode, bestMove?: string) => {
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

  const isMobile = viewport.width <= 900
  // Matches the landscape-phone media query: the one layout that lays the board
  // beside the panels, with no room to scroll if the board overshoots.
  const isLandscapePhone = isMobile && viewport.height <= 520 && viewport.width > viewport.height
  const leftPanelUnavailable = workspaceMode === 'play'
  const layoutLeftWidth = leftPanelUnavailable ? 0 : leftWidth
  // Width the board can never have: the stage padding, the frame drawn around
  // the board, and the evaluation column that sits in flow beside it. All of it
  // is rem-based, so it grows with the user's text size.
  const chrome = isLandscapePhone
    ? BOARD_CHROME.landscape
    : isMobile ? BOARD_CHROME.mobile : BOARD_CHROME.desktop
  const boardChromeWidth = viewport.rem * (
    2 * chrome.stagePadX
    + 2 * chrome.frame
    + (engineEnabled && showWdl ? EVAL_COLUMN_REM : 0)
  ) + 2 * BOARD_FRAME_BORDER
  // The stage stretches to the row it lives in, so its height is the space the
  // board actually has — bars, safe areas and all — without guessing at any of
  // their sizes. Guessing is what the old fixed allowances did, and at 150%
  // text the bars outgrew them and the board ran under the bottom one.
  const boardHeightBudget = stageHeight
    - viewport.rem * (2 * chrome.stagePadY + BOARD_STACK_REM + 2 * chrome.frame)
    - 2 * BOARD_FRAME_BORDER
  const mobileBoardWidth = Math.min(
    Math.max(0, viewport.width - viewport.scrollbar - boardChromeWidth),
    isLandscapePhone ? boardHeightBudget : Math.max(300, Math.round(viewport.height * 0.46)),
  )

  // Mobile: prefer finger-friendly squares while respecting narrow screens.
  const boardWidth = Math.floor(isMobile
    ? mobileBoardWidth
    : Math.min(
      viewport.width - layoutLeftWidth - rightWidth - boardChromeWidth,
      boardHeightBudget,
      800,
    ))
  const renderedBoardWidth = isMobile ? boardWidth : Math.max(260, boardWidth)
  const notationFontSize = `${Math.round(Math.max(10, Math.min(13, renderedBoardWidth / 32)))}px`
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
  const turnLabel = gameResultLabel
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
  const moveNumberLabel = `Move ${fen.split(/\s+/)[5] ?? '1'}`
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
  const canStepAiMove = playEngineActive && !game.isGameOver() && (
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
              aria-hidden={settingsOpen ? true : undefined}
              inert={settingsOpen ? true : undefined}
            >
              <div className="top-mode-pills" aria-label="Workspace mode">
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
              <div className="top-mode-pills" aria-label="Game mode">
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
              <span className={`turn-pill ${gameResultLabel ? 'final' : game.turn() === 'w' ? 'white' : 'black'}`}>
                {turnLabel}
              </span>
              <span className="board-meta-move">{moveNumberLabel}</span>
              {importedPlayers && (
                <span className="board-meta-game" title={importedGameTitle}>
                  {importedResult && <strong>{importedResult}</strong>}
                  <span>{importedPlayers}</span>
                </span>
              )}
              {clock && workspaceMode === 'play' && (
                <ChessClock state={clock} paused={paused} orientation={orientation} />
              )}
              <span className="board-meta-status">{workspaceMode === 'analysis' ? status : gameModeLabel}</span>
              {currentMoveQuality && (
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
                const evalSnap = evaluationsByFen.get(fen)
                const evalLabel = evalSnap
                  ? formatCompactWhitePovEvaluation(fen, evalSnap.cp, evalSnap.mate)
                  : null
                return (
                  <div className="eval-column" aria-hidden="true">
                    <WdlBar fen={fen} evaluation={evalSnap} orientation={orientation} />
                    {evalLabel && <span className="eval-bar-label">{evalLabel}</span>}
                  </div>
                )
              })()}
              <div className="board-area" onKeyDown={handleBoardKeyDown}>
                <div
                  className="board-surface"
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
                      position: fen,
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
                      squareStyles: {
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
                      allowDrawingArrows: true,
                      allowDragging: !boardInputLocked || premoveAllowed,
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
              onImportBackup={library.importBackup}
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
                    <p className="panel-copy small">
                      {playEngineActive
                        ? `${aiPlayer.profileName} play engine is ${playEngineStatus} at ${aiDifficultyLabel} difficulty.`
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
                      <div>
                        <span>Depth</span>
                        <strong>{coachDepthLabel}</strong>
                      </div>
                    </div>
                    {/* The Coach line is the one a beginner is most likely to
                        want to see played out, and it was the same dead text as
                        the Pro panel's. Same buttons, shorter line. */}
                    {(() => {
                      const source = coachLine ?? (currentCloudEval?.pvs[0]
                        ? { fen, pv: currentCloudEval.pvs[0].moves }
                        : null)
                      const steps = source ? pvLineMoves(source.fen ?? fen, source.pv, 6) : []
                      if (!steps.length) {
                        return <p>{coachLineSan || 'Start analysis to get a candidate line.'}</p>
                      }
                      const lineFen = source!.fen ?? fen
                      return (
                        <p className="pv-moves coach-line-moves">
                          {steps.map(step => (
                            <button
                              key={`${step.index}-${step.uci}`}
                              type="button"
                              className="pv-move"
                              onClick={() => playPvLine(lineFen, source!.pv, step.index)}
                              title={`Play the line to ${step.san}`}
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
                              title={move.uci}
                              aria-label={tablebaseMoveAriaLabel(move)}
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
                              const games = moveGamesCount(move)
                              return (
                                <button
                                  key={move.uci}
                                  type="button"
                                  className="opening-move-row"
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
                        <p>Start analysis to see principal variation lines here.</p>
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
                                    title={`Play the line to ${step.san}`}
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
                      disabled={mainLineNodes.length <= 1}
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
                  <div className="review-scaffold">
                    <h3><span className="section-icon"><IconBarChart /></span> Review</h3>
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
                      <div>
                        <span>ACPL</span>
                        <strong>{formatCentipawnLossValue(reviewAccuracy.averageCentipawnLoss)}</strong>
                      </div>
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
                      <span className="chip-best">Best {reviewSummary.best}</span>
                      <span className="chip-good">Good {reviewSummary.good}</span>
                      <span className="chip-inaccuracy">Inaccuracy {reviewSummary.inaccuracy}</span>
                      <span className="chip-mistake">Mistake {reviewSummary.mistake}</span>
                      <span className="chip-blunder">Blunder {reviewSummary.blunder}</span>
                      <span className="chip-pending">Pending {reviewSummary.pending}</span>
                    </div>
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
                        nodes={mainLineNodes}
                        currentNodeId={gameTree.current.id}
                        showEngineDetail={analysisExperience === 'pro'}
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
                          const beforeNode = mainLineNodes[row.ply - 1]
                          const movePrefix = row.sideToMove === 'w' ? `${row.moveNumber}.` : `${row.moveNumber}...`
                          const bestMoveHint =
                            row.bestMove && row.bestMove !== row.uci ? `Best ${row.bestMoveSan ?? row.bestMove}` : null
                          const bestMoveLabel = row.bestMoveSan ?? row.bestMove
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
                                title={bestMoveHint ?? undefined}
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
                                {bestMoveHint && (
                                  <span className="critical-moment-best">
                                    {bestMoveHint}
                                  </span>
                                )}
                              </button>
                              {bestMoveHint && beforeNode && (
                                <button
                                  type="button"
                                  className="critical-moment-best-action"
                                  aria-label={`Try best move ${bestMoveLabel} before ${movePrefix} ${row.san}`}
                                  title={`Try ${bestMoveLabel}`}
                                  onClick={() => tryReviewBestMove(beforeNode, row.bestMove)}
                                >
                                  <IconPlay aria-hidden="true" />
                                  Try best
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
              isGameOver={game.isGameOver()}
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

              {currentLastBestMove && !game.isGameOver() && (
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

type ReviewMoveListProps = {
  rows: ReviewRow[]
  nodes: GameNode[]
  currentNodeId: string
  showEngineDetail: boolean
  onSelectNode: (node: GameNode) => void
}

const ReviewMoveList = memo(function ReviewMoveList({ rows, nodes, currentNodeId, showEngineDetail, onSelectNode }: ReviewMoveListProps) {
  return (
    <ol className="moves-list review-move-list">
      {rows.map(row => {
        const node = nodes[row.ply]
        const movePrefix = row.sideToMove === 'w' ? `${row.moveNumber}.` : `${row.moveNumber}...`
        const isCurrentReviewMove = node?.id === currentNodeId
        const qualityLabel = REVIEW_LABELS[row.quality]
        const impactLabel = reviewImpactLabel(row.deltaCp)
        const confidenceLabel = reviewConfidenceLabel(row.confidence, row.evalDepth)
        const bestMoveHint =
          row.bestMove && row.bestMove !== row.uci ? `Best ${row.bestMoveSan ?? row.bestMove}` : null
        // What the mover had left when they played it, where the game carries
        // it. Half the blunders in a real game are explained by this number and
        // by nothing in the evaluation.
        const clockLabel = typeof node?.clockMs === 'number' ? formatClockTime(node.clockMs) : null
        const ariaDetails = [
          qualityLabel,
          impactLabel,
          confidenceLabel,
          bestMoveHint,
          clockLabel ? `${describeClockTime(node!.clockMs!)} left` : null,
        ].filter(Boolean).join(', ')

        return (
          <li key={`${row.ply}-${row.uci}`} className={`quality-${row.quality}`}>
            <button
              type="button"
              className={`review-move-row ${showEngineDetail ? '' : 'compact'} ${isCurrentReviewMove ? 'active' : ''}`}
              disabled={!node}
              aria-current={isCurrentReviewMove ? 'true' : undefined}
              aria-label={`Go to ${movePrefix} ${row.san}: ${ariaDetails}`}
              onClick={() => {
                if (node) onSelectNode(node)
              }}
            >
              <span className="move-index">{movePrefix}</span>
              <strong>{row.san}</strong>
              {showEngineDetail && <span className="move-uci">{row.uci}</span>}
              <span className="move-best">{bestMoveHint ?? ''}</span>
              <span className="move-impact">{impactLabel}</span>
              {clockLabel && <span className="move-clock" aria-hidden="true">{clockLabel}</span>}
              {showEngineDetail && (
                <span className={`move-confidence confidence-${row.confidence}`}>
                  {confidenceLabel}
                </span>
              )}
              <span className="move-quality">{qualityLabel}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
})

// ── Engine option control ──────────────────────────────────────────────────────

type EngineOptionControlProps = {
  option: {
    name: string
    type: 'check' | 'spin' | 'string' | 'button' | 'combo'
    defaultValue?: string
    currentValue?: string
    min?: number
    max?: number
    vars?: string[]
  }
  onSetOption: (name: string, value?: string | number | boolean) => void
  disabled?: boolean
}

function EngineOptionControl({ option, onSetOption, disabled = false }: EngineOptionControlProps) {
  const optionValue = option.currentValue ?? option.defaultValue ?? ''
  const [value, setValue] = useState(optionValue)

  useEffect(() => {
    setValue(optionValue)
  }, [optionValue])

  if (option.type === 'button') {
    return (
      <div className="engine-option-row">
        <button type="button" disabled={disabled} onClick={() => onSetOption(option.name)}>
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
          aria-label={option.name}
          checked={checked}
          disabled={disabled}
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
        <input
          type="number"
          aria-label={option.name}
          min={option.min}
          max={option.max}
          value={value}
          disabled={disabled}
          onChange={e => setValue(e.target.value)}
          onBlur={() => {
            const normalized = normalizeSpinOptionInput(option, value)
            setValue(String(normalized))
            onSetOption(option.name, normalized)
          }} />
      </label>
    )
  }

  if (option.type === 'combo') {
    const choices = option.vars?.length ? option.vars : [optionValue].filter(Boolean)
    return (
      <label className="engine-option-row">
        <span>{option.name}</span>
        <select
          aria-label={option.name}
          value={value}
          disabled={disabled}
          onChange={e => {
            setValue(e.target.value)
            onSetOption(option.name, e.target.value)
          }}>
          {choices.map(choice => (
            <option key={choice} value={choice}>{choice}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="engine-option-row">
      <span>{option.name}</span>
      <input
        type="text"
        aria-label={option.name}
        value={value}
        disabled={disabled}
        onChange={e => setValue(e.target.value)}
        onBlur={() => onSetOption(option.name, value)} />
    </label>
  )
}

// ── Winrate graph ──────────────────────────────────────────────────────────────

// Keep in sync with --graph-height in index.css, which sizes the rendered <svg>.
const GRAPH_HEIGHT = 160
const GRAPH_PAD_LEFT = 52
const GRAPH_PAD_RIGHT = 20
const GRAPH_PAD_TOP = 16
const GRAPH_PAD_BOTTOM = 34
// A trend graph exists to show the shape of a game at a glance. At the old
// 16px per ply an 84-ply game drew 1400px into a ~259px rail, so only a keyhole
// of the curve was ever visible. It now fills whatever width it is given, and
// only games long enough to squeeze plies below this floor scroll at all.
const GRAPH_MIN_PX_PER_PLY = 2
const GRAPH_FALLBACK_WIDTH = 260

function graphWidthForIndex(maxIndex: number, available: number): number {
  const intrinsic = GRAPH_PAD_LEFT + GRAPH_PAD_RIGHT + (maxIndex * GRAPH_MIN_PX_PER_PLY)
  return Math.max(available, intrinsic)
}

function clampGraphIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(index, 0), maxIndex)
}

function graphKeyboardTarget(key: string, currentIndex: number, maxIndex: number): number | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampGraphIndex(currentIndex - 1, maxIndex)
    case 'ArrowRight':
    case 'ArrowUp':
      return clampGraphIndex(currentIndex + 1, maxIndex)
    case 'Home':
      return 0
    case 'End':
      return maxIndex
    case 'PageDown':
      return clampGraphIndex(currentIndex - 10, maxIndex)
    case 'PageUp':
      return clampGraphIndex(currentIndex + 10, maxIndex)
    default:
      return null
  }
}

type WinrateGraphProps = {
  points: WinratePoint[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

/**
 * Everything the two trend graphs work out identically before they draw
 * anything: where a point lands, where the gridlines go, and what a click or an
 * arrow key means. Only the paths drawn through it differ — one line for the
 * winrate, three for the WDL split.
 *
 * A plain function rather than a hook: both callers compute this after their
 * empty-state early return, where a hook could not be called.
 */
function trendGraphGeometry(
  points: readonly { index: number }[],
  available: number,
  currentIndex: number | undefined,
  onNavigate?: (index: number) => void,
) {
  const maxIndex = points.length > 0 ? points[points.length - 1]!.index : 0
  const width = graphWidthForIndex(maxIndex, available)
  const height = GRAPH_HEIGHT
  const padLeft = GRAPH_PAD_LEFT
  const padRight = GRAPH_PAD_RIGHT
  const padTop = GRAPH_PAD_TOP
  const padBottom = GRAPH_PAD_BOTTOM
  const innerWidth = width - padLeft - padRight
  const innerHeight = height - padTop - padBottom

  const toX = (idx: number) => padLeft + (maxIndex > 0 ? (idx / maxIndex) * innerWidth : 0)
  const toY = (pct: number) => padTop + ((100 - pct) / 100) * innerHeight

  const isNavigable = Boolean(onNavigate && maxIndex > 0)
  const selectedIndex = clampGraphIndex(currentIndex ?? maxIndex, maxIndex)

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isNavigable || !onNavigate) return
    const rect = e.currentTarget.getBoundingClientRect()
    const scaleX = width / rect.width
    const xInsideSvg = (e.clientX - rect.left) * scaleX

    let targetIdx = Math.round(((xInsideSvg - padLeft) / innerWidth) * maxIndex)
    if (targetIdx < 0) targetIdx = 0
    if (targetIdx > maxIndex) targetIdx = maxIndex

    onNavigate(targetIdx)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!isNavigable || !onNavigate) return

    const targetIdx = graphKeyboardTarget(e.key, selectedIndex, maxIndex)
    if (targetIdx === null) return

    e.preventDefault()
    if (targetIdx !== selectedIndex) {
      onNavigate(targetIdx)
    }
  }

  return {
    maxIndex, width, height, padLeft, padRight, padTop, padBottom,
    innerWidth, innerHeight, toX, toY,
    markers: [0, 25, 50, 75, 100],
    xTickStep: graphTickStep(maxIndex, innerWidth),
    isNavigable, selectedIndex, handleClick, handleKeyDown,
  }
}

const WinrateGraph = memo(function WinrateGraph({ points, currentIndex, onNavigate }: WinrateGraphProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const available = useElementWidth(scrollRef, GRAPH_FALLBACK_WIDTH)
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><IconTrendingUp /></span>
        <p>Play and analyze moves to build the live winrate graph.</p>
      </div>
    )
  }

  const {
    maxIndex, width, height, padLeft, padRight, padTop, padBottom,
    toX, toY, markers, xTickStep, isNavigable, selectedIndex, handleClick, handleKeyDown,
  } = trendGraphGeometry(points, available, currentIndex, onNavigate)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(p.whiteWinrate).toFixed(2)}`)
    .join(' ')

  const area = `${path} L ${toX(maxIndex).toFixed(2)} ${(height - padBottom).toFixed(2)} L ${toX(points[0]?.index ?? 0).toFixed(2)} ${(height - padBottom).toFixed(2)} Z`
  const selectedPoint = points.find(point => point.index === selectedIndex)

  const currentLineX = currentIndex !== undefined && maxIndex > 0
    ? toX(selectedIndex)
    : null

  return (
    <div className="graph-wrap" aria-label="White winrate graph">
      <div className="graph-scroll" ref={scrollRef}>
        <svg
          className="winrate-graph"
          width={width}
          viewBox={`0 0 ${width} ${height}`}
          role={isNavigable ? 'slider' : 'img'}
          tabIndex={isNavigable ? 0 : undefined}
          aria-label={isNavigable ? 'White winrate move navigator' : 'White winrate graph'}
          aria-valuemin={isNavigable ? 0 : undefined}
          aria-valuemax={isNavigable ? maxIndex : undefined}
          aria-valuenow={isNavigable ? selectedIndex : undefined}
          aria-valuetext={isNavigable ? formatGraphPositionLabel(selectedPoint, selectedIndex) : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          style={{ cursor: isNavigable ? 'pointer' : 'default' }}
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
          {points.map((p) => (
            <circle
              key={`wr-point-${p.index}`}
              cx={toX(p.index)}
              cy={toY(p.whiteWinrate)}
              r={2.8}
              className="graph-point"
            />
          ))}

          {points.map((p) => {
            if (p.index > 0 && p.index % xTickStep === 0) {
              const x = toX(p.index)
              return (
                <g key={`x-${p.index}`}>
                  <line x1={x} x2={x} y1={height - padBottom} y2={height - padBottom + 6} stroke="rgba(240, 246, 252, 0.2)" strokeWidth="1" />
                  <text x={x} y={height - padBottom + 20} className="graph-grid-text" textAnchor="middle">{formatGraphAxisLabel(p)}</text>
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
})

type WdlProgressGraphProps = {
  points: WdlPoint[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

const WdlProgressGraph = memo(function WdlProgressGraph({ points, currentIndex, onNavigate }: WdlProgressGraphProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const available = useElementWidth(scrollRef, GRAPH_FALLBACK_WIDTH)
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon" aria-hidden="true"><IconBarChart /></span>
        <p>Analyze moves with WDL enabled to build the W/D/B progression graph.</p>
      </div>
    )
  }

  const {
    maxIndex, width, height, padLeft, padRight, padTop, padBottom,
    toX, toY, markers, xTickStep, isNavigable, selectedIndex, handleClick, handleKeyDown,
  } = trendGraphGeometry(points, available, currentIndex, onNavigate)

  const buildPath = (selector: (point: WdlPoint) => number): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(selector(p)).toFixed(2)}`).join(' ')

  const whitePath = buildPath((p) => p.white)
  const drawPath = buildPath((p) => p.draw)
  const blackPath = buildPath((p) => p.black)
  const selectedPoint = points.find(point => point.index === selectedIndex)

  const currentLineX = currentIndex !== undefined && maxIndex > 0
    ? toX(selectedIndex)
    : null

  return (
    <div className="graph-wrap" aria-label="WDL progression graph">
      <div className="graph-scroll" ref={scrollRef}>
        <svg
          className="winrate-graph"
          width={width}
          viewBox={`0 0 ${width} ${height}`}
          role={isNavigable ? 'slider' : 'img'}
          tabIndex={isNavigable ? 0 : undefined}
          aria-label={isNavigable ? 'WDL trend move navigator' : 'WDL progression graph'}
          aria-valuemin={isNavigable ? 0 : undefined}
          aria-valuemax={isNavigable ? maxIndex : undefined}
          aria-valuenow={isNavigable ? selectedIndex : undefined}
          aria-valuetext={isNavigable ? formatGraphPositionLabel(selectedPoint, selectedIndex) : undefined}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          style={{ cursor: isNavigable ? 'pointer' : 'default' }}
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
          {points.length === 1 && (
            <>
              <circle cx={toX(points[0]!.index)} cy={toY(points[0]!.white)} r={2.8} className="graph-point graph-point-white" />
              <circle cx={toX(points[0]!.index)} cy={toY(points[0]!.draw)} r={2.8} className="graph-point graph-point-draw" />
              <circle cx={toX(points[0]!.index)} cy={toY(points[0]!.black)} r={2.8} className="graph-point graph-point-black" />
            </>
          )}

          {points.map((p) => {
            if (p.index > 0 && p.index % xTickStep === 0) {
              const x = toX(p.index)
              return (
                <g key={`wdl-x-${p.index}`}>
                  <line x1={x} x2={x} y1={height - padBottom} y2={height - padBottom + 6} stroke="rgba(240, 246, 252, 0.2)" strokeWidth="1" />
                  <text x={x} y={height - padBottom + 20} className="graph-grid-text" textAnchor="middle">{formatGraphAxisLabel(p)}</text>
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
})
