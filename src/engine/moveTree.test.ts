import { describe, expect, it } from 'vitest'
import type { GameNode } from '../hooks/useGameTree'
import { isOnMainLine, promoteToMainLine, removeSubtree, variationRootId } from './moveTree'

type Spec = Record<string, string[]>

/** A tree from an id -> children map. "root" is the root. */
function treeFrom(spec: Spec): Map<string, GameNode> {
  const nodes = new Map<string, GameNode>()
  const parentOf = new Map<string, string>()

  for (const [id, children] of Object.entries(spec)) {
    for (const child of children) parentOf.set(child, id)
  }

  const ids = new Set([...Object.keys(spec), ...Object.values(spec).flat()])
  for (const id of ids) {
    nodes.set(id, {
      id,
      fen: `fen-${id}`,
      move: null,
      san: id,
      uci: id,
      parent: parentOf.get(id) ?? null,
      children: spec[id] ?? [],
    })
  }

  return nodes
}

/** The first-child chain, which is what mainLine() walks. */
function mainLine(nodes: Map<string, GameNode>): string[] {
  const line: string[] = []
  let cursor = nodes.get('root')
  while (cursor) {
    line.push(cursor.id)
    const first = cursor.children[0]
    cursor = first ? nodes.get(first) : undefined
  }
  return line
}

describe('telling the main line from a variation', () => {
  const nodes = treeFrom({ root: ['a1', 'b1'], a1: ['a2'], b1: ['b2'] })

  it('accepts the first-child chain', () => {
    expect(isOnMainLine(nodes, 'root')).toBe(true)
    expect(isOnMainLine(nodes, 'a1')).toBe(true)
    expect(isOnMainLine(nodes, 'a2')).toBe(true)
  })

  it('rejects a node that hangs off a later child', () => {
    expect(isOnMainLine(nodes, 'b1')).toBe(false)
    expect(isOnMainLine(nodes, 'b2')).toBe(false)
  })

  it('rejects a node that is not in the tree', () => {
    expect(isOnMainLine(nodes, 'nope')).toBe(false)
  })
})

describe('promoting a variation to the main line', () => {
  it('moves the branch to the front of its parent', () => {
    const nodes = treeFrom({ root: ['a1', 'b1'], a1: ['a2'], b1: ['b2'] })
    const promoted = promoteToMainLine(nodes, 'b2')

    expect(promoted).not.toBeNull()
    expect(mainLine(promoted!)).toEqual(['root', 'b1', 'b2'])
    expect(isOnMainLine(promoted!, 'b2')).toBe(true)
  })

  /**
   * The reason every ancestor is walked. Winning only at the node's own fork
   * leaves the chain from the root turning off before it ever arrives.
   */
  it('wins at every fork above it, not just the nearest one', () => {
    const nodes = treeFrom({
      root: ['a1', 'b1'],
      b1: ['b2', 'c2'],
      c2: ['c3'],
    })
    const promoted = promoteToMainLine(nodes, 'c3')

    expect(mainLine(promoted!)).toEqual(['root', 'b1', 'c2', 'c3'])
  })

  it('keeps the demoted siblings, in order, behind the promoted one', () => {
    const nodes = treeFrom({ root: ['a1', 'b1', 'c1'] })
    const promoted = promoteToMainLine(nodes, 'c1')

    expect(promoted!.get('root')!.children).toEqual(['c1', 'a1', 'b1'])
  })

  it('leaves the rest of the tree alone', () => {
    const nodes = treeFrom({ root: ['a1', 'b1'], a1: ['a2'], b1: ['b2'] })
    const promoted = promoteToMainLine(nodes, 'b1')

    expect(promoted!.get('a1')).toBe(nodes.get('a1'))
    expect(promoted!.get('b2')).toBe(nodes.get('b2'))
    expect(nodes.get('root')!.children, 'the map handed in is not mutated').toEqual(['a1', 'b1'])
  })

  it('reports no change for a node already on the main line', () => {
    const nodes = treeFrom({ root: ['a1', 'b1'], a1: ['a2'] })
    expect(promoteToMainLine(nodes, 'a2')).toBeNull()
    expect(promoteToMainLine(nodes, 'root')).toBeNull()
  })

  it('reports no change for a node that is not in the tree', () => {
    const nodes = treeFrom({ root: ['a1'] })
    expect(promoteToMainLine(nodes, 'nope')).toBeNull()
  })

  /** The walk runs on user input; a malformed tree must fail rather than hang. */
  it('stops on a cycle instead of walking forever', () => {
    const nodes = treeFrom({ root: ['a1'], a1: ['a2'], a2: [] })
    nodes.set('root', { ...nodes.get('root')!, parent: 'a2' })
    nodes.set('a2', { ...nodes.get('a2')!, children: ['root'] })

    expect(() => promoteToMainLine(nodes, 'a2')).not.toThrow()
    expect(() => isOnMainLine(nodes, 'a2')).not.toThrow()
  })
})

