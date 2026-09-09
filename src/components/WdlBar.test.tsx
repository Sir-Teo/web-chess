import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WdlBar } from './WdlBar'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('WdlBar', () => {
  it('labels a score-only reading without a draw figure', () => {
    const markup = renderToStaticMarkup(<WdlBar fen={START} evaluation={{ cp: 0 }} orientation="white" />)
    expect(markup).toContain('Win chances: White 50.0%, Black 50.0%')
    expect(markup).not.toContain('Draw')
  })

  it('shows an even split until there is a reading', () => {
    const markup = renderToStaticMarkup(<WdlBar fen={START} orientation="white" />)
    expect(markup).toContain('Draw 33.4%')
  })

  /** The heights the bar is actually drawn at, in source order. */
  const heights = (markup: string) => [...markup.matchAll(/height:([\d.]+)%/g)].map(m => Number(m[1]))

  /**
   * The bar's boundary is the score's winning chances; the draws are a band
   * over it. Drawn as a third share, an opening reading of `wdl 83 912 5` gave
   * White 8% of the bar under a label saying "53% for White".
   */
  it('puts the boundary at the winning chances, not at the split', () => {
    const markup = renderToStaticMarkup(
      <WdlBar fen={START} evaluation={{ cp: 37, wdl: { w: 83, d: 912, l: 5 } }} orientation="white" />,
    )
    const [top, bottom, band] = heights(markup)
    // White is the bottom share unflipped, and it has rather more than 8%.
    expect(bottom).toBeGreaterThan(50)
    expect(top + bottom).toBeCloseTo(100, 6)
    expect(band).toBeCloseTo(91.2, 6)
    // The label still reports what the engine said, all three of them.
    expect(markup).toContain('White 8.3%, Draw 91.2%, Black 0.5%')
  })

  /** The band straddles the boundary: White's share, then the draws. */
  it('offsets the band from Whites end of the bar, whichever end that is', () => {
    const evaluation = { cp: 37, wdl: { w: 83, d: 912, l: 5 } }
    const white = renderToStaticMarkup(<WdlBar fen={START} evaluation={evaluation} orientation="white" />)
    const black = renderToStaticMarkup(<WdlBar fen={START} evaluation={evaluation} orientation="black" />)
    expect(white).toContain('bottom:8.3%')
    expect(black).toContain('top:8.3%')
    expect(black).toContain('is-flipped')
    expect(white).not.toContain('is-flipped')
  })

  /** No draws to show, no band to draw. */
  it('leaves the band out of a score-only reading', () => {
    const markup = renderToStaticMarkup(<WdlBar fen={START} evaluation={{ cp: 37 }} orientation="white" />)
    expect(markup).not.toContain('wdl-draw')
    expect(heights(markup)).toHaveLength(2)
  })
})
