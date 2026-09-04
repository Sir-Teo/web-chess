import { describe, expect, it } from 'vitest'
import { profileById } from './profiles'
import type { EngineCapabilities } from './profiles'
import {
  MAX_POOL_WORKERS,
  MIN_HASH_MB_PER_WORKER,
  MIN_QUEUE_FOR_POOL,
  planReviewPool,
  splitReviewQueue,
} from './reviewPool'

const multi = profileById('lite-multi-local')
const single = profileById('lite-single-local')

function desktop(overrides: Partial<EngineCapabilities> = {}): EngineCapabilities {
  return {
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    hardwareConcurrency: 16,
    isMobile: false,
    ...overrides,
  }
}

const LONG_QUEUE = 83

describe('sizing a review pool', () => {
  it('splits a capable desktop into several engines that share the thread budget', () => {
    const plan = planReviewPool({ profile: multi, capabilities: desktop(), queueLength: LONG_QUEUE, hashMb: 64 })
    expect(plan.workers).toBeGreaterThan(1)
    expect(plan.workers).toBeLessThanOrEqual(MAX_POOL_WORKERS)
    expect(plan.threadsPerWorker).toBeGreaterThanOrEqual(1)
    // The point of dividing: N engines at the reader's Hash would be N times
    // the memory they asked for.
    expect(plan.hashMbPerWorker * plan.workers).toBeLessThanOrEqual(64)
  })

  it('never runs more engines than the cap, however many cores are claimed', () => {
    const plan = planReviewPool({
      profile: multi,
      capabilities: desktop({ hardwareConcurrency: 128 }),
      queueLength: LONG_QUEUE,
      hashMb: 512,
    })
    expect(plan.workers).toBe(MAX_POOL_WORKERS)
  })

  describe('falling back to the single engine', () => {
    it('for a queue too short to earn back the boots', () => {
      const plan = planReviewPool({
        profile: multi,
        capabilities: desktop(),
        queueLength: MIN_QUEUE_FOR_POOL - 1,
        hashMb: 64,
      })
      expect(plan.workers).toBe(1)
    })

    it('on a phone, which does not want a second WASM heap', () => {
      const plan = planReviewPool({
        profile: multi,
        capabilities: desktop({ isMobile: true }),
        queueLength: LONG_QUEUE,
        hashMb: 64,
      })
      expect(plan.workers).toBe(1)
    })

    it('on a machine with too few cores to share', () => {
      for (const cores of [1, 2, 3]) {
        const plan = planReviewPool({
          profile: multi,
          capabilities: desktop({ hardwareConcurrency: cores }),
          queueLength: LONG_QUEUE,
          hashMb: 64,
        })
        expect(plan.workers, `${cores} cores`).toBe(1)
      }
    })

    /**
     * The single-threaded build gets one thread whatever the machine has, so
     * there is no thread budget to divide and no reason to think two of it
     * would be faster than one.
     */
    it('on a build that cannot use threads at all', () => {
      const plan = planReviewPool({ profile: single, capabilities: desktop(), queueLength: LONG_QUEUE, hashMb: 64 })
      expect(plan.workers).toBe(1)
    })

    it('when dividing the hash would leave each engine without a usable table', () => {
      const plan = planReviewPool({
        profile: multi,
        capabilities: desktop(),
        queueLength: LONG_QUEUE,
        hashMb: MIN_HASH_MB_PER_WORKER,
      })
      expect(plan.workers).toBe(1)
      expect(plan.hashMbPerWorker).toBe(MIN_HASH_MB_PER_WORKER)
    })
  })

  it('leaves the hash the reader chose alone when it falls back', () => {
    const plan = planReviewPool({ profile: multi, capabilities: desktop(), queueLength: 2, hashMb: 128 })
    expect(plan).toEqual({ workers: 1, threadsPerWorker: 1, hashMbPerWorker: 128 })
  })
})

describe('splitting the queue between engines', () => {
  const queue = Array.from({ length: 10 }, (_, index) => index)

  /**
   * The reason blocks beat round-robin: adjacent positions in a game
   * transpose into one another, so an engine given a run of them keeps its own
   * table warm. Round-robin would give up the single-engine path's one
   * advantage.
   */
  it('hands each engine a contiguous run, not every Nth position', () => {
    expect(splitReviewQueue(queue, 2)).toEqual([[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]])
  })

  it('gives the remainder to the earliest blocks so nothing waits at the end', () => {
    const blocks = splitReviewQueue(queue, 3)
    expect(blocks.map(block => block.length)).toEqual([4, 3, 3])
    expect(blocks.flat()).toEqual(queue)
  })

  it('loses no position and duplicates none, at any width', () => {
    for (const workers of [1, 2, 3, 4, 7, 10, 13]) {
      const blocks = splitReviewQueue(queue, workers)
      expect(blocks.flat(), `${workers} workers`).toEqual(queue)
    }
  })

  it('produces no empty block when there are more engines than positions', () => {
    const blocks = splitReviewQueue([1, 2], 5)
    expect(blocks).toEqual([[1], [2]])
    expect(blocks.every(block => block.length > 0)).toBe(true)
  })

  it('has nothing to split when there is nothing queued', () => {
    expect(splitReviewQueue([], 4)).toEqual([])
    expect(splitReviewQueue([], 1)).toEqual([])
  })

  it('returns the queue whole for a single engine', () => {
    expect(splitReviewQueue(queue, 1)).toEqual([queue])
  })
})
