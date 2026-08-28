import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildWinrateSeries } from './analysis'
import type { EvalSnapshot } from './analysis'

/**
 * What the trend graph is handed when a review is only part-way done.
 *
 * The series omits a ply it has no evaluation for but keeps the real index on
 * the points either side, so the gap is a gap in the *data* while the graph
 * draws one continuous path across it. Pinned because it is the precondition
 * for the note in docs/architecture.md — if the skipping ever changes to
 * carrying a value forward, that note and the graph both need revisiting.
 */
function seriesWithEvaluated(sans: string[], evaluatedPlies: number[]) {
  const game = new Chess()
  const rootFen = game.fen()
  const evaluations = new Map<string, EvalSnapshot>([[rootFen, { cp: 0, depth: 20 }]])
  const moves = []
  for (const [index, san] of sans.entries()) {
    moves.push(game.move(san))
    if (evaluatedPlies.includes(index + 1)) {
      evaluations.set(game.fen(), { cp: 10 * (index + 1), depth: 20 })
    }
  }
  return buildWinrateSeries(moves, evaluations, rootFen)
}

const SANS = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']

describe('the winrate series while a review is still filling in', () => {
  it('gives every ply a point once they are all evaluated', () => {
    const series = seriesWithEvaluated(SANS, [1, 2, 3, 4, 5, 6])
    // Plus the start position.
    expect(series.map(point => point.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('omits an unevaluated ply rather than inventing a value for it', () => {
    const series = seriesWithEvaluated(SANS, [1, 2, 5, 6])
    expect(series.map(point => point.index)).toEqual([0, 1, 2, 5, 6])
  })

  it('keeps the real index on the points either side of the gap', () => {
    // This is what makes the graph span the gap: the neighbours are two plies
    // apart in x, and nothing marks the space between them as missing.
    const series = seriesWithEvaluated(SANS, [1, 2, 5, 6])
    const around = series.map(point => point.index)
    const before = around[around.indexOf(5) - 1]
    expect(before).toBe(2)
    expect(5 - (before as number)).toBeGreaterThan(1)
  })

  it('carries no value forward across the gap', () => {
    // The neighbours differ, so the omitted plies are absent rather than
    // flattened into a repeat of the last known evaluation.
    const series = seriesWithEvaluated(SANS, [1, 2, 5, 6])
    const at2 = series.find(point => point.index === 2)!.whiteWinrate
    const at5 = series.find(point => point.index === 5)!.whiteWinrate
    expect(at2).not.toBe(at5)
  })

  it('still labels each surviving point by its own move', () => {
    const series = seriesWithEvaluated(SANS, [1, 6])
    expect(series.map(point => point.label)).toEqual(['Start', '1. e4', '3... a6'])
  })
})
