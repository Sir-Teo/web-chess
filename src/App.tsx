import { Chess, type Square } from 'chess.js'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import {
  buildWdlSeries,
  buildWinrateSeries,
  buildReviewRows,
  formatCompactWhitePovEvaluation,
  formatWhitePovEvaluation,
  pvToSan,
  scoreToCp,
  summarizeReview,
  uciToSan,
  type EvalSnapshot,
  type ReviewRow,
  type ReviewLabel,
  type WdlPoint,
  type WinratePoint,
} from './engine/analysis'
import { historicalSampleGames, type HistoricalSampleGame, type HistoricalSampleFormat } from './assets/historicalSamples'
import {
  cloudEvalToSnapshot,
  cloudLineToSideToMoveScore,
} from './engine/cloudEval'
import {
  getCachedOpeningExplorer,
  prefetchOpeningExplorer,
  type OpeningDatabaseSource,
  type OpeningExplorerMove,
  type OpeningSpeed,
} from './engine/openingExplorer'
import type { AnalyzeMode, UciGoLimits } from './engine/uci'
import { rootFenFromPgnHeaders } from './engine/pgn'
import { engineProfiles, type EngineProfileId } from './engine/profiles'
import type { TablebaseCategory, TablebaseMove, TablebaseResult } from './engine/tablebase'
import { useStockfishEngine } from './hooks/useStockfishEngine'
import { DIFFICULTY_LABELS, useAiPlayer, type AiDifficulty } from './hooks/useAiPlayer'
import { useGameTree, type GameNode } from './hooks/useGameTree'
import { useOpening } from './hooks/useOpening'
import { useCloudEvaluation } from './hooks/useCloudEvaluation'
import { useOpeningExplorer } from './hooks/useOpeningExplorer'
import { useTablebase } from './hooks/useTablebase'
import { NewGameDialog, type GameMode, type PlayerColor } from './components/NewGameDialog'
import { PgnDialog } from './components/PgnDialog'
import { WatchControls } from './components/WatchControls'
import { AI_SPEED_MS, type AiSpeed } from './components/aiSpeed'
import { WdlBar } from './components/WdlBar'
import { HorizontalWdlBar } from './components/HorizontalWdlBar'
import { MoveListTree } from './components/MoveListTree'
import { IconBot, IconBarChart, IconSearch, IconSwords, IconAlert, IconKing, IconRefresh, IconFlip, IconDownload, IconUsers, IconZap, IconSettings, IconPlay, IconStop, IconTrendingUp } from './components/icons'
import './App.css'

type Orientation = 'white' | 'black'
type WorkspaceMode = 'play' | 'analysis'
type AnalysisTab = 'analyze' | 'review' | 'engine-lab'
type AnalysisExperience = 'beginner' | 'pro'
type AnalyzePresetId = 'blunder-check' | 'game-review' | 'deep-candidate' | 'mate-hunt'
type OpeningRatingPresetId = 'all' | 'club' | 'advanced'
type SampleLibraryFilter = 'all' | HistoricalSampleFormat
type PromotionPiece = 'q' | 'r' | 'b' | 'n'
type PendingPromotion = { from: Square; to: Square }

const ANALYSIS_SETTINGS_STORAGE_KEY = 'webchess:analysis-settings:v1'
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
const IMPORT_SWEEP_MULTIPV = 1
const AUTO_ANALYZE_DEBOUNCE_MS = 140

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

const TABLEBASE_CATEGORY_LABELS: Record<TablebaseCategory, string> = {
  win: 'Win',
  unknown: 'Unknown',
  'syzygy-win': 'Win',
  'maybe-win': 'Maybe win',
  'cursed-win': 'Cursed win',
  draw: 'Draw',
  'blessed-loss': 'Blessed loss',
  'maybe-loss': 'Maybe loss',
  'syzygy-loss': 'Loss',
  loss: 'Loss',
}

type ImportSweepTarget = {
  fen: string
  rootFen: string
  historyMoves: string[]
}

type BatchReviewTarget = ImportSweepTarget & {
  nodeId: string
}

type AnalysisTarget = {
  fen: string
  rootFen: string
  pathMovesKey: string
}

function buildImportSweepTargets(
  entries: Array<{ move: { from: string; to: string; promotion?: string }; fen: string }>,
  rootFen: string,
): ImportSweepTarget[] {
  if (!entries.length) return []

  const historyMoves: string[] = []
  const targets: ImportSweepTarget[] = [{
    fen: rootFen,
    rootFen,
    historyMoves: [],
  }]

  for (const entry of entries) {
    historyMoves.push(`${entry.move.from}${entry.move.to}${entry.move.promotion ?? ''}`)
    targets.push({
      fen: entry.fen,
      rootFen,
      historyMoves: [...historyMoves],
    })
  }

  return targets
}

