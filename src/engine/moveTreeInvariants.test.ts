import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import type { GameNode } from '../hooks/useGameTree'
import { isOnMainLine, promoteToMainLine, removeSubtree } from './moveTree'

/**
 * Structural rules for the move tree, checked against randomly branched trees
 * rather than against shapes someone drew.
 *
 * This is the structure the takeback bug lived in: the main line is the
 * first-child chain, and the PGN export, the auto-save, the library, Review
 * Game and both graphs all read it. A tree that loses a parent link or grows a
 * second root is not a visible bug until one of those reads it.
 */

function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Tree = { nodes: Map<string, GameNode>; rootId: string; ids: string[] }

/**
 * A tree grown by playing real moves from randomly chosen existing nodes, so
 * the branching is the shape analysis actually produces -- a long line with
 * variations hanging off it, and variations inside those.
 */
function buildRandomTree(seed: number, nodeCount: number): Tree {
  const random = makeRandom(seed)
  const rootId = 'root'
  const start = new Chess()
  const nodes = new Map<string, GameNode>([[rootId, {
    id: rootId, fen: start.fen(), move: null, san: '', uci: '', parent: null, children: [],
  }]])
  const ids = [rootId]

  for (let i = 0; i < nodeCount; i++) {
    // Bias towards the newest node so lines grow, but branch often enough that
    // variations inside variations happen.
    const pick = random() < 0.65 ? ids[ids.length - 1] : ids[Math.floor(random() * ids.length)]
    const parent = nodes.get(pick)!
    const board = new Chess(parent.fen)
    const legal = board.moves({ verbose: true })
    if (legal.length === 0) continue

    const move = legal[Math.floor(random() * legal.length)]
    board.move(move)
    const id = `n${i}`
    nodes.set(id, {
      id, fen: board.fen(), move, san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      parent: parent.id, children: [],
    })
    nodes.set(parent.id, { ...parent, children: [...parent.children, id] })
    ids.push(id)
  }

  return { nodes, rootId, ids }
}

/** The first-child chain, worked out without asking `isOnMainLine`. */
function mainLineChain(nodes: Map<string, GameNode>, rootId: string): string[] {
  const chain: string[] = []
  let cursor = nodes.get(rootId)
  while (cursor) {
    chain.push(cursor.id)
    cursor = cursor.children[0] ? nodes.get(cursor.children[0]) : undefined
  }
  return chain
}

/**
 * Every structural rule in one pass, reporting a list rather than asserting
 * per node: this runs thousands of times, and an `expect` per node per call is
 * most of the cost of the file.
 */
function soundnessProblems(nodes: Map<string, GameNode>, rootId: string): string[] {
  const problems: string[] = []
  const root = nodes.get(rootId)
  if (!root) return ['the root is gone']
  if (root.parent !== null) problems.push('the root grew a parent')

  for (const node of nodes.values()) {
    if (node.parent !== null) {
      const parent = nodes.get(node.parent)
      if (!parent) problems.push(`${node.id} points at a parent that is not there`)
      else if (!parent.children.includes(node.id)) problems.push(`${node.id} is not among its parent's children`)
    }
    for (const child of node.children) {
      const seen = nodes.get(child)
      if (!seen) problems.push(`${node.id} lists a child that is not there`)
      else if (seen.parent !== node.id) problems.push(`${child} does not point back at ${node.id}`)
    }
  }

  // One walk down from the root answers reachability and cycles together: a
  // cycle either revisits a node or strands one, and both show up here.
  const reached = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    if (reached.has(id)) { problems.push(`${id} is reachable twice, so there is a cycle`); continue }
    reached.add(id)
    stack.push(...(nodes.get(id)?.children ?? []))
  }
  if (reached.size !== nodes.size) {
    const stranded = [...nodes.keys()].filter(id => !reached.has(id))
    problems.push(`${stranded.length} node(s) do not hang off the root: ${stranded.slice(0, 4).join(', ')}`)
  }

  const chain = new Set(mainLineChain(nodes, rootId))
  for (const node of nodes.values()) {
    if (isOnMainLine(nodes, node.id) !== chain.has(node.id)) {
      problems.push(`isOnMainLine disagrees with the first-child chain about ${node.id}`)
    }
  }

  return problems
}

