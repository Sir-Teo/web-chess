import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { EngineLine } from '../hooks/useStockfishEngine'
import { parseInfoLine } from '../hooks/useStockfishEngine'
import {
  type EvalSnapshot,
  accuracyFromCentipawnLoss,
  accuracyFromWinPercentLoss,
  buildReviewRows,
  buildWdlSeries,
  buildWinrateSeries,
  normalizeWhitePovWdl,
  filterReviewRowsBySide,
  formatCompactWhitePovEvaluation,
  formatWhitePovEvaluation,
  isTerminalPositionFen,
  isReviewEvaluationSufficient,
  mergeEvaluationSnapshot,
  scoreToCp,
  shouldReplaceEvaluationSnapshot,
  rankCriticalMoments,
  summarizeAccuracy,
  summarizeReview,
  uciToSan,
  winPercentFromCp,
  recordEvaluation,
  engineLineToSnapshot,
  pvLineMoves,
} from './analysis'

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

  it('uses mate scores when reviewing move quality', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('e4')
    const afterFen = game.fen()

    const keepsForcedMate = buildReviewRows(
      [move],
      new Map([
        [rootFen, { cp: Number.NaN, mate: 3 }],
        [afterFen, { cp: Number.NaN, mate: -2 }],
      ]),
      rootFen,
    )
    const dropsForcedMate = buildReviewRows(
      [move],
      new Map([
        [rootFen, { cp: Number.NaN, mate: 3 }],
        [afterFen, { cp: 0 }],
      ]),
      rootFen,
    )

    expect(keepsForcedMate[0]).toMatchObject({
      deltaCp: 0,
      quality: 'best',
    })
    expect(dropsForcedMate[0]).toMatchObject({
      deltaCp: -10000,
      quality: 'blunder',
    })
  })

  it('reviews final checkmates without waiting for a terminal engine score', () => {
    const game = new Chess()
    const moves = [
      game.move('f3')!,
      game.move('e5')!,
      game.move('g4')!,
    ]
    const beforeMateFen = game.fen()
    moves.push(game.move('Qh4#')!)

    const rows = buildReviewRows(
      moves,
      new Map([
        [beforeMateFen, { cp: 10000, bestMove: 'd8h4', depth: 20, purpose: 'batch-review' }],
      ]),
    )

    expect(rows.at(-1)).toMatchObject({
      san: 'Qh4#',
      quality: 'best',
      confidence: 'deep',
      deltaCp: 0,
    })
    expect(isTerminalPositionFen(game.fen())).toBe(true)
    expect(isTerminalPositionFen(beforeMateFen)).toBe(false)
    expect(isTerminalPositionFen('not a fen')).toBe(false)
  })

  it('includes finite mate evaluations in the winrate graph', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('e4')
    const afterFen = game.fen()

    const series = buildWinrateSeries(
      [move],
      new Map([
        [rootFen, { cp: Number.NaN, mate: 3 }],
        [afterFen, { cp: Number.NaN, mate: -2 }],
      ]),
      rootFen,
    )

    expect(series).toHaveLength(2)
    expect(series[0]?.label).toBe('Start')
    expect(series[1]?.label).toBe('1. e4')
    expect(series[0]?.whiteWinrate).toBeGreaterThan(99)
    expect(series[1]?.whiteWinrate).toBeGreaterThan(99)
  })

  it('adds best-move hints to review rows', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('d4')
    const afterFen = game.fen()

    const rows = buildReviewRows(
      [move],
      new Map([
        [rootFen, { cp: 0, bestMove: 'e2e4' }],
        [afterFen, { cp: 100 }],
      ]),
      rootFen,
    )

    expect(rows[0]).toMatchObject({
      san: 'd4',
      bestMove: 'e2e4',
      bestMoveSan: 'e4',
      quality: 'inaccuracy',
    })
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

  it('detects review-ready evaluations for queue reuse', () => {
    expect(isReviewEvaluationSufficient(undefined, 12)).toBe(false)
    expect(isReviewEvaluationSufficient({ cp: Number.NaN, depth: 20 }, 12)).toBe(false)
    expect(isReviewEvaluationSufficient({ cp: 20, depth: 20, purpose: 'import-sweep' }, 12)).toBe(false)
    expect(isReviewEvaluationSufficient({ cp: 20, depth: 8 }, 6)).toBe(false)
    expect(isReviewEvaluationSufficient({ cp: 20, depth: 12 }, 16)).toBe(false)
    expect(isReviewEvaluationSufficient({ cp: 20, depth: 16 }, 16)).toBe(true)
    expect(isReviewEvaluationSufficient({ cp: Number.NaN, mate: -3, depth: 18 }, 16)).toBe(true)
  })

  it('keeps deeper review evaluations over shallow import scans', () => {
    const current = { cp: 42, depth: 18, bestMove: 'e2e4', purpose: 'batch-review' as const }
    const shallowImport = { cp: -80, depth: 4, bestMove: 'd2d4', purpose: 'import-sweep' as const }

    expect(shouldReplaceEvaluationSnapshot(current, shallowImport)).toBe(false)
    expect(mergeEvaluationSnapshot(current, shallowImport)).toBe(current)
  })

  it('allows deeper local evaluations to replace shallower stored snapshots', () => {
    const deeperManual = { cp: 35, depth: 18, nodes: 2000, purpose: 'manual' as const }

    expect(mergeEvaluationSnapshot(
      { cp: 10, depth: 12, nodes: 1000, purpose: 'cloud-eval' as const },
      deeperManual,
    )).toEqual(deeperManual)
    expect(mergeEvaluationSnapshot(
      { cp: 10, depth: 12, nodes: 1000, purpose: 'auto' as const },
      deeperManual,
    )).toEqual(deeperManual)
  })

  it('prefers cloud evaluations unless local analysis is deeper', () => {
    const cloudSameDepth = { cp: 12, depth: 16, nodes: 300000, purpose: 'cloud-eval' as const }
    const deeperLocal = { cp: 10, depth: 20, nodes: 500000, purpose: 'manual' as const }

    expect(mergeEvaluationSnapshot(
      { cp: 8, depth: 16, nodes: 250000, purpose: 'auto' as const },
      cloudSameDepth,
    )).toEqual(cloudSameDepth)
    expect(mergeEvaluationSnapshot(deeperLocal, cloudSameDepth)).toBe(deeperLocal)
  })

  it('can merge WDL into a kept snapshot when the score matches', () => {
    const current = {
      cp: 20,
      depth: 18,
      purpose: 'batch-review' as const,
      wdl: { w: 10, d: 80, l: 10 },
    }
    const matchingScoreWdl = {
      cp: 20,
      depth: 4,
      purpose: 'import-sweep' as const,
      wdl: { w: 12, d: 76, l: 12 },
    }
    const differentScoreWdl = {
      cp: 21,
      depth: 4,
      purpose: 'import-sweep' as const,
      wdl: { w: 13, d: 74, l: 13 },
    }

    expect(mergeEvaluationSnapshot(current, matchingScoreWdl)).toEqual({
      ...current,
      wdl: matchingScoreWdl.wdl,
    })
    expect(mergeEvaluationSnapshot(current, differentScoreWdl)).toBe(current)
  })

  it('ignores invalid replacement evaluations', () => {
    const current = { cp: 15, depth: 18, purpose: 'manual' as const }
    const invalid = { cp: Number.NaN, depth: 99, purpose: 'manual' as const }

    expect(shouldReplaceEvaluationSnapshot(current, invalid)).toBe(false)
    expect(mergeEvaluationSnapshot(current, invalid)).toBe(current)
    expect(mergeEvaluationSnapshot(undefined, invalid)).toBeUndefined()
  })

  it('summarizes player accuracy from evaluated centipawn loss', () => {
    const rows = [
      { ply: 1, moveNumber: 1, sideToMove: 'w' as const, san: 'e4', uci: 'e2e4', quality: 'best' as const, deltaCp: -10, confidence: 'standard' as const, phase: 'opening' as const },
      { ply: 2, moveNumber: 1, sideToMove: 'b' as const, san: 'e5', uci: 'e7e5', quality: 'mistake' as const, deltaCp: -220, confidence: 'standard' as const, phase: 'opening' as const },
      { ply: 3, moveNumber: 2, sideToMove: 'w' as const, san: 'Nf3', uci: 'g1f3', quality: 'pending' as const, confidence: 'pending' as const, phase: 'opening' as const },
    ]

    expect(accuracyFromCentipawnLoss(40)).toBe(100)
    expect(accuracyFromCentipawnLoss(-300)).toBeCloseTo(36.8, 1)
    const summary = summarizeAccuracy(rows)
    expect(summary).toMatchObject({
      evaluatedMoves: 2,
      pendingMoves: 1,
    })
    // These rows carry no winPercentBefore, so there is no swing to weight by
    // and every weight is the floor — which makes the aggregate the plain mean
    // it was before. That is the honest behaviour for rows with no evaluation
    // series behind them; the weighting only bites on a real review.
    expect(summary.overall).toBeCloseTo(72.4, 1)
    expect(summary.white).toBeCloseTo(96.7, 1)
    expect(summary.black).toBeCloseTo(48.0, 1)
    expect(summary.averageCentipawnLoss).toBe(115)
    expect(summary.whiteAverageCentipawnLoss).toBe(10)
    expect(summary.blackAverageCentipawnLoss).toBe(220)
  })

  it('filters review rows by player side', () => {
    const rows = [
      { ply: 1, moveNumber: 1, sideToMove: 'w' as const, san: 'e4', uci: 'e2e4', quality: 'best' as const, confidence: 'standard' as const, phase: 'opening' as const },
      { ply: 2, moveNumber: 1, sideToMove: 'b' as const, san: 'e5', uci: 'e7e5', quality: 'good' as const, confidence: 'standard' as const, phase: 'opening' as const },
    ]

    expect(filterReviewRowsBySide(rows, 'both')).toBe(rows)
    expect(filterReviewRowsBySide(rows, 'white').map(row => row.uci)).toEqual(['e2e4'])
    expect(filterReviewRowsBySide(rows, 'black').map(row => row.uci)).toEqual(['e7e5'])
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

    expect(buildWinrateSeries([move], new Map([[rootFen, { cp: Number.NaN }], [afterFen, { cp: Number.POSITIVE_INFINITY }]]), rootFen)).toEqual([])
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

    const series = buildWinrateSeries(
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

  it('labels graph points from black-to-move imported root positions', () => {
    const rootFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const game = new Chess(rootFen)
    const blackMove = game.move('c5')!
    const afterBlackFen = game.fen()
    const whiteMove = game.move('Nf3')!
    const afterWhiteFen = game.fen()

    const evaluations = new Map([
      [rootFen, { cp: 0, wdl: { w: 100, d: 800, l: 100 } }],
      [afterBlackFen, { cp: -40, wdl: { w: 120, d: 780, l: 100 } }],
      [afterWhiteFen, { cp: 20, wdl: { w: 110, d: 780, l: 110 } }],
    ])

    expect(buildWinrateSeries([blackMove, whiteMove], evaluations, rootFen).map(point => point.label)).toEqual([
      'Start',
      '1... c5',
      '2. Nf3',
    ])
    expect(buildWdlSeries([blackMove, whiteMove], evaluations, rootFen).map(point => point.label)).toEqual([
      'Start',
      '1... c5',
      '2. Nf3',
    ])
  })
})

describe('formatCompactWhitePovEvaluation', () => {
  const whiteToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const blackToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'

  it('keeps one decimal for ordinary scores', () => {
    expect(formatCompactWhitePovEvaluation(whiteToMove, 19)).toBe('+0.2')
    expect(formatCompactWhitePovEvaluation(whiteToMove, -145)).toBe('-1.5')
  })

  it('drops the decimal for large advantages so the bar never truncates', () => {
    expect(formatCompactWhitePovEvaluation(whiteToMove, 1234)).toBe('+12')
    expect(formatCompactWhitePovEvaluation(whiteToMove, -998)).toBe('-10')
  })

  it('normalizes to white perspective', () => {
    expect(formatCompactWhitePovEvaluation(blackToMove, 50)).toBe('-0.5')
    expect(formatCompactWhitePovEvaluation(blackToMove, undefined, 3)).toBe('#-3')
    expect(formatCompactWhitePovEvaluation(whiteToMove, undefined, 3)).toBe('#3')
  })

  it('matches the mate notation the panels use', () => {
    expect(formatCompactWhitePovEvaluation(whiteToMove, undefined, 13))
      .toBe(formatWhitePovEvaluation(whiteToMove, undefined, 13))
  })

  it('returns null without a score', () => {
    expect(formatCompactWhitePovEvaluation(whiteToMove)).toBeNull()
  })
})

describe('replaying a history that does not fit its root position', () => {
  // A history and a root position disagree for ordinary reasons — an edited
  // position, an imported PGN, a shared link. chess.js throws on the first move
  // that will not go, and these run inside a React render, so the throw reached
  // the error boundary and took the whole app down.
  const foreignHistory = () => {
    const other = new Chess()
    other.move('e4')
    other.move('e5')
    other.move('Nf3')
    return other.history({ verbose: true })
  }
  const endgame = '8/P6k/8/8/8/8/6K1/8 w - - 0 1'

  it('stops the review at the first move that will not replay', () => {
    const rows = buildReviewRows(foreignHistory(), new Map(), endgame)
    expect(rows).toEqual([])
  })

  it('stops the winrate series instead of throwing', () => {
    expect(() => buildWinrateSeries(foreignHistory(), new Map(), endgame)).not.toThrow()
  })

  it('stops the WDL series instead of throwing', () => {
    expect(() => buildWdlSeries(foreignHistory(), new Map(), endgame)).not.toThrow()
  })

  it('still replays a history that does fit', () => {
    const game = new Chess()
    game.move('e4')
    game.move('e5')
    expect(buildReviewRows(game.history({ verbose: true }), new Map())).toHaveLength(2)
  })
})


/**
 * The three series builders share one cached replay of the history, keyed by the
 * root position and every move in it. A key that dropped any part of that would
 * hand one game's positions to another game's evaluations, and every symptom of
 * it would look like an evaluation bug rather than a caching one.
 */
describe('the shared history replay', () => {
    const playFrom = (rootFen: string | undefined, sans: string[]) => {
        const chess = rootFen ? new Chess(rootFen) : new Chess()
        for (const san of sans) chess.move(san)
        return { moves: chess.history({ verbose: true }), fen: chess.fen() }
    }

    it('tells apart two lines that share a prefix', () => {
        const root = new Chess().fen()
        const italian = playFrom(undefined, ['e4', 'e5', 'Nf3'])
        const scotch = playFrom(undefined, ['e4', 'e5', 'Nf3', 'Nc6', 'd4'])

        const shortRows = buildReviewRows(italian.moves, new Map(), root)
        const longRows = buildReviewRows(scotch.moves, new Map(), root)

        expect(shortRows.map(row => row.san)).toEqual(['e4', 'e5', 'Nf3'])
        expect(longRows.map(row => row.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'd4'])

        // Re-asking for the shorter line must not return the longer one's rows.
        expect(buildReviewRows(italian.moves, new Map(), root).map(row => row.san))
            .toEqual(['e4', 'e5', 'Nf3'])
    })

    it('tells apart the same moves played from two different roots', () => {
        const fromStart = playFrom(undefined, ['e4'])
        const shifted = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2'
        const fromShifted = playFrom(shifted, ['e4'])

        const startRows = buildReviewRows(fromStart.moves, new Map([[new Chess().fen(), { cp: 30 }]]), new Chess().fen())
        const shiftedRows = buildReviewRows(fromShifted.moves, new Map([[shifted, { cp: 30 }]]), shifted)

        expect(startRows).toHaveLength(1)
        expect(shiftedRows).toHaveLength(1)
        expect(startRows[0]!.moveNumber).toBe(1)
        expect(shiftedRows[0]!.moveNumber).toBe(2)
    })

    it('still reflects a new evaluation for an unchanged history', () => {
        const root = new Chess().fen()
        const { moves, fen: afterFen } = playFrom(undefined, ['e4'])

        const pending = buildReviewRows(moves, new Map(), root)
        expect(pending[0]!.quality).toBe('pending')

        const scored = buildReviewRows(
            moves,
            new Map<string, EvalSnapshot>([
                [root, { cp: 30, depth: 20 }],
                // POV side-to-move: after 1. e4 a positive score is Black's.
                [afterFen, { cp: 400, depth: 20 }],
            ]),
            root,
        )
        expect(scored[0]!.quality).toBe('blunder')
    })

    it('keeps the winrate and WDL series in step with the rows', () => {
        const root = new Chess().fen()
        const { moves, fen: afterFen } = playFrom(undefined, ['e4'])
        const evaluations = new Map<string, EvalSnapshot>([
            [root, { cp: 30, depth: 20, wdl: { w: 400, d: 500, l: 100 } }],
            [afterFen, { cp: -30, depth: 20, wdl: { w: 100, d: 500, l: 400 } }],
        ])

        expect(buildWinrateSeries(moves, evaluations, root).map(point => point.label))
            .toEqual(['Start', '1. e4'])
        expect(buildWdlSeries(moves, evaluations, root).map(point => point.label))
            .toEqual(['Start', '1. e4'])
    })
})

describe('white-perspective WDL', () => {
  const wdl = { w: 700, d: 200, l: 100 }
  const whiteToMove = '8/8/8/8/8/8/8/K6k w - - 0 1'
  const blackToMove = '8/8/8/8/8/8/8/K6k b - - 0 1'

  it('reads the engine numbers straight through when white is to move', () => {
    expect(normalizeWhitePovWdl(whiteToMove, wdl)).toEqual({ white: 70, draw: 20, black: 10 })
  })

  it('swaps win and loss when black is to move', () => {
    expect(normalizeWhitePovWdl(blackToMove, wdl)).toEqual({ white: 10, draw: 20, black: 70 })
  })

  it('refuses numbers a bar cannot be drawn from', () => {
    expect(normalizeWhitePovWdl(whiteToMove, { w: 0, d: 0, l: 0 })).toBeNull()
    expect(normalizeWhitePovWdl(whiteToMove, { w: -5, d: 10, l: 5 })).toBeNull()
    expect(normalizeWhitePovWdl(whiteToMove, { w: Number.NaN, d: 1, l: 1 })).toBeNull()
  })
})

describe('position-aware move accuracy', () => {
  it('reads an even position as an even split and saturates at the limit', () => {
    expect(winPercentFromCp(0)).toBeCloseTo(50, 10)
    expect(winPercentFromCp(5000)).toBe(winPercentFromCp(2000))
    expect(winPercentFromCp(-5000)).toBe(winPercentFromCp(-2000))
    expect(winPercentFromCp(250)).toBeCloseTo(100 - winPercentFromCp(-250), 10)
  })

  it('scores a move that gives nothing away as full marks', () => {
    expect(accuracyFromWinPercentLoss(0)).toBeCloseTo(100, 3)
    expect(accuracyFromWinPercentLoss(5)).toBeGreaterThan(accuracyFromWinPercentLoss(40))
    expect(accuracyFromWinPercentLoss(100)).toBe(0)
    expect(accuracyFromWinPercentLoss(Number.NaN)).toBe(0)
  })

  it('charges the same centipawn drop far less when the game is already decided', () => {
    // Identical -300cp move, played from equality and from a won position.
    const rowsFromEven = reviewRowsForOneMove(0, 300)
    const rowsFromWon = reviewRowsForOneMove(1800, -1500)

    expect(rowsFromEven[0].deltaCp).toBe(-300)
    expect(rowsFromWon[0].deltaCp).toBe(-300)

    // The old centipawn-only curve scored both at exp(-1), about 36.8%.
    expect(accuracyFromCentipawnLoss(-300)).toBeCloseTo(36.8, 1)

    const even = summarizeAccuracy(rowsFromEven).white as number
    const won = summarizeAccuracy(rowsFromWon).white as number
    expect(even).toBeLessThan(40)
    expect(won).toBeGreaterThan(95)
  })

  it('stops calling an imprecision in a won game a blunder', () => {
    // -300cp is a blunder on the raw scale in both positions.
    expect(reviewRowsForOneMove(0, 300)[0]).toMatchObject({ quality: 'blunder' })
    // From +18 it costs 0.3 percentage points, so it is graded on that instead.
    expect(reviewRowsForOneMove(1800, -1500)[0]).toMatchObject({ quality: 'best' })
  })

  it('never grades a move harsher than the raw centipawn reading', () => {
    // Losing a whole game from equality: both readings agree it is a blunder.
    expect(reviewRowsForOneMove(0, 900)[0]).toMatchObject({ quality: 'blunder' })
    // A tiny slip stays 'best' rather than being dragged down by win percent.
    expect(reviewRowsForOneMove(0, 5)[0]).toMatchObject({ quality: 'best' })
  })

  it('falls back to the centipawn curve for rows built without a win-percent loss', () => {
    const legacyRow = {
      ply: 1,
      moveNumber: 1,
      sideToMove: 'w' as const,
      san: 'e4',
      uci: 'e2e4',
      quality: 'blunder' as const,
      deltaCp: -300,
      confidence: 'standard' as const,
      phase: 'opening' as const,
    }
    expect(summarizeAccuracy([legacyRow]).white).toBeCloseTo(accuracyFromCentipawnLoss(-300), 10)
  })
})

/** One white move from the start, with the two evaluations the review needs. */
function reviewRowsForOneMove(rootCp: number, afterCp: number) {
  const game = new Chess()
  const rootFen = game.fen()
  const move = game.move('e4')!
  const afterFen = game.fen()
  return buildReviewRows(
    [move],
    new Map([[rootFen, { cp: rootCp }], [afterFen, { cp: afterCp }]]),
    rootFen,
  )
}

describe('ranking the moves that cost the most', () => {
  const row = (over: Partial<import('./analysis').ReviewRow>) => ({
    ply: 1,
    moveNumber: 1,
    sideToMove: 'w' as const,
    san: 'e4',
    uci: 'e2e4',
    quality: 'mistake' as const,
    confidence: 'standard' as const,
    phase: 'middleGame' as const,
    ...over,
  })

  it('puts the costliest move first', () => {
    const ranked = rankCriticalMoments([
      row({ san: 'small', deltaCp: -150, winPercentLoss: 5 }),
      row({ san: 'big', deltaCp: -160, winPercentLoss: 30 }),
      row({ san: 'middling', deltaCp: -400, winPercentLoss: 12 }),
    ])
    expect(ranked.map(r => r.san)).toEqual(['big', 'middling', 'small'])
  })

  it('ranks by what a move cost, not by its centipawn delta', () => {
    // The larger centipawn drop happened where it mattered less.
    const ranked = rankCriticalMoments([
      row({ san: 'bigDropLateGame', deltaCp: -500, winPercentLoss: 3 }),
      row({ san: 'turnedTheGame', deltaCp: -200, winPercentLoss: 25 }),
    ])
    expect(ranked[0].san).toBe('turnedTheGame')
  })

  it('only considers moves the review called a mistake', () => {
    const ranked = rankCriticalMoments([
      row({ san: 'best', quality: 'best', deltaCp: -5, winPercentLoss: 1 }),
      row({ san: 'good', quality: 'good', deltaCp: -40, winPercentLoss: 3 }),
      row({ san: 'pending', quality: 'pending', deltaCp: -400, winPercentLoss: 40 }),
      row({ san: 'blunder', quality: 'blunder', deltaCp: -400, winPercentLoss: 40 }),
    ])
    expect(ranked.map(r => r.san)).toEqual(['blunder'])
  })

  it('skips a row with no evaluation at all', () => {
    expect(rankCriticalMoments([row({ san: 'unevaluated' })])).toEqual([])
  })

  it('falls back to the centipawn reading for a row from an older review', () => {
    const ranked = rankCriticalMoments([
      row({ san: 'slight', deltaCp: -150 }),
      row({ san: 'severe', deltaCp: -600 }),
    ])
    expect(ranked.map(r => r.san)).toEqual(['severe', 'slight'])
  })

  it('honours the limit, including a nonsensical one', () => {
    const many = Array.from({ length: 12 }, (_, i) => row({ san: `m${i}`, deltaCp: -200, winPercentLoss: i }))
    expect(rankCriticalMoments(many)).toHaveLength(5)
    expect(rankCriticalMoments(many, 3)).toHaveLength(3)
    expect(rankCriticalMoments(many, 0)).toEqual([])
    expect(rankCriticalMoments(many, -2)).toEqual([])
  })

  it('has nothing to rank in a clean game', () => {
    expect(rankCriticalMoments([])).toEqual([])
    expect(rankCriticalMoments([row({ quality: 'best', deltaCp: -2, winPercentLoss: 0.2 })])).toEqual([])
  })
})

describe('bounded engine scores', () => {
    /**
     * `score cp 150 lowerbound` means "at least 150", not "150". It comes out
     * of an aspiration-window re-search, and the exact line normally follows a
     * moment later — but a search stopped in between leaves the bound as the
     * deepest thing the app saw. Taking it as an evaluation turns an inequality
     * into a number, and in a review that number becomes a swing the player
     * never caused.
     *
     * web-xiangqi does not parse these flags at all; this repo parsed them and
     * then dropped them before they reached a snapshot, which came to the same
     * thing.
     */
    const exact = (cp: number, depth: number): EvalSnapshot => ({ cp, depth, nodes: 1000, purpose: 'manual' })
    const bounded = (cp: number, depth: number, bound: 'upperbound' | 'lowerbound'): EvalSnapshot =>
        ({ cp, depth, nodes: 5000, scoreBound: bound, purpose: 'manual' })

    it('prefers an exact score to a bound at the same depth', () => {
        expect(shouldReplaceEvaluationSnapshot(bounded(150, 20, 'lowerbound'), exact(210, 20))).toBe(true)
    })

    it('does not let a bound displace an exact score at the same depth', () => {
        // Even though the bounded line searched five times the nodes.
        expect(shouldReplaceEvaluationSnapshot(exact(210, 20), bounded(150, 20, 'lowerbound'))).toBe(false)
    })

    it('still takes a deeper bound over a shallower exact score', () => {
        // Depth is the stronger signal: a bound at 24 plies knows more about
        // the position than an exact score at 18.
        expect(shouldReplaceEvaluationSnapshot(exact(210, 18), bounded(150, 24, 'upperbound'))).toBe(true)
    })

    it('leaves two exact scores to the existing comparison', () => {
        expect(shouldReplaceEvaluationSnapshot(exact(210, 20), exact(215, 22))).toBe(true)
        expect(shouldReplaceEvaluationSnapshot(exact(210, 22), exact(215, 20))).toBe(false)
    })

    it('parses both flags off an info line', () => {
        expect(parseInfoLine('info depth 20 score cp 150 lowerbound nodes 5000 pv e2e4')?.scoreBound)
            .toBe('lowerbound')
        expect(parseInfoLine('info depth 20 score cp 150 upperbound nodes 5000 pv e2e4')?.scoreBound)
            .toBe('upperbound')
        expect(parseInfoLine('info depth 20 score cp 150 nodes 5000 pv e2e4')?.scoreBound)
            .toBeUndefined()
    })
})

/**
 * A game saved with its review and loaded back should still be graded. The
 * evaluations travel in the PGN as `[%eval ...]`, and the app parses them --
 * but they used to be tagged `import-load`, the purpose its own 70ms pass
 * uses, and so were classed shallow. The sweep that runs on every import then
 * outranked them on depth and overwrote them, and every row read "Pending".
 */
describe('an evaluation read out of a PGN', () => {
    const annotation: EvalSnapshot = { cp: -71, purpose: 'pgn-annotation', mode: 'review' }
    const sweep: EvalSnapshot = { cp: 20, depth: 16, purpose: 'import-sweep' }

    it('is not overwritten by the shallow sweep that runs after an import', () => {
        const before = new Map([['fen-a', annotation]])
        const after = recordEvaluation(before, 'fen-a', sweep)

        expect(after, 'the sweep must not displace the saved reading').toBe(before)
        expect(after.get('fen-a')?.cp).toBe(-71)
    })

    it('still grades the move, rather than sitting at pending', () => {
        const game = new Chess()
        const rootFen = game.fen()
        const move = game.move('f3')
        const afterFen = game.fen()

        const rows = buildReviewRows(
            [move],
            new Map<string, EvalSnapshot>([
                [rootFen, { cp: 30, purpose: 'pgn-annotation' }],
                [afterFen, { cp: 130, purpose: 'pgn-annotation' }],
            ]),
            rootFen,
        )

        expect(rows[0]!.quality).not.toBe('pending')
        expect(rows[0]!.confidence).not.toBe('shallow')
    })

    /** A real search is still worth more than an annotation of unknown depth. */
    it('gives way to an actual review search', () => {
        const before = new Map([['fen-a', annotation]])
        const after = recordEvaluation(before, 'fen-a', { cp: 44, depth: 22, purpose: 'batch-review' })

        expect(after).not.toBe(before)
        expect(after.get('fen-a')?.depth).toBe(22)
    })

    it('is still worth deepening, so a review does not skip it', () => {
        expect(isReviewEvaluationSufficient(annotation, 16)).toBe(false)
    })
})

describe('recording an evaluation', () => {
    const snap = (cp: number, depth: number): EvalSnapshot =>
        ({ cp, depth, nodes: depth * 1000, purpose: 'manual' })

    it('stores a reading for a position that had none', () => {
        const before = new Map<string, EvalSnapshot>()
        const after = recordEvaluation(before, 'fen-a', snap(20, 18))

        expect(after).not.toBe(before)
        expect(after.get('fen-a')?.cp).toBe(20)
        expect(before.size, 'the map handed in is not mutated').toBe(0)
    })

    it('replaces a shallower reading with a deeper one', () => {
        const before = new Map([['fen-a', snap(20, 12)]])
        const after = recordEvaluation(before, 'fen-a', snap(45, 24))

        expect(after).not.toBe(before)
        expect(after.get('fen-a')?.depth).toBe(24)
        expect(after.get('fen-a')?.cp).toBe(45)
    })

    /**
     * The identity is the point, not an optimisation. Auto-save debounces on a
     * snapshot that depends on the evaluations; a fresh Map per `info` line
     * would churn that identity several times a second and the save would never
     * settle long enough to fire. A previous investigation reported exactly that
     * starvation and found it was not happening — because of this.
     */
    it('returns the very same map when nothing improves', () => {
        const before = new Map([['fen-a', snap(45, 24)]])

        const shallower = recordEvaluation(before, 'fen-a', snap(20, 12))
        expect(shallower, 'a shallower reading must not churn the identity').toBe(before)

        const identical = recordEvaluation(shallower, 'fen-a', snap(45, 24))
        expect(identical, 'an identical reading must not churn the identity').toBe(before)
    })

    it('does not churn across a burst of shallow lines, which is the failure mode', () => {
        // What arrives while the engine is thinking: many lines, most of which
        // improve on nothing. The map must survive the burst unchanged.
        let map = new Map([['fen-a', snap(45, 24)]])
        const original = map
        for (let depth = 1; depth <= 20; depth++) {
            map = recordEvaluation(map, 'fen-a', snap(20 + depth, depth))
        }
        expect(map).toBe(original)
    })

    /**
     * The counterpart to the test above, and the case it does not cover. That
     * one feeds readings that improve on nothing. A live search improves on
     * something every time: the node count, the elapsed time and usually the
     * depth all climb, and `shouldReplaceEvaluationSnapshot` takes more nodes
     * at the same depth as an improvement.
     *
     * So the map identity churns on *every* flush while the engine runs, which
     * is roughly ten times a second. Anything debouncing on it -- the auto-save
     * did -- never settles. Pinned because the fix lives in the consumer, and
     * a reader who finds only the test above would conclude there is nothing
     * to consume around.
     */
    it('churns on every flush of a live search, which is the case the burst test does not cover', () => {
        let map = new Map<string, EvalSnapshot>()
        let previous = map
        let changes = 0
        let nodes = 1000

        for (let depth = 1; depth <= 20; depth += 1) {
            for (let flush = 0; flush < 5; flush += 1) {
                nodes += 50_000
                map = recordEvaluation(map, 'fen-a', {
                    cp: 30,
                    depth,
                    nodes,
                    nps: 900_000,
                    time: depth * 500 + flush * 100,
                    purpose: 'manual',
                })
                if (map !== previous) {
                    changes += 1
                    previous = map
                }
            }
        }

        expect(changes, 'every flush of a running search is a new map').toBe(100)
    })

    it('keeps other positions untouched', () => {
        const before = new Map([['fen-a', snap(20, 18)], ['fen-b', snap(-30, 18)]])
        const after = recordEvaluation(before, 'fen-a', snap(60, 26))

        expect(after.get('fen-b')).toBe(before.get('fen-b'))
        expect(after.size).toBe(2)
    })

    it('refuses a reading with no usable score', () => {
        const before = new Map([['fen-a', snap(20, 18)]])
        const after = recordEvaluation(before, 'fen-a', { cp: Number.NaN, depth: 30, purpose: 'manual' })
        expect(after).toBe(before)
    })
})

describe('turning an engine line into a snapshot', () => {
    const line = (over: Partial<EngineLine> = {}): EngineLine =>
        ({ multipv: 1, depth: 20, cp: 35, pv: ['e2e4', 'e7e5'], nodes: 500_000, ...over } as EngineLine)

    it('carries the reading and its telemetry across', () => {
        const recorded = engineLineToSnapshot(line({ fen: 'fen-a', nps: 900_000, time: 420 }), 'fallback', 1234)
        expect(recorded?.fen).toBe('fen-a')
        expect(recorded?.snapshot).toMatchObject({
            cp: 35, depth: 20, bestMove: 'e2e4', nodes: 500_000, nps: 900_000, time: 420, searchedAt: 1234,
        })
    })

    it('falls back to the position on screen when the line names none', () => {
        expect(engineLineToSnapshot(line(), 'fallback', 0)?.fen).toBe('fallback')
    })

    it('keeps the bound, so a fail-high cannot pass as a value', () => {
        const bounded = engineLineToSnapshot(line({ scoreBound: 'lowerbound' }), 'fen', 0)
        expect(bounded?.snapshot.scoreBound).toBe('lowerbound')
    })

    it('refuses a line with no usable score, rather than storing a NaN', () => {
        expect(engineLineToSnapshot(undefined, 'fen', 0)).toBeNull()
        expect(engineLineToSnapshot(line({ cp: undefined, mate: undefined }), 'fen', 0)).toBeNull()
    })

    it('turns a mate into a score the map can hold', () => {
        const mate = engineLineToSnapshot(line({ cp: undefined, mate: 3 }), 'fen', 0)
        expect(mate?.snapshot.mate).toBe(3)
        expect(Number.isFinite(mate?.snapshot.cp)).toBe(true)
    })
})

describe('pvLineMoves', () => {
  const START = new Chess().fen()

  it('turns a principal variation into steppable moves with the position after each', () => {
    const moves = pvLineMoves(START, ['e2e4', 'e7e5', 'g1f3'])
    expect(moves.map(move => ({ index: move.index, san: move.san, prefix: move.prefix }))).toEqual([
      { index: 0, san: 'e4', prefix: '1.' },
      { index: 1, san: 'e5', prefix: null },
      { index: 2, san: 'Nf3', prefix: '2.' },
    ])
    expect(new Chess(moves[2].fenAfter).turn()).toBe('b')
  })

  it('always numbers the spoken form, even where the printed one leaves it out', () => {
    const moves = pvLineMoves(START, ['e2e4', 'e7e5', 'g1f3'])
    expect(moves.map(move => move.numbered)).toEqual(['1. e4', '1... e5', '2. Nf3'])
    // The printed form still drops the number on the Black move that follows.
    expect(moves.map(move => move.prefix)).toEqual(['1.', null, '2.'])
  })

  it('numbers a line that opens on Black, so it does not read as White to move', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const moves = pvLineMoves(afterE4, ['e7e5', 'g1f3'])
    expect(moves.map(move => move.prefix)).toEqual(['1...', '2.'])
  })

  it('reports the move it actually made, so a promotion keeps its piece', () => {
    const [move] = pvLineMoves('8/P6k/8/8/8/8/7K/8 w - - 0 1', ['a7a8q'])
    expect(move.san).toBe('a8=Q')
    expect(move.uci).toBe('a7a8q')
  })

  it('honours the move cap the panel renders', () => {
    expect(pvLineMoves(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 2)).toHaveLength(2)
  })

  /**
   * A flush can outlive the position it was searched from. Every other walk in
   * this module stops rather than throwing, because all of them run in render.
   */
  it('stops at the first move the position will not take', () => {
    expect(pvLineMoves(START, ['e2e4', 'e2e4', 'g1f3']).map(move => move.san)).toEqual(['e4'])
    expect(pvLineMoves(START, ['not-a-move'])).toEqual([])
    expect(pvLineMoves('total nonsense', ['e2e4'])).toEqual([])
  })
})
