import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import type { GameNode, GameTreeImportEntry } from '../hooks/useGameTree'
import { exportAnnotatedPgn, parsePgnMoveTree } from './pgn'

/**
 * Export a game and read it back, over games nobody wrote by hand.
 *
 * Every other test here states a shape and checks it. That finds what someone
 * thought to state; it does not find the branch nobody thought of -- a
 * variation three deep whose first move carries a clock, a NAG and a written
 * note at once, which is an ordinary node in a Lichess study and appears in no
 * fixture. The export and the import are each other's inverse or the app loses
 * somebody's analysis on the way to disk, so the property is worth asserting
 * directly, over trees generated rather than chosen.
 *
 * Seeded, so a failure names a number that reproduces it exactly.
 */

/** Mulberry32: small, fast, and the same sequence everywhere. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** What a node has to survive the trip with. */
type Shape = {
  san: string
  comment?: string
  nags?: string[]
  suffix?: string
  clockMs?: number
  children: Shape[]
}

// Nothing here exercises the comment sanitiser: no braces, no semicolons (the
// separator the exporter joins parts with), no `[%...]` that would read back as
// a command. Those have their own tests; this one is about structure.
const COMMENTS = ['a quiet move', 'better was Nf3', 'the point', 'careless', 'only move']
const NAGS = ['1', '2', '3', '4', '5', '6', '14', '15', '36']
const SUFFIXES = ['!', '?', '!?', '?!', '!!', '??']

type Generated = { nodes: Map<string, GameNode>; mainLine: GameNode[] }

type GenerateOptions = {
  plies: number
  /** How deep alternatives may themselves branch. */
  branching?: number
  startFen?: string
  /** Comments long enough that the exporter has to break the token to wrap it. */
  longComments?: boolean
}

