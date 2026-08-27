import { Chess, type Move, type Square } from 'chess.js'
import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from 'react'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import {
  buildWdlSeries,
  buildWinrateSeries,
  buildReviewRows,
  formatCompactWhitePovEvaluation,
  filterReviewRowsBySide,
  formatWhitePovEvaluation,
  isReviewEvaluationSufficient,
  isTerminalPositionFen,
  mergeEvaluationSnapshot,
  pvToSan,
  scoreToCp,
  summarizeAccuracy,
  summarizeReview,
  uciToSan,
  type EvalSnapshot,
  type ReviewRow,
  type ReviewLabel,
  type ReviewSideFilter,
  type WdlPoint,
  type WinratePoint,
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
import { parseCandidateMoveInput } from './engine/candidateMoves'
import { type AnalyzeMode, type UciGoLimits } from './engine/uci'
import { flattenPgnMainLine, parsePgnMoveTree, pgnImportUserErrorMessage } from './engine/pgn'
import { FEN_PARSE_ERROR, validateFenForAnalysis } from './engine/fen'
import { buildImportSweepTargets, countImportSweepCandidates, type ImportSweepTarget } from './engine/importSweep'
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
import { tablebaseMoveAriaLabel, tablebaseMoveSummary, tablebaseSummary } from './engine/tablebaseLabels'
import { BOARD_SQUARES, describeBoardSquare, isBoardSquare } from './engine/boardAccessibility'
import { isBoardInputLocked } from './engine/boardInput'
import { isExactTablebaseCoachMove, selectCoachBestMove } from './engine/coach'
import { engineLabCommandBlockMessage, engineLabCommandSafetyMessage } from './engine/labCommands'
import { defaultOrientationForGameMode } from './engine/playMode'
import { useStockfishEngine } from './hooks/useStockfishEngine'
import { DIFFICULTY_LABELS, useAiPlayer, type AiDifficulty } from './hooks/useAiPlayer'
import { useGameTree, type GameNode } from './hooks/useGameTree'
import { useOpening } from './hooks/useOpening'
import { useCloudEvaluation } from './hooks/useCloudEvaluation'
import { useOpeningExplorer } from './hooks/useOpeningExplorer'
import { useTablebase } from './hooks/useTablebase'
import { ANALYSIS_SETTINGS_STORAGE_KEY } from './storageKeys'
import type { GameMode, PlayerColor } from './components/NewGameDialog'
import { WatchControls } from './components/WatchControls'
import { AI_SPEED_MS, type AiSpeed } from './components/aiSpeed'
import { WdlBar } from './components/WdlBar'
import { HorizontalWdlBar } from './components/HorizontalWdlBar'
import { MoveListTree } from './components/MoveListTree'
import { graphTickStep } from './components/graphLayout'
import { useElementHeight, useElementWidth } from './hooks/useElementWidth'
import { formatGraphAxisLabel, formatGraphPositionLabel } from './components/graphLabels'
import { IconBot, IconBarChart, IconSearch, IconSwords, IconAlert, IconKing, IconRefresh, IconFlip, IconDownload, IconUsers, IconZap, IconSettings, IconPlay, IconStop, IconTrendingUp } from './components/icons'
import './App.css'

const NewGameDialog = lazy(() =>
  import('./components/NewGameDialog').then(module => ({ default: module.NewGameDialog })),
)
const PgnDialog = lazy(() =>
  import('./components/PgnDialog').then(module => ({ default: module.PgnDialog })),
)

type Orientation = 'white' | 'black'
type WorkspaceMode = 'play' | 'analysis'
type AnalysisTab = 'analyze' | 'review' | 'engine-lab'
type AnalysisExperience = 'beginner' | 'pro'
type AnalyzePresetId = 'blunder-check' | 'game-review' | 'deep-candidate' | 'mate-hunt'
type OpeningRatingPresetId = 'all' | 'club' | 'advanced'
type SampleLibraryFilter = 'all' | HistoricalSampleFormat
type PromotionPiece = 'q' | 'r' | 'b' | 'n'
type PendingPromotion = { from: Square; to: Square }
type ImportSweepProgress = { done: number; total: number; sampledFrom?: number }

// Board chrome, in rem — keep in sync with --stage-pad-x, --board-frame,
// --eval-col-w and --eval-col-gap in index.css. The board is sized in JS, so
// anything that sits beside it has to be subtracted here or the board overflows
// its stage; the mobile figures are the @media (max-width: 900px) overrides.
const BOARD_CHROME = {
  desktop: { stagePadX: 1.25, frame: 0.55 },
  mobile: { stagePadX: 0.5, frame: 0.25 },
} as const
const EVAL_COLUMN_REM = 1.625 + 0.5
const BOARD_FRAME_BORDER = 1
// Everything the board is stacked on top of inside the stage: the stage's own
// vertical padding, the meta strip, and the gap between them. Only landscape
// needs it — that is the one layout where the stage cannot scroll.
const LANDSCAPE_BOARD_STACK_REM = 2 * 0.5 + 2.25 + 0.55

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
const ANALYZE_MODE_IDS: AnalyzeMode[] = ['quick', 'deep', 'infinite', 'mate', 'review']
const ANALYSIS_TAB_IDS: AnalysisTab[] = ['analyze', 'review', 'engine-lab']
const ANALYSIS_EXPERIENCE_IDS: AnalysisExperience[] = ['beginner', 'pro']
const WORKSPACE_MODE_IDS: WorkspaceMode[] = ['play', 'analysis']
const OPENING_SOURCES: OpeningDatabaseSource[] = ['masters', 'lichess']
const OPENING_SPEEDS: OpeningSpeed[] = ['bullet', 'blitz', 'rapid', 'classical']
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
const IMPORT_LOAD_MOVETIME_MS = 70
const IMPORT_SHALLOW_MULTIPV = 1
const MOVE_PONDER_MIN_DEPTH = 20
const IMPORT_SWEEP_MOVETIME_MS = 70
const IMPORT_SWEEP_TARGET_LIMIT = 80
const IMPORT_SWEEP_MULTIPV = 1
const AUTO_ANALYZE_DEBOUNCE_MS = 140
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

type BatchReviewTarget = ImportSweepTarget

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

function buildBatchReviewTargets(
  nodes: Array<{ fen: string; uci: string }>,
  rootFen: string,
): BatchReviewTarget[] {
  if (!nodes.length) return []

  const historyMoves: string[] = []
  return nodes.map((node, index) => {
    if (index > 0 && node.uci) historyMoves.push(node.uci)
    return {
      fen: node.fen,
      rootFen,
      historyMoves: [...historyMoves],
    }
  })
}

type PersistedAppSettings = {
  workspaceMode: WorkspaceMode
  autoAnalyze: boolean
  engineProfile: EngineProfileId
  analysisTab: AnalysisTab
  analysisExperience: AnalysisExperience
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
  openingSource: OpeningDatabaseSource
  openingSpeeds: OpeningSpeed[]
  openingRatingPreset: OpeningRatingPresetId
  showBoardArrows: boolean
  showTopMoveArrows: boolean
  topMoveArrowCount: number
}

const DEFAULT_PERSISTED_SETTINGS: PersistedAppSettings = {
  workspaceMode: 'play',
  autoAnalyze: true,
  engineProfile: 'auto',
  analysisTab: 'analyze',
  analysisExperience: 'beginner',
  activePreset: 'game-review',
  analyzeMode: 'review',
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
  openingSource: 'masters',
  openingSpeeds: ['blitz', 'rapid', 'classical'],
  openingRatingPreset: 'all',
  showBoardArrows: true,
  showTopMoveArrows: true,
  topMoveArrowCount: 3,
}

const QUICK_MOVETIME_BOUNDS = { min: 50, max: 30_000, fallback: DEFAULT_PERSISTED_SETTINGS.quickMovetimeMs }
const MATE_TARGET_BOUNDS = { min: 1, max: 30, fallback: DEFAULT_PERSISTED_SETTINGS.mateTarget }
const LIMIT_NODES_BOUNDS = { min: 1, max: 1_000_000_000 }
const CLOCK_TIME_BOUNDS = { min: 0, max: 86_400_000, fallback: DEFAULT_PERSISTED_SETTINGS.whiteTimeMs }
const CLOCK_INCREMENT_BOUNDS = { min: 0, max: 60_000, fallback: DEFAULT_PERSISTED_SETTINGS.whiteIncMs }
const MOVES_TO_GO_BOUNDS = { min: 1, max: 500 }

function isAnalyzePresetId(value: unknown): value is AnalyzePresetId {
  return typeof value === 'string' && analyzePresets.some(preset => preset.id === value)
}

function isAnalyzeMode(value: unknown): value is AnalyzeMode {
  return typeof value === 'string' && ANALYZE_MODE_IDS.includes(value as AnalyzeMode)
}

function isAnalysisTab(value: unknown): value is AnalysisTab {
  return typeof value === 'string' && ANALYSIS_TAB_IDS.includes(value as AnalysisTab)
}

function isAnalysisExperience(value: unknown): value is AnalysisExperience {
  return typeof value === 'string' && ANALYSIS_EXPERIENCE_IDS.includes(value as AnalysisExperience)
}

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return typeof value === 'string' && WORKSPACE_MODE_IDS.includes(value as WorkspaceMode)
}

