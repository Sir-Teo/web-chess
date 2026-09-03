import { describe, expect, it } from 'vitest'
// Both real stylesheets: the tints live with the chips in App.css and the inks
// with the rest of the palette in index.css, so a test that guards a copy of
// either would guard nothing. Same approach as reviewPalette.test.ts.
import APP_CSS from '../App.css?raw'
import ROOT_CSS from '../index.css?raw'

/**
 * The review's summary chips -- "Blunder 2", "Good 14" -- are the row that
 * tells a reader how the game went, printed at 10.7px on a tint of their own
 * colour.
 *
 * The quality tokens they used to inherit are sized for the 5px dot beside a
 * move in the tree, where 3:1 is the floor because a dot is not read. As text
 * three of them missed 4.5: dark blunder 4.41 and pending 4.49, light good
 * 3.55, blunder 4.12 and pending 4.23 -- measured in the running app, then
 * reproduced here to within 0.01. An earlier pass had already moved blunder
 * and pending onto `--danger` and `--text-muted` for exactly this reason and
 * landed a hair short, which is the kind of near miss only a number catches.
 */

type Rgb = { r: number; g: number; b: number; a: number }

function rgb(value: string): Rgb {
  if (value.startsWith('#')) {
    return {
      r: Number.parseInt(value.slice(1, 3), 16),
      g: Number.parseInt(value.slice(3, 5), 16),
      b: Number.parseInt(value.slice(5, 7), 16),
      a: 1,
    }
  }
  const parts = value.replace(/rgba?\(|\)/g, '').split(',').map(part => Number.parseFloat(part))
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

/** `fg` painted over `bg`, honouring `fg`'s alpha. */
function over(fg: Rgb, bg: Rgb): Rgb {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
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

const lightBlockAt = ROOT_CSS.indexOf('[data-theme="light"]')
const blocks = {
  dark: lightBlockAt >= 0 ? ROOT_CSS.slice(0, lightBlockAt) : ROOT_CSS,
  light: lightBlockAt >= 0 ? ROOT_CSS.slice(lightBlockAt) : '',
}

function token(theme: 'dark' | 'light', name: string): string {
  const match = blocks[theme].match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`--${name} is missing from the ${theme} block of index.css`)
  return match[1].trim()
}

/**
 * The rule that styles a chip, however its selector is written. `.chip-best`
 * and `.chip-excellent` share one, so the chip may be anywhere in a
 * comma-separated list -- and `[^{}]*` cannot cross a brace, which is what
 * keeps the search inside a single selector list.
 */
function chipRule(chip: string): string {
  const rule = APP_CSS.match(new RegExp(`[^{}]*\\.chip-${chip}\\b[^{}]*\\{[^}]*\\}`))
  if (!rule) throw new Error(`.chip-${chip} is not in App.css`)
  return rule[0]
}

function chipDeclaration(chip: string, property: 'background' | 'color'): string {
  const found = chipRule(chip).match(new RegExp(`(?:^|[;{])\\s*${property}:\\s*([^;]+);`))
  if (!found) throw new Error(`.chip-${chip} declares no ${property}`)
  return found[1].trim()
}

/** The `background:` a chip rule declares, read out of App.css. */
function chipTint(chip: string): Rgb {
  return rgb(chipDeclaration(chip, 'background'))
}

/** The `color:` a chip rule declares, resolved through the theme's tokens. */
function chipInk(theme: 'dark' | 'light', chip: string): Rgb {
  const declared = chipDeclaration(chip, 'color')
  const variable = declared.match(/var\(--([a-z-]+)\)/)
  return rgb(variable ? token(theme, variable[1]) : declared)
}

/**
 * What a chip sits on: its own tint over the review card, over the panel, over
 * the page. The alphas are the ones in the stylesheets; the card and panel are
 * white on light and near-black on dark, which is what `--bg-*` already says.
 */
const CARD_ALPHA = 0.76
const PANEL_ALPHA = 0.86

function chipBackground(theme: 'dark' | 'light', chip: string): Rgb {
  const base = rgb(token(theme, 'bg-base'))
  const sheet = theme === 'light' ? rgb('#ffffff') : rgb('#111319')
  const panel = over({ ...sheet, a: PANEL_ALPHA }, base)
  const card = over({ ...(theme === 'light' ? rgb('#ffffff') : rgb('#181b23')), a: CARD_ALPHA }, panel)
  return over(chipTint(chip), card)
}

/** WCAG AA for text under 18.66px. The chips are 10.7px. */
const AA_NORMAL_TEXT = 4.5

const CHIPS = ['book', 'best', 'good', 'inaccuracy', 'mistake', 'blunder', 'pending']

describe.each(['dark', 'light'] as const)('the %s review chips', (theme) => {
  it.each(CHIPS)('reads %s at AA on its own tint', (chip) => {
    const ratio = contrastRatio(chipInk(theme, chip), chipBackground(theme, chip))
    expect(ratio, `${theme} .chip-${chip} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})

describe('the grades as dots and the grades as words', () => {
  /**
   * The point of the split. A dot has a 3:1 floor and a word has 4.5, so the
   * three that could not do both got their own ink -- and the palette the
   * colour-vision work in reviewPalette.test.ts measures is left untouched.
   */
  it.each([
    ['dark', 'good'], ['dark', 'blunder'], ['dark', 'pending'],
    ['light', 'good'], ['light', 'blunder'], ['light', 'pending'],
  ] as const)('gives %s %s an ink of its own', (theme, chip) => {
    expect(token(theme, `quality-${chip}-ink`)).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('would fail on the shared token, which is why the ink exists', () => {
    // Kept as a measurement rather than a claim: if a future palette change
    // made the dot colour legible as text too, this is the test that says the
    // extra token can go.
    for (const [theme, chip] of [['dark', 'blunder'], ['light', 'good'], ['light', 'pending']] as const) {
      const shared = rgb(token(theme, `quality-${chip}`))
      const ratio = contrastRatio(shared, chipBackground(theme, chip))
      expect(ratio, `${theme} --quality-${chip} as chip text is ${ratio.toFixed(2)}:1`)
        .toBeLessThan(AA_NORMAL_TEXT)
    }
  })
})
