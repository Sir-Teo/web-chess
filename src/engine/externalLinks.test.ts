import { describe, expect, it } from 'vitest'
import { chessComPositionUrl, lichessAnalysisUrl, lichessGameUrl, lichessPositionUrl } from './externalLinks'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

describe('a Lichess link to a position', () => {
  it('writes the FEN the way Lichess writes its own, with underscores for spaces', () => {
    expect(lichessPositionUrl(AFTER_E4))
      .toBe('https://lichess.org/analysis/standard/rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR_b_KQkq_e3_0_1')
  })
})

describe('a Lichess link to a line', () => {
  it('numbers the moves and joins them with the separator that route reads', () => {
    expect(lichessGameUrl(['e4', 'e5', 'Nf3']))
      .toBe('https://lichess.org/analysis/pgn/1.+e4+e5+2.+Nf3')
  })

  it('drops check and mate markers, which the route would read as a separator or a fragment', () => {
    const url = lichessGameUrl(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    expect(url.endsWith('4.+Qxf7')).toBe(true)
    expect(url).not.toContain('#')
    expect(lichessGameUrl(['e4', 'f5', 'Qh5+'])).toContain('2.+Qh5')
  })
})

describe('the link for what is on the board', () => {
  it('sends the line when it began at the initial position', () => {
    expect(lichessAnalysisUrl({ rootFen: START, sanMoves: ['e4', 'e5'], fen: 'ignored' }))
      .toBe('https://lichess.org/analysis/pgn/1.+e4+e5')
  })

  it('sends the position when there are no moves, or the game began elsewhere', () => {
    expect(lichessAnalysisUrl({ rootFen: START, sanMoves: [], fen: START }))
      .toBe(lichessPositionUrl(START))
    // The movetext route cannot carry a starting position, so a game set up
    // from a FEN goes as the position it has reached.
    expect(lichessAnalysisUrl({ rootFen: AFTER_E4, sanMoves: ['e5', 'Nf3'], fen: 'r1b1k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' }))
      .toBe('https://lichess.org/analysis/standard/r1b1k2r/8/8/8/8/8/8/R3K2R_w_KQkq_-_0_1')
  })
})

describe('a chess.com link to a position', () => {
  it('carries the FEN percent-encoded in the query', () => {
    expect(chessComPositionUrl('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'))
      .toBe('https://www.chess.com/analysis?fen=rnbqkbnr%2Fpppppppp%2F8%2F8%2F4P3%2F8%2FPPPP1PPP%2FRNBQKBNR%20b%20KQkq%20e3%200%201')
  })

  it('normalises the whitespace a pasted FEN can carry', () => {
    expect(chessComPositionUrl('  8/8/8/8/8/8/8/K6k   w  - - 0 1 '))
      .toBe('https://www.chess.com/analysis?fen=8%2F8%2F8%2F8%2F8%2F8%2F8%2FK6k%20w%20-%20-%200%201')
  })
})
