import { describe, expect, it } from 'vitest'
// The stylesheet the app ships, not a copy of the values kept in step by hand.
import CSS from '../App.css?raw'

/**
 * The edges of the three strips that scroll sideways on a phone: the board
 * actions and the mode groups in the top bar, and the readings in the board's
 * own strip. All three hold their items at their natural width and let the row
 * run past the end rather than squeezing anything, so all three need an edge
 * that says the row goes on.
 *
 * Three things have to stay true, and none of them is visible in a diff:
 *
 * - the leading edge fades once the row has been pushed off its start, and the
 *   trailing one stops fading once the end is on the screen. What was there
 *   before faded the trailing edge and nothing else, always, which is wrong at
 *   both ends of the scroll at once;
 * - a strip whose items all fit fades neither edge, which is what the declared
 *   values give when there is no timeline to run;
 * - and a browser with no scroll timelines gets exactly what this used to
 *   draw, rather than nothing.
 */

function block(selector: string): string {
  const start = CSS.indexOf(selector)
  expect(start, `${selector} is not in the stylesheet`).toBeGreaterThanOrEqual(0)
  return CSS.slice(start, CSS.indexOf('}', start))
}

/**
 * All three strips are styled by one rule. Found by the declaration only this
 * rule carries, so adding a fourth strip to the selector list does not break
 * the test that guards the other three -- the list itself is asserted below.
 */
const EDGE_RULE_MARK = '--edge-w: 1.25rem'

/** Every strip that wears these edges. Named so a new one has to be added here. */
const STRIPS = ['.top .mobile-modes-wrapper', '.top .mobile-actions', '.board-meta-flow']

function edgeRule(): string {
  const mark = CSS.indexOf(EDGE_RULE_MARK)
  expect(mark, 'the shared edge rule is gone').toBeGreaterThanOrEqual(0)
  const open = CSS.lastIndexOf('{', mark)
  return CSS.slice(CSS.lastIndexOf('}', open) + 1, CSS.indexOf('}', mark))
}

describe('the fading edges of a sideways strip', () => {
  /** A strip that scrolls sideways and is not in the list gets no edges. */
  it('paints every strip that scrolls sideways', () => {
    const rule = edgeRule()
    for (const strip of STRIPS) expect(rule, strip).toContain(strip)
    const supports = CSS.indexOf('@supports (animation-timeline: scroll())')
    const inside = CSS.slice(supports, CSS.indexOf('\n  }', supports))
    for (const strip of STRIPS) expect(inside, strip).toContain(strip)
  })

  it('drives both edges from the scroll position, not from a timer', () => {
    const supports = CSS.indexOf('@supports (animation-timeline: scroll())')
    expect(supports, 'the scroll-timeline block is gone').toBeGreaterThanOrEqual(0)
    const inside = CSS.slice(supports, CSS.indexOf('\n  }', supports))
    expect(inside).toContain('scroll(self inline)')
    expect(inside).toContain('edge-lead-in')
    expect(inside).toContain('edge-trail-out')
    // One range for each edge: the first 1.25rem of the scroll, and the last.
    expect(inside).toContain('animation-range: 0 1.25rem, calc(100% - 1.25rem) 100%')
  })

  /** 0 is a crisp edge and 1 is a faded one, at both ends. */
  it('fades the leading edge in and the trailing edge out', () => {
    expect(block('@keyframes edge-lead-in')).toContain('--edge-lead: 0')
    expect(CSS.slice(CSS.indexOf('@keyframes edge-lead-in'))).toMatch(/--edge-lead: 0;[\s\S]*?--edge-lead: 1;/)
    expect(CSS.slice(CSS.indexOf('@keyframes edge-trail-out'))).toMatch(/--edge-trail: 1;[\s\S]*?--edge-trail: 0;/)
  })

  /**
   * The mask has to read both numbers, or one of the two edges is decorative.
   * `1 - value`, because the number is how faded the edge is and the mask stop
   * is how opaque it is.
   */
  it('reads both edges in the mask it paints', () => {
    const rule = edgeRule()
    for (const property of ['mask-image', '-webkit-mask-image']) {
      const declaration = rule.slice(rule.indexOf(`${property}:`))
      expect(declaration, property).toContain('calc(1 - var(--edge-lead))')
      expect(declaration, property).toContain('calc(1 - var(--edge-trail))')
    }
  })

  /**
   * What a browser with no scroll timelines is left holding, and it is the
   * static trailing fade this used to draw unconditionally -- so nothing is
   * lost there, and the edges only start moving where something can move them.
   */
  it('falls back to the fade it replaced', () => {
    const rule = edgeRule()
    expect(rule).toContain('--edge-lead: 0')
    expect(rule).toContain('--edge-trail: 1')
  })

  /**
   * And where the timeline exists but has no scrolling to report -- a strip
   * whose items all fit -- the animations contribute nothing and this is what
   * shows. Neither edge, which is the answer the old fade got wrong.
   */
  it('fades neither edge on a strip with nothing to scroll to', () => {
    const supports = CSS.indexOf('@supports (animation-timeline: scroll())')
    const inside = CSS.slice(supports, CSS.indexOf('\n  }', supports))
    expect(inside).toContain('--edge-trail: 0')
    expect(inside).not.toContain('--edge-lead: 1')
  })

  /** Registered, or they are strings the mask cannot interpolate. */
  it('registers both edges as numbers', () => {
    for (const name of ['--edge-lead', '--edge-trail']) {
      const rule = block(`@property ${name}`)
      expect(rule, name).toContain('syntax: "<number>"')
      expect(rule, name).toContain('inherits: false')
    }
  })
})
