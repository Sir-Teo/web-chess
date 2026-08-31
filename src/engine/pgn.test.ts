import { describe, expect, it } from 'vitest'
import type { GameNode } from '../hooks/useGameTree'
import { Chess } from 'chess.js'
import { type EvalSnapshot, buildReviewRows as buildReviewRowsForTest } from './analysis'
import {
  PGN_EMPTY_IMPORT_ERROR,
  PGN_MULTIPLE_GAMES_ERROR,
  PGN_NO_MOVES_IMPORT_ERROR,
  exportAnnotatedPgn,
  flattenPgnMainLine,
  formatPgnDate,
  hasMultiplePgnGames,
  parsePgnMoveTree,
  pgnImportContentError,
  rootFenFromPgnHeaders,
  clockCommentValue,
  clockMsFromComment,
  reorderPgnAnnotations,
  stripPgnByteOrderMark,
} from './pgn'

function makeNode(
  id: string,
  fen: string,
  move: GameNode['move'],
  parent: string | null,
  children: string[] = [],
  quality?: GameNode['quality'],
  extra: Partial<GameNode> = {},
): GameNode {
  return {
    id,
    fen,
    move,
    san: move?.san ?? '',
    uci: move ? `${move.from}${move.to}${move.promotion ?? ''}` : '',
    parent,
    children,
    quality,
    ...extra,
  } as GameNode
}

