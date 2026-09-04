import type { EngineCapabilities, EngineProfile } from './profiles'
import { recommendedThreadCount } from './profiles'

/**
 * How many engines a game review should run at once, and how to size them.
 *
 * A review is the slowest thing this app does: 83 positions at depth 16
 * measured 84.3s, of which 47.8s is the engine actually searching, one
 * position at a time on one worker. The positions are independent, so the
 * wall clock is a scheduling choice rather than a fact about the work.
 *
 * Running several is not free, and the costs are why the sizing is not simply
 * "one per core":
 *
 *   - Each engine owns a transposition table. Adjacent positions in a game
 *     transpose heavily, so a single engine walking the line in order reuses
 *     most of its table; splitting the line across N engines gives that up.
 *     The total hash is therefore divided rather than multiplied -- N engines
 *     at the reader's Hash setting would be N times the memory they asked for.
 *   - Each engine is a WASM instance with its own heap, and each boot costs
 *     a second or so. A short queue never earns that back.
 *   - Threads and engines compete for the same cores, so the thread count is
 *     divided too. Two engines on four threads each is the same CPU as one on
 *     eight, spent on two positions instead of one.
 *
 * Whether the trade comes out ahead is an empirical question about a
 * particular device, which is why every number here is derived from the
 * capabilities rather than guessed, and why the caller is expected to be able
 * to fall back to the single-engine path.
 */

export type ReviewPoolPlan = {
  /** How many engines to run. 1 means "use the existing single-engine path". */
  workers: number
  /** Threads for each engine. */
  threadsPerWorker: number
  /** Hash for each engine, in MB, so the total is what the reader asked for. */
  hashMbPerWorker: number
}

/**
 * The shortest queue worth booting a pool for.
 *
 * Below this the boots cost more than the overlap saves: a WASM engine takes
 * roughly a second to come up, and a depth-16 position takes well under one.
 */
export const MIN_QUEUE_FOR_POOL = 12

/** The most engines to run, whatever the machine claims. */
export const MAX_POOL_WORKERS = 4

/** Below this, an engine's table is too small to be worth having. */
export const MIN_HASH_MB_PER_WORKER = 16

export function planReviewPool(input: {
  profile: EngineProfile
  capabilities: EngineCapabilities
  /** How many positions are queued. */
  queueLength: number
  /** The reader's Hash setting, which the pool divides rather than multiplies. */
  hashMb: number
}): ReviewPoolPlan {
  const single: ReviewPoolPlan = { workers: 1, threadsPerWorker: 1, hashMbPerWorker: input.hashMb }

  if (input.queueLength < MIN_QUEUE_FOR_POOL) return single
  // A phone runs one engine at a time and is told so by `recommendedThreadCount`
  // already; a second WASM heap is the last thing it needs.
  if (input.capabilities.isMobile) return single

  const threads = recommendedThreadCount(input.profile, input.capabilities)
  const cores = Math.max(1, Math.floor(input.capabilities.hardwareConcurrency || 1))
  if (cores < 4) return single

  // One engine per pair of usable threads, so each still gets more than one.
  const byThreads = Math.floor(threads / 2)
  const byCores = Math.floor(cores / 2)
  const workers = Math.min(MAX_POOL_WORKERS, Math.max(1, Math.min(byThreads, byCores)))
  if (workers < 2) return single

  const hashMbPerWorker = Math.floor(input.hashMb / workers)
  // Dividing the hash below a usable table is the point at which splitting has
  // taken more than it can give back.
  if (hashMbPerWorker < MIN_HASH_MB_PER_WORKER) return single

  return {
    workers,
    threadsPerWorker: Math.max(1, Math.floor(threads / workers)),
    hashMbPerWorker,
  }
}

/**
 * Which positions each engine takes.
 *
 * Contiguous blocks rather than round-robin, and that is the whole reason this
 * is a function worth testing: adjacent positions in a game transpose into one
 * another, so an engine handed moves 1-20 keeps finding its own table warm,
 * while one handed every fourth position never does. Round-robin would give up
 * the one advantage the single-engine path has.
 *
 * The remainder goes to the earliest blocks, so no engine sits idle at the end
 * waiting for one that was given an extra position.
 */
export function splitReviewQueue<T>(queue: T[], workers: number): T[][] {
  const count = Math.max(1, Math.floor(workers))
  if (count === 1 || queue.length === 0) return queue.length ? [queue] : []

  const blocks: T[][] = []
  const base = Math.floor(queue.length / count)
  const remainder = queue.length % count
  let cursor = 0
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0)
    if (size === 0) continue
    blocks.push(queue.slice(cursor, cursor + size))
    cursor += size
  }
  return blocks
}