describe('finding the branch a move belongs to', () => {
  it('names the node where the line left the main line', () => {
    const nodes = treeFrom({ root: ['a1', 'b1'], b1: ['b2'], b2: ['b3'] })
    expect(variationRootId(nodes, 'b3')).toBe('b1')
    expect(variationRootId(nodes, 'b1')).toBe('b1')
  })

  it('names the nearest fork for a variation inside a variation', () => {
    const nodes = treeFrom({ root: ['a1', 'b1'], b1: ['b2', 'c2'], c2: ['c3'] })
    expect(variationRootId(nodes, 'c3')).toBe('c2')
  })

  it('has nothing to name for a move on the main line', () => {
    const nodes = treeFrom({ root: ['a1'], a1: ['a2'] })
    expect(variationRootId(nodes, 'a2')).toBeNull()
    expect(variationRootId(nodes, 'root')).toBeNull()
  })
})

describe('removing a branch', () => {
  it('takes the node and everything under it', () => {
    const nodes = treeFrom({ root: ['a1', 'b1'], b1: ['b2'], b2: ['b3', 'b4'] })
    const removal = removeSubtree(nodes, 'b1')

    expect(removal!.removedCount).toBe(4)
    expect([...removal!.nodes.keys()].sort()).toEqual(['a1', 'root'])
    expect(removal!.nodes.get('root')!.children).toEqual(['a1'])
    expect(removal!.fallbackId).toBe('root')
  })

  it('leaves the siblings it did not remove', () => {
    const nodes = treeFrom({ root: ['a1', 'b1', 'c1'] })
    const removal = removeSubtree(nodes, 'b1')
    expect(removal!.nodes.get('root')!.children).toEqual(['a1', 'c1'])
  })

  it('does not mutate the map handed in', () => {
    const nodes = treeFrom({ root: ['a1', 'b1'] })
    removeSubtree(nodes, 'b1')
    expect(nodes.get('root')!.children).toEqual(['a1', 'b1'])
    expect(nodes.has('b1')).toBe(true)
  })

  /** There is no such thing as a tree with no root, so this cannot be asked for. */
  it('refuses the root', () => {
    const nodes = treeFrom({ root: ['a1'] })
    expect(removeSubtree(nodes, 'root')).toBeNull()
  })

  it('refuses a node that is not in the tree', () => {
    const nodes = treeFrom({ root: ['a1'] })
    expect(removeSubtree(nodes, 'nope')).toBeNull()
  })

  it('terminates on a cycle instead of walking forever', () => {
    const nodes = treeFrom({ root: ['a1'], a1: ['a2'], a2: [] })
    nodes.set('a2', { ...nodes.get('a2')!, children: ['a1'] })
    expect(removeSubtree(nodes, 'a1')!.removedCount).toBe(2)
  })
})