function isEngineProfileId(value: unknown): value is EngineProfileId {
  if (value === 'auto') return true
  return typeof value === 'string' && engineProfiles.some(profile => profile.id === value)
}

function isOpeningSource(value: unknown): value is OpeningDatabaseSource {
  return typeof value === 'string' && OPENING_SOURCES.includes(value as OpeningDatabaseSource)
}

function isOpeningSpeed(value: unknown): value is OpeningSpeed {
  return typeof value === 'string' && OPENING_SPEEDS.includes(value as OpeningSpeed)
}

function isOpeningRatingPreset(value: unknown): value is OpeningRatingPresetId {
  return typeof value === 'string' && OPENING_RATING_PRESETS.some(preset => preset.id === value)
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

function normalizeOpeningSpeeds(value: unknown): OpeningSpeed[] {
  if (!Array.isArray(value)) return DEFAULT_PERSISTED_SETTINGS.openingSpeeds
  const seen = new Set<OpeningSpeed>()
  const next = value
    .filter((item): item is OpeningSpeed => isOpeningSpeed(item))
    .filter(item => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })
  return next.length ? next : DEFAULT_PERSISTED_SETTINGS.openingSpeeds
}

function moveGamesCount(move: OpeningExplorerMove): number {
  return move.white + move.draws + move.black
}

function percentage(part: number, total: number): number {
  if (!total) return 0
  return (part / total) * 100
}

