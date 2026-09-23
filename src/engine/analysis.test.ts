import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildReviewRows, buildScoreSeries, buildWdlSeries, formatWhitePovEvaluation, scoreToCp, summarizeReview, uciToSan } from './analysis'

describe('review analysis helpers', () => {
  it('labels reviewed moves from side-to-move centipawn deltas', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('e4')
    const afterFen = game.fen()

    const rows = buildReviewRows(
      [move],
      new Map([
        [rootFen, { cp: 30 }],
        [afterFen, { cp: -20 }],
      ]),
      rootFen,
    )

    expect(rows).toMatchObject([
      {
        ply: 1,
        moveNumber: 1,
        san: 'e4',
        uci: 'e2e4',
        deltaCp: -10,
        quality: 'best',
      },
    ])
    expect(summarizeReview(rows)).toMatchObject({ best: 1, pending: 0 })
  })

  it('marks rows pending when either side of the move is missing an evaluation', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('d4')

    const rows = buildReviewRows([move], new Map([[rootFen, { cp: 15 }]]), rootFen)

    expect(rows[0]).toMatchObject({
      san: 'd4',
      uci: 'd2d4',
      quality: 'pending',
    })
    expect(summarizeReview(rows).pending).toBe(1)
  })

  it('does not assign a final quality label from shallow import scans', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('e4')
    const afterFen = game.fen()

    const rows = buildReviewRows(
      [move],
      new Map([
        [rootFen, { cp: 30, depth: 4, purpose: 'import-sweep' }],
        [afterFen, { cp: -20, depth: 5, purpose: 'import-sweep' }],
      ]),
      rootFen,
    )

    expect(rows[0]).toMatchObject({
      san: 'e4',
      deltaCp: -10,
      evalDepth: 4,
      confidence: 'shallow',
      quality: 'pending',
    })
  })

  it('keeps review move numbering from a black-to-move root', () => {
    const game = new Chess()
    game.move('e4')
    const rootFen = game.fen()
    const move = game.move('c5')!
    const rows = buildReviewRows([move], new Map([[rootFen, { cp: 0 }]]), rootFen)

    expect(rows[0]).toMatchObject({
      moveNumber: 1,
      sideToMove: 'b',
      san: 'c5',
    })
  })

  it('formats mate scores from White perspective', () => {
    const blackToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const whiteToMove = new Chess().fen()

    expect(formatWhitePovEvaluation(blackToMove, -10000, -3)).toBe('#3')
    expect(formatWhitePovEvaluation(blackToMove, 10000, 2)).toBe('#-2')
    expect(formatWhitePovEvaluation(whiteToMove, 42)).toBe('+0.42')
  })

  it('treats non-finite evaluation values as missing', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('e4')
    const afterFen = game.fen()

    expect(scoreToCp(Number.NaN)).toBeUndefined()
    expect(scoreToCp(undefined, Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(formatWhitePovEvaluation(rootFen, Number.NaN)).toBe('...')

    const rows = buildReviewRows(
      [move],
      new Map([
        [rootFen, { cp: Number.NaN, depth: Number.POSITIVE_INFINITY }],
        [afterFen, { cp: -20 }],
      ]),
      rootFen,
    )
    expect(rows[0]).toMatchObject({ quality: 'pending', confidence: 'pending' })

    expect(buildScoreSeries([move], new Map([[rootFen, { cp: Number.NaN }], [afterFen, { cp: Number.POSITIVE_INFINITY }]]), rootFen)).toEqual([])
    expect(buildWdlSeries([move], new Map([[rootFen, { cp: 0, wdl: { w: 1, d: Number.NaN, l: 1 } }]]), rootFen)).toEqual([])
  })

  it('formats a single UCI move as SAN for the current position', () => {
    const game = new Chess()
    expect(uciToSan(game.fen(), 'e2e4')).toBe('e4')
    expect(uciToSan(game.fen(), 'not-a-move')).toBeNull()
  })

  it('builds graph series from an imported root FEN', () => {
    const rootFen = '8/8/8/8/8/8/4K3/6k1 w - - 0 1'
    const game = new Chess(rootFen)
    const move = game.move('Kf3')
    const afterFen = game.fen()

    const series = buildScoreSeries(
      [move],
      new Map([
        [rootFen, { cp: 0 }],
        [afterFen, { cp: -50 }],
      ]),
      rootFen,
    )

    expect(series).toHaveLength(2)
    expect(series[0]?.label).toBe('Start')
    expect(series[1]?.label).toBe('1. Kf3')
  })

  it('uses wins plus half draws for White score when WDL is available', () => {
    const game = new Chess()
    const whiteToMove = game.fen()
    game.move('e4')
    const blackToMove = game.fen()

    const series = buildScoreSeries(
      [game.history({ verbose: true })[0]!],
      new Map([
        [whiteToMove, { cp: 0, wdl: { w: 100, d: 800, l: 100 } }],
        [blackToMove, { cp: 0, wdl: { w: 200, d: 700, l: 100 } }],
      ]),
      whiteToMove,
    )

    expect(series.map(point => point.whiteScore)).toEqual([50, 45])
  })
})
