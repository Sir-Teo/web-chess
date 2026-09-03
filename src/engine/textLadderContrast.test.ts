import { describe, expect, it } from 'vitest'
// The stylesheet the app ships. Same approach as reviewPalette.test.ts.
import CSS from '../index.css?raw'

/**
 * Every rung of the text ladder, on every surface its theme paints.
 *
 * The two themes share token *names* so that no stylesheet knows which one it
 * is drawing -- which is the design, and which also means a light value can be
 * written by mirroring a dark one and never measured. That has now happened
 * three times in this palette: the accent as ink, three review chips, and this.
 * `--text-muted` carries a note in the dark block about being raised off a
 * value that sat under AA for the small metadata it draws; the light block
 * inherited gray-500 and landed at 4.23:1 on the page background, which is
 * the same defect one theme over.
 *
 * So the assertion is over the whole ladder rather than the token that failed.
 * A mirrored token that is wrong for its own surfaces fails here.
 */

type Rgb = { r: number; g: number; b: number }

function hex(value: string): Rgb {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  }
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a)
  const second = relativeLuminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

const lightBlockAt = CSS.indexOf('[data-theme="light"]')
const blocks = {
  dark: lightBlockAt >= 0 ? CSS.slice(0, lightBlockAt) : CSS,
  light: lightBlockAt >= 0 ? CSS.slice(lightBlockAt) : '',
}

function token(theme: 'dark' | 'light', name: string): string {
  const match = blocks[theme].match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`))
  if (!match) throw new Error(`--${name} is not a six-digit hex in the ${theme} block`)
  return match[1]
}

/**
 * The opaque grounds a theme paints text on. `--bg-panel` and `--bg-card` are
 * translucent versions of these and always land between two of them, so the
 * three flat surfaces are the bounds that matter.
 */
const SURFACES = ['bg-base', 'bg-surface', 'bg-elevated'] as const

/**
 * The rungs, and the smallest text each is used for. Everything here is under
 * 18.66px in the app, so the floor is AA's 4.5 throughout -- `--text-muted`
 * draws 10px metadata and `--text-primary` draws body copy.
 */
const LADDER = ['text-primary', 'text-secondary', 'text-tertiary', 'text-muted', 'text-heading'] as const

const AA_NORMAL_TEXT = 4.5

describe.each(['dark', 'light'] as const)('the %s text ladder', (theme) => {
  it.each(LADDER)('reads %s at AA on every surface its theme paints', (name) => {
    const ink = hex(token(theme, name))
    for (const surface of SURFACES) {
      const ratio = contrastRatio(ink, hex(token(theme, surface)))
      expect(ratio, `${theme} --${name} on --${surface} is ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  /**
   * A ladder that has stopped descending is not a ladder: the whole point of
   * four rungs is that a caption reads as quieter than body copy. Muted is the
   * quietest, so raising it to clear the floor is only correct while it stays
   * lighter than tertiary.
   */
  it('still descends, quietest last', () => {
    const onBase = (name: string) => contrastRatio(hex(token(theme, name)), hex(token(theme, 'bg-base')))
    expect(onBase('text-primary')).toBeGreaterThan(onBase('text-secondary'))
    expect(onBase('text-secondary')).toBeGreaterThan(onBase('text-tertiary'))
    expect(onBase('text-tertiary')).toBeGreaterThan(onBase('text-muted'))
  })
})

describe('mirroring a token across the themes', () => {
  /**
   * Kept as a measurement rather than a claim. gray-500 is what the light
   * block held, and it is what mirroring the dark block's *role* rather than
   * its measured contrast produces.
   */
  it('is what put gray-500 under the floor on the light page background', () => {
    const ratio = contrastRatio(hex('#6b7280'), hex(token('light', 'bg-base')))
    expect(ratio, `gray-500 on the light page background is ${ratio.toFixed(2)}:1`)
      .toBeLessThan(AA_NORMAL_TEXT)
  })
})
