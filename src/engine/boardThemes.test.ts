import { describe, expect, it } from 'vitest'
import {
  BOARD_INK_MIN_CONTRAST,
  BOARD_INK_REFERENCE_CONTRAST,
  BOARD_THEMES,
  DEFAULT_BOARD_THEME_ID,
  boardThemeById,
  contrastRatio,
  isBoardThemeId,
  relativeLuminance,
} from './boardThemes'

const HEX = /^#[0-9a-f]{6}$/

describe('contrast maths', () => {
  it('agrees with the WCAG reference points', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('does not care which colour is given first', () => {
    expect(contrastRatio('#2b2118', '#b58863')).toBeCloseTo(contrastRatio('#b58863', '#2b2118'), 10)
  })
})

describe('board themes', () => {
  /**
   * Computed rather than trusted: a scheme added by eye is exactly how a board
   * ends up with coordinates that vanish on the dark squares, and the dark
   * square is always the harder of the two.
   */
  it('gives every scheme an ink that clears WCAG AA on its own dark square', () => {
    for (const theme of BOARD_THEMES) {
      const onDark = contrastRatio(theme.ink, theme.dark)
      const onLight = contrastRatio(theme.ink, theme.light)
      expect(onDark, `${theme.id} ink on its dark square is ${onDark.toFixed(2)}`)
        .toBeGreaterThanOrEqual(BOARD_INK_MIN_CONTRAST)
      expect(onLight, `${theme.id} ink on its light square is ${onLight.toFixed(2)}`)
        .toBeGreaterThanOrEqual(BOARD_INK_MIN_CONTRAST)
    }
  })

  /**
   * AA is the legal floor; this is the one the board already met. A new scheme
   * that merely clears 4.5 would be a step down from what shipped.
   */
  it('keeps every scheme at least as legible as the original pair', () => {
    for (const theme of BOARD_THEMES) {
      const onDark = contrastRatio(theme.ink, theme.dark)
      expect(onDark, `${theme.id} ink on its dark square is ${onDark.toFixed(4)}`)
        .toBeGreaterThanOrEqual(BOARD_INK_REFERENCE_CONTRAST)
    }
  })

  /** Squares a player cannot tell apart are not a board. */
  it('keeps the two square colours clearly distinct', () => {
    for (const theme of BOARD_THEMES) {
      expect(contrastRatio(theme.light, theme.dark), theme.id).toBeGreaterThan(1.5)
      expect(relativeLuminance(theme.light), theme.id).toBeGreaterThan(relativeLuminance(theme.dark))
    }
  })

  it('is well formed: unique ids, real labels, six-digit lowercase hex', () => {
    const ids = new Set<string>()
    for (const theme of BOARD_THEMES) {
      expect(ids.has(theme.id), `duplicate id ${theme.id}`).toBe(false)
      ids.add(theme.id)
      expect(theme.label.trim().length).toBeGreaterThan(0)
      for (const colour of [theme.light, theme.dark, theme.ink]) {
        expect(colour, `${theme.id} ${colour}`).toMatch(HEX)
      }
    }
  })

  /** Changing these silently moves every existing board. */
  it('leaves the original pair and its ink exactly where they were', () => {
    const classic = boardThemeById('classic')
    expect(classic.light).toBe('#f0d9b5')
    expect(classic.dark).toBe('#b58863')
    expect(classic.ink).toBe('#2b2118')
    expect(DEFAULT_BOARD_THEME_ID).toBe('classic')
  })

  it('falls back to the default rather than returning nothing for an unknown id', () => {
    expect(boardThemeById('not-a-theme').id).toBe(DEFAULT_BOARD_THEME_ID)
    expect(boardThemeById('').id).toBe(DEFAULT_BOARD_THEME_ID)
  })

  it('recognises only the ids it ships', () => {
    expect(isBoardThemeId('ocean')).toBe(true)
    expect(isBoardThemeId('teal')).toBe(false)
    expect(isBoardThemeId(null)).toBe(false)
  })
})
