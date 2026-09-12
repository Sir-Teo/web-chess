import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { GameNode } from '../hooks/useGameTree'
import { createReviewSession, recordReviewResult, snapshotReviewSession } from './reviewSession'
import { createSavedReview, readSavedReview, restoreSavedReview, reviewLineKey, savedReviewSummary } from './savedReviews'

function fixture(moves = ['Nf3', 'Nf6', 'g3'], rootFen?: string, depth = 16) {
  const game = new Chess(rootFen)
  const line: GameNode[] = [{ id: 'root', fen: game.fen(), uci: '', san: '', move: null, parent: null, children: ['1'] }]
  for (const san of moves) {
    const move = game.move(san)
    line.push({ id: String(line.length), fen: game.fen(), uci: move.from + move.to + (move.promotion ?? ''), san,
      move, parent: line.at(-1)!.id, children: line.length < moves.length ? [String(line.length + 1)] : [], comment: 'Keep my note' })
  }
  const settings = { engine: { profile: 'lite-single-local', name: 'Stockfish 18 Lite', version: '18.0.7' }, depth, hashMb: 64, showWdl: true }
  const session = createReviewSession(line, line[0].fen, settings, new Map(), null, 10)
  for (const node of line) recordReviewResult(session, node.fen, { cp: -15, depth, engine: settings.engine, wdl: { w: 100, d: 850, l: 50 }, nodes: 1000 })
  const report = snapshotReviewSession(session, 20)
  const saved = createSavedReview(line, report, { White: 'A', Black: 'B' }, [], 'saved-one')
  return { line, report, saved }
}

describe('portable, isolated saved reviews', () => {
  it('keeps exact scores, WDL, source, limits, notes and timestamps across JSON and fresh node IDs', () => {
    const { line, report, saved } = fixture()
    const reopened = readSavedReview(JSON.parse(JSON.stringify(saved)))!
    expect(reopened.pgn).toContain('Keep my note')
    expect(savedReviewSummary(reopened)).toMatchObject({ title: 'A – B', complete: true, evaluated: 4, total: 4 })
    const restored = restoreSavedReview(reopened, line.map(node => ({ ...node, id: 'new-' + node.id })))!
    expect(restored).toMatchObject({ settings: report.settings, startedAt: 10, finishedAt: 20, lineEndId: 'new-3' })
    expect(restored.evaluations.get(line[0].fen)).toMatchObject({ cp: -15, wdl: { w: 100, d: 850, l: 50 }, nodes: 1000 })
    restored.evaluations.delete(line[0].fen)
    expect(reopened.evaluations).toHaveLength(4)
    expect(report.evaluations.size).toBe(4)
  })

  it('round-trips a completed depth-6 report without discarding its readings', () => {
    const { saved, line } = fixture(['Nf3', 'Nf6'], undefined, 6)
    const restored = restoreSavedReview(readSavedReview(JSON.parse(JSON.stringify(saved)))!, line)!
    expect(restored.complete).toBe(true)
    expect(restored.settings.depth).toBe(6)
    expect([...restored.evaluations.values()].map(reading => reading.depth)).toEqual([6, 6, 6])
  })

  it('does not confuse transpositions or root halfmove counters', () => {
    const first = fixture(['Nf3', 'Nf6', 'Nc3', 'Nc6'])
    const other = fixture(['Nc3', 'Nc6', 'Nf3', 'Nf6'])
    expect(first.line.at(-1)!.fen).toBe(other.line.at(-1)!.fen)
    expect(reviewLineKey(first.line)).not.toBe(reviewLineKey(other.line))
    expect(restoreSavedReview(first.saved, other.line)).toBeNull()
    expect(reviewLineKey(first.line)).not.toBe(reviewLineKey(first.line.map((node, i) => i ? node : { ...node, fen: node.fen.replace('0 1', '40 1') })))
  })

  it('retains a partial report without filling the gaps', () => {
    const { line, report } = fixture()
    report.evaluations.delete(line[1].fen)
    report.complete = false
    const saved = createSavedReview(line, report, {}, [], 'partial')
    const restored = restoreSavedReview(readSavedReview(JSON.parse(JSON.stringify(saved)))!, line)!
    expect(restored.complete).toBe(false)
    expect(restored.evaluations.has(line[1].fen)).toBe(false)
    expect(restored.evaluations.size).toBe(3)
  })

  it('saves completed games and positions requiring no engine work', () => {
    for (const { saved, report } of [
      fixture(['f3', 'e5', 'g4', 'Qh4#']),
      fixture(['Qg7#'], '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1'),
      fixture(['Kd1'], '8/8/8/8/8/4k3/8/4K3 w - - 0 1'),
    ]) {
      expect(saved.total).toBe(report.total)
      expect(saved.complete).toBe(true)
      expect(readSavedReview(saved)).not.toBeNull()
    }
  })

  it('rejects damaged settings, incompatible schemas and mismatched histories', () => {
    const { saved } = fixture()
    for (const invalid of [null, {}, { ...saved, version: 2 }, { ...saved, total: 99 }, { ...saved, finishedAt: 1 },
      { ...saved, complete: false }, { ...saved, settings: { ...saved.settings, hashMb: NaN } },
      { ...saved, pgn: '1. d4 *' }, { ...saved, lineKey: 'another line' }]) expect(readSavedReview(invalid)).toBeNull()
  })

  it('rejects duplicate, foreign, bounded or nonfinite readings instead of silently repairing a report', () => {
    const { saved } = fixture()
    const [fen, reading] = saved.evaluations[0]
    for (const replacement of [{ ...reading, cp: NaN }, { ...reading, depth: 2 }, { ...reading, scoreBound: 'lowerbound' },
      { ...reading, engine: { ...reading.engine, version: '19' } }, { ...reading, wdl: { w: -1, d: 1000, l: 1 } }]) {
      expect(readSavedReview({ ...saved, evaluations: [[fen, replacement], ...saved.evaluations.slice(1)] })).toBeNull()
    }
    expect(readSavedReview({ ...saved, evaluations: [saved.evaluations[1], ...saved.evaluations.slice(1)] })).toBeNull()
    expect(readSavedReview({ ...saved, evaluations: [['unrelated-fen', reading], ...saved.evaluations.slice(1)] })).toBeNull()
  })
})
