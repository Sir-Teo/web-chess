import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PERSISTED_SETTINGS,
  loadPersistedSettings,
  persistSettings,
  resolveTheme,
  type PersistedAppSettings,
} from './appSettings'
import { ANALYSIS_SETTINGS_STORAGE_KEY } from '../storageKeys'

/** A localStorage stand-in, so nothing here depends on a browser. */
function installStorage(initial?: string, overrides: Partial<Storage> = {}) {
  const entries = new Map<string, string>()
  if (initial !== undefined) entries.set(ANALYSIS_SETTINGS_STORAGE_KEY, initial)
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, String(value)) },
    removeItem: (key: string) => { entries.delete(key) },
    clear: () => entries.clear(),
    key: () => null,
    length: 0,
    ...overrides,
  } as unknown as Storage
  vi.stubGlobal('window', { localStorage: storage })
  return entries
}

function stored(settings: Partial<PersistedAppSettings> | Record<string, unknown>) {
  return JSON.stringify(settings)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reading settings back', () => {
  it('returns the defaults when nothing has ever been stored', () => {
    installStorage()
    expect(loadPersistedSettings()).toEqual(DEFAULT_PERSISTED_SETTINGS)
  })

  it('returns the defaults rather than throwing on a store full of nonsense', () => {
    installStorage('{{{ not json')
    expect(loadPersistedSettings()).toEqual(DEFAULT_PERSISTED_SETTINGS)
  })

  it('returns the defaults when storage itself refuses to be read', () => {
    installStorage(undefined, { getItem: () => { throw new Error('blocked') } })
    expect(loadPersistedSettings()).toEqual(DEFAULT_PERSISTED_SETTINGS)
  })

  it('keeps a value it recognises', () => {
    installStorage(stored({ workspaceMode: 'analysis', analysisTab: 'review', multiPv: 4, showWdl: false }))
    const settings = loadPersistedSettings()
    expect(settings.workspaceMode).toBe('analysis')
    expect(settings.analysisTab).toBe('review')
    expect(settings.multiPv).toBe(4)
    expect(settings.showWdl).toBe(false)
  })

  it('fills in every field the store is missing', () => {
    installStorage(stored({ multiPv: 3 }))
    const settings = loadPersistedSettings()
    expect(settings.multiPv).toBe(3)
    expect(settings.analyzeMode).toBe(DEFAULT_PERSISTED_SETTINGS.analyzeMode)
    expect(settings.openingSpeeds).toEqual(DEFAULT_PERSISTED_SETTINGS.openingSpeeds)
    expect(Object.keys(settings).sort()).toEqual(Object.keys(DEFAULT_PERSISTED_SETTINGS).sort())
  })
})

describe('refusing a value that is present but wrong', () => {
  /**
   * The whole point of the function. A hand-edited or half-written store must
   * not put a value the UI cannot render into a control.
   */
  it('rejects a mode, tab or experience it does not know', () => {
    installStorage(stored({ workspaceMode: 'wandering', analysisTab: 'nope', analysisExperience: 'expert' }))
    const settings = loadPersistedSettings()
    expect(settings.workspaceMode).toBe(DEFAULT_PERSISTED_SETTINGS.workspaceMode)
    expect(settings.analysisTab).toBe(DEFAULT_PERSISTED_SETTINGS.analysisTab)
    expect(settings.analysisExperience).toBe(DEFAULT_PERSISTED_SETTINGS.analysisExperience)
  })

  it('clamps an integer that is out of range rather than passing it through', () => {
    installStorage(stored({ searchDepth: 999, multiPv: 0, topMoveArrowCount: -3, hashMb: 4096 }))
    const settings = loadPersistedSettings()
    expect(settings.searchDepth).toBe(DEFAULT_PERSISTED_SETTINGS.searchDepth)
    expect(settings.multiPv).toBe(DEFAULT_PERSISTED_SETTINGS.multiPv)
    expect(settings.topMoveArrowCount).toBe(DEFAULT_PERSISTED_SETTINGS.topMoveArrowCount)
    expect(settings.hashMb).toBeLessThanOrEqual(512)
  })

  it('rejects a non-number where a number belongs', () => {
    installStorage(stored({ searchDepth: 'deep', quickMovetimeMs: null, mateTarget: Number.NaN }))
    const settings = loadPersistedSettings()
    expect(settings.searchDepth).toBe(DEFAULT_PERSISTED_SETTINGS.searchDepth)
    expect(settings.quickMovetimeMs).toBe(DEFAULT_PERSISTED_SETTINGS.quickMovetimeMs)
    expect(settings.mateTarget).toBe(DEFAULT_PERSISTED_SETTINGS.mateTarget)
  })

  it('rejects a non-boolean where a switch belongs', () => {
    installStorage(stored({ showWdl: 'yes', autoAnalyze: 1, soundEnabled: null }))
    const settings = loadPersistedSettings()
    expect(settings.showWdl).toBe(DEFAULT_PERSISTED_SETTINGS.showWdl)
    expect(settings.autoAnalyze).toBe(DEFAULT_PERSISTED_SETTINGS.autoAnalyze)
    expect(settings.soundEnabled).toBe(DEFAULT_PERSISTED_SETTINGS.soundEnabled)
  })

  it('keeps a null preset, which means "none", and rejects an unknown one', () => {
    installStorage(stored({ activePreset: null }))
    expect(loadPersistedSettings().activePreset).toBeNull()
    installStorage(stored({ activePreset: 'turbo' }))
    expect(loadPersistedSettings().activePreset).toBe(DEFAULT_PERSISTED_SETTINGS.activePreset)
  })

  it('keeps an optional integer as null when it is absent or unusable', () => {
    installStorage(stored({ limitNodes: 'lots', movesToGo: -4 }))
    const settings = loadPersistedSettings()
    expect(settings.limitNodes).toBeNull()
    expect(settings.movesToGo).toBeNull()
  })
})

