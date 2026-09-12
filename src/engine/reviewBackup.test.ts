import { Chess } from 'chess.js'
import { describe, expect, it, vi } from 'vitest'
import { createReviewBackup, MAX_REVIEW_BACKUP_BYTES, parseReviewBackup, planReviewImport, REVIEW_BACKUP_FORMAT } from './reviewBackup'
import { importReviewBackup } from './reviewBackupClient'
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

  it('imports a full archive, including a UTF-8 BOM, without losing run details', () => {
    const saved = fixture()
    expect(parseReviewBackup('\uFEFF' + createReviewBackup([saved], 30).text)).toEqual([saved])
  })

  it('refuses incompatible, truncated and partly damaged backups before writing', () => {
    const envelope = JSON.parse(createReviewBackup([fixture()], 30).text)
    for (const text of ['{', 'null', '[]', '1. e4 *', JSON.stringify({ ...envelope, format: 'game-library' }),
      JSON.stringify({ ...envelope, version: 2 }), JSON.stringify({ ...envelope, exportedAt: null }),
      JSON.stringify({ ...envelope, reviews: {} }), JSON.stringify({ ...envelope, reviews: [fixture(), { ...fixture('second'), pgn: '1. Qz9 *' }] }),
      JSON.stringify({ ...envelope, reviews: Array.from({ length: 51 }, () => fixture()) })]) {
      expect(() => parseReviewBackup(text)).toThrow()
    }
  })

  it('rejects oversized files before constructing a worker or reading their contents', async () => {
    const worker = vi.fn()
    vi.stubGlobal('Worker', worker)
    try {
      await expect(importReviewBackup({ size: MAX_REVIEW_BACKUP_BYTES + 1 } as File)).rejects.toThrow('size limit')
      expect(worker).not.toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
})

describe('adding review backups without overwriting saved work', () => {
  it('deduplicates by normalized run content, including reversed reading order and changed IDs', () => {
    const saved = fixture()
    const copy = { ...fixture('another-id'), evaluations: [...saved.evaluations].reverse() }
    expect(planReviewImport([saved], [copy, saved])).toEqual({ added: [], skipped: 2, reassigned: 0 })
    expect(planReviewImport([], [copy, saved])).toEqual({ added: [copy], skipped: 1, reassigned: 0 })
  })

  it('keeps distinct readings sharing an ID and skips them on a later import', () => {
    const saved = fixture()
    const incoming = fixture()
    incoming.evaluations[0][1].cp = 90
    const before = JSON.stringify([saved, incoming])
    const first = planReviewImport([saved], [incoming], () => 'new-id')
    expect(first).toEqual({ added: [{ ...incoming, id: 'new-id' }], skipped: 0, reassigned: 1 })
    expect(JSON.stringify([saved, incoming])).toBe(before)
    expect(planReviewImport([saved, ...first.added], [incoming])).toEqual({ added: [], skipped: 1, reassigned: 0 })
  })

  it('reserves IDs belonging to later incoming runs when assigning collision IDs', () => {
    const existing = fixture()
    const one = { ...fixture(), title: 'First imported run' }
    const two = { ...fixture('reserved'), title: 'Second imported run' }
    const ids = vi.fn().mockReturnValueOnce('reserved').mockReturnValue('fresh')
    const plan = planReviewImport([existing], [one, two], ids)
    expect(plan.added.map(saved => saved.id)).toEqual(['fresh', 'reserved'])
    expect(plan.reassigned).toBe(1)
    expect(ids).toHaveBeenCalledTimes(2)
  })

  it('counts unreadable records toward capacity without treating them as valid duplicates', () => {
    const saved = fixture()
    const damaged = { ...saved, complete: false }
    const plan = planReviewImport([damaged], [saved], () => 'recovered')
    expect(plan.added[0].id).toBe('recovered')
    expect(plan.skipped).toBe(0)
    expect(() => planReviewImport(Array.from({ length: 50 }, () => damaged), [saved])).toThrow('only 0 remain')
  })

  it('refuses the entire addition when only some new runs fit, while permitting duplicates at capacity', () => {
    const existing = Array.from({ length: 49 }, (_, i) => fixture('old-' + i))
    const one = { ...fixture('one'), title: 'One' }
    const two = { ...fixture('two'), title: 'Two' }
    const before = JSON.stringify(existing)
    expect(() => planReviewImport(existing, [one, two])).toThrow('needs 2 free saved-review slots, but only 1 remain')
    expect(JSON.stringify(existing)).toBe(before)
    expect(planReviewImport([...existing, fixture()], [fixture()])).toEqual({ added: [], skipped: 1, reassigned: 0 })
  })
})
