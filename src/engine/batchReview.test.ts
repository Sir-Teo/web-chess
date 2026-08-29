import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { type BatchReviewTarget, buildBatchReviewTargets, planBatchReview } from './batchReview'
import type { EvalSnapshot } from './analysis'

/** A short line, as the game tree hands it over: root first, then each move. */
function lineOf(sans: string[]): Array<{ fen: string; uci: string }> {
    const board = new Chess()
    const nodes = [{ fen: board.fen(), uci: '' }]
    for (const san of sans) {
        const move = board.move(san)
        nodes.push({ fen: board.fen(), uci: `${move.from}${move.to}` })
    }
    return nodes
}

const deep = (depth: number): EvalSnapshot => ({ cp: 20, depth, nodes: 200_000, purpose: 'manual' })

describe('building review targets', () => {
    const nodes = lineOf(['e4', 'e5', 'Nf3'])

    it('covers the root and every move after it', () => {
        expect(buildBatchReviewTargets(nodes, nodes[0]!.fen)).toHaveLength(4)
    })

    it('gives each position the moves that reach it', () => {
        const targets = buildBatchReviewTargets(nodes, nodes[0]!.fen)
        expect(targets[0]?.historyMoves).toEqual([])
        expect(targets[1]?.historyMoves).toEqual(['e2e4'])
        expect(targets[3]?.historyMoves).toEqual(['e2e4', 'e7e5', 'g1f3'])
    })

    it('gives each target its own copy of the history', () => {
        // Each carries its own copy; a shared array would grow under everyone.
        const targets = buildBatchReviewTargets(nodes, nodes[0]!.fen)
        expect(targets[1]!.historyMoves).not.toBe(targets[2]!.historyMoves)
    })

    it('has nothing to do with an empty line', () => {
        expect(buildBatchReviewTargets([], 'fen')).toEqual([])
    })
})

describe('planning a review', () => {
    const nodes = lineOf(['e4', 'e5', 'Nf3'])
    const rootFen = nodes[0]!.fen

    it('queues everything when nothing has been evaluated', () => {
        const plan = planBatchReview(nodes, rootFen, new Map(), 18)
        expect(plan.queue).toHaveLength(4)
        expect(plan).toMatchObject({ done: 0, total: 4 })
    })

    it('counts a position already searched deeply enough as done', () => {
        const evaluations = new Map([[nodes[1]!.fen, deep(24)]])
        const plan = planBatchReview(nodes, rootFen, evaluations, 18)

        expect(plan.done).toBe(1)
        expect(plan.total).toBe(4)
        expect(plan.queue.map(target => target.fen)).not.toContain(nodes[1]!.fen)
    })

    it('still queues a position searched too shallowly', () => {
        const evaluations = new Map([[nodes[1]!.fen, deep(6)]])
        const plan = planBatchReview(nodes, rootFen, evaluations, 18)
        expect(plan.done).toBe(0)
        expect(plan.queue).toHaveLength(4)
    })

    /**
     * Re-running a review on a game that is already analysed should show a full
     * bar, not an empty one that never moves.
     */
    it('reports a finished review as finished rather than as no work', () => {
        const evaluations = new Map(nodes.map(node => [node.fen, deep(30)] as const))
        const plan = planBatchReview(nodes, rootFen, evaluations, 18)

        expect(plan.queue).toEqual([])
        expect(plan.done).toBe(plan.total)
        expect(plan.total).toBeGreaterThan(0)
    })

    it('drops a checkmate instead of counting work it cannot do', () => {
        // Fool's mate: the last position is terminal, so it is not in the total.
        const mated = lineOf(['f3', 'e5', 'g4', 'Qh4#'])
        const plan = planBatchReview(mated, mated[0]!.fen, new Map(), 18)

        expect(plan.total).toBe(mated.length - 1)
        expect(plan.queue.map((t: BatchReviewTarget) => t.fen)).not.toContain(mated.at(-1)!.fen)
    })
})