function reviewImpactLabel(deltaCp: number | undefined): string {
  if (typeof deltaCp !== 'number') return 'Queued'
  if (deltaCp >= 10) return `Gain +${(deltaCp / 100).toFixed(2)}`
  if (deltaCp >= -10) return 'No loss'
  return `Lost ${(Math.abs(deltaCp) / 100).toFixed(2)}`
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

function lineScoreForCandidate(line: { cp?: number; mate?: number }): number | null {
  const cp = scoreToCp(line.cp, line.mate)
  return typeof cp === 'number' ? cp : null
}

function formatCandidateGap(gapCp: number | null): string | null {
  if (gapCp === null) return null
  if (gapCp >= 5000) return 'mate swing'
  if (gapCp <= 10) return 'same tier'
  return `+${(gapCp / 100).toFixed(2)} vs #2`
}

function describeBestMove(
  fen: string,
  moveUci: string | null,
  lines: Array<{ cp?: number; mate?: number; pv: string[] }>,
  openingTopMove?: string,
  tablebaseTopMove?: string,
): { tags: string[]; summary: string; gapLabel: string | null } | null {
  if (!moveUci || moveUci.length < 4) return null

  const replay = new Chess(fen)
  let move: ReturnType<typeof replay.move>
  try {
    move = replay.move({
      from: moveUci.slice(0, 2) as Square,
      to: moveUci.slice(2, 4) as Square,
      promotion: moveUci[4],
    })
  } catch {
    return null
  }
  if (!move) return null

  const tags: string[] = []
  const san = move.san
  const fromRank = move.from[1]
  const centerSquares = new Set(['d4', 'e4', 'd5', 'e5'])

  if (san.includes('#')) tags.push('Mate')
  else if (san.includes('+')) tags.push('Check')
  if (move.captured) tags.push('Capture')
  if (move.flags.includes('k') || move.flags.includes('q')) tags.push('Castle')
  if (move.promotion) tags.push('Promotion')
  if (tablebaseTopMove === moveUci) tags.push('Tablebase')
  if (openingTopMove === moveUci) tags.push('Book')
  if (move.piece === 'p' && centerSquares.has(move.to)) tags.push('Center')
  if ((move.piece === 'n' || move.piece === 'b') && (fromRank === '1' || fromRank === '8')) tags.push('Develop')

  const uniqueCandidateLines = lines.reduce<Array<{ cp?: number; mate?: number; pv: string[] }>>((acc, line) => {
    const candidate = line.pv[0]
    if (!candidate || acc.some(item => item.pv[0] === candidate)) return acc
    return [...acc, line]
  }, [])
  const primaryLine = uniqueCandidateLines.find(line => line.pv[0] === moveUci) ?? uniqueCandidateLines[0]
  const alternativeLine = uniqueCandidateLines.find(line => line.pv[0] !== moveUci)
  const primaryScore = primaryLine ? lineScoreForCandidate(primaryLine) : null
  const alternativeScore = alternativeLine ? lineScoreForCandidate(alternativeLine) : null
  const gapCp = primaryScore !== null && alternativeScore !== null
    ? Math.max(0, primaryScore - alternativeScore)
    : null
  const gapLabel = formatCandidateGap(gapCp)

  let summary = 'Best engine candidate; use the line to check the plan.'
  if (san.includes('#')) summary = 'Forces mate. The follow-up line matters more than material.'
  else if (san.includes('+')) summary = 'Creates a forcing move, so the reply choices are narrower.'
  else if (move.captured) summary = 'Starts with a capture; compare the recapture in the principal variation.'
  else if (move.flags.includes('k') || move.flags.includes('q')) summary = 'Improves king safety and connects the rooks.'
  else if (tablebaseTopMove === moveUci) summary = 'Matches the exact tablebase move for this endgame.'
  else if (openingTopMove === moveUci) summary = 'Matches the leading book move from the selected opening source.'
  else if (move.piece === 'p' && centerSquares.has(move.to)) summary = 'Claims central space and opens lines for pieces.'
  else if ((move.piece === 'n' || move.piece === 'b') && (fromRank === '1' || fromRank === '8')) summary = 'Develops a piece while keeping the position flexible.'
  else if (gapCp !== null && gapCp >= 80) summary = 'The top candidate is meaningfully ahead of the alternatives.'
  else if (gapCp !== null && gapCp <= 20) summary = 'Several candidate moves are close; choose by plan and preparation.'

  return {
    tags: tags.length ? tags.slice(0, 4) : ['Candidate'],
    summary,
    gapLabel,
  }
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
}

const KEYBOARD_SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['←', '→'], action: 'Previous / next move' },
  { keys: ['Home', 'End'], action: 'First / last position' },
  { keys: ['F'], action: 'Flip the board' },
  { keys: ['Space'], action: 'Pause or resume the AI (Play mode)' },
]

