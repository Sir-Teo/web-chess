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

/**
 * WCAG 1.4.11 for a graphical object you need in order to understand the
 * content. The move hints are exactly that: they are the only thing on the
 * board saying where the piece you picked up may go.
 */
export const BOARD_MOVE_HINT_MIN_CONTRAST = 3

/**
 * How solid a move hint is drawn.
 *
 * The hints used to be one hardcoded pair for all five schemes — a 25% black
 * dot for a quiet move and a half-opacity orange disc for a capture. Measured
 * against the squares they are drawn on, the dot came out between 1.6:1 and
 * 1.8:1 and the capture disc between 1.01:1 and 1.16:1 on the dark squares, so
 * neither cleared the bar on any scheme. Same defect the coordinates had, and
 * for the same reason — one value picked by eye against one board — one layer
 * further down, where the contrast sweep cannot see it because a square has no
 * text in it to measure.
 *
 * What that ratio does *not* mean, and it is worth writing down because the
 * number invites the wrong conclusion: the orange disc was not invisible. It
 * failed a luminance criterion while carrying its difference in hue, and
 * `colorVision.distanceAsSeen` puts it 24 to 57 ΔE from its square even
 * simulated for protanopia — plainly visible, to everyone. The quiet dot is the
 * one that was genuinely faint, at 13.5 to 16.9 ΔE.
 *
 * So the case for changing them is not that they could not be seen. It is that
 * a hint should not depend on hue to be seen at all, that the orange was close
 * to the amber this board already spends on "the move that was played", and
 * that five schemes sharing two values picked against one of them is how the
 * coordinates went wrong. The pair below clears 3:1 on every scheme *and* sits
 * 33 to 36 ΔE from its square.
 *
 * The hint reuses the scheme's own `ink` rather than adding a sixth pair of
 * hand-picked colours: it is the one colour per scheme already proven to clear
 * AA against the *darker* square, which is the harder of the two, so at this
 * alpha it clears the graphical bar against both. 0.72 is the lowest round
 * value that does it for every scheme; the tests compute that rather than
 * trust it.
 */
export const BOARD_MOVE_HINT_ALPHA = 0.72

/** `#rrggbb` for `foreground` at `alpha` painted over an opaque `background`. */
export function compositeOver(background: string, foreground: string, alpha: number): string {
  const parse = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }
  const back = parse(background)
  const front = parse(foreground)
  const blend = (index: number) => Math.round(alpha * front[index] + (1 - alpha) * back[index])
  return `#${[0, 1, 2].map(index => blend(index).toString(16).padStart(2, '0')).join('')}`
}

/** The move hints' colour for a scheme, ready to drop into a gradient. */
export function moveHintColor(theme: BoardTheme): string {
  const value = Number.parseInt(theme.ink.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${BOARD_MOVE_HINT_ALPHA})`
}

/**
 * Where a piece may go, and where it may take.
 *
 * Two shapes rather than two colours: a filled dot for a quiet move and a ring
 * in the square's corners for a capture, which is what Lichess and chess.com
 * both draw. Shape carries the difference, so the pair survives being read by
 * someone who cannot separate the hues — and neither of them has to borrow a
 * colour from the board's existing language, where green already means "the
 * engine likes this", amber the move that was played and violet a threat.
 */
export function moveHintStyle(theme: BoardTheme, capture: boolean): { background: string } {
  const color = moveHintColor(theme)
  return {
    background: capture
      ? `radial-gradient(circle, transparent 0 78%, ${color} 78%)`
      : `radial-gradient(circle, ${color} 28%, transparent 28%)`,
  }
}
