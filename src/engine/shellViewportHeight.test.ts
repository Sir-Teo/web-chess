import { describe, expect, it } from 'vitest'
// The stylesheets the app ships, not a copy of the values kept in step by hand.
import APP_CSS from '../App.css?raw'
import INDEX_CSS from '../index.css?raw'

/**
 * The shell is as tall as the reader can see, not as tall as the chrome would
 * leave if it went away.
 *
 * `100vh` is the *large* viewport: the height a phone browser has once its URL
 * bar has retracted. While that bar is up -- which on iOS Safari is 60 to
 * 115px of the screen -- a shell sized in `vh` is taller than the window, and
 * this one is `overflow: hidden`, so its last band is simply gone. Measured at
 * 390x844 on the production build: the whole move-navigation row, "Go to first
 * position" through "Autoplay the moves", sits at y=762..802 with no
 * scrollable ancestor. Nothing can bring it back, and nothing on the page
 * scrolls the root either, so the bar that is covering it never retracts.
 *
 * Four layout passes measured this app in a desktop browser and none could see
 * it: where there is no retractable chrome, `vh` and `dvh` are the same number.
 * That is why the guard is on the unit rather than on a laid-out page.
 *
 * A `vh` line *before* the `dvh` one is the fallback for a browser that has no
 * `dvh`, so what is pinned here is the declaration that wins.
 */

/** Every declaration block in `css` whose selector is exactly `selector`. */
function rulesFor(css: string, selector: string): string[] {
  const found: string[] = []
  let at = 0
  for (;;) {
    const start = css.indexOf(selector, at)
    if (start < 0) break
    at = start + selector.length
    // The selector itself, not a longer one that happens to end with it.
    const before = css[start - 1] ?? '\n'
    if (!/[\s{,]/.test(before)) continue
    if (!/^\s*[,{]/.test(css.slice(at))) continue
    const open = css.indexOf('{', at)
    if (open < 0) break
    found.push(css.slice(open + 1, css.indexOf('}', open)))
  }
  return found
}

/** The last value given for `property` -- the one the browser uses. */
function winningValue(rule: string, property: string): string | null {
  const matches = [...rule.matchAll(new RegExp(`(?:^|;|\\n)\\s*${property}\\s*:\\s*([^;}]+)`, 'g'))]
  return matches.length ? matches[matches.length - 1][1].trim() : null
}

describe('the app shell is sized by the viewport a reader can see', () => {
  it('finds the rules it means to check', () => {
    // The probe before the assertion: a selector that matched nothing would
    // let every case below pass without reading a single declaration.
    expect(rulesFor(APP_CSS, '.app-shell').length).toBeGreaterThanOrEqual(2)
    expect(rulesFor(INDEX_CSS, '.app-error-shell')).toHaveLength(1)
  })

  it('gives .app-shell a dynamic height in every breakpoint that sets one', () => {
    const sized = rulesFor(APP_CSS, '.app-shell')
      .map(rule => winningValue(rule, 'height'))
      .filter((value): value is string => value !== null)

    expect(sized.length).toBeGreaterThanOrEqual(2)
    for (const value of sized) {
      expect(value, `.app-shell height resolves to "${value}"`).toMatch(/dvh/)
    }
  })

  it('keeps a plain vh fallback ahead of it for a browser without dvh', () => {
    for (const rule of rulesFor(APP_CSS, '.app-shell')) {
      if (!/height\s*:/.test(rule)) continue
      const declarations = [...rule.matchAll(/(?:^|;|\n)\s*height\s*:\s*([^;}]+)/g)].map(m => m[1].trim())
      if (declarations.length < 2) continue
      expect(declarations[declarations.length - 2]).toMatch(/vh\b/)
    }
  })

  it('sizes the error shell the same way', () => {
    const [rule] = rulesFor(INDEX_CSS, '.app-error-shell')
    expect(winningValue(rule, 'min-height')).toMatch(/dvh/)
  })
})
