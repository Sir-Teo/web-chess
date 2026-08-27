import { describe, expect, it } from 'vitest'
import type { GameNode } from '../hooks/useGameTree'
import { Chess } from 'chess.js'
import { exportAnnotatedPgn, rootFenFromPgnHeaders } from './pgn'

describe('PGN export helpers', () => {
  it('exports FEN roots with setup headers and black-to-move numbering', () => {
    const game = new Chess()
    game.move('e4')
    const rootFen = game.fen()
    const move = game.move('c5')!
    const afterFen = game.fen()
    const mainLine = [
      {
        id: 'root',
        fen: rootFen,
        move: null,
        san: '',
        uci: '',
        parent: null,
        children: ['n1'],
      },
      {
        id: 'n1',
        fen: afterFen,
        move,
        san: move.san,
        uci: 'c7c5',
        parent: 'root',
        children: [],
      },
    ] as unknown as GameNode[]

    const pgn = exportAnnotatedPgn(mainLine, new Map(), { Result: '*' })
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('[SetUp "1"]')
    expect(pgn).toContain(`[FEN "${rootFen}"]`)
    expect(pgn).toContain('1... c5')
    expect(rootFenFromPgnHeaders(loader.getHeaders())).toBe(rootFen)
    expect(loader.history()).toEqual(['c5'])
  })

  it('preserves mate distance from side-to-move engine scores', () => {
    const fenAfterWhiteMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const mainLine = [
      {
        id: 'root',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        move: null,
        san: '',
        uci: '',
        parent: null,
        children: ['n1'],
      },
      {
        id: 'n1',
        fen: fenAfterWhiteMove,
        move: {},
        san: 'e4',
        uci: 'e2e4',
        parent: 'root',
        children: [],
      },
    ] as unknown as GameNode[]

    const pgn = exportAnnotatedPgn(
      mainLine,
      new Map([[fenAfterWhiteMove, { cp: -10000, mate: -3 }]]),
      { Result: '*' },
    )

    expect(pgn).toContain('{ [%eval #3] }')
  })
})

describe('exportAnnotatedPgn header preservation', () => {
  it('keeps the headers a game was imported with', () => {
    const chess = new Chess()
    chess.move('e4')
    const mainLine: GameNode[] = [
      { id: 'root', fen: new Chess().fen(), move: null, parentId: null, childIds: [] } as unknown as GameNode,
      { id: 'n1', fen: chess.fen(), move: { san: 'e4' }, parentId: 'root', childIds: [] } as unknown as GameNode,
    ]

    const pgn = exportAnnotatedPgn(mainLine, new Map(), {
      Event: '41st Olympiad Open 2014',
      White: 'Aronian, L.',
      Black: 'Carlsen, M.',
      Result: '1/2-1/2',
    })

    expect(pgn).toContain('[White "Aronian, L."]')
    expect(pgn).toContain('[Black "Carlsen, M."]')
    expect(pgn).toContain('[Result "1/2-1/2"]')
    expect(pgn).toContain('[Event "41st Olympiad Open 2014"]')
    expect(pgn).not.toContain('Player 1')
  })
})