function buildBatchReviewTargets(
  nodes: Array<{ id: string; fen: string; uci: string }>,
  rootFen: string,
): BatchReviewTarget[] {
  if (!nodes.length) return []

  const historyMoves: string[] = []
  return nodes.map((node, index) => {
    if (index > 0 && node.uci) historyMoves.push(node.uci)
    return {
      nodeId: node.id,
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
  workspaceMode: 'analysis',
  autoAnalyze: true,
  engineProfile: 'auto',
  analysisTab: 'analyze',
  analysisExperience: 'beginner',
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
  openingSource: 'masters',
  openingSpeeds: ['blitz', 'rapid', 'classical'],
  openingRatingPreset: 'all',
  showBoardArrows: true,
  showTopMoveArrows: true,
  topMoveArrowCount: 3,
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

function formatTablebaseDistance(label: string, value: number | null | undefined): string | null {
  return typeof value === 'number' && value !== 0 ? `${label} ${Math.abs(value)}` : null
}

function tablebaseSummary(result: TablebaseResult): string {
  return [
    TABLEBASE_CATEGORY_LABELS[result.category],
    formatTablebaseDistance('DTM', result.dtm),
    formatTablebaseDistance('DTZ', result.preciseDtz ?? result.dtz),
  ].filter(Boolean).join(' · ')
}

function tablebaseMoveSummary(move: TablebaseMove): string {
  return [
    TABLEBASE_CATEGORY_LABELS[move.category],
    formatTablebaseDistance('DTM', move.dtm),
    formatTablebaseDistance('DTZ', move.preciseDtz ?? move.dtz),
  ].filter(Boolean).join(' · ')
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

// Top bar, status bar, stage padding, meta strip, its gap, and the board frame —
// everything stacked above and below the board on a rotated phone.
const LANDSCAPE_BOARD_CHROME = 176

const KEYBOARD_SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['←', '→'], action: 'Previous / next move' },
  { keys: ['Home', 'End'], action: 'First / last position' },
  { keys: ['F'], action: 'Flip the board' },
  { keys: ['Space'], action: 'Pause or resume the AI (Play mode)' },
]

const NOTATION_BASE_STYLE = {
  position: 'absolute' as const,
  fontWeight: 700,
  lineHeight: 1,
  opacity: 0.9,
  // Coordinates share the square with a piece on the outer files/ranks; the
  // shadow keeps them readable without darkening the board.
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.45)',
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

function uniqueSquares(squares: Square[]): Square[] {
  return Array.from(new Set(squares))
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(persistedSettings.workspaceMode)
  const engineEnabled = workspaceMode === 'analysis'

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
  const [analysisExperience, setAnalysisExperience] = useState<AnalysisExperience>(persistedSettings.analysisExperience)
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
  const [engineLabOutputLines, setEngineLabOutputLines] = useState<string[]>([])
  const [expertModeEnabled, setExpertModeEnabled] = useState(persistedSettings.expertModeEnabled)
  const [labCommandHistory, setLabCommandHistory] = useState<string[]>(persistedSettings.labCommandHistory)
  const [lastLabRun, setLastLabRun] = useState<{ command: string; durationMs: number } | null>(null)
  const [openingSource, setOpeningSource] = useState<OpeningDatabaseSource>(persistedSettings.openingSource)
  const [openingSpeeds, setOpeningSpeeds] = useState<OpeningSpeed[]>(persistedSettings.openingSpeeds)
  const [openingRatingPreset, setOpeningRatingPreset] = useState<OpeningRatingPresetId>(persistedSettings.openingRatingPreset)
  const [openingAuthToken, setOpeningAuthToken] = useState('')
  const [showBoardArrows, setShowBoardArrows] = useState<boolean>(persistedSettings.showBoardArrows)
  const [showTopMoveArrows, setShowTopMoveArrows] = useState<boolean>(persistedSettings.showTopMoveArrows)
  const [topMoveArrowCount, setTopMoveArrowCount] = useState<number>(persistedSettings.topMoveArrowCount)
  const [openingPrefetchTick, setOpeningPrefetchTick] = useState(0)
  const [sampleFilter, setSampleFilter] = useState<SampleLibraryFilter>('all')
  const [sampleLoadingId, setSampleLoadingId] = useState<string | null>(null)
  const [sampleLoadError, setSampleLoadError] = useState<string | null>(null)
  const [isImportingGame, setIsImportingGame] = useState(false)
  const [pendingShallowAnalyzeFen, setPendingShallowAnalyzeFen] = useState<string | null>(null)
  const [pendingPonderFen, setPendingPonderFen] = useState<string | null>(null)
  const [importSweepProgress, setImportSweepProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const skipFullAnalyzeFenRef = useRef<string | null>(null)
  const importSweepQueueRef = useRef<ImportSweepTarget[]>([])
  const activeImportSweepRef = useRef<ImportSweepTarget | null>(null)
  const activeImportSweepStartedRef = useRef(false)
  const samplePgnCacheRef = useRef<Map<string, string>>(new Map())

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

  // ── Click-to-move (tap support) ───────────────────────
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [legalTargets, setLegalTargets] = useState<Square[]>([])
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)

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

  const clearImportSweep = useCallback(() => {
    importSweepQueueRef.current = []
    activeImportSweepRef.current = null
    activeImportSweepStartedRef.current = false
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
  const openingExplorer = useOpeningExplorer({
    source: openingSource,
    fen: currentRootFen,
    moves: currentPathMoves,
    speeds: openingRequestSpeeds,
    ratings: openingRequestRatings,
    authToken: openingAuthToken,
    enabled: workspaceMode === 'analysis'
      && (analysisTab === 'analyze' || (analysisTab === 'engine-lab' && Boolean(openingAuthToken.trim()))),
  })
  const filteredSampleGames = useMemo(
    () => historicalSampleGames.filter(sample => sampleFilter === 'all' || sample.format === sampleFilter),
    [sampleFilter],
  )
  const isImportSweepActive = importSweepProgress.total > 0 && importSweepProgress.done < importSweepProgress.total
  const openingFenPath = useMemo(() => currentPathNodes.map(n => n.fen), [currentPathNodes])
  const opening = useOpening(openingFenPath, workspaceMode === 'analysis' && currentPathNodes.length > 1)
  const canGoBack = currentPathNodes.length > 1
  const canGoForward = gameTree.current.children.length > 0

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

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
  }, [goFirst, goLast, goPrev, goNext, pause, resume, workspaceMode])

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

  // ── Batch Review ─────────────────────────────────────
  const [isBatchReviewing, setIsBatchReviewing] = useState(false)
  const [batchReviewProgress, setBatchReviewProgress] = useState({ done: 0, total: 0 })
  const batchReviewQueueRef = useRef<BatchReviewTarget[]>([])
  const activeBatchReviewRef = useRef<BatchReviewTarget | null>(null)
  const {
    error: cloudEvalError,
    multiPv: cloudEvalMultiPv,
    result: currentCloudEval,
    status: cloudEvalStatus,
  } = useCloudEvaluation({
    fen,
    multiPv,
    enabled: engineEnabled && !isImportingGame && !isBatchReviewing,
  })
  const tablebase = useTablebase({
    fen,
    enabled: workspaceMode === 'analysis',
  })

  const stopBatchReview = useCallback(() => {
    batchReviewQueueRef.current = []
    activeBatchReviewRef.current = null
    setIsBatchReviewing(false)
    stop()
  }, [stop])

  const startBatchReview = useCallback(() => {
    if (!engineEnabled) return
    const nodes = gameTreeRef.current.mainLine()
    if (nodes.length <= 1) return

    const rootFen = gameTreeRef.current.root.fen
    const targets = buildBatchReviewTargets(nodes, rootFen)
    clearImportSweep()
    batchReviewQueueRef.current = targets
    activeBatchReviewRef.current = null
    setBatchReviewProgress({ done: 0, total: targets.length })
    setIsBatchReviewing(true)
    stop()
  }, [clearImportSweep, engineEnabled, stop])

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
    navigateAndPause(gameTreeRef.current.navigateTo(nextTarget.nodeId))
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
    navigateAndPause,
    searchDepth,
    showWdl,
    status,
  ])

  const aiEnabled = workspaceMode === 'play' && (gameMode === 'human-vs-ai' || gameMode === 'ai-vs-ai')
  const aiPlayer = useAiPlayer(aiEnabled)

  useEffect(() => {
    if (workspaceMode !== 'play') return
    stop()
    clearImportSweep()
    setPendingShallowAnalyzeFen(null)
    setEvaluationsByFen(new Map())
    setIsBatchReviewing(false)
    batchReviewQueueRef.current = []
    activeBatchReviewRef.current = null
    setBatchReviewProgress({ done: 0, total: 0 })
  }, [clearImportSweep, stop, workspaceMode])

  const primaryLine = lines.find(l => l.multipv === 1) ?? lines[0]
  const currentLastBestMove = lastBestMoveFen === fen ? lastBestMove : null
  const currentLastPonderMove = lastPonderMoveFen === fen ? lastPonderMove : null

  // ── Capture evaluations ──────────────────────────────
  useEffect(() => {
    if (!engineEnabled) return
    const cp = scoreToCp(primaryLine?.cp, primaryLine?.mate)
    if (typeof cp !== 'number') return
    const evaluationFen = primaryLine?.fen ?? fen
    setEvaluationsByFen(prev => {
      const cur = prev.get(evaluationFen)
      const localDepth = primaryLine?.depth
      if (
        cur?.purpose === 'cloud-eval'
        && typeof cur.depth === 'number'
        && typeof localDepth === 'number'
        && localDepth < cur.depth
      ) {
        const sameWdl = cur.wdl?.w === primaryLine?.wdl?.w
          && cur.wdl?.d === primaryLine?.wdl?.d
          && cur.wdl?.l === primaryLine?.wdl?.l
        if (!primaryLine?.wdl || sameWdl) return prev

        const next = new Map(prev)
        next.set(evaluationFen, {
          ...cur,
          wdl: primaryLine.wdl,
        })
        return next
      }
      // Check if cp and wdl are exactly the same
      const sameCp = cur?.cp === cp
      const sameMate = cur?.mate === primaryLine?.mate
      const sameWdl = cur?.wdl?.w === primaryLine?.wdl?.w
        && cur?.wdl?.d === primaryLine?.wdl?.d
        && cur?.wdl?.l === primaryLine?.wdl?.l
      const sameSearch = cur?.searchId === primaryLine?.searchId
      const sameDepth = cur?.depth === primaryLine?.depth
      const samePurpose = cur?.purpose === primaryLine?.purpose
      if (sameCp && sameMate && sameWdl && sameSearch && sameDepth && samePurpose) return prev

      const next = new Map(prev)
      next.set(evaluationFen, {
        cp,
        mate: primaryLine?.mate,
        wdl: primaryLine?.wdl,
        depth: primaryLine?.depth,
        nodes: primaryLine?.nodes,
        nps: primaryLine?.nps,
        time: primaryLine?.time,
        searchId: primaryLine?.searchId,
        mode: primaryLine?.mode,
        purpose: primaryLine?.purpose,
        searchedAt: Date.now(),
      })
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
      const currentDepth = current?.depth ?? 0
      const cloudDepth = snapshot.depth ?? 0
      if (current && current.purpose !== 'cloud-eval' && currentDepth >= cloudDepth) return previous
      if (
        current?.purpose === 'cloud-eval'
        && current.cp === snapshot.cp
        && current.mate === snapshot.mate
        && current.depth === snapshot.depth
        && current.nodes === snapshot.nodes
      ) {
        return previous
      }

      const next = new Map(previous)
      next.set(fen, snapshot)
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
        setViewport({ width: window.innerWidth, height: window.innerHeight })
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

    if (activeImportSweepRef.current && !activeImportSweepStartedRef.current && status === 'analyzing') {
      activeImportSweepStartedRef.current = true
      return
    }

    if (activeImportSweepRef.current && activeImportSweepStartedRef.current && status === 'ready') {
      activeImportSweepRef.current = null
      activeImportSweepStartedRef.current = false
      setImportSweepProgress(previous => ({
        total: previous.total,
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
    activeImportSweepStartedRef.current = false
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

  const parsedSearchMoves = useMemo(
    () =>
      searchMovesInput
        .split(/[,\s]+/g)
        .map(move => move.trim())
        .filter(Boolean),
    [searchMovesInput],
  )
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
        : '...'
  const coachBestMove = coachLine?.pv[0] ?? currentCloudEval?.pvs[0]?.moves[0] ?? currentLastBestMove ?? null
  const coachBestMoveText = bestMoveLabel(fen, coachBestMove)
  const coachDepth = coachLine?.depth ?? currentCloudEval?.depth
  const engineTelemetry = engineTelemetryLabel(coachLine)
  const coachLineSan = coachLine
    ? pvToSan(coachLine.fen ?? fen, coachLine, 6)
    : currentCloudEval?.pvs[0]
      ? pvToSan(fen, { multipv: 1, depth: currentCloudEval.depth, pv: currentCloudEval.pvs[0].moves }, 6)
      : ''
  const currentEngineBestUci = currentFenLines.find(line => line.multipv === 1)?.pv[0] ?? null
  const engineBookAgreement = currentEngineBestUci && openingTopBookMove
    ? currentEngineBestUci === openingTopBookMove.uci
    : null
  const coachMoveInsight = describeBestMove(
    fen,
    coachBestMove,
    currentFenLines,
    openingTopBookMove?.uci,
    tablebase.result?.moves[0]?.uci,
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

  const resetSavedWorkspace = useCallback(() => {
    try {
      window.localStorage.removeItem(ANALYSIS_SETTINGS_STORAGE_KEY)
    } catch {
      // Ignore localStorage failures (private mode / quota).
    }

    setWorkspaceMode(DEFAULT_PERSISTED_SETTINGS.workspaceMode)
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
    setShowBoardArrows(DEFAULT_PERSISTED_SETTINGS.showBoardArrows)
    setShowTopMoveArrows(DEFAULT_PERSISTED_SETTINGS.showTopMoveArrows)
    setTopMoveArrowCount(DEFAULT_PERSISTED_SETTINGS.topMoveArrowCount)
    setOpeningPrefetchTick(0)
    setEngineLabError(null)
    setEngineLabOutputLines([])
    setPendingPromotion(null)
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
    if (!engineEnabled) return
    clearImportSweep()
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
    clearImportSweep,
  ])

  // The mode groups scroll horizontally on narrow screens; keep whichever pill is
  // active in view so the current mode is never parked off-screen.
  const modeScrollerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const scroller = modeScrollerRef.current
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return
    const active = scroller.querySelector('.gc-pill-active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [gameMode, workspaceMode])

  const handleWorkspaceModeChange = useCallback((mode: WorkspaceMode) => {
    if (mode === 'analysis') pause()
    setWorkspaceMode(mode)
  }, [pause])

  const handleAnalysisTabChange = useCallback((tab: AnalysisTab) => {
    pause()
    setAnalysisTab(tab)
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
      if (!expertModeEnabled && isHeavyCommand(trimmed)) {
        setEngineLabError('Enable expert mode before running heavy commands (bench/perft/go infinite).')
        return
      }

      setLabCommandHistory(previous => [trimmed, ...previous.filter(item => item !== trimmed)].slice(0, 20))
      const startTime = performance.now()
      const outputLines = [`> ${trimmed}`]
      setEngineLabOutputLines(outputLines)
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
  }, [])

  const copyLabConsole = useCallback(async () => {
    try {
      if (!engineLabOutputLines.length) return
      await navigator.clipboard.writeText(engineLabOutputLines.join('\n'))
      setEngineLabError(null)
    } catch (error) {
      setEngineLabError(error instanceof Error ? error.message : 'Failed to copy console output.')
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
    searchMovesInput,
    showAdvancedAnalyze,
    showWdl,
    useClockLimits,
    whiteIncMs,
    whiteTimeMs,
  ])

  // ── Derived move data ─────────────────────────────────
  const mainLineNodes = useMemo(() => gameTree.mainLine(), [gameTree])
  const mainLineMoves = useMemo(() => mainLineNodes.slice(1).map(n => n.move!).filter(Boolean), [mainLineNodes])
  const mainLineUciMoves = useMemo(() => mainLineNodes.slice(1).map(node => node.uci).filter(Boolean), [mainLineNodes])

  const reviewRows = useMemo(
    () => buildReviewRows(mainLineMoves, evaluationsByFen, currentRootFen),
    [currentRootFen, evaluationsByFen, mainLineMoves],
  )
  const reviewSummary = useMemo(() => summarizeReview(reviewRows), [reviewRows])
  const criticalReviewRows = useMemo(
    () => reviewRows
      .filter(row => row.quality === 'inaccuracy' || row.quality === 'mistake' || row.quality === 'blunder')
      .filter(row => typeof row.deltaCp === 'number')
      .sort((a, b) => (a.deltaCp ?? 0) - (b.deltaCp ?? 0))
      .slice(0, 5),
    [reviewRows],
  )

  useEffect(() => {
    if (workspaceMode !== 'analysis') return
    if (analysisTab !== 'review') return
    if (!mainLineUciMoves.length) return

    let cancelled = false
    const maxPlyToPrefetch = Math.min(mainLineUciMoves.length, 30)

    const run = async () => {
      for (let idx = 0; idx < maxPlyToPrefetch; idx += 1) {
        if (cancelled) return
        await prefetchOpeningExplorer({
          source: openingSource,
          fen: currentRootFen,
          moves: mainLineUciMoves.slice(0, idx),
          speeds: openingSource === 'lichess' ? openingSpeeds : undefined,
          ratings: openingSource === 'lichess' ? openingRatings : undefined,
          authToken: openingAuthToken,
        })
        if (cancelled) return
        setOpeningPrefetchTick(tick => tick + 1)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [analysisTab, currentRootFen, mainLineUciMoves, openingAuthToken, openingRatings, openingSource, openingSpeeds, workspaceMode])

  const reviewBookRows = useMemo(() => {
    void openingPrefetchTick
    return mainLineUciMoves.map((uci, index) => {
      const beforeMoves = mainLineUciMoves.slice(0, index)
      const fromCache = getCachedOpeningExplorer({
        source: openingSource,
        fen: currentRootFen,
        moves: beforeMoves,
        speeds: openingSource === 'lichess' ? openingSpeeds : undefined,
        ratings: openingSource === 'lichess' ? openingRatings : undefined,
      })
      const san = mainLineNodes[index + 1]?.san ?? uci

      if (!fromCache) {
        return {
          ply: index + 1,
          san,
          uci,
          status: openingAuthToken.trim() ? 'loading' as const : 'auth-required' as const,
        }
      }

      const totalGames = fromCache.white + fromCache.draws + fromCache.black
      if (!totalGames) {
        return {
          ply: index + 1,
          san,
          uci,
          status: 'unknown' as const,
        }
      }

      const move = fromCache.moves.find(item => item.uci === uci)
      if (!move) {
        return {
          ply: index + 1,
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
    openingAuthToken,
    openingPrefetchTick,
    openingRatings,
    openingSource,
    openingSpeeds,
  ])

  const reviewBookSummary = useMemo(() => {
    const inBook = reviewBookRows.filter(row => row.status === 'in-book').length
    const outOfBook = reviewBookRows.filter(row => row.status === 'out-of-book').length
    const loading = reviewBookRows.filter(row => row.status === 'loading').length
    const authRequired = reviewBookRows.filter(row => row.status === 'auth-required').length
    const firstOutOfBook = reviewBookRows.find(row => row.status === 'out-of-book') ?? null
    return { inBook, outOfBook, loading, authRequired, firstOutOfBook }
  }, [reviewBookRows])

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
      return buildWinrateSeries(moves, evaluationsByFen, currentRootFen)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRootFen, evaluationsByFen, currentLineNodes.length, currentLineNodes[currentLineNodes.length - 1]?.id],
  )

  const wdlPoints = useMemo(
    () => {
      const moves = currentLineNodes.slice(1).map(n => n.move!).filter(Boolean)
      return buildWdlSeries(moves, evaluationsByFen, currentRootFen)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentRootFen, evaluationsByFen, currentLineNodes.length, currentLineNodes[currentLineNodes.length - 1]?.id],
  )

  // ── Move quality → annotate tree nodes ───────────────
  useEffect(() => {
    const qualityUpdates = reviewRows.flatMap((row, idx) => {
      const node = mainLineNodes[idx + 1]
      if (!node || row.quality === 'pending') return []
      return [{ id: node.id, quality: row.quality }]
    })
    gameTree.setNodeQualities(qualityUpdates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewRows])

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

    const stepModeMove = aiSpeedRef.current === 'step'
    const delayMs = AI_SPEED_MS[aiSpeedRef.current]

    const doMove = () => {
      aiPlayer.requestMove(fen, aiDifficulty).then(uciMove => {
        aiMoveScheduledRef.current = false
        setIsAiThinking(false)

        if (uciMove && !game.isGameOver() && !pausedRef.current) {
          const from = uciMove.slice(0, 2) as Square
          const to = uciMove.slice(2, 4) as Square
          const promo = uciMove[4] as 'q' | 'r' | 'b' | 'n' | undefined

          const move = game.move({ from, to, promotion: promo })
          if (move) {
            const newFen = game.fen()
            setFen(newFen)
            gameTreeRef.current.addMove(move, newFen)
          }
        }

        if (stepModeMove && aiSpeedRef.current === 'step') {
          pausedRef.current = true
          setPaused(true)
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
  const clearBoardSelection = useCallback(() => {
    setSelectedSquare(null)
    setLegalTargets([])
  }, [])

  const applyHumanMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      const move = game.move({ from, to, promotion })
      if (!move) return false

      clearImportSweep()
      const newFen = game.fen()
      setFen(newFen)
      gameTree.addMove(move, newFen)
      clearBoardSelection()
      setPendingPromotion(null)
      return true
    },
    [clearBoardSelection, clearImportSweep, game, gameTree],
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
    if (gameMode === 'human-vs-ai' && isAiThinking) return false
    if (gameMode === 'human-vs-ai' && !paused && game.turn() !== playerColor[0]) return false

    if (pieceType.toLowerCase().endsWith('p') && isPromotionMove(game, sourceSquare, targetSquare)) {
      beginPromotion(sourceSquare, targetSquare)
      return false
    }

    return applyHumanMove(sourceSquare, targetSquare)
  }

  const onSquareClick = useCallback((square: Square) => {
    if (pendingPromotion) return
    if (gameMode === 'human-vs-ai' && isAiThinking) return
    if (gameMode === 'human-vs-ai' && !paused && game.turn() !== playerColor[0]) return

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
  ])

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

  // The global key handler is declared above these callbacks, so it reaches them
  // through refs rather than re-binding the listener on every promotion.
  const pendingPromotionRef = useRef<PendingPromotion | null>(null)
  const completePromotionRef = useRef(completePromotion)
  const cancelPromotionRef = useRef(cancelPromotion)
  useEffect(() => {
    pendingPromotionRef.current = pendingPromotion
    completePromotionRef.current = completePromotion
    cancelPromotionRef.current = cancelPromotion
  })

  // Move focus into the chooser so keyboard users are not left on <body> behind
  // a modal, and so Tab cycles the four pieces.
  const promotionChooserRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!pendingPromotion) return
    promotionChooserRef.current?.querySelector('button')?.focus()
  }, [pendingPromotion])

  // ── New game ──────────────────────────────────────────
  const openNewGameDialog = () => setShowNewGameDialog(true)
  const openPgnDialog = () => setShowPgnDialog(true)

  const handlePgnImport = useCallback((pgnText: string) => {
    try {
      setIsImportingGame(true)
      clearImportSweep()
      const loader = new Chess()
      loader.loadPgn(pgnText)
      const rootFen = rootFenFromPgnHeaders(loader.getHeaders())
      newGame()
      game.load(rootFen)
      setFen(game.fen())
      setEvaluationsByFen(new Map())
      setPendingShallowAnalyzeFen(null)
      setSampleLoadError(null)
      setPendingPromotion(null)

      const moves = loader.history({ verbose: true })
      const mainLineEntries: Array<{ move: (typeof moves)[number]; fen: string }> = []
      for (const m of moves) {
        game.move(m)
        const nextFen = game.fen()
        mainLineEntries.push({ move: m, fen: nextFen })
      }
      gameTree.loadMainLine(mainLineEntries, rootFen)

      const finalFen = game.fen()
      setFen(finalFen)
      if (engineEnabled) {
        setPendingShallowAnalyzeFen(finalFen)
        const allSweepTargets = buildImportSweepTargets(mainLineEntries, rootFen)
        const sweepTargets = allSweepTargets.slice(0, -1)
        importSweepQueueRef.current = sweepTargets
        setImportSweepProgress({ done: 0, total: sweepTargets.length })
      } else {
        setPendingShallowAnalyzeFen(null)
        clearImportSweep()
      }

      setPaused(true)
      pausedRef.current = true
      setIsAiThinking(false)
      aiMoveScheduledRef.current = false
      setIsImportingGame(false)
      return { ok: true }
    } catch {
      setIsImportingGame(false)
      return { ok: false, error: 'Failed to parse PGN. Check the move text, headers, and move numbers.' }
    }
  }, [clearImportSweep, engineEnabled, game, gameTree, newGame])

  const handleFenLoad = useCallback((fenText: string) => {
    try {
      const loaded = new Chess(fenText.trim())
      const rootFen = loaded.fen()

      newGame()
      game.load(rootFen)
      setFen(rootFen)
      gameTree.reset(rootFen)
      setEvaluationsByFen(new Map())
      clearImportSweep()
      setPendingShallowAnalyzeFen(engineEnabled ? rootFen : null)
      setSampleLoadError(null)
      setPendingPromotion(null)
      setSelectedSquare(null)
      setLegalTargets([])
      setIsImportingGame(false)
      setIsBatchReviewing(false)
      pausedRef.current = true
      setPaused(true)
      setIsAiThinking(false)
      aiMoveScheduledRef.current = false
      return { ok: true }
    } catch {
      return { ok: false, error: 'Failed to parse FEN. Check piece placement, side to move, castling rights, and counters.' }
    }
  }, [clearImportSweep, engineEnabled, game, gameTree, newGame])

  const fetchSamplePgn = useCallback(async (sample: HistoricalSampleGame): Promise<string> => {
    const cached = samplePgnCacheRef.current.get(sample.id)
    if (cached) return cached

    const response = await fetch(`https://lichess.org/game/export/${sample.lichessGameId}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch sample PGN (${response.status}).`)
    }

    const pgnText = await response.text()
    samplePgnCacheRef.current.set(sample.id, pgnText)
    return pgnText
  }, [])

  const loadHistoricalSample = useCallback(
    async (sample: HistoricalSampleGame) => {
      setSampleLoadingId(sample.id)
      setSampleLoadError(null)
      try {
        const pgnText = await fetchSamplePgn(sample)
        handlePgnImport(pgnText)
        if (workspaceMode === 'analysis') setAnalysisTab('analyze')
      } catch (error) {
        setSampleLoadError(error instanceof Error ? error.message : 'Failed to load sample game.')
      } finally {
        setSampleLoadingId(null)
      }
    },
    [fetchSamplePgn, handlePgnImport, workspaceMode],
  )

  const handleNewGameStart = useCallback(
    ({ mode, playerColor: color, difficulty }: { mode: GameMode; playerColor: PlayerColor; difficulty: AiDifficulty }) => {
      setShowNewGameDialog(false)
      setWorkspaceMode('play')
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
      clearImportSweep()
      setPendingShallowAnalyzeFen(null)
      setIsImportingGame(false)
      setPendingPromotion(null)
      pausedRef.current = false
      setPaused(false)
      gameTree.reset()

      setOrientation(mode === 'human-vs-ai' ? color : 'white')
    },
    [aiPlayer, clearImportSweep, game, gameTree, newGame],
  )

  // ── Mode switch mid-game ──────────────────────────────
  const handleModeChange = useCallback((mode: GameMode) => {
    setGameMode(mode)
    if (workspaceMode !== 'play') setWorkspaceMode('play')
    aiMoveScheduledRef.current = false
    if (pausedRef.current) {
      pausedRef.current = false
      setPaused(false)
    }
    setFen(f => f)
  }, [workspaceMode])

  const navigateMoveListAndPause = useCallback((chess: Chess) => {
    navigateAndPause(chess)
  }, [navigateAndPause])

  const navigateMoveListAndPonder = useCallback((chess: Chess) => {
    navigateAndPonder(chess)
  }, [navigateAndPonder])

  const navigateReviewNode = useCallback((node: GameNode) => {
    navigateAndPonder(gameTreeRef.current.navigateTo(node.id))
  }, [navigateAndPonder])

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
    setFen(f => f) // nudge loop
  }, [game, gameMode, playerColor])

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
  // A rotated phone has width to spare and almost no height, so the stacked
  // layout would push half the board below the fold. It gets a side-by-side
  // layout instead, with the board sized off the height it actually has.
  const isLandscapePhone = isMobile && viewport.height <= 520

  // Space reserved beside the board for the in-flow evaluation column (--eval-col-w + gap)
  const evalColumnWidth = engineEnabled && showWdl ? 34 : 0
  const boardWidth = isMobile
    ? (isLandscapePhone
      ? Math.min(viewport.height - LANDSCAPE_BOARD_CHROME, Math.round(viewport.width * 0.55) - evalColumnWidth)
      // Portrait: board takes ~46% of the height so the panels stay visible below.
      : Math.min(viewport.width - 32 - evalColumnWidth, Math.round(viewport.height * 0.46)))
    : Math.min(
      viewport.width - leftWidth - rightWidth - 48 - evalColumnWidth,
      viewport.height - (bottomPanelOpen ? 140 : 80) - (topPanelOpen ? 80 : 40),
      800,
    )
  const minBoardWidth = isLandscapePhone ? 180 : 260
  // The status strip should name whatever is actually running. In Play mode the
  // analysis engine is idle by design, and while an AI game is on it is the
  // opponent — a separate worker — doing the work.
  const showsAiOpponent = workspaceMode === 'play' && aiEnabled
  const engineStatusLabel = showsAiOpponent
    ? (aiPlayer.status === 'thinking' ? 'thinking' : aiPlayer.status)
    : (status === 'disabled' ? 'engine off' : status)
  const engineStatusTone = showsAiOpponent ? aiPlayer.status : status
  const engineSourceLabel = showsAiOpponent
    ? `AI · ${DIFFICULTY_LABELS[aiDifficulty]}`
    : activeProfile.name
  // In Play mode the engine is off, so an empty winrate/WDL card can never fill —
  // it is 250px of permanent blank. They stay whenever there is data to plot.
  const showEvaluationGraphs = engineEnabled || winratePoints.length > 0 || wdlPoints.length > 0
  const notationFontSize = `${Math.round(Math.max(10, Math.min(13, boardWidth / 32)))}px`
  const turnLabel = game.turn() === 'w' ? 'White to move' : 'Black to move'
  const moveNumberLabel = `Move ${fen.split(/\s+/)[5] ?? '1'}`
  const gameModeLabel = gameMode === 'human-vs-human'
    ? 'Human vs Human'
    : gameMode === 'human-vs-ai'
      ? 'Human vs AI'
      : 'AI vs AI'

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
            <div className="mobile-actions">
              <button type="button" onClick={openNewGameDialog} aria-label="Start new game" title="New game">
                <span className="btn-icon"><IconRefresh /></span> <span className="btn-label">New game</span>
              </button>
              <button type="button" onClick={flipBoard} aria-label="Flip board" title="Flip board (F)">
                <span className="btn-icon"><IconFlip /></span> <span className="btn-label">Flip</span>
              </button>
              <button type="button" onClick={openPgnDialog} aria-label="Open PGN and FEN dialog" title="PGN and FEN">
                <span className="btn-icon"><IconDownload /></span> <span className="btn-label">PGN</span>
              </button>
            </div>

            {/* Workspace & Game Mode wrappers */}
            <span className="toolbar-divider desktop-only" />
            <div className="mobile-modes-wrapper" ref={modeScrollerRef}>
              <div className="top-mode-pills top-workspaces" aria-label="Workspace mode">
                {([
                  { id: 'play', label: 'Play', icon: <IconSwords /> },
                  { id: 'analysis', label: 'Analysis', icon: <IconSearch /> },
                ] as const).map(({ id, label, icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`gc-pill ${workspaceMode === id ? 'gc-pill-active' : ''}`}
                    onClick={() => handleWorkspaceModeChange(id)}
                    aria-pressed={workspaceMode === id}
                  >
                    <span className="gc-pill-icon">{icon}</span>
                    <span className="gc-pill-label">{label}</span>
                  </button>
                ))}
              </div>

              {/* Game mode switcher — a Play-workspace control: picking a mode
                  forces the workspace back to Play, so it stays out of Analysis. */}
              {workspaceMode === 'play' && (
                <>
                  <span className="toolbar-divider desktop-only" />
                  <div className="top-mode-pills top-game-modes" aria-label="Game mode">
                    {([
                      { id: 'human-vs-human', label: 'H vs H', title: 'Human vs Human', icon: <IconUsers /> },
                      { id: 'human-vs-ai', label: 'H vs AI', title: 'Human vs AI', icon: <IconBot /> },
                      { id: 'ai-vs-ai', label: 'AI vs AI', title: 'AI vs AI', icon: <IconZap /> },
                    ] as const).map(({ id, label, title, icon }) => (
                      <button
                        key={id}
                        type="button"
                        className={`gc-pill ${gameMode === id ? 'gc-pill-active' : ''}`}
                        onClick={() => id !== gameMode && handleModeChange(id)}
                        title={title}
                        aria-label={title}
                        aria-pressed={gameMode === id}
                      >
                        <span className="gc-pill-icon">{icon}</span>
                        <span className="gc-pill-label">{label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <span className="toolbar-divider desktop-only" />

            <details className="settings-menu">
              <summary aria-label="Settings" title="Settings">
                <span className="btn-icon"><IconSettings /></span>
                <span className="btn-label">Settings</span>
              </summary>
              <div className="settings-backdrop" onClick={(e) => {
                const details = e.currentTarget.closest('details');
                if (details) details.removeAttribute('open');
              }}></div>
              <div className="settings-body">
                <div className="settings-header">
                  <h2>Settings</h2>
                  <button type="button" className="settings-close-btn" onClick={(e) => {
                    const details = e.currentTarget.closest('details');
                    if (details) details.removeAttribute('open');
                  }}>
                    Done
                  </button>
                </div>
                <p className="panel-copy small command-summary">
                  Workspace: <strong>{workspaceMode === 'play' ? 'Play mode' : 'Analysis mode'}</strong>
                </p>
                {engineEnabled && (
                  <p className="panel-copy small command-summary">
                    Engine: <strong>{activeProfile.name}</strong> · {profileMessage}
                  </p>
                )}
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
                        <input
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={multiPv}
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
                          <EngineOptionControl
                            key={option.name}
                            option={option}
                            disabled={status === 'analyzing'}
                            onSetOption={setOption}
                          />
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
                )}
                <details className="advanced-settings">
                  <summary>Keyboard shortcuts</summary>
                  <dl className="shortcut-list">
                    {KEYBOARD_SHORTCUTS.map(({ keys, action }) => (
                      <div key={action}>
                        <dt>{keys.map(key => <kbd key={key}>{key}</kbd>)}</dt>
                        <dd>{action}</dd>
                      </div>
                    ))}
                  </dl>
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

      <div className="main-container">
        {/* ── Left panel (winrate graph) ── */}
        <section className={`panel left ${leftWidth === 0 ? 'collapsed' : ''}`} style={{ width: leftWidth }}>
          <div className="resize-handle resize-handle-right" onMouseDown={startLeftResize}
            onClick={() => { if (leftWidth === 0) setLeftWidth(DEFAULT_LEFT) }}
            title="Drag to resize · click to expand">
            <span className="resize-pill" />
          </div>
          <div className="panel-inner" style={{ opacity: (!isMobile && leftWidth === 0) ? 0 : 1 }}>
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
                  {wdlPoints.length > 0 && <strong>{wdlPoints.length} plies</strong>}
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
                <div className="sample-filter-row">
                  {([
                    { id: 'all', label: 'All' },
                    { id: 'classical', label: 'Classical' },
                    { id: 'rapid-blitz', label: 'Rapid/Blitz' },
                  ] as const).map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`mode-pill ${sampleFilter === filter.id ? 'active' : ''}`}
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
                        <p className="panel-copy small">
                          {sample.format === 'classical' ? 'Classical' : 'Rapid/Blitz'} · {resultLabel(sample.result)}
                        </p>
                        <div className="sample-game-actions">
                          <button
                            type="button"
                            onClick={() => void loadHistoricalSample(sample)}
                            disabled={isLoading}
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
        <section className="board-stage" aria-label="Chessboard">
          <div className="board-layout">
            <div className="board-meta-strip" aria-label="Current game state">
              <span className={`turn-pill ${game.turn() === 'w' ? 'white' : 'black'}`}>{turnLabel}</span>
              <span className="board-meta-move">{moveNumberLabel}</span>
              {/* The opening shares this slot rather than claiming a row of its
                  own: a row that appears and disappears mid-game resized the
                  board under the player. Engine status and game mode both
                  already read from the panels, so the opening wins the slot. */}
              {opening
                ? (
                  <span className="board-meta-opening" title={`${opening.eco} · ${opening.name}`}>
                    <strong>{opening.eco}</strong>
                    <span>{opening.name}</span>
                  </span>
                )
                : <span>{workspaceMode === 'analysis' ? status : gameModeLabel}</span>}
            </div>
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
              <div className="board-area">
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
                          ? 'radial-gradient(circle, transparent 62%, rgba(255,110,0,0.55) 62%)'
                          : 'radial-gradient(circle, rgba(0,0,0,0.32) 26%, transparent 27%)',
                        borderRadius: '50%',
                      }])),
                    },
                    arrows,
                    arrowOptions: BOARD_ARROW_OPTIONS,
                    allowDrawingArrows: false,
                    allowDragging: !isAiThinking && !(gameMode === 'human-vs-ai' && !paused && game.turn() !== playerColor[0]),
                    darkSquareStyle: { backgroundColor: '#b58863' },
                    lightSquareStyle: { backgroundColor: '#f0d9b5' },
                    darkSquareNotationStyle: notationStyle('#f0d9b5'),
                    lightSquareNotationStyle: notationStyle('#b58863'),
                    alphaNotationStyle: { ...NOTATION_BASE_STYLE, bottom: 2, right: 3, fontSize: notationFontSize },
                    numericNotationStyle: { ...NOTATION_BASE_STYLE, top: 2, left: 3, fontSize: notationFontSize },
                    boardStyle: {
                      width: `${Math.max(minBoardWidth, boardWidth)}px`,
                      maxWidth: '100%',
                      borderRadius: 12,
                      boxShadow: '0 8px 40px rgba(0, 0, 0, 0.60), 0 2px 8px rgba(0, 0, 0, 0.40)',
                    },
                  }}
                />
                {pendingPromotion && (
                  <div className="promotion-overlay" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
                    <div className="promotion-chooser" ref={promotionChooserRef}>
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

        {/* ── New Game Dialog ── */}
        <NewGameDialog
          key={showNewGameDialog ? `${gameMode}-${playerColor}-${aiDifficulty}` : 'closed'}
          open={showNewGameDialog}
          initialMode={gameMode}
          initialPlayerColor={playerColor}
          initialDifficulty={aiDifficulty}
          onStart={handleNewGameStart}
          onCancel={() => setShowNewGameDialog(false)}
        />

        <PgnDialog
          open={showPgnDialog}
          onClose={() => setShowPgnDialog(false)}
          onImport={handlePgnImport}
          onLoadFen={handleFenLoad}
          mainLineNodes={mainLineNodes}
          evaluations={evaluationsByFen}
        />

        {/* ── Right panel ── */}
        <aside className={`panel right ${rightWidth === 0 ? 'collapsed' : ''}`} style={{ width: rightWidth }}>
          <div className="resize-handle resize-handle-left" onMouseDown={startRightResize}
            onClick={() => { if (rightWidth === 0) setRightWidth(DEFAULT_RIGHT) }}
            title="Drag to resize · click to expand">
            <span className="resize-pill" />
          </div>
          <div className="panel-inner" style={{ opacity: (!isMobile && rightWidth === 0) ? 0 : 1 }}>
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
                      onClick={() => handleAnalysisTabChange(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              {workspaceMode === 'analysis' && (
                <div className="analysis-context-row">
                  <span>{engineName}</span>
                  <strong className={`status ${status}`}>{status}</strong>
                </div>
              )}
            </header>
            <div className="panel-content">
              {workspaceMode === 'play' && (
                <>
                  <div className="engine-lab-card">
                    <h3><span className="section-icon"><IconSwords /></span> Play Focus</h3>
                    <p className="panel-copy small">
                      Engine is off in Play mode. Switch to Analysis above for evaluation and engine lines.
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
                    />
                  </div>
                </>
              )}

              {workspaceMode === 'analysis' && analysisTab === 'analyze' && (
                <>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className={`btn-primary analyze-toggle ${status === 'analyzing' ? 'analyzing' : ''}`}
                      onClick={status === 'analyzing' ? stop : runAnalyze}
                    >
                      {status === 'analyzing'
                        ? <><IconStop /> Stop analysis</>
                        : <><IconPlay /> Analyze</>}
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
                        <span>Depth</span>
                        <strong>{coachDepth ? `D${coachDepth}` : status}</strong>
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
                  {tablebase.eligible && (
                    <div className="tablebase-card">
                      <h3><span className="section-icon"><IconKing /></span> Endgame Tablebase</h3>
                      <p className="panel-copy small command-summary">
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
                              className="tablebase-move-row"
                              title={move.uci}
                              onClick={() => {
                                setShowAdvancedAnalyze(true)
                                setActivePreset(null)
                                setSearchMovesInput(move.uci)
                              }}
                            >
                              <strong>{move.san}</strong>
                              <span>{tablebaseMoveSummary(move)}</span>
                              <span>{move.uci}</span>
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
                      <p className="panel-copy small command-summary">
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
                  <div className="opening-intel-card">
                    <div className="opening-intel-head">
                      <h3><span className="section-icon"><IconBarChart /></span> Opening Intel</h3>
                      <div className="opening-source-toggle">
                        {OPENING_SOURCES.map(source => (
                          <button
                            key={source}
                            type="button"
                            className={`mode-pill ${openingSource === source ? 'active' : ''}`}
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
                        onChange={event => setOpeningAuthToken(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Session-only API token"
                      />
                    </label>
                    {openingSource === 'lichess' && (
                      <>
                        <div className="opening-speed-toggle">
                          {OPENING_SPEEDS.map(speed => (
                            <button
                              key={speed}
                              type="button"
                              className={`mode-pill ${openingSpeeds.includes(speed) ? 'active' : ''}`}
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
                        Add a session-only Lichess token to load Masters or Lichess book stats. Local ECO names stay available offline.
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
                            Use Top Book Moves As `searchmoves`
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  )}
                  <div className="pv-list">
                    <h3><span className="section-icon"><IconSearch /></span> Lines</h3>
                    {lines.length === 0 && !activeGoCommand && !currentLastBestMove && (
                      <div className="empty-state">
                        <span className="empty-state-icon"><IconSearch /></span>
                        <p>Start analysis to see principal variation lines here.</p>
                      </div>
                    )}
                    {lines
                      .filter(l => !l.fen || l.fen === fen)
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
                      title={!engineEnabled ? 'Enable Stockfish to review the game' : undefined}
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
                    <div className="review-chips">
                      <span className="chip-best">Best {reviewSummary.best}</span>
                      <span className="chip-good">Good {reviewSummary.good}</span>
                      <span className="chip-inaccuracy">Inaccuracy {reviewSummary.inaccuracy}</span>
                      <span className="chip-mistake">Mistake {reviewSummary.mistake}</span>
                      <span className="chip-blunder">Blunder {reviewSummary.blunder}</span>
                      <span className="chip-pending">Pending {reviewSummary.pending}</span>
                    </div>
                    {reviewRows.length > 0 && (
                      <ReviewMoveList
                        rows={reviewRows}
                        nodes={mainLineNodes}
                        currentNodeId={gameTree.current.id}
                        showUci={analysisExperience === 'pro'}
                        onSelectNode={navigateReviewNode}
                      />
                    )}
                  </div>
                  <div className="critical-moments-card">
                    <h3><span className="section-icon"><IconAlert /></span> Critical Moments</h3>
                    {criticalReviewRows.length > 0 ? (
                      <div className="critical-moment-list">
                        {criticalReviewRows.map(row => {
                          const node = mainLineNodes[row.ply]
                          const movePrefix = row.sideToMove === 'w' ? `${row.moveNumber}.` : `${row.moveNumber}...`
                          return (
                            <button
                              key={`${row.ply}-${row.uci}`}
                              type="button"
                              className={`critical-moment-row quality-${row.quality}`}
                              disabled={!node}
                              onClick={() => {
                                if (!node) return
                                navigateAndPonder(gameTree.navigateTo(node.id))
                              }}
                            >
                              <span className="critical-moment-move">
                                <strong>{movePrefix} {row.san}</strong>
                                <span>{REVIEW_LABELS[row.quality]}</span>
                              </span>
                              <span className="critical-moment-impact">
                                {reviewImpactLabel(row.deltaCp)}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="panel-copy small">
                        Run Review Game after a line is analyzed to surface the biggest turning points.
                      </p>
                    )}
                  </div>
                  <div className="opening-intel-card review-book-card">
                    <h3><span className="section-icon"><IconSearch /></span> Book vs Engine</h3>
                    <p className="panel-copy small command-summary">
                      In book {reviewBookSummary.inBook} · Out of book {reviewBookSummary.outOfBook}
                      {reviewBookSummary.loading > 0 ? ` · checking ${reviewBookSummary.loading}` : ''}
                      {reviewBookSummary.authRequired > 0 ? ' · token needed' : ''}
                    </p>
                    {reviewBookSummary.firstOutOfBook && (
                      <p className="panel-copy small">
                        First novelty: ply {reviewBookSummary.firstOutOfBook.ply} ({reviewBookSummary.firstOutOfBook.san})
                      </p>
                    )}
                    {reviewBookSummary.authRequired > 0 && (
                      <p className="panel-copy small warning-copy">
                        Add a session-only Lichess token in Analyze to compare the line against cloud book stats.
                      </p>
                    )}
                    <div className="review-book-list">
                      {reviewBookRows.slice(0, 14).map(row => (
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
                      Loaded: <strong>{activeProfile.name}</strong> · {profileMessage}
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
                        value={engineLabCommand}
                        onChange={e => setEngineLabCommand(e.target.value)}
                        placeholder="go depth 16"
                      />
                      <button type="submit">Send</button>
                      <button type="button" onClick={() => void copyLabConsole()}>Copy</button>
                      <button type="button" onClick={clearLabConsole}>Clear</button>
                    </form>
                    {lastLabRun && (
                      <p className="panel-copy small command-summary">
                        Last run: <strong>{lastLabRun.command}</strong> ({lastLabRun.durationMs} ms)
                      </p>
                    )}
                    <div className="inline-actions diagnostics-actions">
                      <button type="button" disabled={status === 'analyzing'} onClick={() => void runLabCommand('d')}>d</button>
                      <button type="button" disabled={status === 'analyzing'} onClick={() => void runLabCommand('eval')}>eval</button>
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
                    <pre className="engine-lab-output">
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
              <span className="bottom-engine-info" title={`${engineName} · ${profileMessage}`}>
                {engineSourceLabel} · <strong className={`status ${engineStatusTone}`}>{engineStatusLabel}</strong>
              </span>
              {activeGoCommand && (
                <span className="engine-command-inline">{activeGoCommand}</span>
              )}
              {engineTelemetry && (
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
  showUci: boolean
  onSelectNode: (node: GameNode) => void
}

const ReviewMoveList = memo(function ReviewMoveList({ rows, nodes, currentNodeId, showUci, onSelectNode }: ReviewMoveListProps) {
  return (
    <ol className="moves-list review-move-list">
      {rows.map(row => {
        const node = nodes[row.ply]
        const movePrefix = row.sideToMove === 'w' ? `${row.moveNumber}.` : `${row.moveNumber}...`
        const isCurrentReviewMove = node?.id === currentNodeId

        return (
          <li key={`${row.ply}-${row.uci}`} className={`quality-${row.quality}`}>
            <button
              type="button"
              className={`review-move-row ${showUci ? '' : 'compact'} ${isCurrentReviewMove ? 'active' : ''}`}
              disabled={!node}
              aria-current={isCurrentReviewMove ? 'true' : undefined}
              aria-label={`Go to ${movePrefix} ${row.san}`}
              onClick={() => {
                if (node) onSelectNode(node)
              }}
            >
              <span className="move-index">{movePrefix}</span>
              <strong>{row.san}</strong>
              {showUci && <span className="move-uci">{row.uci}</span>}
              <span className="move-impact">{reviewImpactLabel(row.deltaCp)}</span>
              <span className={`move-confidence confidence-${row.confidence}`}>
                {reviewConfidenceLabel(row.confidence, row.evalDepth)}
              </span>
              <span className="move-quality">{REVIEW_LABELS[row.quality]}</span>
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
    type: 'check' | 'spin' | 'string' | 'button'
    defaultValue?: string
    min?: number
    max?: number
  }
  onSetOption: (name: string, value?: string | number | boolean) => void
  disabled?: boolean
}

function EngineOptionControl({ option, onSetOption, disabled = false }: EngineOptionControlProps) {
  const [value, setValue] = useState(option.defaultValue ?? '')

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
        <input type="checkbox" checked={checked} disabled={disabled}
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
        <input type="number" min={option.min} max={option.max} value={value} disabled={disabled}
          onChange={e => setValue(e.target.value)}
          onBlur={() => onSetOption(option.name, Number(value))} />
      </label>
    )
  }

  return (
    <label className="engine-option-row">
      <span>{option.name}</span>
      <input type="text" value={value} disabled={disabled}
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

const WinrateGraph = memo(function WinrateGraph({ points, currentIndex, onNavigate }: WinrateGraphProps) {
  if (points.length === 0) {
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
})

type WdlProgressGraphProps = {
  points: WdlPoint[]
  currentIndex?: number
  onNavigate?: (index: number) => void
}

const WdlProgressGraph = memo(function WdlProgressGraph({ points, currentIndex, onNavigate }: WdlProgressGraphProps) {
  if (points.length === 0) {
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
})
