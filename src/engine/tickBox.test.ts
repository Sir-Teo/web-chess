import { describe, expect, it } from 'vitest'
// The stylesheet the app ships, not a copy of the values kept in step by hand.
import CSS from '../App.css?raw'

/**
 * A tick box is a square, and it grows with the reader's text.
 *
 * Both went wrong the same way and neither is visible in a diff. Outside the
 * phone's media query the box had no size at all, so a desktop drew the user
 * agent's 13px at 100% text and the same 13px at 200%. Inside it, only one axis
 * was given: a checkbox is a flex item beside a label that wraps, `width` is a
 * hint a flex item gives up, and the five boxes in Settings measured 23x42,
 * 26x42, 42x42, 42x42 and 20x42 at 200% text on a 375px phone -- a different
 * rectangle on every row, decided by how many lines the label beside it took.
 *
 * So what is pinned here is the pair of properties that make it square at any
 * text size, in both breakpoints: the two axes named from one length, and a
 * `flex` that cannot give either of them up.
 */

/** Every rule in the sheet whose selector is exactly this. */
function rulesFor(selector: string): string[] {
  const found: string[] = []
  let at = 0
  for (;;) {
    const start = CSS.indexOf(selector, at)
    if (start < 0) break
    at = start + selector.length
    // The selector itself, not a longer one that ends with it.
    const before = CSS[start - 1] ?? '\n'
    const after = CSS.slice(at).match(/^\s*\{/)
    if (!/[\s{,]|^$/.test(before) || !after) continue
    const open = CSS.indexOf('{', at)
    found.push(CSS.slice(open + 1, CSS.indexOf('}', open)))
  }
  return found
}

function lengthOf(rule: string, property: string): string | null {
  const match = rule.match(new RegExp(`(?:^|;|\\n)\\s*${property}\\s*:\\s*([^;]+)`))
  return match ? match[1].trim() : null
}

describe('the tick box', () => {
  const rules = rulesFor('input[type="checkbox"]')

  /** One for every reader, one for the phone. */
  it('is sized in both breakpoints', () => {
    expect(rules.length, 'the checkbox rules are gone').toBeGreaterThanOrEqual(2)
  })

  it('is a square at whatever size it is drawn', () => {
    for (const rule of rules) {
      const width = lengthOf(rule, 'width')
      const height = lengthOf(rule, 'height')
      expect(width, `a checkbox rule sets no width: ${rule.trim()}`).toBeTruthy()
      expect(height, `a checkbox rule sets no height: ${rule.trim()}`).toBe(width)
    }
  })

  /** rem, so the reader's text size carries it, like the board. */
  it('is measured in units the reader sets', () => {
    for (const rule of rules) {
      expect(lengthOf(rule, 'width')).toMatch(/rem$/)
    }
  })

  /**
   * And cannot be squeezed out of shape by the label beside it. Declared once,
   * on the rule that applies everywhere, so the phone's override inherits it.
   */
  it('refuses to shrink beside a label that wraps', () => {
    const everywhere = rules.filter(rule => lengthOf(rule, 'flex'))
    expect(everywhere.length, 'no checkbox rule fixes its flex').toBeGreaterThanOrEqual(1)
    for (const rule of everywhere) expect(lengthOf(rule, 'flex')).toBe('none')
  })

  /** The phone's is the larger of the two: it is aimed at a finger. */
  it('is bigger on a phone', () => {
    const sizes = rules.map(rule => Number.parseFloat(lengthOf(rule, 'width') ?? '0'))
    expect(Math.max(...sizes)).toBeGreaterThan(Math.min(...sizes))
  })
})