// The usual "opposite square colour" convention cannot reach WCAG AA against the
// mid-tone dark square — no lightness does — so coordinates take one dark ink,
// which clears 5:1 on the dark square and 11:1 on the light one.
const BOARD_NOTATION_INK = '#2b2118'

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
      workspaceMode: isWorkspaceMode(parsed.workspaceMode) ? parsed.workspaceMode : DEFAULT_PERSISTED_SETTINGS.workspaceMode,
      autoAnalyze: typeof parsed.autoAnalyze === 'boolean' ? parsed.autoAnalyze : DEFAULT_PERSISTED_SETTINGS.autoAnalyze,
      engineProfile: isEngineProfileId(parsed.engineProfile) ? parsed.engineProfile : DEFAULT_PERSISTED_SETTINGS.engineProfile,
      analysisTab: isAnalysisTab(parsed.analysisTab) ? parsed.analysisTab : DEFAULT_PERSISTED_SETTINGS.analysisTab,
      analysisExperience: isAnalysisExperience(parsed.analysisExperience)
        ? parsed.analysisExperience
        : DEFAULT_PERSISTED_SETTINGS.analysisExperience,
      activePreset: parsed.activePreset === null ? null : (isAnalyzePresetId(parsed.activePreset) ? parsed.activePreset : DEFAULT_PERSISTED_SETTINGS.activePreset),
      analyzeMode: isAnalyzeMode(parsed.analyzeMode) ? parsed.analyzeMode : DEFAULT_PERSISTED_SETTINGS.analyzeMode,
      showAdvancedAnalyze: typeof parsed.showAdvancedAnalyze === 'boolean'
        ? parsed.showAdvancedAnalyze
        : DEFAULT_PERSISTED_SETTINGS.showAdvancedAnalyze,
      searchDepth: normalizeInteger(parsed.searchDepth, 6, 32, DEFAULT_PERSISTED_SETTINGS.searchDepth),
      quickMovetimeMs: normalizeInteger(
        parsed.quickMovetimeMs,
        QUICK_MOVETIME_BOUNDS.min,
        QUICK_MOVETIME_BOUNDS.max,
        QUICK_MOVETIME_BOUNDS.fallback,
      ),
      mateTarget: normalizeInteger(parsed.mateTarget, MATE_TARGET_BOUNDS.min, MATE_TARGET_BOUNDS.max, MATE_TARGET_BOUNDS.fallback),
      multiPv: normalizeInteger(parsed.multiPv, 1, 5, DEFAULT_PERSISTED_SETTINGS.multiPv),
      hashMb: normalizeInteger(parsed.hashMb, 16, 512, DEFAULT_PERSISTED_SETTINGS.hashMb),
      showWdl: typeof parsed.showWdl === 'boolean' ? parsed.showWdl : DEFAULT_PERSISTED_SETTINGS.showWdl,
      limitNodes: normalizeOptionalPositiveInteger(parsed.limitNodes, LIMIT_NODES_BOUNDS.max),
      searchMovesInput: DEFAULT_PERSISTED_SETTINGS.searchMovesInput,
      useClockLimits: typeof parsed.useClockLimits === 'boolean' ? parsed.useClockLimits : DEFAULT_PERSISTED_SETTINGS.useClockLimits,
      whiteTimeMs: normalizeInteger(parsed.whiteTimeMs, CLOCK_TIME_BOUNDS.min, CLOCK_TIME_BOUNDS.max, DEFAULT_PERSISTED_SETTINGS.whiteTimeMs),
      blackTimeMs: normalizeInteger(parsed.blackTimeMs, CLOCK_TIME_BOUNDS.min, CLOCK_TIME_BOUNDS.max, DEFAULT_PERSISTED_SETTINGS.blackTimeMs),
      whiteIncMs: normalizeInteger(parsed.whiteIncMs, CLOCK_INCREMENT_BOUNDS.min, CLOCK_INCREMENT_BOUNDS.max, DEFAULT_PERSISTED_SETTINGS.whiteIncMs),
      blackIncMs: normalizeInteger(parsed.blackIncMs, CLOCK_INCREMENT_BOUNDS.min, CLOCK_INCREMENT_BOUNDS.max, DEFAULT_PERSISTED_SETTINGS.blackIncMs),
      movesToGo: normalizeOptionalPositiveInteger(parsed.movesToGo, MOVES_TO_GO_BOUNDS.max),
      expertModeEnabled: typeof parsed.expertModeEnabled === 'boolean'
        ? parsed.expertModeEnabled
        : DEFAULT_PERSISTED_SETTINGS.expertModeEnabled,
      labCommandHistory,
      openingSource: isOpeningSource(parsed.openingSource) ? parsed.openingSource : DEFAULT_PERSISTED_SETTINGS.openingSource,
      openingSpeeds: normalizeOpeningSpeeds(parsed.openingSpeeds),
      openingRatingPreset: isOpeningRatingPreset(parsed.openingRatingPreset)
        ? parsed.openingRatingPreset
        : DEFAULT_PERSISTED_SETTINGS.openingRatingPreset,
      showBoardArrows: typeof parsed.showBoardArrows === 'boolean'
        ? parsed.showBoardArrows
        : DEFAULT_PERSISTED_SETTINGS.showBoardArrows,
      showTopMoveArrows: typeof parsed.showTopMoveArrows === 'boolean'
        ? parsed.showTopMoveArrows
        : DEFAULT_PERSISTED_SETTINGS.showTopMoveArrows,
      topMoveArrowCount: normalizeInteger(parsed.topMoveArrowCount, 1, 5, DEFAULT_PERSISTED_SETTINGS.topMoveArrowCount),
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
  const [openingPrefetchTick, setOpeningPrefetchTick] = useState(0)
  const [sampleFilter, setSampleFilter] = useState<SampleLibraryFilter>('all')
  const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null)
  const [sampleLoadError, setSampleLoadError] = useState<string | null>(null)
  const [isImportingGame, setIsImportingGame] = useState(false)
  const [boardRevealTick, setBoardRevealTick] = useState(0)
  const [analysisPanelRevealTick, setAnalysisPanelRevealTick] = useState(0)
  const [pendingShallowAnalyzeFen, setPendingShallowAnalyzeFen] = useState<string | null>(null)
  const [pendingPonderFen, setPendingPonderFen] = useState<string | null>(null)
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
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [legalTargets, setLegalTargets] = useState<Square[]>([])
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
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
  const appModalOpen = showNewGameDialog || showPgnDialog
  const promotionDialogOpen = pendingPromotion !== null
  const topChromeHidden = appModalOpen || promotionDialogOpen
  const backgroundUiHidden = appModalOpen || settingsOpen || promotionDialogOpen
  const dialogLoadingLabel = showNewGameDialog ? 'Loading new game...' : 'Loading import tools...'
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

  // The global key handler is declared above these callbacks, so it reaches them
  // through refs rather than re-binding the listener on every promotion.
  const pendingPromotionRef = useRef<PendingPromotion | null>(null)
  const completePromotionRef = useRef<(piece: PromotionPiece) => void>(() => {})
  const cancelPromotionRef = useRef<() => void>(() => {})

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (shortcutsSuspended) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      // The promotion chooser is modal: it owns the keyboard until it resolves,
      // otherwise navigation would run with a move still half-made.
      if (pendingPromotionRef.current) {
        if (e.key === 'Escape') { e.preventDefault(); cancelPromotionRef.current() }
        const piece = PROMOTION_KEYS[e.key.toLowerCase()]
        if (piece) { e.preventDefault(); completePromotionRef.current(piece) }
        return
      }

      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'Home') { e.preventDefault(); goFirst() }
      if (e.key === 'End') { e.preventDefault(); goLast() }
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOrientation(value => value === 'white' ? 'black' : 'white')
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

  useEffect(() => {
    if (!settingsOpen) return

    const panelEl = settingsBodyRef.current
    if (!panelEl) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    const isVisible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element)
      return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
    }

    const getFocusable = () =>
      Array.from(panelEl.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1 && isVisible(el))

    const focusable = getFocusable()
    focusable[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSettingsOpen(false)
        return
      }

      if (event.key !== 'Tab') return
      const currentFocusable = getFocusable()
      if (!currentFocusable.length) return

      const first = currentFocusable[0]
      const last = currentFocusable[currentFocusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      const activeIsFocusable = active ? currentFocusable.includes(active) : false

      if (event.shiftKey) {
        if (active === first || !activeIsFocusable) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !activeIsFocusable) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.()
      }
    }
  }, [settingsOpen])

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
    const reviewTargets = buildBatchReviewTargets(nodes, rootFen)
    const searchableTargets = reviewTargets.filter(target => !isTerminalPositionFen(target.fen))
    const targets = searchableTargets.filter(target => !isReviewEvaluationSufficient(evaluationsByFen.get(target.fen), searchDepth))
    clearImportSweep()
    setBatchReviewProgress({
      done: searchableTargets.length - targets.length,
      total: searchableTargets.length,
    })
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
  const primaryBestMove = primaryLine?.pv[0]
  const currentLastBestMove = lastBestMoveFen === fen ? lastBestMove : null
  const currentLastPonderMove = lastPonderMoveFen === fen ? lastPonderMove : null

  // ── Capture evaluations ──────────────────────────────
  useEffect(() => {
    if (!engineEnabled) return
    const cp = scoreToCp(primaryLine?.cp, primaryLine?.mate)
    if (typeof cp !== 'number') return
    const bestMove = primaryBestMove
    const evaluationFen = primaryLine?.fen ?? fen
    const snapshot: EvalSnapshot = {
      cp,
      mate: primaryLine?.mate,
      bestMove,
      wdl: primaryLine?.wdl,
      depth: primaryLine?.depth,
      nodes: primaryLine?.nodes,
      nps: primaryLine?.nps,
      time: primaryLine?.time,
      searchId: primaryLine?.searchId,
      mode: primaryLine?.mode,
      purpose: primaryLine?.purpose,
      searchedAt: Date.now(),
    }

    setEvaluationsByFen(prev => {
      const cur = prev.get(evaluationFen)
      const merged = mergeEvaluationSnapshot(cur, snapshot)
      if (!merged || merged === cur) return prev

      const next = new Map(prev)
      next.set(evaluationFen, merged)
      return next
    })
  }, [
    engineEnabled,
    fen,
    primaryLine?.cp,
    primaryLine?.depth,
    primaryLine?.fen,
    primaryLine?.mate,
    primaryLine?.mode,
    primaryLine?.nodes,
    primaryLine?.nps,
    primaryBestMove,
    primaryLine?.purpose,
    primaryLine?.searchId,
    primaryLine?.time,
    primaryLine?.wdl,
  ])

  useEffect(() => {
    if (!engineEnabled || !currentCloudEval) return
    const snapshot = cloudEvalToSnapshot(fen, currentCloudEval)
    if (!snapshot) return

    setEvaluationsByFen(previous => {
      const current = previous.get(fen)
      const merged = mergeEvaluationSnapshot(current, snapshot)
      if (!merged || merged === current) return previous

      const next = new Map(previous)
      next.set(fen, merged)
      return next
    })
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
    setHashMb(DEFAULT_PERSISTED_SETTINGS.hashMb)
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

  const reviewRows = useMemo(
    () => buildReviewRows(mainLineMoves, evaluationsByFen, currentRootFen),
    [currentRootFen, evaluationsByFen, mainLineMoves],
  )
  const visibleReviewRows = useMemo(
    () => filterReviewRowsBySide(reviewRows, reviewSideFilter),
    [reviewRows, reviewSideFilter],
  )
  const reviewSummary = useMemo(() => summarizeReview(visibleReviewRows), [visibleReviewRows])
  const reviewAccuracy = useMemo(() => summarizeAccuracy(visibleReviewRows), [visibleReviewRows])
  const reviewGameDisabledReason = !engineEnabled
    ? 'Enable Stockfish to review the game.'
    : mainLineNodes.length <= 1
      ? 'Add moves or import a PGN before running review.'
      : null
  const reviewGameButtonLabel = isBatchReviewing
    ? `Stop game review. ${batchReviewProgress.done} of ${batchReviewProgress.total} positions reviewed.`
    : reviewGameDisabledReason
      ? `Review Game unavailable. ${reviewGameDisabledReason}`
      : 'Review Game'
  const criticalReviewRows = useMemo(
    () => visibleReviewRows
      .filter(row => row.quality === 'inaccuracy' || row.quality === 'mistake' || row.quality === 'blunder')
      .filter(row => typeof row.deltaCp === 'number')
      .sort((a, b) => (a.deltaCp ?? 0) - (b.deltaCp ?? 0))
      .slice(0, 5),
    [visibleReviewRows],
  )
  const criticalMomentsEmptyCopy = visibleReviewRows.length === 0
    ? 'Run Review Game after a line is analyzed to surface the biggest turning points.'
    : reviewAccuracy.pendingMoves > 0
      ? 'Review Game is still collecting enough depth to identify the biggest turning points.'
      : 'No major swings found in this reviewed line.'

  useEffect(() => {
    setReviewBookError(null)
    setReviewBookTerminalPly(null)
    if (workspaceMode !== 'analysis') return
    if (analysisTab !== 'review') return
    if (!mainLineUciMoves.length) return
    if (!hasOpeningExplorerToken) return

    let cancelled = false
    const controller = new AbortController()
    const maxPlyToPrefetch = Math.min(mainLineUciMoves.length, REVIEW_BOOK_PREFETCH_LIMIT)

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
  }, [analysisTab, currentRootFen, hasOpeningExplorerToken, mainLineUciMoves, openingAuthToken, openingRatings, openingSource, openingSpeeds, workspaceMode])

  const reviewBookRows = useMemo(() => {
    void openingPrefetchTick
    const maxRows = Math.min(mainLineUciMoves.length, REVIEW_BOOK_PREFETCH_LIMIT)
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
    reviewBookTerminalPly,
    reviewBookError,
  ])

  const visibleReviewBookRows = useMemo(() => {
    if (reviewSideFilter === 'both') return reviewBookRows
    const side = reviewSideFilter === 'white' ? 'w' : 'b'
    return reviewBookRows.filter(row => row.sideToMove === side)
  }, [reviewBookRows, reviewSideFilter])

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

  const winratePoints = useMemo(
    () => buildWinrateSeries(currentLineMoves, evaluationsByFen, currentRootFen),
    [currentLineMoves, currentRootFen, evaluationsByFen],
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

  // ── Engine arrows ────────────────────────────────────
  const currentBoardMove = gameTree.current.move
  const arrows = useMemo(() => {
    if (!showBoardArrows) return []

    const list: Array<{ startSquare: string; endSquare: string; color: string }> = []

    if (currentBoardMove) {
      list.push({ startSquare: currentBoardMove.from, endSquare: currentBoardMove.to, color: 'rgba(255, 170, 0, 0.8)' })
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
  }, [currentBoardMove, engineEnabled, fen, lines, showBoardArrows, showTopMoveArrows, topMoveArrowCount])

  // ── AI move loop (with speed throttle) ───────────────
  useEffect(() => {
    if (workspaceMode !== 'play') return
    if (game.isGameOver()) return
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

    const doMove = () => {
      requestAiMove(requestFen, aiDifficulty).then(uciMove => {
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
          gameTreeRef.current.addMove(move, newFen)
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

      cancelStaleBackgroundAnalysis()
      stop()
      const newFen = game.fen()
      setFen(newFen)
      gameTree.addMove(move, newFen)
      clearBoardSelection()
      setPendingPromotion(null)
      return true
    },
    [cancelStaleBackgroundAnalysis, clearBoardSelection, game, gameTree, stop],
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
    if (isBoardInputLocked({
      workspaceMode,
      gameMode,
      isAiThinking,
      paused,
      turn: game.turn(),
      playerColor: playerColorToTurn(playerColor),
    })) return false

    if (pieceType.toLowerCase().endsWith('p') && isPromotionMove(game, sourceSquare, targetSquare)) {
      beginPromotion(sourceSquare, targetSquare)
      return false
    }

    return applyHumanMove(sourceSquare, targetSquare)
  }

  const onSquareClick = useCallback((square: Square) => {
    if (pendingPromotion) return
    if (isBoardInputLocked({
      workspaceMode,
      gameMode,
      isAiThinking,
      paused,
      turn: game.turn(),
      playerColor: playerColorToTurn(playerColor),
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
    isAiThinking,
    paused,
    pendingPromotion,
    playerColor,
    selectedSquare,
    workspaceMode,
  ])

  useEffect(() => {
    const sync = () => syncRenderedBoardAccessibility(game, selectedSquare, legalTargets)
    const frame = window.requestAnimationFrame(sync)
    const settleTimer = window.setTimeout(sync, 360)

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

  useEffect(() => {
    pendingPromotionRef.current = pendingPromotion
    completePromotionRef.current = completePromotion
    cancelPromotionRef.current = cancelPromotion
  })

  useEffect(() => {
    if (!pendingPromotion) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialogEl = promotionDialogRef.current
    if (!dialogEl) return

    const focusableSelector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    const getFocusable = () =>
      Array.from(dialogEl.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)

    const focusable = getFocusable()
    focusable[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setPendingPromotion(null)
        return
      }

      if (event.key !== 'Tab') return
      const currentFocusable = getFocusable()
      if (!currentFocusable.length) return

      const first = currentFocusable[0]
      const last = currentFocusable[currentFocusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      const activeIsFocusable = active ? currentFocusable.includes(active) : false

      if (event.shiftKey) {
        if (active === first || !activeIsFocusable) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !activeIsFocusable) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.()
      }
    }
  }, [pendingPromotion])

  // ── New game ──────────────────────────────────────────
  const rememberModalTrigger = () => {
    modalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }

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

  const openNewGameDialog = () => {
    rememberModalTrigger()
    setSettingsOpen(false)
    setShowPgnDialog(false)
    setShowNewGameDialog(true)
  }
  const openPgnDialog = () => {
    rememberModalTrigger()
    setSettingsOpen(false)
    setShowNewGameDialog(false)
    setShowPgnDialog(true)
  }
  const closeNewGameDialog = useCallback(() => {
    setShowNewGameDialog(false)
    restoreModalTriggerFocus()
  }, [restoreModalTriggerFocus])
  const closePgnDialog = useCallback(() => {
    setShowPgnDialog(false)
    restoreModalTriggerFocus()
  }, [restoreModalTriggerFocus])
  const handleSettingsToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open
    setSettingsOpen(nextOpen)
    if (!nextOpen) return
    setShowNewGameDialog(false)
    setShowPgnDialog(false)
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

  useEffect(() => {
    const loadSharedHash = () => {
      const sharedFen = loadSharedFenFromUrl()
      if (!sharedFen) return
      setShowPgnDialog(false)
      setShowNewGameDialog(false)
      setSettingsOpen(false)
      if (sharedFen === game.fen()) {
        requestBoardReveal()
        return
      }
      handleFenLoad(sharedFen, { forceAnalysis: true })
    }

    window.addEventListener('hashchange', loadSharedHash)
    return () => window.removeEventListener('hashchange', loadSharedHash)
  }, [game, handleFenLoad, requestBoardReveal])

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
    ({ mode, playerColor: color, difficulty }: { mode: GameMode; playerColor: PlayerColor; difficulty: AiDifficulty }) => {
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

      setOrientation(defaultOrientationForGameMode(mode, color))
      requestBoardReveal()
    },
    [cancelPendingAiMove, cancelSampleLoad, clearBatchReview, clearBoardSelection, clearImportSweep, game, gameTree, newGame, requestBoardReveal, setAiPlayerDifficulty, setPgnHeaders],
  )

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
  const desktopBoardChromeReserve = 44
  // Width the board can never have: the stage padding, the frame drawn around
  // the board, and the evaluation column that sits in flow beside it. All of it
  // is rem-based, so it grows with the user's text size.
  const chrome = isMobile ? BOARD_CHROME.mobile : BOARD_CHROME.desktop
  const boardChromeWidth = viewport.rem * (
    2 * chrome.stagePadX
    + 2 * chrome.frame
    + (engineEnabled && showWdl ? EVAL_COLUMN_REM : 0)
  ) + 2 * BOARD_FRAME_BORDER
  // The stage stretches to the row it lives in, so its height is the space the
  // board actually has — bars, safe areas and all — without guessing at any of
  // their sizes.
  const boardHeightBudget = stageHeight
    - viewport.rem * (LANDSCAPE_BOARD_STACK_REM + 2 * chrome.frame)
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
      viewport.height - (bottomPanelOpen ? 140 : 80) - (topPanelOpen ? 80 : 40) - desktopBoardChromeReserve,
      800,
    ))
  const renderedBoardWidth = isMobile ? boardWidth : Math.max(260, boardWidth)
  const notationFontSize = `${Math.round(Math.max(10, Math.min(13, renderedBoardWidth / 32)))}px`
  const turnLabel = game.turn() === 'w' ? 'White to move' : 'Black to move'
  const moveNumberLabel = `Move ${fen.split(/\s+/)[5] ?? '1'}`
  const currentMoveQuality = gameTree.current.quality
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
                <h4 className="settings-subhead">Keyboard shortcuts</h4>
                <dl className="shortcut-list">
                  {KEYBOARD_SHORTCUTS.map(({ keys, action }) => (
                    <div key={action}>
                      <dt>{keys.map(key => <kbd key={key}>{key}</kbd>)}</dt>
                      <dd>{action}</dd>
                    </div>
                  ))}
                </dl>
                <label className="switch-control">
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
                        <strong>{multiPv} lines</strong>
                      </label>
                      <label className="switch-control">
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
                  onNavigate={(idx) => {
                    const targetNode = currentLineNodes[idx] || currentLineNodes[currentLineNodes.length - 1]
                    if (!targetNode) return
                    const chess = gameTree.navigateTo(targetNode.id)
                    if (workspaceMode === 'analysis') {
                      navigateAndPonder(chess)
                      return
                    }
                    navigateAndPause(chess)
                  }}
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
                  onNavigate={(idx) => {
                    const targetNode = currentLineNodes[idx] || currentLineNodes[currentLineNodes.length - 1]
                    if (!targetNode) return
                    const chess = gameTree.navigateTo(targetNode.id)
                    if (workspaceMode === 'analysis') {
                      navigateAndPonder(chess)
                      return
                    }
                    navigateAndPause(chess)
                  }}
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
              <span className={`turn-pill ${game.turn() === 'w' ? 'white' : 'black'}`}>{turnLabel}</span>
              <span>{moveNumberLabel}</span>
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
                      squareStyles: {
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
                      darkSquareNotationStyle: notationStyle(BOARD_NOTATION_INK),
                      lightSquareNotationStyle: notationStyle(BOARD_NOTATION_INK),
                      alphaNotationStyle: { ...NOTATION_BASE_STYLE, bottom: 2, right: 3, fontSize: notationFontSize },
                      numericNotationStyle: { ...NOTATION_BASE_STYLE, top: 2, left: 3, fontSize: notationFontSize },
                      allowDrawingArrows: false,
                      allowDragging: !boardInputLocked,
                      darkSquareStyle: { backgroundColor: '#b58863' },
                      lightSquareStyle: { backgroundColor: '#f0d9b5' },
                      boardStyle: {
                        width: `${renderedBoardWidth}px`,
                        maxWidth: '100%',
                        borderRadius: 12,
                        boxShadow: '0 8px 40px rgba(0, 0, 0, 0.60), 0 2px 8px rgba(0, 0, 0, 0.40)',
                      },
                    }}
                  />
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

        <Suspense fallback={<DialogLoadingFallback label={dialogLoadingLabel} />}>
          {showNewGameDialog && (
            <NewGameDialog
              key={`${gameMode}-${playerColor}-${aiDifficulty}`}
              open
              initialMode={gameMode}
              initialPlayerColor={playerColor}
              initialDifficulty={aiDifficulty}
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
        </Suspense>

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
                    <p>{coachLineSan || 'Start analysis to get a candidate line.'}</p>
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
                          <p>{pvToSan(line.fen ?? fen, line) || line.pv.slice(0, 8).join(' ')}</p>
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
                      disabled={!engineEnabled || mainLineNodes.length <= 1}
                      title={reviewGameDisabledReason ?? undefined}
                      aria-label={reviewGameButtonLabel}
                    >
                      {isBatchReviewing ? (
                        <><IconStop /> Reviewing ({batchReviewProgress.done}/{batchReviewProgress.total})</>
                      ) : (
                        <><IconSearch /> Review Game</>
                      )}
                    </button>
                  </div>
                  <div className="review-scaffold">
                    <h3><span className="section-icon"><IconBarChart /></span> Review</h3>
                    <div className="review-filter-row" aria-label="Review side filter">
                      {REVIEW_SIDE_FILTERS.map(filter => (
                        <button
                          key={filter.id}
                          type="button"
                          className={`mode-pill ${reviewSideFilter === filter.id ? 'active' : ''}`}
                          aria-pressed={reviewSideFilter === filter.id}
                          onClick={() => setReviewSideFilter(filter.id)}
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
                        <strong>{reviewAccuracy.evaluatedMoves}/{visibleReviewRows.length}</strong>
                      </div>
                    </div>
                    {reviewAccuracy.pendingMoves > 0 && (
                      <p className="panel-copy small command-summary">
                        {reviewAccuracy.pendingMoves} move{reviewAccuracy.pendingMoves === 1 ? '' : 's'} still need deeper evaluation before accuracy is final.
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
                    {visibleReviewRows.length > 0 ? (
                      <ReviewMoveList
                        rows={visibleReviewRows}
                        nodes={mainLineNodes}
                        currentNodeId={gameTree.current.id}
                        showEngineDetail={analysisExperience === 'pro'}
                        onSelectNode={navigateReviewNode}
                      />
                    ) : (
                      <div className="empty-state review-empty-state">
                        <span className="empty-state-icon"><IconSearch /></span>
                        <p>Add moves or import a PGN, then run Review Game.</p>
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
                      First {Math.min(mainLineUciMoves.length, REVIEW_BOOK_PREFETCH_LIMIT)} plies · In book {reviewBookSummary.inBook} · Out of book {reviewBookSummary.outOfBook}
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
                      <p className="panel-copy small warning-copy">
                        Add a session-only Lichess token in Pro Opening Intel to compare the line against cloud book stats.
                      </p>
                    )}
                    {reviewBookSummary.authRequired > 0 && (
                      <button
                        type="button"
                        className="review-book-token-btn"
                        onClick={openOpeningIntel}
                      >
                        <span className="btn-icon"><IconBarChart /></span>
                        Open Opening Intel
                      </button>
                    )}
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
                    {!expertModeEnabled && (
                      <p className="panel-copy small warning-copy">
                        Heavy diagnostics are locked to keep the UI responsive.
                      </p>
                    )}
                    {openingExplorer.data && (
                      <div className="engine-lab-inline">
                        <p className="panel-copy small">
                          Book moves available: {openingExplorer.data.moves.length} · games {openingTotalGames.toLocaleString()}
                        </p>
                        <button type="button" onClick={applyBookMovesToSearch} disabled={openingTopMoves.length === 0}>
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
                        onClick={() => void runLabCommand('d')}
                      >
                        d
                      </button>
                      <button
                        type="button"
                        aria-label="Run static evaluation command"
                        disabled={status === 'analyzing'}
                        onClick={() => void runLabCommand('eval')}
                      >
                        eval
                      </button>
                      <button
                        type="button"
                        className="danger-lite"
                        disabled={!expertModeEnabled || status === 'analyzing'}
                        onClick={() => void runLabCommand('bench')}
                      >
                        bench
                      </button>
                      <button
                        type="button"
                        className="danger-lite"
                        disabled={!expertModeEnabled || status === 'analyzing'}
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

              {/* Game-over badges */}
              {game.isCheckmate() && <span className="game-over-badge">♟ Checkmate!</span>}
              {game.isStalemate() && <span className="game-over-badge draw">½ Stalemate</span>}
              {game.isDraw() && !game.isStalemate() && <span className="game-over-badge draw">½ Draw</span>}
              {game.isCheck() && !game.isGameOver() && (
                <span className="game-over-badge check"><IconAlert style={{ marginRight: '3px' }} />Check!</span>
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
        const ariaDetails = [qualityLabel, impactLabel, confidenceLabel, bestMoveHint].filter(Boolean).join(', ')

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
  const toY = (wr: number) => padTop + ((100 - wr) / 100) * innerHeight

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(p.whiteWinrate).toFixed(2)}`)
    .join(' ')

  const area = `${path} L ${toX(maxIndex).toFixed(2)} ${(height - padBottom).toFixed(2)} L ${toX(points[0]?.index ?? 0).toFixed(2)} ${(height - padBottom).toFixed(2)} Z`
  const markers = [0, 25, 50, 75, 100]
  const xTickStep = graphTickStep(maxIndex, innerWidth)
  const isNavigable = Boolean(onNavigate && maxIndex > 0)
  const selectedIndex = clampGraphIndex(currentIndex ?? maxIndex, maxIndex)
  const selectedPoint = points.find(point => point.index === selectedIndex)

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

  const maxIndex = points.length > 0 ? points[points.length - 1]!.index : 0
  const width = graphWidthForIndex(maxIndex, available)
  const height = GRAPH_HEIGHT
  const padLeft = GRAPH_PAD_LEFT
  const padRight = GRAPH_PAD_RIGHT
  const padTop = GRAPH_PAD_TOP
  const padBottom = GRAPH_PAD_BOTTOM
  const innerWidth = width - padLeft - padRight
  const innerHeight = height - padTop - padBottom
  const markers = [0, 25, 50, 75, 100]
  const xTickStep = graphTickStep(maxIndex, innerWidth)

  const toX = (idx: number) => padLeft + (maxIndex > 0 ? (idx / maxIndex) * innerWidth : 0)
  const toY = (pct: number) => padTop + ((100 - pct) / 100) * innerHeight

  const buildPath = (selector: (point: WdlPoint) => number): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.index).toFixed(2)} ${toY(selector(p)).toFixed(2)}`).join(' ')

  const whitePath = buildPath((p) => p.white)
  const drawPath = buildPath((p) => p.draw)
  const blackPath = buildPath((p) => p.black)
  const isNavigable = Boolean(onNavigate && maxIndex > 0)
  const selectedIndex = clampGraphIndex(currentIndex ?? maxIndex, maxIndex)
  const selectedPoint = points.find(point => point.index === selectedIndex)

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
