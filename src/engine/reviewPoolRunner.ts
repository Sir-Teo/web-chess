import { parseInfoLine, shouldReplaceLiveLine } from '../hooks/useStockfishEngine'
import type { EvalSnapshot } from './analysis'
import { scoreToCp } from './analysis'
import type { BatchReviewTarget } from './batchReview'
import type { EngineProfile } from './profiles'
import { createStockfishWorker } from './stockfishWorker'
import { buildPositionCommand } from './uci'
import { splitReviewQueue, type ReviewPoolPlan } from './reviewPool'

/**
 * Running a game review across several engines at once.
 *
 * The single-engine path lives in `App.tsx` as a state machine keyed off the
 * shared engine's status, and it stays there: it is what an ordinary analysis
 * uses, and what this falls back to. This owns engines of its own, boots them
 * for the length of one review, and terminates them at the end -- a review is
 * a burst of work with a beginning and an end, which is exactly the shape that
 * justifies its own engines rather than sharing the one the panel is using.
 *
 * Every position is independent, so the only ordering that matters is the one
 * `splitReviewQueue` preserves inside each block, for the transposition table.
 */

/** How long to wait for one engine to answer `uci` and `isready` before giving up. */
const BOOT_TIMEOUT_MS = 20_000
/** A single depth-16 search is well under a second; this is a stuck engine, not a slow one. */
const SEARCH_TIMEOUT_MS = 60_000

export type ReviewPoolCallbacks = {
  /** One position finished. Called once per target, in whatever order they land. */
  onResult: (fen: string, snapshot: EvalSnapshot) => void
  /** One position finished, for the progress bar. Called after `onResult`. */
  onProgress: () => void
}

export type ReviewPoolRun = {
  /** Resolves when every target has been searched, or rejects if the pool could not run. */
  done: Promise<void>
  /** Stop everything and terminate the engines. Safe to call more than once. */
  cancel: () => void
}

type Engine = {
  worker: Worker
  blobUrl?: string
  send: (command: string) => void
  /** Resolves on the next line matching `predicate`, or rejects on timeout. */
  await: (predicate: (line: string) => boolean, timeoutMs: number, label: string) => Promise<void>
  /** Every line since the last reset, for the search currently in flight. */
  lines: string[]
  terminate: () => void
}

function createEngine(profile: EngineProfile): Engine {
  const created = createStockfishWorker(profile)
  const worker = created.worker
  const lines: string[] = []
  const waiters: Array<{
    predicate: (line: string) => boolean
    resolve: () => void
    fail: (error: Error) => void
  }> = []
  let failure: Error | null = null

  /**
   * A dead engine has to reach the waiters, not just the next caller to ask.
   *
   * `failure` used to be recorded and left there. Nothing matches the
   * predicate after that, so a worker that died with a wait outstanding sat
   * until that wait's own timeout -- 20s for a boot, 60s for a `bestmove` --
   * before the block rejected and `App` could fall back to the shared engine.
   * A pool that stalls for a minute before giving up is slower than the single
   * engine it replaced, which is the entire point of it.
   */
  const failWaiters = (error: Error) => {
    for (const waiter of waiters.splice(0)) waiter.fail(error)
  }

  worker.onmessage = (event: MessageEvent<unknown>) => {
    if (typeof event.data !== 'string') return
    for (const raw of event.data.split(/\r?\n/g)) {
      const line = raw.trim()
      if (!line) continue
      lines.push(line)
      if (line.startsWith('__BOOT_ERROR__:')) {
        failure = new Error(line.replace('__BOOT_ERROR__:', '').trim() || 'Engine bootstrap failed.')
        failWaiters(failure)
        continue
      }
      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        if (waiters[index]!.predicate(line)) {
          waiters.splice(index, 1)[0]!.resolve()
        }
      }
    }
  }
  worker.onerror = () => {
    failure = new Error('Engine worker error.')
    failWaiters(failure)
  }

  let terminated = false
  return {
    worker,
    blobUrl: created.blobUrl,
    lines,
    send: (command: string) => {
      if (!terminated) worker.postMessage(command)
    },
    await: (predicate, timeoutMs, label) =>
      new Promise<void>((resolve, reject) => {
        if (failure) { reject(failure); return }
        // A line that already arrived counts: `readyok` can land before the
        // caller gets to ask for it.
        if (lines.some(predicate)) { resolve(); return }
        const timer = setTimeout(() => {
          const index = waiters.findIndex(item => item.resolve === settle)
          if (index >= 0) waiters.splice(index, 1)
          reject(failure ?? new Error(`Timed out waiting for ${label}.`))
        }, timeoutMs)
        const settle = () => {
          clearTimeout(timer)
          resolve()
        }
        const fail = (error: Error) => {
          clearTimeout(timer)
          reject(error)
        }
        waiters.push({ predicate, resolve: settle, fail })
      }),
    terminate: () => {
      if (terminated) return
      terminated = true
      // Same reason as `failWaiters`, for the deliberate case: a cancelled
      // review must not leave `done` pending on a search that can no longer
      // answer. Every `cancel()` site clears `reviewPoolRunRef` first, so the
      // rejection this produces is discarded by the staleness guard rather
      // than mistaken for an engine giving out.
      failWaiters(failure ?? new Error('Engine terminated.'))
      try { worker.postMessage('quit') } catch { /* already gone */ }
      try { worker.terminate() } catch { /* already gone */ }
      if (created.blobUrl) URL.revokeObjectURL(created.blobUrl)
    },
  }
}

