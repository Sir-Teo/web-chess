import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { GameNode } from '../hooks/useGameTree'
import { compareReviews, comparisonScore, comparisonWdl } from './reviewComparison'
import type { ReviewSnapshot } from './reviewSession'
import { createSavedReview, reviewLineKey, type SavedReview } from './savedReviews'
import { createReviewSession, recordReviewResult, snapshotReviewSession } from './reviewSession'

function fixture() {
  const game = new Chess()
  const line: GameNode[] = [{ id: 'root', fen: game.fen(), uci: '', san: '', move: null, parent: null, children: ['e4'] }]
  const move = game.move('e4')
  line.push({ id: 'e4', fen: game.fen(), uci: 'e2e4', san: 'e4', move, parent: 'root', children: [] })
  const settings = { depth: 16, hashMb: 64, showWdl: true, engine: { profile: 'lite-single-local', name: 'Stockfish', version: '18' } }
  const open: ReviewSnapshot = { lineEndId: 'e4', settings, startedAt: 1, finishedAt: 2, total: 2, reused: 0, complete: true,
    evaluations: new Map(line.map(node => [node.fen, { cp: 100, depth: 16, bestMove: 'e2e4' }])) }
  const saved: SavedReview = { ...open, id: 'saved', title: 'Example', version: 1, pgn: '1. e4 *', lineKey: reviewLineKey(line), evaluated: 2,
    evaluations: line.map(node => [node.fen, { cp: 0, depth: 16, bestMove: 'd2d4' }]) }
  return { line, open, saved }
}

describe('review comparisons', () => {
  it('uses White point of view at both turns and keeps sources separate', () => {
    const { line, open, saved } = fixture()
    const compared = compareReviews(line, open, saved)!
    expect(compared.rows.map(row => row.changePawns)).toEqual([1, -1])
    expect(compared.rows.map(row => row.label)).toEqual(['Start', '1. e4'])
    expect(compared).toMatchObject({ paired: 2, changedScores: 2, changedBestMoves: 2, missingOpen: 0, missingSaved: 0 })
    expect(comparisonScore(line[1].fen, open.evaluations.get(line[1].fen))).toBe('-1.00')
    expect(saved.evaluations[0][1].cp).toBe(0)
  })

  it('keeps mate distance and never subtracts its sentinel centipawns', () => {
    const { line, open, saved } = fixture()
    open.evaluations.set(line[1].fen, { cp: 10000, mate: 3 })
    saved.evaluations[1][1] = { cp: 10000, mate: 5 }
    const row = compareReviews(line, open, saved)!.rows[1]
    expect(row.scoreChanged).toBe(true)
    expect(row.changePawns).toBeNull()
    expect(comparisonScore(row.node.fen, row.open)).toBe('#-3')
  })

  it('counts partial coverage without fabricating scores or best-move changes', () => {
    const { line, open, saved } = fixture()
    open.evaluations.delete(line[1].fen)
    saved.evaluations.shift()
    const compared = compareReviews(line, open, saved)!
    expect(compared).toMatchObject({ paired: 0, changedScores: 0, changedBestMoves: 0, missingOpen: 1, missingSaved: 1 })
    expect(compared.rows.every(row => row.differs && row.changePawns === null)).toBe(true)
    expect(comparisonScore(line[1].fen, undefined)).toBe('Not reviewed')
  })

  it('compares WDL independently of scores and normalizes Black to move', () => {
    const { line, open, saved } = fixture()
    const current = { cp: 0, wdl: { w: 100, d: 600, l: 300 } }
    open.evaluations.set(line[1].fen, current)
    saved.evaluations[1][1] = { cp: 0, wdl: { w: 200, d: 600, l: 200 } }
    expect(compareReviews(line, open, saved)!.rows[1]).toMatchObject({ scoreChanged: false, wdlChanged: true, differs: true })
    expect(comparisonWdl(line[1].fen, current)).toBe('30.0 / 60.0 / 10.0%')
    expect(comparisonWdl(line[1].fen, undefined)).toBe('Not recorded')
  })

  it('refuses a different reviewed line or a report from another node', () => {
    const { line, open, saved } = fixture()
    expect(compareReviews(line, open, { ...saved, lineKey: 'another' })).toBeNull()
    expect(compareReviews(line, { ...open, lineEndId: 'other' }, saved)).toBeNull()
  })

  it('does not count a legacy repetition score as a missing or changed reading', () => {
    const { line, open } = fixture()
    const game = new Chess()
    line.splice(1)
    for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) {
      const move = game.move(san)
      line.push({ id: String(line.length), fen: game.fen(), uci: move.from + move.to, san, move, parent: line.at(-1)!.id, children: [] })
    }
    const session = createReviewSession(line, line[0].fen, open.settings, new Map(), null, 1)
    for (const node of line) recordReviewResult(session, node.fen, { cp: 20, depth: 16, engine: open.settings.engine })
    const current = snapshotReviewSession(session, 2)
    const saved = createSavedReview(line, current, {}, [], 'draw')
    saved.total = saved.evaluated = 9
    saved.evaluations.push([line.at(-1)!.fen, { cp: 900, depth: 16, engine: open.settings.engine }])
    const compared = compareReviews(line, current, saved)!
    expect(compared).toMatchObject({ paired: 8, missingOpen: 0, missingSaved: 0, changedScores: 0 })
    expect(compared.rows).toHaveLength(8)
    expect(compared.rows.at(-1)!.label).toBe('4. Ng1')
    expect(saved.evaluations.at(-1)![1].cp).toBe(900)
  })
})
