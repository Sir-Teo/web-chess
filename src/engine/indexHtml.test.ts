import { describe, expect, it } from 'vitest'
import { deferStylesheets } from './indexHtml'

const LINK = '<link rel="stylesheet" crossorigin href="/web-chess/assets/index-abc.css">'

describe('deferStylesheets', () => {
  it('stops the sheet holding up the first paint, and still loads it', () => {
    const out = deferStylesheets(`<head>${LINK}</head>`)
    expect(out).toContain('media="print"')
    expect(out).toContain(`onload="this.media='all'"`)
    expect(out).toContain('/web-chess/assets/index-abc.css')
  })

  /**
   * Without this a reader whose browser never fires the `onload` -- scripting
   * off, an extension that strips inline handlers -- gets the page with no
   * stylesheet at all, which is worse than the blocking link it replaced.
   */
  it('leaves a copy that needs no script', () => {
    const out = deferStylesheets(`<head>${LINK}</head>`)
    const noscript = out.match(/<noscript>([\s\S]*?)<\/noscript>/)
    expect(noscript, 'no <noscript> fallback').toBeTruthy()
    expect(noscript![1]).toContain('rel="stylesheet"')
    expect(noscript![1]).not.toContain('media="print"')
  })

  it('carries every attribute over, so the href and crossorigin survive', () => {
    const out = deferStylesheets(`<head>${LINK}</head>`)
    expect(out.match(/crossorigin/g)?.length).toBe(2)
  })

  it('handles more than one sheet', () => {
    const second = '<link rel="stylesheet" href="/web-chess/assets/other.css">'
    const out = deferStylesheets(`<head>${LINK}${second}</head>`)
    expect(out.match(/media="print"/g)?.length).toBe(2)
    expect(out.match(/<noscript>/g)?.length).toBe(2)
  })

  it('leaves a page with no stylesheet alone', () => {
    const html = '<head><link rel="icon" href="icon.svg"></head>'
    expect(deferStylesheets(html)).toBe(html)
  })

  /** A preload or a modulepreload is not a stylesheet and must not be touched. */
  it('does not touch the other links in the head', () => {
    const html = '<head><link rel="modulepreload" crossorigin href="/a.js"><link rel="manifest" href="m.json"></head>'
    expect(deferStylesheets(html)).toBe(html)
  })
})