describe('the three settings added in one session, which is why this file exists', () => {
  it('keeps a board theme it ships and refuses one it does not', () => {
    installStorage(stored({ boardThemeId: 'dusk' }))
    expect(loadPersistedSettings().boardThemeId).toBe('dusk')
    installStorage(stored({ boardThemeId: 'neon' }))
    expect(loadPersistedSettings().boardThemeId).toBe(DEFAULT_PERSISTED_SETTINGS.boardThemeId)
  })

  it('keeps a time control it offers and refuses one it does not', () => {
    installStorage(stored({ timeControlId: '3+2' }))
    expect(loadPersistedSettings().timeControlId).toBe('3+2')
    installStorage(stored({ timeControlId: '3+3' }))
    expect(loadPersistedSettings().timeControlId).toBe(DEFAULT_PERSISTED_SETTINGS.timeControlId)
  })

  it('keeps the sound switch either way', () => {
    installStorage(stored({ soundEnabled: false }))
    expect(loadPersistedSettings().soundEnabled).toBe(false)
    installStorage(stored({ soundEnabled: true }))
    expect(loadPersistedSettings().soundEnabled).toBe(true)
  })
})

describe('the two fields with a shape of their own', () => {
  it('keeps known opening speeds, drops the rest, and de-duplicates', () => {
    installStorage(stored({ openingSpeeds: ['blitz', 'blitz', 'hyper', 'classical'] }))
    expect(loadPersistedSettings().openingSpeeds).toEqual(['blitz', 'classical'])
  })

  it('falls back rather than leaving no speed selected at all', () => {
    installStorage(stored({ openingSpeeds: ['hyper'] }))
    expect(loadPersistedSettings().openingSpeeds).toEqual(DEFAULT_PERSISTED_SETTINGS.openingSpeeds)
    installStorage(stored({ openingSpeeds: 'blitz' }))
    expect(loadPersistedSettings().openingSpeeds).toEqual(DEFAULT_PERSISTED_SETTINGS.openingSpeeds)
  })

  it('keeps a bounded lab history of trimmed, non-empty strings', () => {
    installStorage(stored({ labCommandHistory: ['  go depth 5  ', '', 42, 'eval'] }))
    expect(loadPersistedSettings().labCommandHistory).toEqual(['go depth 5', 'eval'])
  })

  it('caps the lab history rather than growing without limit', () => {
    installStorage(stored({ labCommandHistory: Array.from({ length: 60 }, (_, i) => `go depth ${i}`) }))
    expect(loadPersistedSettings().labCommandHistory).toHaveLength(20)
  })

  /**
   * Deliberate: search moves are about the position on the board, and restoring
   * yesterday's restriction onto today's position would silently narrow a
   * search nobody asked to narrow.
   */
  it('never restores a search-move restriction', () => {
    installStorage(stored({ searchMovesInput: 'e2e4 d2d4' }))
    expect(loadPersistedSettings().searchMovesInput).toBe('')
  })
})

describe('writing settings out', () => {
  it('round-trips everything it wrote', () => {
    const entries = installStorage()
    const settings: PersistedAppSettings = {
      ...DEFAULT_PERSISTED_SETTINGS,
      workspaceMode: 'analysis',
      boardThemeId: 'ocean',
      timeControlId: '5+0',
      soundEnabled: false,
      multiPv: 5,
    }
    persistSettings(settings)
    expect(entries.has(ANALYSIS_SETTINGS_STORAGE_KEY)).toBe(true)
    expect(loadPersistedSettings()).toEqual({ ...settings, searchMovesInput: '' })
  })

  it('says nothing and throws nothing when storage refuses the write', () => {
    installStorage(undefined, { setItem: () => { throw new Error('quota') } })
    expect(() => persistSettings(DEFAULT_PERSISTED_SETTINGS)).not.toThrow()
  })
})

describe('the theme preference', () => {
  it('keeps a preference it knows and falls back to dark for anything else', () => {
    installStorage(stored({ theme: 'light' }))
    expect(loadPersistedSettings().theme).toBe('light')
    installStorage(stored({ theme: 'system' }))
    expect(loadPersistedSettings().theme).toBe('system')
    installStorage(stored({ theme: 'sepia' }))
    expect(loadPersistedSettings().theme).toBe('dark')
    installStorage(stored({ theme: true }))
    expect(loadPersistedSettings().theme).toBe('dark')
  })

  it('draws what the reader chose, and follows the OS only when asked to', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
})
