import { renderToStaticMarkup } from 'react-dom/server'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { PhaseAccuracy } from './PhaseAccuracy'
import { buildReviewRows } from '../engine/analysis'
import type { EvalSnapshot, ReviewRow } from '../engine/analysis'

const format = (value: number | null) => (value === null ? '—' : value.toFixed(1))

/** Flat evaluations: these tests read the phase split, never the move quality. */
function reviewOf(sans: string[], rootFen: string) {
    const game = new Chess(rootFen)
    const evaluations = new Map<string, EvalSnapshot>([[rootFen, { cp: 0, depth: 22 }]])
    const moves = []
    for (const san of sans) {
        moves.push(game.move(san))
        evaluations.set(game.fen(), { cp: 0, depth: 22 })
    }
    return buildReviewRows(moves, evaluations, rootFen)
}

const START = new Chess().fen()
const MIDDLEGAME = 'r1b1k2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1B1K2R w KQkq - 0 12'
const ENDGAME = '4k2r/5ppp/8/8/8/8/5PPP/4K2R w Kk - 0 40'

function render(rows: ReviewRow[]) {
    return renderToStaticMarkup(<PhaseAccuracy rows={rows} formatAccuracy={format} />)
}

describe('PhaseAccuracy', () => {
    it('says nothing about a game that never left the opening', () => {
        // One phase repeats the overall figure without adding to it.
        expect(render(reviewOf(['e4', 'e5', 'Nf3', 'Nc6'], START))).toBe('')
    })

    it('says nothing at all with no rows', () => {
        expect(render([])).toBe('')
    })

    it('breaks a game down once it spans more than one phase', () => {
        const rows = [...reviewOf(['e4', 'e5'], START), ...reviewOf(['d3', 'd6'], MIDDLEGAME)]
        const html = render(rows)
        expect(html).toContain('Opening')
        expect(html).toContain('Middlegame')
        expect(html).toContain('aria-label="Accuracy by phase"')
    })

    it('leaves out a phase the game never reached', () => {
        const rows = [...reviewOf(['e4', 'e5'], START), ...reviewOf(['d3', 'd6'], MIDDLEGAME)]
        expect(render(rows)).not.toContain('Endgame')
    })

    it('names both sides so a reader can tell the two figures apart', () => {
        const rows = [...reviewOf(['e4', 'e5'], START), ...reviewOf(['Kf1', 'Kf8'], ENDGAME)]
        const html = render(rows)
        expect(html).toContain('White accuracy in the opening')
        expect(html).toContain('Black accuracy in the opening')
        expect(html).toContain('White accuracy in the endgame')
    })

    it('counts the moves it scored, with the singular spelt out', () => {
        const rows = [...reviewOf(['e4'], START), ...reviewOf(['Kf1', 'Kf8'], ENDGAME)]
        const html = render(rows)
        expect(html).toContain('1 move<')
        expect(html).toContain('2 moves')
    })
})
