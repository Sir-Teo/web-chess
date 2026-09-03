import { describe, expect, it } from 'vitest'
// The stylesheet the app ships, not a copy of its values kept in step by hand.
// Same reason `reviewPalette.test.ts` reads it this way.
import CSS from '../index.css?raw'

/**
 * The accent, where it is used as text.
 *
 * `--accent` fills buttons, tints pills and draws glows, and it is also the ink
 * on the active pill, the engine status and "Best: Nf3". Those two jobs want
 * opposite things from a colour, and only one of them has a legibility floor --
 * so the ink is its own token and this is the floor.
 *
 * It went unmeasured through the light theme's whole design. Teal-600 reads
 * 7.5:1 on near-black and 2.95:1 on the tinted background of an active pill,
 * which is under AA on the selected state of the app's primary navigation, at
 * 12px. The quality inks in the same block were chosen with a colour-vision
 * probe and written up; the accent was not held to the same bar.
 */

type Rgb = { r: number; g: number; b: number }

function hex(value: string): Rgb {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  }
}

/** `fg` at `alpha` painted over `bg`. */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  }
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Both themes, each read from its own block. The light block redefines every
 * token, so one pass over the whole file would keep whichever definition came
 * last and guard only that one.
 */
const lightBlockAt = CSS.indexOf('[data-theme="light"]')
const blocks = {
  dark: lightBlockAt >= 0 ? CSS.slice(0, lightBlockAt) : CSS,
  light: lightBlockAt >= 0 ? CSS.slice(lightBlockAt) : '',
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`))
  if (!match) throw new Error(`--${name} is not a six-digit hex in this block`)
  return match[1]
}

/**
 * What sits behind the accent ink in the place it is hardest to read: the
 * active pill, whose tint is `--accent-subtle` over `--glass-2` over the panel.
 * The alphas are the ones in the stylesheet; the hues they carry do not matter
 * enough to parse, so the tint is the theme's own accent and the glass its own
 * neutral.
 */
const PILL_TINT_ALPHA = 0.12
const GLASS_ALPHA = 0.045
const PANEL_ALPHA = 0.88

function activePillBackground(theme: 'dark' | 'light'): Rgb {
  const block = blocks[theme]
  const base = hex(token(block, 'bg-base'))
  const neutral = theme === 'light' ? hex('#0f172a') : hex('#ffffff')
  const panel = over(theme === 'light' ? hex('#ffffff') : hex('#111319'), PANEL_ALPHA, base)
  const glass = over(neutral, GLASS_ALPHA, panel)
  return over(hex(token(block, 'accent')), PILL_TINT_ALPHA, glass)
}

/** WCAG AA for text under 18.66px, which is every one of these readings. */
const AA_NORMAL_TEXT = 4.5

describe.each(['dark', 'light'] as const)('the %s accent ink', (theme) => {
  const block = blocks[theme]

  it('is declared in its own block of index.css', () => {
    expect(token(block, 'accent-ink')).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('clears AA on the flat surfaces it is read on', () => {
    const ink = hex(token(block, 'accent-ink'))
    for (const surface of ['bg-base', 'bg-surface', 'bg-elevated'] as const) {
      const ratio = contrastRatio(ink, hex(token(block, surface)))
      expect(ratio, `${theme} --accent-ink on --${surface} is ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  /**
   * The hardest case, and the one that was failing: the ink sits *on* the
   * accent's own tint there, which pulls the background toward the ink.
   */
  it('clears AA on the tint of an active pill', () => {
    const ratio = contrastRatio(hex(token(block, 'accent-ink')), activePillBackground(theme))
    expect(ratio, `${theme} --accent-ink on an active pill is ${ratio.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('is still recognisably the accent rather than the body text', () => {
    const ink = token(block, 'accent-ink')
    expect(ink).not.toBe(token(block, 'text-primary'))
    // Darkening the ink until it passes is only a fix if it is still a hue a
    // reader reads as "selected"; a green channel well ahead of red is what
    // makes this teal rather than another grey.
    const { r, g, b } = hex(ink)
    expect(g).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(r)
  })
})

describe('the accent fill and the accent ink', () => {
  it('are allowed to differ, and on light they must', () => {
    // Kept as a statement of the finding rather than a bare inequality: the
    // dark theme is free to use one colour for both because it already clears
    // the floor, and it does.
    expect(token(blocks.dark, 'accent-ink')).toBe(token(blocks.dark, 'accent'))

    const lightFill = hex(token(blocks.light, 'accent'))
    const fillAsInk = contrastRatio(lightFill, activePillBackground('light'))
    expect(fillAsInk, `the light fill would read at ${fillAsInk.toFixed(2)}:1 as ink`)
      .toBeLessThan(AA_NORMAL_TEXT)
  })
})

/**
 * Every stylesheet, found rather than listed, so a new one is covered the day
 * it is added. `import.meta.glob` is Vite's own, which is what runs the tests.
 */
const STYLESHEETS: Record<string, string> = import.meta.glob('../**/*.css', {
  query: '?raw',
  eager: true,
  import: 'default',
})

describe('the accent as a colour rather than a fill', () => {
  /**
   * The reason this exists: the first pass at `--accent-ink` swept App.css and
   * stopped there, leaving seven `color: var(--accent)` rules in index.css and
   * the two dialog stylesheets. One of them drew "Open in Lichess" inside the
   * PGN dialog at 3.52:1 -- the very defect the token was introduced to fix,
   * one file over, found only by sweeping the dialogs in a browser.
   *
   * Anchored to the start of a declaration so `border-color` and
   * `accent-color`, which are not read and correctly keep the fill, do not
   * match.
   */
  it('is never used to paint text, in any stylesheet', () => {
    const offenders: string[] = []
    for (const [path, css] of Object.entries(STYLESHEETS)) {
      for (const match of css.matchAll(/(^|[;{])\s*color:\s*var\(--accent\)\s*(!important)?\s*;/gm)) {
        const line = css.slice(0, match.index).split('\n').length
        offenders.push(`${path}:${line}`)
      }
    }
    expect(offenders, `use --accent-ink for text: ${offenders.join(', ')}`).toEqual([])
  })

  it('found some stylesheets to check, so an empty pass is not a green one', () => {
    expect(Object.keys(STYLESHEETS).length).toBeGreaterThanOrEqual(3)
    expect(Object.keys(STYLESHEETS).some(path => path.endsWith('App.css'))).toBe(true)
  })
})
