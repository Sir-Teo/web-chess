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
})
