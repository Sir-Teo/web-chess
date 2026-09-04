import { describe, expect, it } from 'vitest'
import { snapshotFromSearchLines } from './reviewPoolRunner'

/**
 * The reading a pooled search leaves behind.
 *
 * This is the one place a pooled review could disagree with a single-engine
 * one without anything failing: both feed the same evaluation map, and a
 * snapshot built from a different line of the same search would grade the game
 * differently. The rule has to match what `engineLineToSnapshot` takes from
 * the shared engine -- the deepest `info` line at rank 1 that carries a score.
 */

const SEARCH = [
  'info depth 1 seldepth 1 multipv 1 score cp 20 nodes 20 nps 20000 pv e2e4',
  'info depth 8 seldepth 10 multipv 1 score cp 31 nodes 9000 nps 900000 time 10 pv e2e4 e7e5',
  'info depth 16 seldepth 22 multipv 1 score cp 28 nodes 900000 nps 1200000 time 750 pv d2d4 d7d5 c2c4',
  'bestmove d2d4 ponder d7d5',
]

describe('the snapshot a pooled search leaves behind', () => {
  it('takes the deepest line, not the last one seen', () => {
    const snapshot = snapshotFromSearchLines(SEARCH, 1234)
    expect(snapshot).toMatchObject({ cp: 28, depth: 16, bestMove: 'd2d4', nodes: 900000, time: 750 })
  })

  it('files itself as the review searching, so the review pipeline trusts its depth', () => {
    // `isShallowEvaluation` reads these two, and a snapshot filed as an import
    // sweep would be treated as too thin to grade a move with.
    expect(snapshotFromSearchLines(SEARCH, 1)).toMatchObject({ purpose: 'batch-review', mode: 'review' })
  })

  it('carries the search time it was given, so a later reading can outrank it', () => {
    expect(snapshotFromSearchLines(SEARCH, 99)?.searchedAt).toBe(99)
  })

  it('ignores the ranks a review does not ask for', () => {
    const withExtraRanks = [
      'info depth 20 multipv 2 score cp 900 pv h2h4',
      'info depth 16 multipv 1 score cp 28 pv d2d4',
    ]
    expect(snapshotFromSearchLines(withExtraRanks, 0)).toMatchObject({ cp: 28, bestMove: 'd2d4' })
  })

  it('keeps a mate as a mate rather than flattening it to a score', () => {
    const mating = ['info depth 12 multipv 1 score mate 3 pv d1h5 e8e7 h5f7']
    expect(snapshotFromSearchLines(mating, 0)).toMatchObject({ mate: 3, bestMove: 'd1h5' })
  })

  it('records a bound as one, so an inequality is not read as an evaluation', () => {
    const bounded = ['info depth 14 multipv 1 score cp 900 lowerbound pv e2e4']
    expect(snapshotFromSearchLines(bounded, 0)?.scoreBound).toBe('lowerbound')
  })

  it('carries WDL through when the engine was asked for it', () => {
    const withWdl = ['info depth 16 multipv 1 score cp 28 wdl 300 600 100 pv d2d4']
    expect(snapshotFromSearchLines(withWdl, 0)?.wdl).toEqual({ w: 300, d: 600, l: 100 })
  })

  describe('a search that said nothing usable', () => {
    it('is null rather than a zero, which would grade as a level position', () => {
      expect(snapshotFromSearchLines(['bestmove (none)'], 0)).toBeNull()
      expect(snapshotFromSearchLines([], 0)).toBeNull()
    })

    /**
     * `score mate 0` is what a mated position answers, and it is not a score.
     * The review has its own terminal fallback for those; a snapshot here would
     * override it with a number nobody means.
     */
    it('refuses a mate with no distance', () => {
      expect(snapshotFromSearchLines(['info depth 1 multipv 1 score mate 0 pv e2e4'], 0)).toBeNull()
    })

    it('refuses an info line with no score at all', () => {
      expect(snapshotFromSearchLines(['info depth 3 multipv 1 nodes 400 pv e2e4'], 0)).toBeNull()
    })
  })
})