/**
 * The reading a finished search leaves behind.
 *
 * Built from the deepest `info` line carrying a score for the top rank, which
 * is the same thing `engineLineToSnapshot` takes from the shared engine -- the
 * two have to agree, or a pooled review would grade a game differently from a
 * single-engine one.
 */
export function snapshotFromSearchLines(lines: string[], searchedAt: number): EvalSnapshot | null {
  let best: ReturnType<typeof parseInfoLine> = null
  for (const line of lines) {
    if (!line.startsWith('info ')) continue
    const parsed = parseInfoLine(line)
    if (!parsed || parsed.multipv !== 1) continue
    if (typeof scoreToCp(parsed.cp, parsed.mate) !== 'number') continue
    if ((!best || parsed.depth >= best.depth) && shouldReplaceLiveLine(best ?? undefined, parsed)) best = parsed
  }
  if (!best) return null
  const cp = scoreToCp(best.cp, best.mate)
  if (typeof cp !== 'number') return null

  return {
    cp,
    mate: best.mate,
    scoreBound: best.scoreBound,
    bestMove: best.pv[0],
    wdl: best.wdl,
    depth: best.depth,
    nodes: best.nodes,
    nps: best.nps,
    time: best.time,
    mode: 'review',
    purpose: 'batch-review',
    searchedAt,
  }
}

/**
 * Boot the pool, search every target, and tear the engines down.
 *
 * Rejects rather than degrading if the engines will not start, so the caller
 * can fall back to the single-engine path with nothing half-done: no result is
 * reported until an engine has actually answered.
 */
export function runReviewPool(input: {
  targets: BatchReviewTarget[]
  plan: ReviewPoolPlan
  profile: EngineProfile
  depth: number
  showWdl: boolean
  callbacks: ReviewPoolCallbacks
}): ReviewPoolRun {
  const blocks = splitReviewQueue(input.targets, input.plan.workers)
  const engines: Engine[] = []
  let cancelled = false

  const cancel = () => {
    cancelled = true
    for (const engine of engines) engine.terminate()
  }

  const runBlock = async (block: BatchReviewTarget[]) => {
    const engine = createEngine(input.profile)
    engines.push(engine)
    if (cancelled) { engine.terminate(); return }

    engine.send('uci')
    await engine.await(line => line === 'uciok', BOOT_TIMEOUT_MS, 'uciok')
    engine.send(`setoption name Threads value ${input.plan.threadsPerWorker}`)
    engine.send(`setoption name Hash value ${input.plan.hashMbPerWorker}`)
    engine.send('setoption name MultiPV value 1')
    engine.send(`setoption name UCI_ShowWDL value ${input.showWdl}`)
    // After the options, never between them and a `go`: changing Threads
    // rebuilds the pool, and a `go` in the same tick as that rebuild never
    // answers. The same hang `useStockfishEngine` documents.
    engine.lines.length = 0
    engine.send('isready')
    await engine.await(line => line === 'readyok', BOOT_TIMEOUT_MS, 'readyok')

    for (const target of block) {
      if (cancelled) return
      engine.lines.length = 0
      engine.send(buildPositionCommand(target.fen, target.historyMoves, target.rootFen))
      engine.send(`go depth ${input.depth}`)
      await engine.await(line => line.startsWith('bestmove '), SEARCH_TIMEOUT_MS, `bestmove for ${target.fen}`)
      if (cancelled) return

      const snapshot = snapshotFromSearchLines(engine.lines, Date.now())
      if (snapshot) input.callbacks.onResult(target.fen, snapshot)
      input.callbacks.onProgress()
    }
  }

  const done = (async () => {
    try {
      await Promise.all(blocks.map(runBlock))
    } finally {
      for (const engine of engines) engine.terminate()
    }
  })()

  return { done, cancel }
}
