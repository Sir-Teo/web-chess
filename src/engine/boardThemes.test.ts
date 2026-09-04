import { describe, expect, it } from 'vitest'
import { distanceAsSeen } from './colorVision'
import {
  BOARD_INK_MIN_CONTRAST,
  BOARD_INK_REFERENCE_CONTRAST,
  BOARD_MOVE_HINT_ALPHA,
  BOARD_MOVE_HINT_MIN_CONTRAST,
  BOARD_THEMES,
  DEFAULT_BOARD_THEME_ID,
  boardThemeById,
  compositeOver,
  contrastRatio,
  isBoardThemeId,
  moveHintColor,
  moveHintStyle,
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

describe('move hints', () => {
  // WCAG 1.4.11: a graphical object you need to understand the content. These
  // are the only thing saying where the piece you picked up can go.
  it('clears the graphical bar on both squares of every scheme', () => {
    for (const theme of BOARD_THEMES) {
      const onLight = compositeOver(theme.light, theme.ink, BOARD_MOVE_HINT_ALPHA)
      const onDark = compositeOver(theme.dark, theme.ink, BOARD_MOVE_HINT_ALPHA)
      expect(contrastRatio(onLight, theme.light)).toBeGreaterThanOrEqual(BOARD_MOVE_HINT_MIN_CONTRAST)
      expect(contrastRatio(onDark, theme.dark)).toBeGreaterThanOrEqual(BOARD_MOVE_HINT_MIN_CONTRAST)
    }
  })

  // What was there before, kept as the thing this must beat.
  it('beats the hardcoded pair it replaced, which failed on every scheme', () => {
    for (const theme of BOARD_THEMES) {
      const oldDot = compositeOver(theme.dark, '#000000', 0.25)
      const oldCapture = compositeOver(theme.dark, '#ff6400', 0.5)
      expect(contrastRatio(oldDot, theme.dark)).toBeLessThan(BOARD_MOVE_HINT_MIN_CONTRAST)
      expect(contrastRatio(oldCapture, theme.dark)).toBeLessThan(BOARD_MOVE_HINT_MIN_CONTRAST)

      const now = compositeOver(theme.dark, theme.ink, BOARD_MOVE_HINT_ALPHA)
      expect(contrastRatio(now, theme.dark)).toBeGreaterThan(contrastRatio(oldDot, theme.dark))
      expect(contrastRatio(now, theme.dark)).toBeGreaterThan(contrastRatio(oldCapture, theme.dark))
    }
  })


  // The orange disc failed the luminance bar while carrying its difference
  // entirely in hue. That is not the same as being hard to see -- it was 24 ΔE
  // from its square even for a protanope -- and this pins the distinction, so
  // nobody reads 1.01:1 as "invisible" and nobody replaces the new hints with
  // something that leans on hue again.
  it('keeps its distance from the square without relying on hue', () => {
    for (const theme of BOARD_THEMES) {
      const oldCapture = compositeOver(theme.dark, '#ff6400', 0.5)
      const now = compositeOver(theme.dark, theme.ink, BOARD_MOVE_HINT_ALPHA)

      // Both are easy to see; only one of them is still easy to see when the
      // hue is taken away, which is what the contrast ratio above measures.
      expect(distanceAsSeen(oldCapture, theme.dark, 'protan')).toBeGreaterThan(15)
      expect(distanceAsSeen(now, theme.dark, 'protan')).toBeGreaterThan(15)
      expect(contrastRatio(oldCapture, theme.dark)).toBeLessThan(1.2)
      expect(contrastRatio(now, theme.dark)).toBeGreaterThanOrEqual(BOARD_MOVE_HINT_MIN_CONTRAST)
    }
  })

  it('is the lowest round alpha that works, so the hints are no heavier than they must be', () => {
    const worst = (alpha: number) => Math.min(
      ...BOARD_THEMES.flatMap(theme => [
        contrastRatio(compositeOver(theme.light, theme.ink, alpha), theme.light),
        contrastRatio(compositeOver(theme.dark, theme.ink, alpha), theme.dark),
      ]),
    )
    expect(worst(BOARD_MOVE_HINT_ALPHA)).toBeGreaterThanOrEqual(BOARD_MOVE_HINT_MIN_CONTRAST)
    expect(worst(BOARD_MOVE_HINT_ALPHA - 0.1)).toBeLessThan(BOARD_MOVE_HINT_MIN_CONTRAST)
  })

  // Shape, not hue: the pair has to stay readable to someone who cannot
  // separate the colours, and it must not borrow from the board's existing
  // language, where green is "the engine likes this" and amber the played move.
  it('separates a capture from a quiet move by shape and shares one colour', () => {
    const theme = BOARD_THEMES[0]
    const quiet = moveHintStyle(theme, false).background
    const capture = moveHintStyle(theme, true).background
    expect(quiet).not.toBe(capture)
    expect(quiet).toContain(moveHintColor(theme))
    expect(capture).toContain(moveHintColor(theme))
    expect(capture).toContain('transparent 0 78%')
  })

  it('composites the way the browser does', () => {
    expect(compositeOver('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(compositeOver('#ffffff', '#000000', 0)).toBe('#ffffff')
    expect(compositeOver('#ffffff', '#000000', 1)).toBe('#000000')
  })
})
