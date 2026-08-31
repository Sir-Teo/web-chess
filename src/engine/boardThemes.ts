/**
 * Board colour schemes.
 *
 * The board shipped with one hardcoded pair, `#f0d9b5` / `#b58863`, and one
 * notation ink chosen against it. That ink is the reason this is a module
 * rather than two more strings in `App.tsx`: coordinates are drawn *inside* the
 * squares, so every scheme needs its own ink, and picking one by eye is how a
 * board ends up with coordinates nobody can read on the dark squares.
 *
 * The rule every scheme here meets: the ink clears **WCAG AA (4.5:1) against
 * the darker square**, which is the worse of the two, and is no worse than the
 * original pair's ink, which measures 4.9995 — the comment it came from said
 * "5:1", rounded. The usual "opposite square colour" convention cannot reach
 * even AA against a mid-tone dark square, no lightness of white does, so each
 * ink is instead the scheme's own dark square taken down toward black until it
 * clears the bar, which keeps it in the scheme's hue.
 *
 * `boardThemes.test.ts` computes the ratios rather than trusting these values,
 * so a scheme cannot be added below either bar.
 */

export type BoardTheme = {
  id: string
  label: string
  /** Light squares. */
  light: string
  /** Dark squares — the harder of the two for the coordinates to sit on. */
  dark: string
  /** Rank and file coordinates, drawn inside the squares. */
  ink: string
}

/** WCAG AA for normal text. Every ink clears it against its own dark square. */
export const BOARD_INK_MIN_CONTRAST = 4.5

/**
 * What the original pair actually measures, to the digit. Kept as a separate
 * bar from AA so a new scheme has to be at least as legible as the one this
 * board shipped with, not merely legal.
 */
export const BOARD_INK_REFERENCE_CONTRAST = 4.99

export const BOARD_THEMES: BoardTheme[] = [
  // The original pair, unchanged, so nobody's board moves under them.
  { id: 'classic', label: 'Classic', light: '#f0d9b5', dark: '#b58863', ink: '#2b2118' },
  { id: 'ocean', label: 'Ocean', light: '#dee3e6', dark: '#8ca2ad', ink: '#292f32' },
  { id: 'forest', label: 'Forest', light: '#ffffdd', dark: '#86a666', ink: '#27301e' },
  { id: 'slate', label: 'Slate', light: '#e8ebef', dark: '#7d8796', ink: '#131417' },
  { id: 'dusk', label: 'Dusk', light: '#d9d3e0', dark: '#8a7fa3', ink: '#131217' },
]

export const DEFAULT_BOARD_THEME_ID = 'classic'

export function boardThemeById(id: string): BoardTheme {
  return BOARD_THEMES.find(theme => theme.id === id)
    ?? BOARD_THEMES.find(theme => theme.id === DEFAULT_BOARD_THEME_ID)!
}

export function isBoardThemeId(value: unknown): value is string {
  return typeof value === 'string' && BOARD_THEMES.some(theme => theme.id === value)
}

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance of a `#rrggbb` colour, per WCAG. */
export function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channelLuminance((value >> 16) & 255)
    + 0.7152 * channelLuminance((value >> 8) & 255)
    + 0.0722 * channelLuminance(value & 255)
}

/** WCAG contrast ratio between two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}
