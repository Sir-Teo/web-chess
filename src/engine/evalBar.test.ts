import { describe, expect, it } from 'vitest'
import { evalBarSplit } from './evalBar'
import { winPercentFromCp } from './analysis'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

describe('evalBarSplit', () => {
  it('prefers the engine WDL, turned to White\'s point of view', () => {
    const split = evalBarSplit(BLACK_TO_MOVE, { cp: 30, wdl: { w: 500, d: 300, l: 200 } })
    // Black to move: Black's wins are White's losses.
    expect(split).toEqual({ white: 20, draw: 30, black: 50 })
  })

  // A cloud evaluation, a PGN's [%eval], and a search with UCI_ShowWDL off
  // all carry a score and no split. The bar drew every one as an even
  // three-way split under a position it had a number for.
  it('falls back to winning chances from the score, with no draw band', () => {
    const split = evalBarSplit(START, { cp: 100 })
    expect(split).not.toBeNull()
    expect(split!.draw).toBe(0)
    expect(split!.white).toBeCloseTo(winPercentFromCp(100), 6)
    expect(split!.white + split!.black).toBeCloseTo(100, 6)
    expect(split!.white).toBeGreaterThan(50)
  })

  it('reads the score from the side to move', () => {
    // +100 for Black to move is a White disadvantage.
    const split = evalBarSplit(BLACK_TO_MOVE, { cp: 100 })
    expect(split!.white).toBeLessThan(50)
  })

  it('fills the bar for the side with a forced mate', () => {
    expect(evalBarSplit(START, { cp: 10000, mate: 3 })).toEqual({ white: 100, draw: 0, black: 0 })
    expect(evalBarSplit(BLACK_TO_MOVE, { cp: 10000, mate: 3 })).toEqual({ white: 0, draw: 0, black: 100 })
  })

  it('has nothing to say without a reading', () => {
    expect(evalBarSplit(START, undefined)).toBeNull()
    expect(evalBarSplit(START, { cp: Number.NaN })).toBeNull()
  })
})

