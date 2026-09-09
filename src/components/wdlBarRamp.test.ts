import { describe, expect, it } from 'vitest'
// The stylesheet the app ships, not a copy of the values kept in step by hand.
import HORIZONTAL_CSS from './HorizontalWdlBar.css?raw'
import { relativeLuminance } from '../engine/boardThemes'

/**
 * Which way the draw band ramps in the horizontal bar.
 *
 * This bar really is three shares laid end to end — it is the WDL reading
 * under a candidate line, not an evaluation bar — so the middle share is a
 * gradient between the two either side of it. Ramped against the bar it puts
 * its darkest slate against White's white and its lightest against Black's,
 * which reads as two boundaries in the wrong places.
 *
 * The vertical bar solved the same problem differently, by not making the
 * draws a share at all; see `WdlBar.css`.
 */

const HEX = /#[0-9a-fA-F]{6}/g

/** The gradient stops of one rule's `background`, in source order. */
function rampFor(selector: string): string[] {
  const start = HORIZONTAL_CSS.indexOf(selector)
  expect(start, `${selector} is not in the stylesheet`).toBeGreaterThanOrEqual(0)
  const block = HORIZONTAL_CSS.slice(start, HORIZONTAL_CSS.indexOf('}', start))
  const background = block.match(/background:\s*linear-gradient\(([^)]*)\)/)
  expect(background, `${selector} has no linear-gradient background`).toBeTruthy()
  return background![1].match(HEX) ?? []
}

/** Light to dark, or dark to light, along the axis the rule is written on. */
function ramp(selector: string): 'lightens' | 'darkens' {
  const stops = rampFor(selector)
  expect(stops.length, selector).toBe(2)
  return relativeLuminance(stops[1]) > relativeLuminance(stops[0]) ? 'lightens' : 'darkens'
}

describe('the horizontal draw band ramps the way its bar does', () => {
  /** Unflipped: White on the left, so the band has to darken rightward. */
  it('runs toward White whichever way the board faces', () => {
    expect(ramp('.hw-draw {')).toBe('darkens')
    expect(ramp('.horizontal-wdl-bar.is-flipped .hw-draw {')).toBe('lightens')
  })

  /**
   * A ramp's ends sit nearer their neighbours than a fixed pair would, so each
   * boundary carries its own hairline rather than leaning on the fill colours.
   */
  it('gives each end of the band an edge of its own', () => {
    for (const selector of ['.hw-draw {', '.horizontal-wdl-bar.is-flipped .hw-draw {']) {
      const start = HORIZONTAL_CSS.indexOf(selector)
      const block = HORIZONTAL_CSS.slice(start, HORIZONTAL_CSS.indexOf('}', start))
      expect(block, selector).toContain('inset')
      // One dark edge and one light one: the band divides a dark share from a
      // light one, so a single colour cannot separate both ends.
      expect(block, selector).toContain('rgba(0, 0, 0,')
      expect(block, selector).toContain('rgba(255, 255, 255,')
    }
  })

  /** The band stays between the two shares it divides, never outside them. */
  it('keeps the band between the two shares it divides', () => {
    const white = relativeLuminance('#e2e8f0')
    const black = relativeLuminance('#334155')
    for (const stop of rampFor('.hw-draw {')) {
      expect(relativeLuminance(stop), stop).toBeLessThan(white)
      expect(relativeLuminance(stop), stop).toBeGreaterThan(black)
    }
  })
})
