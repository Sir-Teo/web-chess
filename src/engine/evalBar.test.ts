import { describe, expect, it } from 'vitest'
import { evalBarSplit, evalBarWhiteShare } from './evalBar'
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

describe('evalBarWhiteShare', () => {
  /**
   * The whole point of the separate figure. Stockfish calls the start position
   * roughly `wdl 83 912 5`, and drawing that split literally gave White 8% of
   * the bar beside a "+0.4" label and a "53% for White" verdict.
   */
  it('draws the score, not the split, when a reading carries both', () => {
    const evaluation = { cp: 37, wdl: { w: 83, d: 912, l: 5 } }
    expect(evalBarSplit(START, evaluation)!.white).toBeCloseTo(8.3, 6)
    expect(evalBarWhiteShare(START, evaluation)).toBeCloseTo(winPercentFromCp(37), 6)
    expect(evalBarWhiteShare(START, evaluation)!).toBeGreaterThan(50)
  })

  /** The same curve the winrate card, the trend graph and the accuracy read. */
  it('is the winning chances the rest of the screen prints', () => {
    for (const cp of [-800, -120, 0, 37, 250, 900]) {
      expect(evalBarWhiteShare(START, { cp })).toBeCloseTo(winPercentFromCp(cp), 6)
    }
  })

  it('reads the score from the side to move', () => {
    expect(evalBarWhiteShare(BLACK_TO_MOVE, { cp: 100 })!).toBeLessThan(50)
  })

  it('fills the bar for the side with a forced mate, whatever the split says', () => {
    expect(evalBarWhiteShare(START, { cp: 10000, mate: 3, wdl: { w: 0, d: 1000, l: 0 } })).toBe(100)
    expect(evalBarWhiteShare(BLACK_TO_MOVE, { cp: 10000, mate: 3 })).toBe(0)
  })

  /**
   * The one shape that leaves the curve nothing to work from. The expected
   * score is the same quantity by another route: wins plus half the draws.
   */
  it('falls back to the expected score when the score is not a number', () => {
    const nan = Number.NaN
    expect(evalBarWhiteShare(START, { cp: nan, wdl: { w: 200, d: 600, l: 200 } })).toBeCloseTo(50, 6)
    expect(evalBarWhiteShare(START, { cp: nan, wdl: { w: 500, d: 400, l: 100 } })).toBeCloseTo(70, 6)
  })

  it('has nothing to say without a reading', () => {
    expect(evalBarWhiteShare(START, undefined)).toBeNull()
    expect(evalBarWhiteShare(START, { cp: Number.NaN })).toBeNull()
  })
})

