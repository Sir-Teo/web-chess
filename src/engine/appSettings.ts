import { detectEngineCapabilities, engineProfiles, recommendedHashMb, type EngineProfileId } from './profiles'
import type { AnalyzeMode } from './uci'
import type { OpeningDatabaseSource, OpeningSpeed } from './openingExplorer'
import { isBoardThemeId } from './boardThemes'
import { isTimeControlPresetId } from './chessClock'
import { ANALYSIS_SETTINGS_STORAGE_KEY } from '../storageKeys'

/**
 * Everything the app remembers between visits, and the rules for reading it
 * back.
 *
 * This lived in `App.tsx`, which the architecture doc names as the trap:
 * "Treat 'I am changing a pure helper in App.tsx' as the moment to extract it."
 * Three settings were added to it in one session -- move sounds, the time
 * control, the board theme -- each editing sixty lines of normalisation that
 * nothing exercised. The normalisation is the whole point of the function: it
 * is what stands between a corrupted or hand-edited store and the UI, and it
 * had no test at all.
 *
 * Every reader here follows the storage invariant: bad data produces the
 * default, never an exception and never a value out of range.
 */

export type WorkspaceMode = 'play' | 'analysis'
export type AnalysisTab = 'analyze' | 'review' | 'engine-lab'
export type AnalysisExperience = 'beginner' | 'pro'
export type AnalyzePresetId = 'blunder-check' | 'game-review' | 'deep-candidate' | 'mate-hunt'
export type OpeningRatingPresetId = 'all' | 'club' | 'advanced'
/** Dark is the app's own look; light and system are the reader's choice. */
export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

export const THEME_PREFERENCE_IDS: ThemePreference[] = ['dark', 'light', 'system']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCE_IDS.includes(value as ThemePreference)
}

/** The theme to draw, given the preference and what the OS asked for. */
export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark'
  return preference
}

export const ANALYZE_PRESET_IDS: AnalyzePresetId[] = ['blunder-check', 'game-review', 'deep-candidate', 'mate-hunt']
export const OPENING_RATING_PRESET_IDS: OpeningRatingPresetId[] = ['all', 'club', 'advanced']

export const ANALYZE_MODE_IDS: AnalyzeMode[] = ['quick', 'deep', 'infinite', 'mate', 'review']

export const ANALYSIS_TAB_IDS: AnalysisTab[] = ['analyze', 'review', 'engine-lab']

export const ANALYSIS_EXPERIENCE_IDS: AnalysisExperience[] = ['beginner', 'pro']

export const WORKSPACE_MODE_IDS: WorkspaceMode[] = ['play', 'analysis']

export const OPENING_SOURCES: OpeningDatabaseSource[] = ['masters', 'lichess']

export const OPENING_SPEEDS: OpeningSpeed[] = ['bullet', 'blitz', 'rapid', 'classical']

export type PersistedAppSettings = {
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
  /**
   * Whether the automatic analysis keeps searching until the board moves,
   * rather than stopping at the depth slider. A Pro reading: Coach mode is
   * never left running the machine.
   */
  continuousAnalysis: boolean
  soundEnabled: boolean
  /** Whether a game against the engine points out a mistake as it is made. */
  blunderNudges: boolean
  /** Hide the pieces and play from memory. */
  blindfold: boolean
  timeControlId: string
  boardThemeId: string
  theme: ThemePreference
}

export const DEFAULT_PERSISTED_SETTINGS: PersistedAppSettings = {
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
  continuousAnalysis: false,
  soundEnabled: true,
  blunderNudges: true,
  blindfold: false,
  timeControlId: 'unlimited',
  boardThemeId: 'classic',
  theme: 'dark',
}

/**
 * The settings a browser that has never been here gets.
 *
 * Not `DEFAULT_PERSISTED_SETTINGS` itself, because one of its fields is not a
 * constant: Hash has to be sized to the device. `recommendedHashMb` exists
 * precisely so a phone is not handed 64 MB of transposition table on top of
 * the engine's own WASM heap -- and every path into this module used it except
 * the one that matters most. A corrupt stored value fell back to it, and
 * "Reset saved workspace" used it, but a *first visit* took the flat 64 from
 * the constant. That is the one visit with no reader preference to respect, so
 * it is the one where the device's own limits are all there is to go on.
 */
export function defaultPersistedSettings(): PersistedAppSettings {
  return { ...DEFAULT_PERSISTED_SETTINGS, hashMb: defaultHashMb() }
}

let cachedDefaultHashMb: number | null = null
export function defaultHashMb(): number {
  if (cachedDefaultHashMb !== null) return cachedDefaultHashMb
  try {
    cachedDefaultHashMb = recommendedHashMb(detectEngineCapabilities())
  } catch {
    cachedDefaultHashMb = DEFAULT_PERSISTED_SETTINGS.hashMb
  }
  return cachedDefaultHashMb
}

