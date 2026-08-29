import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { parseCandidateMoveInput, describeBestMove, formatCandidateGap } from './candidateMoves'

describe('candidate move input', () => {
  it('accepts legal SAN and UCI moves from the current position', () => {
    const fen = new Chess().fen()

    expect(parseCandidateMoveInput('e4 Nf3 b1c3', fen)).toEqual({
      invalidTokens: [],
      validMoves: ['e2e4', 'g1f3', 'b1c3'],
    })
  })

  it('deduplicates repeated candidate moves across SAN and UCI notation', () => {
    const fen = new Chess().fen()

    expect(parseCandidateMoveInput('e4 e2e4, Nf3 g1f3', fen)).toEqual({
      invalidTokens: [],
      validMoves: ['e2e4', 'g1f3'],
    })
  })

  it('rejects malformed or illegal moves instead of sending them to Stockfish', () => {
    const fen = new Chess().fen()

    expect(parseCandidateMoveInput('e2e5 e9e4 Qh5', fen)).toEqual({
      invalidTokens: ['e2e5', 'e9e4', 'Qh5'],
      validMoves: [],
    })
  })

  it('understands castling SAN when castling is legal', () => {
    const game = new Chess()
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) {
      game.move(san)
    }

    expect(parseCandidateMoveInput('O-O', game.fen()).validMoves).toEqual(['e1g1'])
  })
})

describe('describing the engine move for the Coach panel', () => {
    const START = new Chess().fen()
    const lines = (...pvs: Array<[string, number]>) => pvs.map(([uci, cp]) => ({ cp, pv: [uci] }))

    it('says nothing about a move it cannot play', () => {
        expect(describeBestMove(START, null, [])).toBeNull()
        expect(describeBestMove(START, 'e2', [])).toBeNull()
        expect(describeBestMove(START, 'e2e9', [])).toBeNull()
    })

    it('tags a plain developing move and never returns an empty tag list', () => {
        const described = describeBestMove(START, 'g1f3', [])
        expect(described?.tags).toContain('Develop')
        expect(described?.tags.length).toBeGreaterThan(0)
    })

    it('falls back to a tag rather than showing none', () => {
        // A quiet pawn move off the back rank earns no tag of its own.
        const described = describeBestMove(START, 'a2a3', [])
        expect(described?.tags).toEqual(['Candidate'])
    })

    it('shows at most four tags', () => {
        const described = describeBestMove(START, 'e2e4', [])
        expect(described!.tags.length).toBeLessThanOrEqual(4)
    })

    /**
     * The summary is a priority chain and the order is the behaviour: a mate is
     * described as a mate even when it is also a capture, and the book line only
     * surfaces when nothing more concrete applies.
     */
    it('describes a mate as a mate, ahead of everything else', () => {
        const foolsMate = new Chess()
        for (const san of ['f3', 'e5', 'g4']) foolsMate.move(san)
        const described = describeBestMove(foolsMate.fen(), 'd8h4', [])
        expect(described?.tags).toContain('Mate')
        expect(described?.summary).toMatch(/mate/i)
    })

    /**
     * The order, walked from the top. Written after getting it wrong twice:
     * the book move outranks "claims central space", and the gap bands are
     * last, so any move with a shape of its own is described by that shape
     * rather than by how far clear it is.
     */
    it('puts the tablebase above the book', () => {
        const described = describeBestMove(START, 'a2a3', [], 'a2a3', 'a2a3')
        expect(described?.summary).toMatch(/tablebase/i)
    })

    it('puts the book above claiming the centre', () => {
        // e4 is both a central pawn move and, here, the named book move.
        expect(describeBestMove(START, 'e2e4', [], 'e2e4')?.summary).toMatch(/book/i)
        expect(describeBestMove(START, 'e2e4', [])?.summary).toMatch(/central/i)
    })

    it('falls back to the gap only for a move with no shape of its own', () => {
        const clear = describeBestMove(START, 'a2a3', lines(['a2a3', 120], ['h2h3', 20]))
        expect(clear?.summary).toMatch(/meaningfully ahead/i)

        const crowded = describeBestMove(START, 'a2a3', lines(['a2a3', 30], ['h2h3', 20]))
        expect(crowded?.summary).toMatch(/close/i)
    })

    it('describes a central pawn move by its shape, not by its lead', () => {
        // e4 is central, which outranks the gap even when the gap is large.
        const described = describeBestMove(START, 'e2e4', lines(['e2e4', 400], ['d2d4', 20]))
        expect(described?.summary).toMatch(/central/i)
    })

    it('labels the gap in the three bands it has', () => {
        expect(formatCandidateGap(null)).toBeNull()
        expect(formatCandidateGap(9000)).toBe('mate swing')
        expect(formatCandidateGap(4)).toBe('same tier')
        expect(formatCandidateGap(150)).toBe('+1.50 vs #2')
    })

    it('has no gap to report when there is only one candidate', () => {
        expect(describeBestMove(START, 'e2e4', lines(['e2e4', 30]))?.gapLabel).toBeNull()
    })

    it('never reports a negative gap when the played move is not the top line', () => {
        // The move under the cursor scores worse than the engine's favourite;
        // the gap is clamped rather than shown as a negative.
        const described = describeBestMove(START, 'a2a3', lines(['a2a3', 10], ['e2e4', 200]))
        expect(described?.gapLabel).not.toMatch(/-/)
    })
})
