import { describe, expect, it } from 'vitest'
// The files the app ships, not a copy of them kept in step by hand.
import HTML from '../../index.html?raw'
import MAIN from '../main.tsx?raw'

/**
 * Something is on the screen before the JavaScript arrives.
 *
 * **Measured** on the production build at 390x844, cold cache, 4x CPU: first
 * contentful paint at 1651ms behind a 4G connection and 5446ms behind a 3G
 * one, and every millisecond of it a blank screen -- no brand, no shape, no
 * sign that anything is happening. Nothing could paint sooner because the only
 * thing in the body was an empty `#root`: the first content in this app is
 * drawn by React, and React is at the end of 214kB of stylesheet and script.
 *
 * A board-shaped placeholder styled from a `<style>` in the head paints as
 * soon as the render-blocking stylesheet lands, which is 764ms behind 4G and
 * 2522ms behind 3G. Measured after: **956ms** and **2688ms**. What is left is
 * the stylesheet's own arrival, and that floor is deliberate -- making the
 * sheet non-blocking would trade this for the app itself flashing unstyled.
 *
 * Two things hold it up, and both are pinned here because breaking either
 * leaves no error anywhere:
 *
 *   The markup is inside `#root`. `createRoot` replaces everything in its
 *   container on the first render, which is the whole reason this needs no
 *   script to clear it. Moved one level out, it would sit over the app
 *   forever.
 *
 *   The styles are inline in the document. In a linked file they would arrive
 *   with the stylesheet they exist to pre-empt, and buy nothing at all.
 */

const head = HTML.slice(0, HTML.indexOf('</head>'))
const body = HTML.slice(HTML.indexOf('<body'))

describe('the boot skeleton', () => {
  it('is inside the element React mounts into', () => {
    const root = body.match(/<div id="root">([\s\S]*?)<\/div>\s*(?:<script|<\/body>)/)
    expect(root, 'the #root element should hold the skeleton').not.toBeNull()
    expect(root![1]).toMatch(/class="boot"/)
    // The other half of the pair: React clears this container, so the skeleton
    // needs no teardown. If the mount point moves, the skeleton is stranded.
    expect(MAIN).toMatch(/createRoot\(\s*document\.getElementById\('root'\)!?\s*\)/)
  })

  it('is styled from the document, not from the stylesheet it pre-empts', () => {
    const inlineStyle = head.match(/<style>([\s\S]*?)<\/style>/)
    expect(inlineStyle, 'the skeleton needs a <style> in the head').not.toBeNull()
    for (const rule of ['.boot', '.boot-board', '.boot-name']) {
      expect(inlineStyle![1]).toContain(rule)
    }
    // Ahead of the stylesheet link, so nothing in the sheet can win by order.
    const styleAt = head.indexOf('<style>')
    const linkAt = head.indexOf('rel="stylesheet"')
    if (linkAt >= 0) expect(styleAt).toBeLessThan(linkAt)
  })

  it('waits long enough not to flash over a warm cache', () => {
    // A warm cache paints the real board in about 110ms, so the fade must not
    // start before then; and every millisecond of delay is taken off the far
    // end, where the wait is, so it must not be generous either.
    const delay = HTML.match(/animation:\s*boot-in\s+[\d.]+m?s\s+\S+\s+([\d.]+)s/)
    expect(delay, 'boot-in should carry an explicit delay').not.toBeNull()
    const seconds = Number(delay![1])
    expect(seconds).toBeGreaterThanOrEqual(0.12)
    expect(seconds).toBeLessThanOrEqual(0.2)
    // `forwards`, or it fades in and then vanishes again while still waiting.
    expect(HTML).toMatch(/animation:\s*boot-in[^;]*forwards/)
  })

  it('says nothing to a screen reader, which has no use for a placeholder', () => {
    expect(body).toMatch(/<div class="boot" aria-hidden="true">/)
  })

  it('drops its pulse for a reader who asked for less motion', () => {
    expect(head).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.boot-name\s*\{\s*animation:\s*none/)
  })
})
