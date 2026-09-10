import { describe, expect, it } from 'vitest'
// The stylesheets the app ships, not a copy of the values kept in step by hand.
import APP_CSS from '../App.css?raw'
import INDEX_CSS from '../index.css?raw'
import COMMAND_PALETTE_CSS from '../components/CommandPaletteDialog.css?raw'
import LIBRARY_CSS from '../components/LibraryDialog.css?raw'
import NEW_GAME_CSS from '../components/NewGameDialog.css?raw'
// The boot skeleton is styled in the document, so its heights are in here too.
import INDEX_HTML from '../../index.html?raw'

/**
 * Every height in this app is a share of the screen a reader can see.
 *
 * `vh` is the *large* viewport: the height a phone browser has once its chrome
 * has retracted. While the URL bar is up -- 60 to 115px of an iOS Safari
 * screen -- a box sized in `vh` is bigger than the window it is sized against,
 * and what that costs depends on the box:
 *
 *   `.app-shell` is `overflow: hidden`, so its last band was simply gone.
 *   **Measured** at 390x844 on the production build: the whole
 *   move-navigation row, "Go to first position" through "Autoplay the moves",
 *   sat at y=762..802 with no scrollable ancestor. Nothing could scroll it
 *   back, and nothing on the page scrolls the root either, so the bar covering
 *   it never retracted.
 *
 *   The overlays scroll, so nothing there is unreachable -- but the share is
 *   wrong, and a share is the whole point of the rule. The phone's settings
 *   sheet asks for 85% of the screen: 0.85 x 844 = 717px, against 729px of
 *   visible screen, is **98%**. The strip of app it means to leave showing --
 *   the thing that says this is a sheet over the board and not a new page --
 *   was 12px instead of 127px. The backdrop dimming that sheet already
 *   measured itself with `100dvh`, in the rule directly above it.
 *
 * A desktop browser cannot see any of this: where there is no retractable
 * chrome, `vh` and `dvh` are the same number, which is why four layout passes
 * measured this app at a dozen sizes and none of them found it. So the guard
 * is on the unit in the source rather than on a laid-out page.
 *
 * The idiom is a pair -- the `vh` line first, as the fallback for a browser
 * with no `dvh`, then the `dvh` line that wins. This sweeps for the first
 * without the second, so a height added later in `vh` alone fails here.
 */

const SHEETS: ReadonlyArray<readonly [string, string]> = [
  ['App.css', APP_CSS],
  ['index.css', INDEX_CSS],
  ['CommandPaletteDialog.css', COMMAND_PALETTE_CSS],
  ['LibraryDialog.css', LIBRARY_CSS],
  ['NewGameDialog.css', NEW_GAME_CSS],
  ['index.html', INDEX_HTML],
]

type Declaration = { sheet: string; line: number; property: string; text: string }

/**
 * The sheet with its comments blanked, line numbering intact.
 *
 * Prose about `vh` is not a declaration in `vh`, and this file's own rules are
 * commented in exactly those words.
 */
function code(css: string): string[] {
  return css.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' ')).split('\n')
}

/**
 * A length in `vh`.
 *
 * `\bvh\b` looks right and matches nothing: in `72vh` the digit and the `v`
 * are both word characters, so there is no boundary between them. The digit is
 * what has to be matched, and matching it is also what keeps `72dvh` out.
 */
const STATIC_VH = /\d\s*vh\b/
const DYNAMIC_VH = /\d\s*dvh\b/
const HEIGHT = /(^|[\s;{])(max-height|min-height|height)\s*:\s*([^;}]+)/

/** Every height declaration measured in `vh`, wherever it is nested. */
function staticViewportHeights(sheet: string, css: string): Declaration[] {
  const found: Declaration[] = []
  code(css).forEach((text, index) => {
    const match = text.match(HEIGHT)
    if (match && STATIC_VH.test(match[3])) {
      found.push({ sheet, line: index + 1, property: match[2], text: text.trim() })
    }
  })
  return found
}

/** Whether a `dvh` line for the same property follows, as the fallback idiom asks. */
function dynamicPartner(css: string, declaration: Declaration): string | null {
  const lines = code(css)
  for (let i = declaration.line; i < Math.min(declaration.line + 2, lines.length); i++) {
    const match = lines[i].match(HEIGHT)
    if (match && match[2] === declaration.property && DYNAMIC_VH.test(match[3])) return lines[i].trim()
  }
  return null
}

/**
 * The same mistake, one axis over.
 *
 * `100vw` is the viewport *including* a classic scrollbar, so a box told to be
 * that wide is a few pixels wider than the room it has, and the page overflows
 * sideways by exactly that much. **Measured** under mobile emulation at 320px
 * wide before the fix: `documentElement.clientWidth` 320 against a
 * `window.innerWidth` of 325, and 5px of horizontal scroll on a layout that has
 * none at any other size. `100%` is the room there is -- and for a fixed
 * element it is the initial containing block, which is the same thing.
 */
function widthsInViewportUnits(sheet: string, css: string): Declaration[] {
  const found: Declaration[] = []
  code(css).forEach((text, index) => {
    const match = text.match(/(^|[\s;{])(max-width|min-width|width)\s*:\s*([^;}]+)/)
    if (match && /\d\s*vw\b/.test(match[3])) {
      found.push({ sheet, line: index + 1, property: match[2], text: text.trim() })
    }
  })
  return found
}

describe('widths are measured against the room there is', () => {
  it('uses no viewport width unit anywhere', () => {
    const offenders = SHEETS.flatMap(([name, css]) => widthsInViewportUnits(name, css))
      .map(d => `${d.sheet}:${d.line}  ${d.text}`)
    expect(offenders, `these widths include a scrollbar that is not there:\n${offenders.join('\n')}`)
      .toEqual([])
  })

  it('still finds the sheets it means to sweep', () => {
    // The probe before the assertion: the sweep above passes trivially if the
    // stylesheets never arrived.
    expect(SHEETS.every(([, css]) => css.length > 100)).toBe(true)
    expect(SHEETS).toHaveLength(6)
  })
})

describe('viewport heights are measured against the visible screen', () => {
  it('finds the declarations it means to check', () => {
    // The probe before the assertion: a sweep that matched nothing would let
    // every case below pass without reading a single declaration.
    const all = SHEETS.flatMap(([name, css]) => staticViewportHeights(name, css))
    expect(all.length).toBeGreaterThanOrEqual(12)
    expect(new Set(all.map(d => d.sheet)).size).toBe(SHEETS.length)
  })

  it.each(SHEETS)('%s pairs every vh height with a dvh line', (name, css) => {
    const unpaired = staticViewportHeights(name, css)
      .filter(declaration => dynamicPartner(css, declaration) === null)
      .map(declaration => `${name}:${declaration.line}  ${declaration.text}`)

    expect(unpaired, `these heights are measured against the retracted viewport:\n${unpaired.join('\n')}`)
      .toEqual([])
  })

  it('keeps the plain vh line first, so a browser without dvh still has one', () => {
    for (const [name, css] of SHEETS) {
      for (const declaration of staticViewportHeights(name, css)) {
        const partner = dynamicPartner(css, declaration)
        expect(partner, `${name}:${declaration.line}`).not.toBeNull()
        // The fallback is the line before; a lone `dvh` would strand an older browser.
        expect(declaration.text).toMatch(STATIC_VH)
      }
    }
  })
})