function generateGame(seed: number, options: GenerateOptions): Generated {
  const { plies, branching: maxBranching = 2, startFen, longComments = false } = options
  const random = rng(seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!
  const nodes = new Map<string, GameNode>()
  let counter = 0

  const root: GameNode = {
    id: 'n0', fen: new Chess(startFen).fen(), move: null, san: '', uci: '', parent: null, children: [],
  }
  nodes.set(root.id, root)

  const grow = (parent: GameNode, depth: number, branching: number) => {
    if (depth >= plies) return
    const legal = new Chess(parent.fen).moves({ verbose: true })
    if (!legal.length) return

    // One continuation, and sometimes an alternative beside it -- the shape a
    // game with analysis has. Alternatives do not branch again past the first
    // level, which keeps the PGN inside what a reader will take.
    const wanted = branching > 0 && random() < 0.35 ? 2 : 1
    const chosen: string[] = []
    while (chosen.length < Math.min(wanted, legal.length)) {
      const candidate = pick(legal).san
      if (!chosen.includes(candidate)) chosen.push(candidate)
    }

    for (const [index, san] of chosen.entries()) {
      const board = new Chess(parent.fen)
      const move = board.move(san)
      counter += 1
      const node: GameNode = {
        id: `n${counter}`,
        fen: board.fen(),
        move,
        san: move.san,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
        parent: parent.id,
        children: [],
        ...(random() < 0.5
          ? { comment: longComments ? Array.from({ length: 12 }, () => pick(COMMENTS)).join(' ') : pick(COMMENTS) }
          : {}),
        ...(random() < 0.3 ? { suffix: pick(SUFFIXES) } : {}),
        ...(random() < 0.3 ? { nags: random() < 0.4 ? [pick(NAGS), pick(NAGS)] : [pick(NAGS)] } : {}),
        // Whole seconds: `[%clk]` is written to the second, so anything finer
        // is lost on purpose and would be testing the wrong thing.
        ...(random() < 0.5 ? { clockMs: Math.floor(random() * 600) * 1000 } : {}),
      }
      nodes.set(node.id, node)
      parent.children.push(node.id)
      grow(node, depth + 1, index === 0 ? branching : branching - 1)
    }
  }

  grow(root, 0, maxBranching)

  const mainLine: GameNode[] = []
  for (let node: GameNode | undefined = root; node; node = node.children[0] ? nodes.get(node.children[0]) : undefined) {
    mainLine.push(node)
  }
  return { nodes, mainLine }
}

function shapeOfNodes(parent: GameNode, nodes: Map<string, GameNode>): Shape[] {
  return parent.children.map(id => {
    const node = nodes.get(id)!
    return {
      san: node.san,
      ...(node.comment ? { comment: node.comment } : {}),
      ...(node.nags?.length ? { nags: node.nags } : {}),
      ...(node.suffix ? { suffix: node.suffix } : {}),
      ...(typeof node.clockMs === 'number' ? { clockMs: node.clockMs } : {}),
      children: shapeOfNodes(node, nodes),
    }
  })
}

function shapeOfEntries(entries: GameTreeImportEntry[]): Shape[] {
  return entries.map(entry => ({
    san: entry.move.san,
    ...(entry.comment ? { comment: entry.comment } : {}),
    ...(entry.nags?.length ? { nags: entry.nags } : {}),
    ...(entry.suffix ? { suffix: entry.suffix } : {}),
    ...(typeof entry.clockMs === 'number' ? { clockMs: entry.clockMs } : {}),
    children: shapeOfEntries(entry.children ?? []),
  }))
}

describe('a game exported and read back', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    it(`keeps every move, note and reading — seed ${seed}`, () => {
      const { nodes, mainLine } = generateGame(seed, { plies: 12 })
      const root = mainLine[0]!
      const expected = shapeOfNodes(root, nodes)
      expect(expected.length, 'the generator produced no moves').toBeGreaterThan(0)

      const pgn = exportAnnotatedPgn(mainLine, new Map(), { Result: '*' }, nodes)
      const parsed = parsePgnMoveTree(pgn)

      expect(shapeOfEntries(parsed.moves)).toEqual(expected)
    })
  }

  /**
   * A long game with long notes, which is the one that makes the exporter
   * wrap: movetext goes out at 70 columns, and a comment too long for a line
   * is broken at its spaces -- with `[%clk ...]` kept whole so a reader
   * scanning line by line still finds it. A newline inside a comment is
   * whitespace to every reader, including this app's importer, and that is the
   * claim being tested.
   */
  for (let seed = 1; seed <= 12; seed += 1) {
    it(`survives the wrap, with notes longer than a line — seed ${seed}`, () => {
      const { nodes, mainLine } = generateGame(seed, { plies: 30, longComments: true })
      const expected = shapeOfNodes(mainLine[0]!, nodes)
      const pgn = exportAnnotatedPgn(mainLine, new Map(), { Result: '*' }, nodes)
      expect(pgn.split('\n').every(line => line.length <= 255),
        'a line went past what the standard allows').toBe(true)
      expect(shapeOfEntries(parsePgnMoveTree(pgn).moves)).toEqual(expected)
    })
  }

  /** Variations inside variations, which a study has and a fixture rarely does. */
  for (let seed = 1; seed <= 12; seed += 1) {
    it(`survives branches inside branches — seed ${seed}`, () => {
      const { nodes, mainLine } = generateGame(seed, { plies: 14, branching: 4 })
      const expected = shapeOfNodes(mainLine[0]!, nodes)
      const parsed = parsePgnMoveTree(exportAnnotatedPgn(mainLine, new Map(), { Result: '*' }, nodes))
      expect(shapeOfEntries(parsed.moves)).toEqual(expected)
    })
  }

  /**
   * A game that does not start from the initial position travels with `SetUp`
   * and `FEN`, and every move in it is read against that root rather than a
   * fresh board. This position is three moves from promoting on both sides,
   * so the generated games reach the SAN the initial position rarely does.
   */
  const PROMOTION_FEN = '8/PPP2k2/8/8/8/8/2K2ppp/8 w - - 0 1'
  for (let seed = 1; seed <= 12; seed += 1) {
    it(`survives a game set up from a FEN — seed ${seed}`, () => {
      const { nodes, mainLine } = generateGame(seed, { plies: 10, startFen: PROMOTION_FEN })
      const expected = shapeOfNodes(mainLine[0]!, nodes)
      const pgn = exportAnnotatedPgn(mainLine, new Map(), { Result: '*' }, nodes)
      const parsed = parsePgnMoveTree(pgn)
      expect(parsed.rootFen).toBe(new Chess(PROMOTION_FEN).fen())
      expect(shapeOfEntries(parsed.moves)).toEqual(expected)
    })
  }

  /**
   * A root where Black is to move, which every other case here skips.
   *
   * It is not an exotic shape: a Lichess study chapter or a puzzle export
   * starts wherever the position starts, and half of those have Black on
   * move. The movetext has to open "23... Nf6" rather than "23. Nf6", and
   * the number has to survive the trip -- a game that comes back a move out
   * is a game whose review rows and clock readings are all attached to the
   * wrong ply.
   */
  const BLACK_TO_MOVE_FEN = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 5 23'
  for (let seed = 1; seed <= 12; seed += 1) {
    it(`survives a root with Black to move — seed ${seed}`, () => {
      const { nodes, mainLine } = generateGame(seed, { plies: 10, startFen: BLACK_TO_MOVE_FEN })
      const expected = shapeOfNodes(mainLine[0]!, nodes)
      expect(expected.length, 'the generator produced no moves').toBeGreaterThan(0)
      const pgn = exportAnnotatedPgn(mainLine, new Map(), { Result: '*' }, nodes)
      expect(pgn).toMatch(/\b23\.{3}\s/)
      const parsed = parsePgnMoveTree(pgn)
      expect(parsed.rootFen).toBe(new Chess(BLACK_TO_MOVE_FEN).fen())
      expect(shapeOfEntries(parsed.moves)).toEqual(expected)
    })
  }

  it('keeps a line that is nothing but annotation', () => {
    const board = new Chess()
    const e4 = board.move('e4')
    const nodes = new Map<string, GameNode>()
    const root: GameNode = { id: 'r', fen: new Chess().fen(), move: null, san: '', uci: '', parent: null, children: ['a'] }
    const node: GameNode = {
      id: 'a', fen: board.fen(), move: e4, san: 'e4', uci: 'e2e4', parent: 'r', children: [],
      comment: 'the point', suffix: '!?', nags: ['14'], clockMs: 178_000,
    }
    nodes.set(root.id, root)
    nodes.set(node.id, node)

    const parsed = parsePgnMoveTree(exportAnnotatedPgn([root, node], new Map(), { Result: '*' }, nodes))
    expect(shapeOfEntries(parsed.moves)).toEqual([
      { san: 'e4', comment: 'the point', nags: ['14'], suffix: '!?', clockMs: 178_000, children: [] },
    ])
  })
})
