import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/**
 * What a pool does when an engine gives out.
 *
 * The pool exists to be faster than the shared engine, and the way it can fail
 * that goal without failing a test is to take a long time to notice it is
 * broken. `App` only falls back once `done` rejects, so every second between
 * an engine dying and that rejection is a second the review is doing nothing
 * at all -- and the waits here are 20s and 60s, either of which is longer than
 * the whole single-engine review the pool replaced.
 *
 * These drive `createEngine` through a fake worker rather than asserting on
 * the timeout constants, because the bug was never in the constants: a
 * recorded `failure` matched no predicate, so nothing woke the waiter that
 * was already parked. Timers stay real and the assertions are immediate, so a
 * regression shows up as the suite hanging on a 20s wait, not as a pass.
 */
describe('a pooled engine that gives out', () => {
  class FakeWorker {
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null
    onerror: ((event: unknown) => void) | null = null
    sent: string[] = []
    terminated = false
    postMessage(command: string) { this.sent.push(command) }
    terminate() { this.terminated = true }
    emit(text: string) { this.onmessage?.({ data: text } as MessageEvent<unknown>) }
  }

  const workers: FakeWorker[] = []

  beforeEach(() => {
    workers.length = 0
    vi.resetModules()
    vi.doMock('./stockfishWorker', () => ({
      createStockfishWorker: () => {
        const worker = new FakeWorker()
        workers.push(worker)
        return { worker, blobUrl: undefined }
      },
    }))
  })

  afterEach(() => { vi.doUnmock('./stockfishWorker') })

  const runOnePosition = async () => {
    const { runReviewPool } = await import('./reviewPoolRunner')
    const run = runReviewPool({
      targets: [{ fen: 'startpos-fen', historyMoves: [], rootFen: 'startpos-fen' }] as never,
      plan: { workers: 1, threadsPerWorker: 1, hashMbPerWorker: 16 },
      profile: { id: 'x', name: 'x', workerPath: 'x', strength: 'lite', requiresIsolation: false, source: 'local' } as never,
      depth: 16,
      showWdl: false,
      callbacks: { onResult: () => {}, onProgress: () => {} },
    })
    // One microtask turn, so `runBlock` has reached its first `await`.
    await Promise.resolve()
    await Promise.resolve()
    return run
  }

  it('rejects as soon as the engine reports a boot error, not at the boot timeout', async () => {
    const run = await runOnePosition()
    expect(workers).toHaveLength(1)

    workers[0]!.emit('__BOOT_ERROR__: wasm refused to load')

    await expect(run.done).rejects.toThrow(/wasm refused to load/)
  })

  it('rejects as soon as the worker errors, not at the search timeout', async () => {
    const run = await runOnePosition()
    workers[0]!.emit('uciok')
    await Promise.resolve()
    workers[0]!.emit('readyok')
    await Promise.resolve()

    workers[0]!.onerror?.({})

    await expect(run.done).rejects.toThrow(/worker error/i)
  })

  /**
   * Cancelling has to settle `done` too. It used to leave the block parked on
   * a `bestmove` the terminated worker could never send, so an unmount or a
   * restarted review held the promise for a further 60s.
   */
  it('settles when cancelled rather than waiting out the search it abandoned', async () => {
    const run = await runOnePosition()
    workers[0]!.emit('uciok')
    await Promise.resolve()
    workers[0]!.emit('readyok')
    await Promise.resolve()

    run.cancel()

    await expect(run.done).rejects.toThrow()
    expect(workers[0]!.terminated).toBe(true)
  })
})
