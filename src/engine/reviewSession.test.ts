import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { createReviewSession, recordReviewResult, snapshotReviewSession, type ReviewSettings } from './reviewSession'
import { planBatchReview } from './batchReview'
import type { EvalSnapshot } from './analysis'

const game = new Chess()
const nodes = [{ id: 'root', fen: game.fen(), uci: '' }]
for (const san of ['a3', 'h6', 'a4']) {
  const move = game.move(san)
  nodes.push({ id: `n${nodes.length}`, fen: game.fen(), uci: move.from + move.to })
}
const root = nodes[0].fen
const full = { profile: 'full-single-cdn', version: '18.0.7', name: 'Stockfish 18' }
const lite = { ...full, profile: 'lite-single-local', name: 'Stockfish 18 Lite' }
const settings: ReviewSettings = { engine: full, depth: 16, hashMb: 64, showWdl: true }
const reading = (over: Partial<EvalSnapshot> = {}): EvalSnapshot => ({ cp: 0, depth: 16, purpose: 'batch-review', engine: full, ...over })

describe('a review owns the readings it grades', () => {
  it('reuses only sufficient scores from the same producer and the reviewed line', () => {
    for (const unusable of [reading({ engine: lite, depth: 40 }), reading({ engine: undefined }),
      reading({ engine: { ...full, version: '19.0' } }), reading({ engine: { ...full, name: 'Different net' } }),
      reading({ scoreBound: 'lowerbound' }), reading({ depth: 8 }), reading({ cp: NaN })]) {
      const plan = planBatchReview(nodes, root, new Map([[root, unusable]]), 16, full)
      expect(plan.done).toBe(0)
      expect(plan.queue).toHaveLength(nodes.length)
      expect(plan.reused.size).toBe(0)
    }
    const plan = planBatchReview(nodes, root, new Map([[root, reading()], ['unrelated', reading()]]), 16, full)
    expect(plan.done).toBe(1)
    expect([...plan.reused.keys()]).toEqual([root])
  })

  it('records this run without overwriting an older deeper position score', () => {
    const earlier = reading({ cp: 900, depth: 40, engine: lite })
    const live = new Map(nodes.map(node => [node.fen, earlier]))
    const session = createReviewSession(nodes, root, settings, live, null, 10)
    expect(session.queue).toHaveLength(nodes.length)
    for (const node of nodes) expect(recordReviewResult(session, node.fen, reading())).toBe(true)
    const report = snapshotReviewSession(session, 20)
    expect(report).toMatchObject({ complete: true, startedAt: 10, finishedAt: 20, total: 4 })
    expect(report.evaluations.get(root)?.cp).toBe(0)
    expect(live.get(root)).toBe(earlier)
    expect(recordReviewResult(session, root, reading({ cp: 30 }))).toBe(true)
    expect(report.evaluations.get(root)?.cp).toBe(0)
  })

  it('can reuse its own completed report even when deeper foreign scores remain on the board', () => {
    const session = createReviewSession(nodes, root, settings, new Map(), null)
    for (const node of nodes) recordReviewResult(session, node.fen, reading())
    const report = snapshotReviewSession(session)
    const live = new Map(nodes.map(node => [node.fen, reading({ cp: 900, depth: 40, engine: lite })]))
    expect(createReviewSession(nodes, root, settings, live, report).queue).toEqual([])
    expect(createReviewSession(nodes, root, settings, live, { ...report, lineEndId: 'another-line' }).queue).toHaveLength(4)
  })

  it('keeps settings fixed and leaves missing, bounded, shallow or foreign results pending', () => {
    const chosen = { ...settings, engine: { ...full } }
    const session = createReviewSession(nodes, root, chosen, new Map(), null)
    chosen.depth = 30
    chosen.engine.profile = lite.profile
    expect(session.settings).toEqual(settings)
    for (const invalid of [reading({ scoreBound: 'upperbound' }), reading({ engine: lite }), reading({ depth: 2 })]) {
      expect(recordReviewResult(session, root, invalid)).toBe(false)
    }
    expect(recordReviewResult(session, 'another-position', reading())).toBe(false)
    recordReviewResult(session, root, reading())
    expect(snapshotReviewSession(session).complete).toBe(false)
    // A failed pool resumes from this map, independent of stale shared scores.
    const remaining = planBatchReview(session.nodes, root, session.evaluations, session.settings.depth, session.settings.engine)
    expect(remaining.done).toBe(1)
    expect(remaining.queue.map(target => target.fen)).not.toContain(root)
  })
})