describe('PGN export helpers', () => {
  it('formats default PGN dates from the local calendar day', () => {
    expect(formatPgnDate(new Date(2026, 4, 31, 23, 30))).toBe('2026.05.31')
  })

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

    expect(pgn).toContain('[Site "Web Chess"]')
    expect(pgn).toContain('[SetUp "1"]')
    expect(pgn).toContain(`[FEN "${rootFen}"]`)
    expect(pgn).toContain('1... c5')
    expect(rootFenFromPgnHeaders(loader.getHeaders())).toBe(rootFen)
    expect(loader.history()).toEqual(['c5'])
  })

  it('rejects PGN FEN headers with impossible adjacent kings', () => {
    expect(() => rootFenFromPgnHeaders({
      FEN: '8/8/8/8/8/8/7K/6k1 w - - 0 1',
    })).toThrow('Invalid FEN king placement')
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

  it('omits non-finite eval annotations from exported PGN', () => {
    const fenAfterWhiteMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const mainLine = [
      {
        id: 'root',
        fen: new Chess().fen(),
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
      new Map([[fenAfterWhiteMove, { cp: Number.NaN, mate: Number.POSITIVE_INFINITY }]]),
      { Result: '*' },
    )

    expect(pgn).toContain('1. e4')
    expect(pgn).not.toContain('%eval')
    expect(pgn).not.toContain('NaN')
    expect(pgn).not.toContain('Infinity')
  })

  it('exports reviewed move quality labels as PGN comments', () => {
    const game = new Chess()
    const move = game.move('e4')!
    const fenAfterWhiteMove = game.fen()
    const mainLine = [
      {
        id: 'root',
        fen: new Chess().fen(),
        move: null,
        san: '',
        uci: '',
        parent: null,
        children: ['n1'],
      },
      {
        id: 'n1',
        fen: fenAfterWhiteMove,
        move,
        san: move.san,
        uci: 'e2e4',
        parent: 'root',
        children: [],
        quality: 'best',
      },
    ] as unknown as GameNode[]

    const pgn = exportAnnotatedPgn(
      mainLine,
      new Map([[fenAfterWhiteMove, { cp: -12 }]]),
      { Result: '*' },
    )
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('{ [%eval 0.12]; Best }')
    expect(loader.history()).toEqual(['e4'])
  })

  it('exports best-move alternatives in review comments', () => {
    const game = new Chess()
    const rootFen = game.fen()
    const move = game.move('d4')!
    const fenAfterMove = game.fen()
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
        fen: fenAfterMove,
        move,
        san: move.san,
        uci: 'd2d4',
        parent: 'root',
        children: [],
        quality: 'inaccuracy',
      },
    ] as unknown as GameNode[]

    const pgn = exportAnnotatedPgn(
      mainLine,
      new Map([
        [rootFen, { cp: 0, bestMove: 'e2e4' }],
        [fenAfterMove, { cp: 100 }],
      ]),
      { Result: '*' },
    )
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('{ [%eval -1.00]; Best e4; Inaccuracy }')
    expect(loader.history()).toEqual(['d4'])
  })

  it('sanitizes tag values and ignores invalid tag names when exporting', () => {
    const mainLine = [
      {
        id: 'root',
        fen: new Chess().fen(),
        move: null,
        san: '',
        uci: '',
        parent: null,
        children: [],
      },
    ] as unknown as GameNode[]

    const pgn = exportAnnotatedPgn(mainLine, new Map(), {
      Event: 'Queen "Sacrifice" \\ Study\nFinal',
      Result: '1-0"\n[Injected "1"]',
      'Bad]Tag': 'ignored',
    })
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('[Event "Queen \'Sacrifice\' \\ Study Final"]')
    expect(pgn).toContain('[Result "*"]')
    expect(pgn).not.toContain('[Injected "1"]')
    expect(pgn).not.toContain('Bad]Tag')
    expect(loader.getHeaders().Event).toBe('Queen \'Sacrifice\' \\ Study Final')
    expect(loader.getHeaders().Result).toBe('*')
  })

  it('exports analysis tree variations from the game tree snapshot', () => {
    const rootFen = new Chess().fen()

    const e4Game = new Chess(rootFen)
    const e4Move = e4Game.move('e4')!
    const e4Fen = e4Game.fen()

    const e5Game = new Chess(e4Fen)
    const e5Move = e5Game.move('e5')!
    const e5Fen = e5Game.fen()

    const nf3Game = new Chess(e5Fen)
    const nf3Move = nf3Game.move('Nf3')!
    const nf3Fen = nf3Game.fen()

    const d4Game = new Chess(rootFen)
    const d4Move = d4Game.move('d4')!
    const d4Fen = d4Game.fen()

    const c5Game = new Chess(e4Fen)
    const c5Move = c5Game.move('c5')!
    const c5Fen = c5Game.fen()

    const root = makeNode('root', rootFen, null, null, ['e4', 'd4'])
    const e4 = makeNode('e4', e4Fen, e4Move, 'root', ['e5', 'c5'])
    const e5 = makeNode('e5', e5Fen, e5Move, 'e4', ['nf3'])
    const nf3 = makeNode('nf3', nf3Fen, nf3Move, 'e5')
    const d4 = makeNode('d4', d4Fen, d4Move, 'root', [], 'mistake')
    const c5 = makeNode('c5', c5Fen, c5Move, 'e4')
    const nodes = new Map([
      [root.id, root],
      [e4.id, e4],
      [e5.id, e5],
      [nf3.id, nf3],
      [d4.id, d4],
      [c5.id, c5],
    ])

    const pgn = exportAnnotatedPgn(
      [root, e4, e5, nf3],
      new Map([[d4Fen, { cp: 24 }]]),
      { Result: '*' },
      nodes,
    )
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('1. e4 (1. d4 { [%eval -0.24]; Mistake }) 1... e5')
    expect(pgn).toContain('(1... c5)')
    expect(loader.history()).toEqual(['e4', 'e5', 'Nf3'])
  })

  it('can export a clean main line without study annotations', () => {
    const rootFen = new Chess().fen()
    const e4Game = new Chess(rootFen)
    const e4Move = e4Game.move('e4')!
    const e4Fen = e4Game.fen()
    const e5Move = e4Game.move('e5')!
    const e5Fen = e4Game.fen()

    const d4Game = new Chess(rootFen)
    const d4Move = d4Game.move('d4')!
    const d4Fen = d4Game.fen()

    const root = makeNode('root', rootFen, null, null, ['e4', 'd4'])
    const e4 = makeNode('e4', e4Fen, e4Move, 'root', ['e5'], 'best', {
      comment: 'Training note',
      suffix: '!',
      nags: ['1'],
    })
    const e5 = makeNode('e5', e5Fen, e5Move, 'e4')
    const d4 = makeNode('d4', d4Fen, d4Move, 'root')
    const nodes = new Map([
      [root.id, root],
      [e4.id, e4],
      [e5.id, e5],
      [d4.id, d4],
    ])

    const pgn = exportAnnotatedPgn(
      [root, e4, e5],
      new Map([[e4Fen, { cp: -34 }]]),
      { Result: '*' },
      nodes,
      {
        includeVariations: false,
        includeComments: false,
        includeEngineAnnotations: false,
        includeGlyphs: false,
      },
    )
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('1. e4 1... e5 *')
    expect(pgn).not.toContain('(')
    expect(pgn).not.toContain('{')
    expect(pgn).not.toContain('$1')
    expect(pgn).not.toContain('!')
    expect(loader.history()).toEqual(['e4', 'e5'])
  })

  it('parses PGN variations into a nested import tree', () => {
    const parsed = parsePgnMoveTree(`
[Event "Branch study"]
[Result "*"]

1. e4 (1. d4 d5) e5 (1... c5) 2. Nf3 *
`)
    const mainLine = flattenPgnMainLine(parsed.moves)

    expect(parsed.rootFen).toBe(new Chess().fen())
    expect(parsed.moves.map(entry => entry.move.san)).toEqual(['e4', 'd4'])
    expect(parsed.moves[0]?.children?.map(entry => entry.move.san)).toEqual(['e5', 'c5'])
    expect(parsed.moves[1]?.children?.map(entry => entry.move.san)).toEqual(['d5'])
    expect(mainLine.map(entry => entry.move.san)).toEqual(['e4', 'e5', 'Nf3'])
    const replay = new Chess()
    for (const entry of mainLine) replay.move(entry.move)
    expect(mainLine.at(-1)?.fen).toBe(replay.fen())
  })

  it('imports PGN eval comments as side-to-move evaluation snapshots', () => {
    const parsed = parsePgnMoveTree(`
[Event "Annotated study"]
[Result "*"]

1. e4 { [%eval 0.34] } (1. d4 { [%eval -0.20] }) e5 { [%eval #-3] } *
`)

    const e4 = parsed.moves[0]!
    const d4 = parsed.moves[1]!
    const e5 = e4.children![0]!
    const e4Eval = parsed.evaluations.get(e4.fen)
    const d4Eval = parsed.evaluations.get(d4.fen)
    const e5Eval = parsed.evaluations.get(e5.fen)

    expect(e4Eval?.cp).toBe(-34)
    expect(d4Eval?.cp).toBe(20)
    expect(e5Eval?.mate).toBe(-3)
    expect(e5Eval?.cp).toBe(-10000)

    const pgn = exportAnnotatedPgn(
      [
        makeNode('root', new Chess().fen(), null, null, ['e4']),
        makeNode('e4', e4.fen, e4.move, 'root', ['e5']),
        makeNode('e5', e5.fen, e5.move, 'e4'),
      ],
      parsed.evaluations,
      { Result: '*' },
    )

    expect(pgn).toContain('{ [%eval 0.34] }')
    expect(pgn).toContain('{ [%eval #-3] }')
  })

  it('round-trips imported PGN comments, suffix annotations, and NAGs', () => {
    const parsed = parsePgnMoveTree(`
[Event "Annotated study"]
[Result "*"]

1. e4! $1 { [%eval 0.34]; Takes the center } e5?! $6 {Sharp reply} *
`)

    const e4 = parsed.moves[0]!
    const e5 = e4.children![0]!

    expect(e4.comment).toBe('Takes the center')
    expect(e4.suffix).toBe('!')
    expect(e4.nags).toEqual(['1'])
    expect(e5.comment).toBe('Sharp reply')
    expect(e5.suffix).toBe('?!')
    expect(e5.nags).toEqual(['6'])

    const pgn = exportAnnotatedPgn(
      [
        makeNode('root', new Chess().fen(), null, null, ['e4']),
        makeNode('e4', e4.fen, e4.move, 'root', ['e5'], undefined, {
          comment: e4.comment,
          suffix: e4.suffix,
          nags: e4.nags,
        }),
        makeNode('e5', e5.fen, e5.move, 'e4', [], undefined, {
          comment: e5.comment,
          suffix: e5.suffix,
          nags: e5.nags,
        }),
      ],
      parsed.evaluations,
      parsed.headers,
    )
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('1. e4! $1 { [%eval 0.34]; Takes the center }')
    expect(pgn).toMatch(/1\.\.\. e5\?! \$6\s+\{ Sharp reply \}/)
    expect(loader.history()).toEqual(['e4', 'e5'])
  })

  it('keeps comments that appear before the game or before a variation move', () => {
    const parsed = parsePgnMoveTree(`
{Training chapter}
1. e4 ({Sicilian idea} 1... c5) e5 *
`)

    const e4 = parsed.moves[0]!
    const e5 = e4.children![0]!
    const c5 = e4.children![1]!

    expect(e4.comment).toBe('Training chapter')
    expect(e5.move.san).toBe('e5')
    expect(c5.move.san).toBe('c5')
    expect(c5.comment).toBe('Sicilian idea')

    const root = makeNode('root', new Chess().fen(), null, null, ['e4'])
    const e4Node = makeNode('e4', e4.fen, e4.move, 'root', ['e5', 'c5'], undefined, {
      comment: e4.comment,
    })
    const e5Node = makeNode('e5', e5.fen, e5.move, 'e4')
    const c5Node = makeNode('c5', c5.fen, c5.move, 'e4', [], undefined, {
      comment: c5.comment,
    })
    const nodes = new Map([
      [root.id, root],
      [e4Node.id, e4Node],
      [e5Node.id, e5Node],
      [c5Node.id, c5Node],
    ])

    const pgn = exportAnnotatedPgn([root, e4Node, e5Node], new Map(), { Result: '*' }, nodes)
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(pgn).toContain('1. e4 { Training chapter }')
    expect(pgn).toContain('(1... c5 { Sicilian idea })')
    expect(loader.history()).toEqual(['e4', 'e5'])
  })

  it('preserves imported PGN headers for export', () => {
    const parsed = parsePgnMoveTree(`
[Event "Training Match"]
[Site "Berlin"]
[White "Ada"]
[Black "Max"]
[Result "1-0"]

1. e4 1-0
`)
    const rootFen = new Chess().fen()
    const e4 = parsed.moves[0]!
    const root = makeNode('root', rootFen, null, null, ['e4'])
    const e4Node = makeNode('e4', e4.fen, e4.move, 'root')
    const pgn = exportAnnotatedPgn([root, e4Node], new Map(), parsed.headers)
    const loader = new Chess()
    loader.loadPgn(pgn)

    expect(parsed.headers.Event).toBe('Training Match')
    expect(parsed.headers.White).toBe('Ada')
    expect(pgn).toContain('[Event "Training Match"]')
    expect(pgn).toContain('[Site "Berlin"]')
    expect(pgn).toContain('[White "Ada"]')
    expect(pgn).toContain('[Black "Max"]')
    expect(pgn).toContain('[Result "1-0"]')
    expect(loader.history()).toEqual(['e4'])
    expect(loader.getHeaders().White).toBe('Ada')
  })

  it('uses the PGN termination marker as Result when the tag is missing', () => {
    const parsed = parsePgnMoveTree('1. e4 e5 1/2-1/2')
    expect(parsed.headers.Result).toBe('1/2-1/2')
  })
})

