import { describe, expect, it } from 'vitest'
import { pgnDownloadFilename } from './pgnFilename'

const TODAY = new Date('2026-09-27T12:00:00Z')

describe('the name a downloaded game is saved under', () => {
  it('is the players and the day the game was played', () => {
    expect(pgnDownloadFilename({ White: 'Carlsen, Magnus', Black: 'Nepomniachtchi, Ian', Date: '2021.12.03' }, undefined, TODAY))
      .toBe('carlsen-vs-nepomniachtchi-2021-12-03.pgn')
  })

  it('falls back to the event, then the opening, then the app', () => {
    expect(pgnDownloadFilename({ Event: 'Club Night' }, 'Sicilian Defense', TODAY)).toBe('club-night-2026-09-27.pgn')
    expect(pgnDownloadFilename({}, "Queen's Gambit Declined", TODAY)).toBe('queen-s-gambit-declined-2026-09-27.pgn')
    expect(pgnDownloadFilename({}, undefined, TODAY)).toBe('web-chess-2026-09-27.pgn')
  })

  it("does not name a game after this app's placeholders or PGN's unknowns", () => {
    const unnamed = { White: 'Player 1', Black: 'Player 2', Event: 'Web Chess Game', Date: '2026.09.27' }
    expect(pgnDownloadFilename(unnamed, 'Italian Game', TODAY)).toBe('italian-game-2026-09-27.pgn')
    expect(pgnDownloadFilename({ White: '?', Black: '?', Date: '1852.??.??' }, undefined, TODAY)).toBe('web-chess-2026-09-27.pgn')
  })

  it('keeps a file name any system will take', () => {
    expect(pgnDownloadFilename({ White: 'Réti', Black: 'Alekhine / Nimzowitsch' }, undefined, TODAY))
      .toBe('reti-vs-alekhine-nimzowitsch-2026-09-27.pgn')
    const long = pgnDownloadFilename({ Event: 'x'.repeat(200) }, undefined, TODAY)
    expect(long.length).toBeLessThanOrEqual(60 + '-2026-09-27.pgn'.length)
  })
})
