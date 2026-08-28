import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildReviewRows, filterReviewRowsByPhase, summarizeAccuracyByPhase } from './analysis'
import type { EvalSnapshot } from './analysis'

/**
 * Plays SAN moves from a position and evaluates every square of it flat, so
 * move quality is never what these tests are reading.
 */
function reviewOf(sans: string[], rootFen = new Chess().fen()) {
  const game = new Chess(rootFen)
  const evaluations = new Map<string, EvalSnapshot>([[rootFen, { cp: 0, depth: 22 }]])
  const moves = []
  for (const san of sans) {
    moves.push(game.move(san))
    evaluations.set(game.fen(), { cp: 0, depth: 22 })
  }
  return buildReviewRows(moves, evaluations, rootFen)
}

/** Queens and one pair of rooks already traded; still plenty of pieces. */
const MIDDLEGAME = 'r1b1k2r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1B1K2R w KQkq - 0 12'
/** Rook and king each. */
const ENDGAME = '4k2r/5ppp/8/8/8/8/5PPP/4K2R w Kk - 0 40'

describe('tagging review rows with a phase', () => {
  it('opens in the opening', () => {
    const rows = reviewOf(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(rows.map(row => row.phase)).toEqual(['opening', 'opening', 'opening', 'opening'])
  })

  it('calls a stripped-down position an endgame however the game got there', () => {
    const rows = reviewOf(['Kf1', 'Kf8'], ENDGAME)
    expect(rows.map(row => row.phase)).toEqual(['endgame', 'endgame'])
  })

  it('calls a position with the queens gone but the pieces on a middlegame', () => {
    const rows = reviewOf(['d3', 'd6'], MIDDLEGAME)
    expect(rows.map(row => row.phase)).toEqual(['middleGame', 'middleGame'])
  })

  it('reads the phase from the position before the move, not the one it creates', () => {
    // Queens and a rook each is a middlegame; taking the queen makes it an
    // endgame. The move that crosses the line belongs to the side it started on.
    const queensStillOn = 'r2qk3/ppp2ppp/8/8/8/8/PPP2PPP/R2QK3 w Qq - 0 30'
    const [taking, replying] = reviewOf(['Qxd8+', 'Kxd8'], queensStillOn)
    expect(taking.san).toBe('Qxd8+')
    expect(taking.phase).toBe('middleGame')
    expect(replying.phase).toBe('endgame')
  })

  it('counts plies from the start of the game, not the start of the review', () => {
    // A closed position at move 20 with nothing captured yet. Analysing from a
    // FEN restarts the review at index 0, but the game is 39 plies old and this
    // is not an opening.
    const closedAtMove20 = 'r1bqk2r/pp1nbppp/2p1pn2/3p4/2PP4/2N1PN2/PP1BBPPP/R2QK2R w KQkq - 0 20'
    const [row] = reviewOf(['a3'], closedAtMove20)
    expect(row.phase).toBe('middleGame')
  })

  it('still reads an opening as an opening when the review starts at move one', () => {
    expect(reviewOf(['e4'], new Chess().fen())[0].phase).toBe('opening')
  })

  it('tags a row that could not be evaluated too', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('e4')
    // No evaluations at all, so the row is pending — it still knows its phase.
    const [row] = buildReviewRows([move], new Map(), rootFen)
    expect(row.quality).toBe('pending')
    expect(row.phase).toBe('opening')
  })
})

describe('summarizing accuracy by phase', () => {
  it('reports only the phases the game actually reached', () => {
    const summary = summarizeAccuracyByPhase(reviewOf(['e4', 'e5', 'Nf3', 'Nc6']))
    expect(summary.map(entry => entry.phase)).toEqual(['opening'])
  })

  it('keeps the phases in playing order', () => {
    const rows = [...reviewOf(['e4', 'e5']), ...reviewOf(['d3', 'd6'], MIDDLEGAME), ...reviewOf(['Kf1'], ENDGAME)]
    expect(summarizeAccuracyByPhase(rows).map(entry => entry.phase))
      .toEqual(['opening', 'middleGame', 'endgame'])
  })

  it('counts every evaluated move exactly once across the phases', () => {
    const rows = [...reviewOf(['e4', 'e5']), ...reviewOf(['d3', 'd6'], MIDDLEGAME), ...reviewOf(['Kf1'], ENDGAME)]
    const counted = summarizeAccuracyByPhase(rows)
      .reduce((total, entry) => total + entry.summary.evaluatedMoves, 0)
    expect(counted).toBe(rows.filter(row => row.quality !== 'pending').length)
  })

  it('says nothing at all about a game with no evaluations', () => {
    const game = new Chess()
    const rows = buildReviewRows([game.move('e4')], new Map(), new Chess().fen())
    expect(summarizeAccuracyByPhase(rows)).toEqual([])
  })
})

describe('narrowing the move list to one phase', () => {
  const rows = [...reviewOf(['e4', 'e5']), ...reviewOf(['d3', 'd6'], MIDDLEGAME)]

  it('leaves everything alone by default', () => {
    expect(filterReviewRowsByPhase(rows, 'all')).toBe(rows)
  })

  it('keeps only the moves played in the chosen phase', () => {
    const opening = filterReviewRowsByPhase(rows, 'opening')
    expect(opening).toHaveLength(2)
    expect(opening.every(row => row.phase === 'opening')).toBe(true)
  })

  it('returns nothing for a phase the game never reached', () => {
    expect(filterReviewRowsByPhase(rows, 'endgame')).toEqual([])
  })

  it('accounts for every row across the phases', () => {
    const counted = (['opening', 'middleGame', 'endgame'] as const)
      .reduce((total, phase) => total + filterReviewRowsByPhase(rows, phase).length, 0)
    expect(counted).toBe(rows.length)
  })
})