describe('PGN import preflight', () => {
  it('rejects empty PGN imports before resetting the board', () => {
    expect(pgnImportContentError(' \n\t ')).toBe(PGN_EMPTY_IMPORT_ERROR)
    expect(() => parsePgnMoveTree(' \n\t ')).toThrow(PGN_EMPTY_IMPORT_ERROR)
  })

  it('rejects PGNs that contain headers but no legal moves', () => {
    const headerOnlyPgn = `
[Event "Unplayed"]
[Site "Web Chess"]
[Result "*"]

*
`

    expect(pgnImportContentError(headerOnlyPgn)).toBeNull()
    expect(() => parsePgnMoveTree(headerOnlyPgn)).toThrow(PGN_NO_MOVES_IMPORT_ERROR)
  })

  it('gives database-style multi-game files a clear one-game-at-a-time error', () => {
    const multiGamePgn = `
[Event "Game one"]
[Result "*"]

1. e4 e5 *

[Event "Game two"]
[Result "*"]

1. d4 d5 *
`

    expect(hasMultiplePgnGames(multiGamePgn)).toBe(true)
    expect(pgnImportContentError(multiGamePgn)).toBe(PGN_MULTIPLE_GAMES_ERROR)
    expect(() => parsePgnMoveTree(multiGamePgn)).toThrow(PGN_MULTIPLE_GAMES_ERROR)
  })

  it('rejects headerless multi-game move text by termination markers', () => {
    const multiGamePgn = `
1. e4 e5 1-0

1. d4 d5 0-1
`

    expect(hasMultiplePgnGames(multiGamePgn)).toBe(true)
    expect(pgnImportContentError(multiGamePgn)).toBe(PGN_MULTIPLE_GAMES_ERROR)
    expect(() => parsePgnMoveTree(multiGamePgn)).toThrow(PGN_MULTIPLE_GAMES_ERROR)
  })

  it('rejects database entries that repeat Result tags without Event tags', () => {
    const multiGamePgn = `
[White "Ada"]
[Black "Max"]
[Result "1-0"]

1. e4 1-0

[White "Lee"]
[Black "Noor"]
[Result "0-1"]

1. d4 0-1
`

    expect(hasMultiplePgnGames(multiGamePgn)).toBe(true)
    expect(pgnImportContentError(multiGamePgn)).toBe(PGN_MULTIPLE_GAMES_ERROR)
  })

  it('does not count result-looking comments as extra games', () => {
    const singleGamePgn = `
[Event "Training note"]
[Result "1-0"]

1. e4 { White is playing for 1-0 here. } e5 2. Nf3 1-0
`

    expect(hasMultiplePgnGames(singleGamePgn)).toBe(false)
    expect(pgnImportContentError(singleGamePgn)).toBeNull()
  })

  it('accepts a normal single-game PGN for import', () => {
    expect(hasMultiplePgnGames('[Event "Game one"]\n\n1. e4 e5 *')).toBe(false)
    expect(pgnImportContentError('[Event "Game one"]\n\n1. e4 e5 *')).toBeNull()
  })
})