export const QUICK_MOVETIME_BOUNDS = { min: 50, max: 30_000, fallback: DEFAULT_PERSISTED_SETTINGS.quickMovetimeMs }

export const MATE_TARGET_BOUNDS = { min: 1, max: 30, fallback: DEFAULT_PERSISTED_SETTINGS.mateTarget }

export const LIMIT_NODES_BOUNDS = { min: 1, max: 1_000_000_000 }

export const CLOCK_TIME_BOUNDS = { min: 0, max: 86_400_000, fallback: DEFAULT_PERSISTED_SETTINGS.whiteTimeMs }

export const CLOCK_INCREMENT_BOUNDS = { min: 0, max: 60_000, fallback: DEFAULT_PERSISTED_SETTINGS.whiteIncMs }

export const MOVES_TO_GO_BOUNDS = { min: 1, max: 500 }

export function isAnalyzePresetId(value: unknown): value is AnalyzePresetId {
  return typeof value === 'string' && ANALYZE_PRESET_IDS.includes(value as AnalyzePresetId)
}

export function isAnalyzeMode(value: unknown): value is AnalyzeMode {
  return typeof value === 'string' && ANALYZE_MODE_IDS.includes(value as AnalyzeMode)
}

export function isAnalysisTab(value: unknown): value is AnalysisTab {
  return typeof value === 'string' && ANALYSIS_TAB_IDS.includes(value as AnalysisTab)
}

export function isAnalysisExperience(value: unknown): value is AnalysisExperience {
  return typeof value === 'string' && ANALYSIS_EXPERIENCE_IDS.includes(value as AnalysisExperience)
}

export function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return typeof value === 'string' && WORKSPACE_MODE_IDS.includes(value as WorkspaceMode)
}

export function isEngineProfileId(value: unknown): value is EngineProfileId {
  if (value === 'auto') return true
  return typeof value === 'string' && engineProfiles.some(profile => profile.id === value)
}

export function isOpeningSource(value: unknown): value is OpeningDatabaseSource {
  return typeof value === 'string' && OPENING_SOURCES.includes(value as OpeningDatabaseSource)
}

export function isOpeningSpeed(value: unknown): value is OpeningSpeed {
  return typeof value === 'string' && OPENING_SPEEDS.includes(value as OpeningSpeed)
}

export function isOpeningRatingPreset(value: unknown): value is OpeningRatingPresetId {
  return typeof value === 'string' && OPENING_RATING_PRESET_IDS.includes(value as OpeningRatingPresetId)
}

export function normalizeInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  if (rounded < minimum || rounded > maximum) return fallback
  return rounded
}

export function normalizeOptionalPositiveInteger(value: unknown, maximum: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded <= 0 || rounded > maximum) return null
  return rounded
}

export function normalizeOpeningSpeeds(value: unknown): OpeningSpeed[] {
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

export function loadPersistedSettings(): PersistedAppSettings {
  if (typeof window === 'undefined') return defaultPersistedSettings()

  try {
    const raw = window.localStorage.getItem(ANALYSIS_SETTINGS_STORAGE_KEY)
    if (!raw) return defaultPersistedSettings()

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
      hashMb: normalizeInteger(parsed.hashMb, 16, 512, defaultHashMb()),
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
      continuousAnalysis: typeof parsed.continuousAnalysis === 'boolean'
        ? parsed.continuousAnalysis
        : DEFAULT_PERSISTED_SETTINGS.continuousAnalysis,
      soundEnabled: typeof parsed.soundEnabled === 'boolean'
        ? parsed.soundEnabled
        : DEFAULT_PERSISTED_SETTINGS.soundEnabled,
      blunderNudges: typeof parsed.blunderNudges === 'boolean'
        ? parsed.blunderNudges
        : DEFAULT_PERSISTED_SETTINGS.blunderNudges,
      blindfold: typeof parsed.blindfold === 'boolean'
        ? parsed.blindfold
        : DEFAULT_PERSISTED_SETTINGS.blindfold,
      timeControlId: isTimeControlPresetId(parsed.timeControlId)
        ? parsed.timeControlId
        : DEFAULT_PERSISTED_SETTINGS.timeControlId,
      boardThemeId: isBoardThemeId(parsed.boardThemeId)
        ? parsed.boardThemeId
        : DEFAULT_PERSISTED_SETTINGS.boardThemeId,
      theme: isThemePreference(parsed.theme) ? parsed.theme : DEFAULT_PERSISTED_SETTINGS.theme,
    }
  } catch {
    return defaultPersistedSettings()
  }
}

export function persistSettings(settings: PersistedAppSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ANALYSIS_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore localStorage failures (private mode / quota).
  }
}
