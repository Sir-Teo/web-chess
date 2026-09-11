import { describe, expect, it } from 'vitest'
import { sameNodeList } from './useGameTree'
import type { GameNode } from './useGameTree'

const node = (id: string): GameNode => ({
  id, fen: '', move: null, parent: null, children: [], ply: 0,
} as unknown as GameNode)

/**
 * The comparison that keeps a derived line's identity across a navigation.
 *
 * Navigating republishes the tree as `{ ...tree, currentId }`, so every line
 * rebuilt from it is equal and new, and each new identity invalidated the memo
 * below it -- the winrate series, the move times, the graphs. **Measured** at
 * 6x CPU in Play mode: a 120-ply game cost 54ms an arrow press and a 12-ply one
 * cost nothing, and holding the line steady took the 120-ply game to nothing
 * as well.
 */
describe('sameNodeList', () => {
  it('holds a line that was rebuilt out of the same nodes', () => {
    const a = node('a')
    const b = node('b')
    expect(sameNodeList([a, b], [a, b])).toBe(true)
  })

  it('is the same list as itself', () => {
    const list = [node('a')]
    expect(sameNodeList(list, list)).toBe(true)
  })

  it('lets go when a move is added or taken back', () => {
    const a = node('a')
    const b = node('b')
    expect(sameNodeList([a], [a, b])).toBe(false)
    expect(sameNodeList([a, b], [a])).toBe(false)
  })

  /**
   * The case that decides this is identity and not id. A review labelling a
   * move replaces that node in a fresh Map, keeping its id; comparing ids would
   * call the line unchanged and leave the graphs drawing the old one.
   */
  it('lets go when a node is replaced but keeps its id', () => {
    const before = node('a')
    const after = node('a')
    expect(after.id).toBe(before.id)
    expect(sameNodeList([before], [after])).toBe(false)
  })

  it('lets go when the same nodes come back in a different order', () => {
    const a = node('a')
    const b = node('b')
    expect(sameNodeList([a, b], [b, a])).toBe(false)
  })
})