function assertSound(nodes: Map<string, GameNode>, rootId: string, where: string) {
  expect(soundnessProblems(nodes, rootId), where).toEqual([])
}

const TREES = Array.from({ length: 40 }, (_, index) => buildRandomTree(index + 1, 60))

describe('the trees these rules are checked against', () => {
  it('actually branch', () => {
    const forks = TREES.map(tree =>
      [...tree.nodes.values()].filter(node => node.children.length > 1).length)
    expect(Math.min(...forks), 'a tree with no fork proves nothing').toBeGreaterThan(0)
    expect(Math.max(...forks)).toBeGreaterThan(5)
  })

  it('are sound to begin with', () => {
    for (const tree of TREES) assertSound(tree.nodes, tree.rootId, `seed tree ${tree.ids.length}`)
  })
})

describe('promoting a line', () => {
  it('puts the node on the main line and leaves the tree sound', () => {
    for (const [index, tree] of TREES.entries()) {
      for (const id of tree.ids) {
        const promoted = promoteToMainLine(tree.nodes, id)
        if (!promoted) {
          // Null means nothing moved, which must mean it was already there.
          expect(isOnMainLine(tree.nodes, id), `tree ${index}: ${id} refused but is off the line`).toBe(true)
          continue
        }
        expect(isOnMainLine(promoted, id), `tree ${index}: ${id} promoted but is still off the line`).toBe(true)
        assertSound(promoted, tree.rootId, `tree ${index} after promoting ${id}`)
      }
    }
  })

  it('moves nodes about without adding or losing any', () => {
    for (const [index, tree] of TREES.entries()) {
      const before = [...tree.nodes.keys()].sort()
      for (const id of tree.ids) {
        const promoted = promoteToMainLine(tree.nodes, id)
        if (!promoted) continue
        expect([...promoted.keys()].sort(), `tree ${index} promoting ${id}`).toEqual(before)
      }
    }
  })

  it('does not touch a tree it cannot find the node in', () => {
    for (const tree of TREES) expect(promoteToMainLine(tree.nodes, 'no-such-node')).toBeNull()
  })
})

describe('discarding a branch', () => {
  it('removes exactly the subtree, and nothing else', () => {
    for (const [index, tree] of TREES.entries()) {
      for (const id of tree.ids) {
        const removal = removeSubtree(tree.nodes, id)
        if (!removal) {
          expect(id, `tree ${index}: ${id} refused but is not the root`).toBe(tree.rootId)
          continue
        }

        // Work out the subtree independently of the function under test.
        const expected = new Set<string>()
        const stack = [id]
        while (stack.length) {
          const next = stack.pop()!
          if (expected.has(next)) continue
          expected.add(next)
          stack.push(...(tree.nodes.get(next)?.children ?? []))
        }

        const gone = [...tree.nodes.keys()].filter(key => !removal.nodes.has(key))
        expect(new Set(gone), `tree ${index} discarding ${id}`).toEqual(expected)
        expect(removal.removedCount, `tree ${index} discarding ${id}`).toBe(expected.size)
        expect(removal.fallbackId, `tree ${index} discarding ${id}`).toBe(tree.nodes.get(id)!.parent)
        assertSound(removal.nodes, tree.rootId, `tree ${index} after discarding ${id}`)
      }
    }
  })

  it('refuses the root, so there is no way to ask for an empty tree', () => {
    for (const tree of TREES) {
      expect(removeSubtree(tree.nodes, tree.rootId)).toBeNull()
      expect(removeSubtree(tree.nodes, 'no-such-node')).toBeNull()
    }
  })
})

describe('promoting and discarding together', () => {
  /** The sequence a reader actually performs: try a line, keep it, drop another. */
  it('survives a run of random operations', () => {
    for (const [index, tree] of TREES.entries()) {
      const random = makeRandom(9000 + index)
      let nodes = tree.nodes
      let live = [...tree.ids]

      for (let step = 0; step < 25 && live.length > 1; step++) {
        const id = live[Math.floor(random() * live.length)]
        if (random() < 0.5) {
          nodes = promoteToMainLine(nodes, id) ?? nodes
        } else {
          const removal = removeSubtree(nodes, id)
          if (removal) {
            nodes = removal.nodes
            live = live.filter(key => nodes.has(key))
          }
        }
        assertSound(nodes, tree.rootId, `tree ${index} step ${step}`)
      }
    }
  })
})