describe('exportAnnotatedPgn header preservation', () => {
  it('keeps the headers a game was imported with', () => {
    const chess = new Chess()
    chess.move('e4')
    const mainLine: GameNode[] = [
      makeNode('root', new Chess().fen(), null, null, ['n1']),
      makeNode('n1', chess.fen(), { san: 'e4', from: 'e2', to: 'e4' } as GameNode['move'], 'root'),
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

/**
 * The auto-save writes a PGN and restoring reads it back, so this loop runs on
 * every reload. `commentForNode` re-derives its own annotations from the
 * evaluation map each time *and* carries the preserved comment through, so any
 * fragment that survived an import was appended to again. Measured before the
 * fix: "Best d4" appeared 1, 2, 3 then 4 times over four rounds.
 */
describe('exporting and importing the same game repeatedly', () => {
  const rootFen = new Chess().fen()

  function afterE4(): string {
    const chess = new Chess()
    chess.move('e4')
    return chess.fen()
  }

  /** Rebuild a node list from imported entries, following the main line. */
  function nodesFromEntries(entries: ReturnType<typeof parsePgnMoveTree>['moves']) {
    const nodes = new Map<string, GameNode>()
    const root = makeNode('r', rootFen, null, null)
    nodes.set(root.id, root)

    const line: GameNode[] = [root]
    let parent = root
    let index = 0
    let cursor = entries

    while (cursor.length) {
      const entry = cursor[0]!
      index += 1
      const node = makeNode(`n${index}`, entry.fen, entry.move, parent.id, [], undefined, {
        san: entry.move.san,
        uci: `${entry.move.from}${entry.move.to}${entry.move.promotion ?? ''}`,
        comment: entry.comment,
      })
      nodes.set(node.id, node)
      parent.children.push(node.id)
      line.push(node)
      parent = node
      cursor = entry.children ?? []
    }

    return { nodes, line }
  }

  function movetextOf(pgn: string): string {
    return pgn.split('\n').filter(row => !row.startsWith('[')).join(' ')
  }

  it('does not grow its own annotations one copy per round', () => {
    const evaluations = new Map([
      [rootFen, { cp: 30, depth: 20, bestMove: 'd2d4' }],
      [afterE4(), { cp: -20, depth: 20, bestMove: 'e7e5' }],
    ])

    let entries = parsePgnMoveTree('1. e4 *').moves
    const counts: number[] = []

    for (let round = 0; round < 4; round += 1) {
      const { nodes, line } = nodesFromEntries(entries)
      const pgn = exportAnnotatedPgn(line, evaluations, {}, nodes)
      counts.push((movetextOf(pgn).match(/Best d4/g) ?? []).length)
      entries = parsePgnMoveTree(pgn).moves
    }

    expect(counts).toEqual([1, 1, 1, 1])
  })

  it('keeps a real note through the same loop', () => {
    const evaluations = new Map([
      [rootFen, { cp: 30, depth: 20, bestMove: 'd2d4' }],
    ])

    let entries = parsePgnMoveTree('1. e4 { Blunder, but the only practical try } *').moves

    for (let round = 0; round < 3; round += 1) {
      const { nodes, line } = nodesFromEntries(entries)
      const pgn = exportAnnotatedPgn(line, evaluations, {}, nodes)
      expect(movetextOf(pgn)).toContain('Blunder, but the only practical try')
      entries = parsePgnMoveTree(pgn).moves
    }

    expect(entries[0]?.comment).toBe('Blunder, but the only practical try')
  })

  it('drops a note that is only this app\'s own wording, because it is regenerated', () => {
    const imported = parsePgnMoveTree('1. e4 { [%eval 0.30]; Best d4; Blunder } *')
    expect(imported.moves[0]?.comment).toBeUndefined()
  })
})

/**
 * The position before the first move. Comments are written per move node and
 * the root is not one, so a saved game used to come back with nothing to grade
 * its opening move against -- `buildReviewRows` needs the reading before a move
 * as much as the one after it.
 */
describe('the evaluation of the position before the first move', () => {
  const rootFen = new Chess().fen()

  function afterE4(): string {
    const chess = new Chess()
    chess.move('e4')
    return chess.fen()
  }

  function exportOneMove(evaluations: Map<string, EvalSnapshot>): string {
    const chess = new Chess()
    const move = chess.move('e4')
    const root = makeNode('r', rootFen, null, null, ['n1'])
    const first = makeNode('n1', chess.fen(), move, 'r', [], undefined, { san: 'e4', uci: 'e2e4' })
    return exportAnnotatedPgn([root, first], evaluations, {}, new Map([[root.id, root], [first.id, first]]))
  }

  it('is written ahead of the first move', () => {
    const pgn = exportOneMove(new Map<string, EvalSnapshot>([[rootFen, { cp: 30, depth: 20 }]]))
    const movetext = pgn.split('\n').filter(row => !row.startsWith('[')).join(' ').trim()

    expect(movetext.startsWith('{ [%eval 0.30] } 1. e4'), movetext).toBe(true)
  })

  it('comes back on import, keyed to the root position', () => {
    const pgn = exportOneMove(new Map<string, EvalSnapshot>([[rootFen, { cp: 30, depth: 20 }]]))
    const imported = parsePgnMoveTree(pgn)

    expect(imported.evaluations.get(rootFen)?.cp).toBe(30)
  })

  /** Engine scores are POV side-to-move, so a Black-to-move root has to flip. */
  it('keeps White\'s point of view through the round trip', () => {
    const blackToMove = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'
    const chess = new Chess(blackToMove)
    const move = chess.move('e5')
    const root = makeNode('r', blackToMove, null, null, ['n1'])
    const first = makeNode('n1', chess.fen(), move, 'r', [], undefined, { san: 'e5', uci: 'e7e5' })

    // cp is POV side-to-move: +50 for Black reads as -0.50 for White.
    const pgn = exportAnnotatedPgn(
      [root, first],
      new Map([[blackToMove, { cp: 50 }]]),
      {},
      new Map([[root.id, root], [first.id, first]]),
    )

    expect(pgn).toContain('[%eval -0.50]')
    expect(parsePgnMoveTree(pgn).evaluations.get(blackToMove)?.cp).toBe(50)
  })

  it('writes nothing when the root was never evaluated', () => {
    const pgn = exportOneMove(new Map<string, EvalSnapshot>([[afterE4(), { cp: -20 }]]))
    const movetext = pgn.split('\n').filter(row => !row.startsWith('[')).join(' ').trim()

    expect(movetext.startsWith('1. e4'), movetext).toBe(true)
  })

  it('lets the first move be graded from a saved game alone', () => {
    const pgn = exportOneMove(new Map<string, EvalSnapshot>([
      [rootFen, { cp: 30 }],
      [afterE4(), { cp: 400 }],
    ]))
    const imported = parsePgnMoveTree(pgn)
    const chess = new Chess()
    const move = chess.move('e4')

    const rows = buildReviewRowsForTest([move], imported.evaluations, imported.rootFen)
    expect(rows[0]?.quality).toBe('blunder')
  })
})

/**
 * The engine's preferred move for a position. It was already written beside the
 * evaluation as the prose "Best Nf3", which is for a human reading the file --
 * and prose cannot be read back, so the review lost its best-move hints on
 * every save and reload. The command form travels as data.
 */
describe('the best move for a position', () => {
  const rootFen = new Chess().fen()

  function exportOneMove(evaluations: Map<string, EvalSnapshot>): string {
    const chess = new Chess()
    const move = chess.move('e4')
    const root = makeNode('r', rootFen, null, null, ['n1'])
    const first = makeNode('n1', chess.fen(), move, 'r', [], undefined, { san: 'e4', uci: 'e2e4' })
    return exportAnnotatedPgn([root, first], evaluations, {}, new Map([[root.id, root], [first.id, first]]))
  }

  it('round-trips beside the evaluation it belongs to', () => {
    const pgn = exportOneMove(new Map<string, EvalSnapshot>([[rootFen, { cp: 30, bestMove: 'd2d4' }]]))

    expect(pgn).toContain('[%wcbest d2d4]')
    expect(parsePgnMoveTree(pgn).evaluations.get(rootFen)?.bestMove).toBe('d2d4')
  })

  it('is not written without an evaluation to hang it on', () => {
    const pgn = exportOneMove(new Map<string, EvalSnapshot>([[rootFen, { cp: Number.NaN, bestMove: 'd2d4' }]]))
    expect(pgn).not.toContain('%wcbest')
  })

  it('is not shown to the reader as though they had typed it', () => {
    const imported = parsePgnMoveTree('1. e4 { [%eval 0.30]; [%wcbest d2d4]; my own note } *')
    expect(imported.moves[0]?.comment).toBe('my own note')
  })

  /**
   * The same rule covers every other tool's commands. A Lichess export carries
   * [%clk ...] on every move, and those were being shown as comments.
   */
  it('drops another tool\'s commands from the comment too', () => {
    const imported = parsePgnMoveTree('1. e4 { [%clk 0:03:00] [%emt 0:00:04] real note } *')
    expect(imported.moves[0]?.comment).toBe('real note')
  })
})

describe('annotation shapes chess.js will not take', () => {
    const headers = '[Event "x"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n'
    const parses = (movetext: string) => {
        try {
            parsePgnMoveTree(headers + movetext + '\n')
            return true
        } catch {
            return false
        }
    }

    /**
     * The PGN standard lets any number of comments and NAGs follow a move, in
     * any order. chess.js takes `$1 {note}` and refuses `{note} {more}` and
     * `{note} $1`, blaming the move text — which is unhelpful when the move
     * text is right. Database exports and Lichess studies produce both.
     */
    it('imports a move carrying two comments', () => {
        expect(parses('1. e4 c5 { dubious } { [%eval -0.1] } 2. Nf3 *')).toBe(true)
    })

    it('imports a NAG written after its comment', () => {
        expect(parses('1. e4 c5 { dubious } $2 2. Nf3 *')).toBe(true)
        expect(parses('1. e4 c5 { dubious } $2 $14 2. Nf3 *')).toBe(true)
    })

    it('imports the two mixed, and inside a variation', () => {
        expect(parses('1. e4 c5 { dubious } $2 { [%eval -0.1] } 2. Nf3 *')).toBe(true)
        expect(parses('1. e4 c5 (1... e5 { open } { [%eval 0.1] }) 2. Nf3 *')).toBe(true)
    })

    it('merges the comments rather than dropping one', () => {
        const parsed = parsePgnMoveTree(headers + '1. e4 { first } { second } *\n')
        expect(parsed.moves[0]?.comment).toContain('first')
        expect(parsed.moves[0]?.comment).toContain('second')
    })

    it('keeps the evaluation when it arrives in the second comment', () => {
        const parsed = parsePgnMoveTree(headers + '1. e4 { a note } { [%eval 0.31] } *\n')
        expect(parsed.evaluations.size).toBe(1)
        expect(parsed.moves[0]?.comment).toBe('a note')
    })

    it('leaves a PGN without either shape byte-identical', () => {
        for (const movetext of [
            '1. e4 c5 2. Nf3 *',
            '1. e4 c5 $2 { dubious } 2. Nf3 *',
            '1. e4 { [%eval 0.2] [%clk 0:02:56] } c5 *',
        ]) {
            expect(reorderPgnAnnotations(movetext)).toBe(movetext)
        }
    })

    /** A `}` only ever ends a comment, so the rewrite cannot reach inside one. */
    it('does not rewrite braces that are part of a comment body', () => {
        expect(reorderPgnAnnotations('1. e4 { a $1 b } *')).toBe('1. e4 { a $1 b } *')
    })
})

describe('a PGN file as it arrives from a disk', () => {
    const headers = '[Event "x"]\n[White "a"]\n[Black "b"]\n[Result "*"]\n\n'

    /**
     * `\uFEFF` is what Notepad, Excel and several download paths put at the
     * front of a text file. The parser failed on the very first character, with
     * a message about move numbers.
     */
    it('imports a file that starts with a byte order mark', () => {
        const parsed = parsePgnMoveTree('\uFEFF' + headers + '1. e4 c5 *\n')
        expect(parsed.moves[0]?.move.san).toBe('e4')
    })

    it('leaves a file without one untouched', () => {
        const plain = headers + '1. e4 *\n'
        expect(stripPgnByteOrderMark(plain)).toBe(plain)
        expect(stripPgnByteOrderMark('')).toBe('')
    })

    /**
     * Only the first character. Elsewhere `\uFEFF` is a zero-width space
     * somebody typed, and it is not this function's business — the comment
     * normalizer folds it into a space along with every other whitespace, which
     * is its own decision and unaffected by this.
     */
    it('strips only a leading mark, never one further in', () => {
        expect(stripPgnByteOrderMark('\uFEFFa\uFEFFb')).toBe('a\uFEFFb')
        expect(stripPgnByteOrderMark('a\uFEFFb')).toBe('a\uFEFFb')
    })

    it('imports a game whose comment contains one, rather than failing on it', () => {
        const parsed = parsePgnMoveTree(headers + '1. e4 { a\uFEFFb } *\n')
        expect(parsed.moves[0]?.move.san).toBe('e4')
        expect(parsed.moves[0]?.comment).toBe('a b')
    })

    it('reads a file saved with Windows line endings', () => {
        const parsed = parsePgnMoveTree((headers + '1. e4 c5 2. Nf3 *\n').replace(/\n/g, '\r\n'))
        expect(parsed.moves.length).toBeGreaterThan(0)
    })
})

describe('the clock reading a move was made with', () => {
    it('reads the shape Lichess and chess.com write', () => {
        expect(clockMsFromComment('[%clk 0:03:07]')).toBe(187_000)
        expect(clockMsFromComment('[%eval 0.2] [%clk 1:02:03]')).toBe(3_723_000)
        expect(clockMsFromComment('[%clk 0:00:00]')).toBe(0)
    })

    /** Lichess writes two fields on a short control, and tenths on a small increment. */
    it('reads minutes:seconds, and a fractional second', () => {
        expect(clockMsFromComment('[%clk 2:58]')).toBe(178_000)
        expect(clockMsFromComment('[%clk 0:00:09.7]')).toBe(9_700)
    })

    it('is absent rather than wrong for anything it does not recognise', () => {
        expect(clockMsFromComment(undefined)).toBeUndefined()
        expect(clockMsFromComment('a note with no clock')).toBeUndefined()
        expect(clockMsFromComment('[%clk banana]')).toBeUndefined()
        expect(clockMsFromComment('[%clk 0:99:00]')).toBeUndefined()
        expect(clockMsFromComment('[%clk 0:00:61]')).toBeUndefined()
    })

    it('writes the shape it reads', () => {
        expect(clockCommentValue(187_000)).toBe('0:03:07')
        expect(clockCommentValue(3_723_000)).toBe('1:02:03')
        expect(clockCommentValue(0)).toBe('0:00:00')
        expect(clockCommentValue(-5)).toBe('0:00:00')
    })

    it('round-trips a reading through its own writer', () => {
        for (const ms of [0, 999, 1_000, 59_000, 187_000, 3_723_000]) {
            expect(clockMsFromComment(`[%clk ${clockCommentValue(ms)}]`)).toBe(Math.floor(ms / 1000) * 1000)
        }
    })
})
