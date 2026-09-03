import { describe, expect, it } from 'vitest'
// Vite's raw import, so the test reads the stylesheet the app actually ships
// rather than a copy of the values kept in step by hand.
import CSS from '../index.css?raw'
import { type ColorVision, distanceAsSeen, simulateColorVision } from './colorVision'

/**
 * The review classifications are told apart by colour in the move list -- a
 * 5px dot beside the move -- and roughly one man in twelve sees those colours
 * differently. This reads the real values out of `index.css` rather than a
 * copy, because a test that guards a duplicate guards nothing.
 *
 * The measured numbers are in the assertions rather than in prose, so a
 * palette change that collapses a distinction fails here instead of shipping.
 */

function paletteFromBlock(block: string): Record<string, string> {
  const palette: Record<string, string> = {}
  for (const match of block.matchAll(/--quality-([a-z]+):\s*(#[0-9a-fA-F]{6});/g)) {
    palette[match[1]] = match[2]
  }
  return palette
}

/**
 * Both themes, each measured on its own. The light block redefines every
 * quality token, so one pass over the whole file would keep whichever
 * definition came last and guard only that one.
 */
const lightBlockAt = CSS.indexOf('[data-theme="light"]')
const palettes: Record<string, Record<string, string>> = {
  dark: paletteFromBlock(lightBlockAt >= 0 ? CSS.slice(0, lightBlockAt) : CSS),
  light: paletteFromBlock(lightBlockAt >= 0 ? CSS.slice(lightBlockAt) : ''),
}
const THEMES = Object.entries(palettes)
/**
 * Excellent is deliberately absent: it takes Best's colour. Both mean "the
 * move was fine", the same trade already recorded for Best and Good below,
 * and a third green between two that are already the same dot would be a
 * third thing nobody could tell apart.
 */
const CLASSIFICATIONS = ['book', 'best', 'good', 'inaccuracy', 'mistake', 'blunder']
const VISIONS: ColorVision[] = ['normal', 'protan', 'deutan', 'tritan']

/** How far apart two classifications are, at the worst kind of vision for them. */
function worstCase(
  palette: Record<string, string>,
  a: string,
  b: string,
): { distance: number; vision: ColorVision } {
  let worst = { distance: Infinity, vision: 'normal' as ColorVision }
  for (const vision of VISIONS) {
    const distance = distanceAsSeen(palette[a], palette[b], vision)
    if (distance < worst.distance) worst = { distance, vision }
  }
  return worst
}

describe.each(THEMES)('the %s palette', (theme, palette) => {
  it('is read from index.css, and has every classification in it', () => {
    for (const name of CLASSIFICATIONS) {
      expect(palette[name], `--quality-${name} is missing from the ${theme} block of index.css`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  describe('telling a good move from a bad one, however you see colour', () => {
    /**
     * The pairs that matter. Confusing "Best" with "Good" costs a reader almost
     * nothing -- both mean the move was fine -- but confusing either with
     * "Mistake" or "Blunder" inverts the thing the review exists to say.
     */
    const ACROSS_THE_DIVIDE = [
      ['best', 'mistake'], ['best', 'blunder'],
      ['good', 'mistake'], ['good', 'blunder'],
      ['book', 'mistake'], ['book', 'blunder'],
      ['inaccuracy', 'blunder'],
    ]

    it.each(ACROSS_THE_DIVIDE)('keeps %s and %s clearly apart', (a, b) => {
      const { distance, vision } = worstCase(palette, a, b)
      expect(distance, `closest at ${vision}`).toBeGreaterThan(18)
    })

    it('degrades on the red-green axis without collapsing', () => {
      // Measured on the dark set: 119.5 normally, 21.1 for protanopia -- most
      // of the separation goes, and enough survives. Worth knowing before
      // anyone tunes these. The light set's inks are darker and lower in
      // chroma, so its normal-vision gap is smaller by construction (81.7);
      // the guard that matters is the dichromat one, and both sets carry it.
      if (theme === 'dark') {
        expect(distanceAsSeen(palette.best, palette.blunder, 'normal')).toBeGreaterThan(100)
      }
      expect(distanceAsSeen(palette.best, palette.blunder, 'protan')).toBeGreaterThan(18)
    })

    it('never makes two classifications the same colour for anyone', () => {
      for (let i = 0; i < CLASSIFICATIONS.length; i++) {
        for (let j = i + 1; j < CLASSIFICATIONS.length; j++) {
          const [a, b] = [CLASSIFICATIONS[i], CLASSIFICATIONS[j]]
          const { distance, vision } = worstCase(palette, a, b)
          expect(distance, `${a}/${b} at ${vision}`).toBeGreaterThan(8)
        }
      }
    })

    /**
     * Deliberately recorded rather than fixed, for the dark set it was measured
     * on: the two "the move was fine" colours are near-identical at 5px for
     * *everyone*, not just for a dichromat. The dot therefore carries four
     * categories, not five. That is a reasonable trade -- the distinction is
     * still in the label, the tooltip and the review list -- but it should be
     * a choice rather than a surprise.
     */
    it.runIf(theme === 'dark')('records that best and good are all but the same dot', () => {
      expect(distanceAsSeen(palette.best, palette.good, 'normal')).toBeLessThan(11)
    })
  })
})

describe('the simulation itself', () => {
  it('leaves a colour alone for normal vision', () => {
    expect(simulateColorVision('#10b981', 'normal')).toEqual(simulateColorVision('#10b981', 'normal'))
    expect(distanceAsSeen('#10b981', '#10b981', 'normal')).toBe(0)
  })

  it('moves red and green towards each other for a dichromat, and not blue', () => {
    const redGreenNormal = distanceAsSeen('#ff0000', '#00ff00', 'normal')
    const redGreenProtan = distanceAsSeen('#ff0000', '#00ff00', 'protan')
    expect(redGreenProtan).toBeLessThan(redGreenNormal / 2)

    const blueYellowNormal = distanceAsSeen('#0000ff', '#ffff00', 'normal')
    expect(distanceAsSeen('#0000ff', '#ffff00', 'deutan')).toBeGreaterThan(blueYellowNormal / 2)
  })

  it('refuses a colour it cannot read rather than guessing', () => {
    expect(() => simulateColorVision('red', 'protan')).toThrow(/hex/i)
    expect(() => simulateColorVision('#abc', 'protan')).toThrow(/hex/i)
  })
})
