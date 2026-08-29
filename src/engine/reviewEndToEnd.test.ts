import { Chess, type Move } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { parsePgnMoveTree } from './pgn'
import type { GameTreeImportEntry } from '../hooks/useGameTree'
import {
    type EvalSnapshot,
    buildReviewRows,
    filterReviewRowsBySide,
    rankCriticalMoments,
    summarizeAccuracy,
    summarizeReview,
} from './analysis'
import { winPercentFromCp } from './analysis'

/**
 * A game played, reviewed and asserted on, with nothing mounted.
 *
 * `docs/cross-app-second-pass.md` §2.2 argues that the goal for the store work
 * is not a smaller `App.tsx` but this: that the game can be driven by a test
 * with no DOM. web-katrain can — 22 test files drive its store — and both
 * siblings were said to have no test that exercises app behaviour at all.
 *
 * This measures how far that actually is rather than assuming. For the review
 * path the answer is: no distance. `parsePgnMoveTree` returns import entries
 * that already carry their `Move`, `buildReviewRows` takes moves and an
 * evaluation map, and everything downstream is pure. The single link that lives
 * in `App.tsx` is `nodes.slice(1).map(n => n.move)`, which is the one line
 * reproduced below.
 *
 * So the remaining gap is narrower than the plan implies, and it is worth
 * writing down which half is which: the *analysis* half is already headless,
 * and what is still trapped in the component is the engine wiring — dispatching
 * searches, collecting `info` lines, deciding when a position is evaluated
 * enough. That is the part a store would buy, and it is a smaller and better
 * defined job than "break up a 5,500-line file".
 */

const GAME = `[Event "Test"]
[White "White"]
[Black "Black"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 *`

/** The ply the deliberate blunder is played on, 1-based as the rows report it. */
const BLUNDER_PLY = 13

/**
 * An evaluation for every position the game passes through: a slow drift with
 * one deliberate lurch, so there is a worst moment to find. A flat evaluation
 * would make every move score identically and the assertions meaningless.
 *
 * Scores are stored the way the engine reports them -- from the side to move,
 * not from White. Writing a single White-POV number into every position was the
 * first version of this, and it made the blunder disappear: `buildReviewRows`
 * flips `after` to the mover's point of view, so data that does not flip
 * produces deltas of zero. Worth knowing before hand-writing evaluations again.
 */
function evaluateEveryPosition(moves: Move[]): Map<string, EvalSnapshot> {
    const evaluations = new Map<string, EvalSnapshot>()
    const board = new Chess()
    let whitePov = 20

    const record = () => {
        const cp = board.turn() === 'w' ? whitePov : -whitePov
        evaluations.set(board.fen(), { cp, depth: 20, nodes: 100_000, purpose: 'manual' })
    }

    record()
    for (const [index, move] of moves.entries()) {
        board.move(move.san)
        const ply = index + 1
        // The lurch is against whoever just moved, so it reads as their mistake.
        const drift = ((index % 5) - 2) * 8
        whitePov += ply === BLUNDER_PLY
            ? (board.turn() === 'b' ? -260 : 260)
            : drift
        record()
    }
    return evaluations
}

/**
 * The main line: the first-child chain through the parsed tree.
 *
 * `parsePgnMoveTree` returns a tree, not a list -- `moves` holds the first move
 * and its continuations hang off `children`. The app reaches the same sequence
 * by building nodes with `useGameTree` and taking `mainLineNodes`; this is the
 * same walk without the hook.
 */
function movesFrom(pgn: string) {
    const parsed = parsePgnMoveTree(pgn)
    const line: Move[] = []
    let entry: GameTreeImportEntry | undefined = parsed.moves[0]
    while (entry) {
        line.push(entry.move)
        entry = entry.children?.[0]
    }
    return line
}

describe('reviewing a game with no DOM', () => {
    const moves = movesFrom(GAME)
    const evaluations = evaluateEveryPosition(moves)
    const rows = buildReviewRows(moves, evaluations)

    it('parses the game into moves', () => {
        expect(moves).toHaveLength(20)
        expect(moves[0]?.san).toBe('e4')
        expect(moves.at(-1)?.san).toBe('Nbd7')
    })

    it('produces one review row per move, each graded', () => {
        expect(rows).toHaveLength(moves.length)
        expect(rows.every(row => row.quality !== 'pending')).toBe(true)
        expect(rows.map(row => row.sideToMove).slice(0, 4)).toEqual(['w', 'b', 'w', 'b'])
    })

    it('reports an accuracy for each side inside the percentage range', () => {
        const summary = summarizeAccuracy(rows)
        expect(summary.evaluatedMoves).toBe(moves.length)
        expect(summary.pendingMoves).toBe(0)
        for (const value of [summary.overall, summary.white, summary.black]) {
            expect(value).not.toBeNull()
            expect(value as number).toBeGreaterThanOrEqual(0)
            expect(value as number).toBeLessThanOrEqual(100)
        }
    })

    it('finds the move the game actually turned on', () => {
        const worst = rankCriticalMoments(rows, 1)[0]
        expect(worst?.ply).toBe(BLUNDER_PLY)
        expect(worst?.quality === 'mistake' || worst?.quality === 'blunder').toBe(true)
    })

    it('splits by side without losing or inventing rows', () => {
        const white = filterReviewRowsBySide(rows, 'white')
        const black = filterReviewRowsBySide(rows, 'black')
        expect(white).toHaveLength(moves.length / 2)
        expect(black).toHaveLength(moves.length / 2)
        expect(white.length + black.length).toBe(rows.length)
    })

    it('counts every row into exactly one quality bucket', () => {
        const counts = summarizeReview(rows)
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
        expect(total).toBe(rows.length)
    })

    it('grades the lurch harder than the drift, which is the whole point', () => {
        // The move that cost 260 centipawns must not read like the ones that
        // cost single digits.
        const lurch = rows[BLUNDER_PLY - 1]!
        const quiet = rows[3]!
        expect(winPercentFromCp(0)).toBeCloseTo(50, 5)
        expect(lurch.winPercentLoss as number).toBeGreaterThan((quiet.winPercentLoss ?? 0) + 10)
    })
})
