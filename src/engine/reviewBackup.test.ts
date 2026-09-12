import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { createReviewBackup, REVIEW_BACKUP_FORMAT } from './reviewBackup'
import { MAX_SAVED_REVIEWS, readSavedReview, reviewLineKey } from './savedReviews'

function fixture(id = 'first') {
  const game = new Chess()
  const root = game.fen()
  game.move('e4')
  const engine = { profile: 'lite-single-local', name: 'Stockfish 18 Lite', version: '18.0.7' }
  return readSavedReview({
    version: 1, id, title: 'A – B', lineKey: reviewLineKey([{ fen: root, uci: '' }, { fen: game.fen(), uci: 'e2e4' }]),
    pgn: '1. e4 {Keep this note} *', settings: { engine, depth: 6, hashMb: 64, showWdl: true },
    startedAt: 10, finishedAt: 20, total: 2, reused: 1, evaluated: 2, complete: true,
    evaluations: [root, game.fen()].map(fen => [fen, { cp: 25, depth: 6, engine, wdl: { w: 300, d: 500, l: 200 },
      bestMove: 'e2e4', nodes: 1234, nps: 15000, time: 80, searchedAt: 15 }]),
  })!
}

describe('complete review backups', () => {
  it('preserves all supported run fields in complete and partial reports', () => {
    const complete = fixture()
    const partial = { ...fixture('partial'), evaluations: complete.evaluations.slice(0, 1), evaluated: 1, reused: 0, complete: false }
    const { text, count } = createReviewBackup([complete, partial], 30)
    expect(count).toBe(2)
    expect(JSON.parse(text)).toEqual({ format: REVIEW_BACKUP_FORMAT, version: 1, exportedAt: 30, reviews: [complete, partial] })
    expect(JSON.parse(text).reviews.every((review: unknown) => readSavedReview(review))).toBe(true)
  })

  it('does not quietly omit a damaged stored run or label its scores as valid', () => {
    const good = fixture()
    const damaged = { ...fixture('damaged'), evaluations: [[good.evaluations[0][0], { ...good.evaluations[0][1], cp: NaN }], good.evaluations[1]] }
    expect(() => createReviewBackup([good, damaged])).toThrow('Review 2 is unreadable')
    expect(() => createReviewBackup([good, { ...good, settings: { ...good.settings, depth: 40 } }])).toThrow('Review 2 is unreadable')
  })

  it('bounds a whole archive and checks the export timestamp', () => {
    expect(() => createReviewBackup(Array.from({ length: MAX_SAVED_REVIEWS + 1 }, () => fixture()))).toThrow('up to 50')
    expect(() => createReviewBackup([], NaN)).toThrow('date')
    expect(JSON.parse(createReviewBackup([], 0).text).reviews).toEqual([])
  })
})
