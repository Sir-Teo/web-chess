import { describe, expect, it } from 'vitest'
import type { GameNode } from '../hooks/useGameTree'
import { VARIATION_PREVIEW_LENGTH, buildVariationPreview } from './variationPreview'

/** A first-child chain of `length` nodes, ids "v1".."vN". */
function chain(length: number): { nodes: Map<string, GameNode>; ids: string[] } {
  const nodes = new Map<string, GameNode>()
  const ids: string[] = []

  for (let index = 0; index < length; index += 1) {
    const id = `v${index + 1}`
    ids.push(id)
    nodes.set(id, {
      id,
      fen: `fen-${id}`,
      move: null,
      san: `m${index + 1}`,
      uci: `u${index + 1}`,
      parent: index === 0 ? null : ids[index - 1]!,
      children: index === length - 1 ? [] : [`v${index + 2}`],
    })
  }

  return { nodes, ids }
}

describe('the variation slice the move list draws', () => {
  it('draws a short variation whole, with nothing hidden', () => {
    const { nodes } = chain(3)
    const preview = buildVariationPreview('v1', nodes)

    expect(preview.nodes.map(node => node.san)).toEqual(['m1', 'm2', 'm3'])
    expect(preview.hidden).toBe(0)
  })

  it('cuts a long variation at the preview length and says how much it cut', () => {
    const { nodes } = chain(20)
    const preview = buildVariationPreview('v1', nodes)

    expect(preview.nodes).toHaveLength(VARIATION_PREVIEW_LENGTH)
    expect(preview.hidden).toBe(20 - VARIATION_PREVIEW_LENGTH)
  })

  /**
   * The defect this function exists for. A plain cap could hide the node the
   * reader is standing on, and then the move list highlighted nothing, marked
   * nothing aria-current, and had nothing to scroll into view -- it stopped
   * answering "where am I".
   */
  it('always reaches the current node, however deep in the variation it is', () => {
    const { nodes } = chain(20)
    const preview = buildVariationPreview('v1', nodes, 'v12')

    expect(preview.nodes).toHaveLength(12)
    expect(preview.nodes.at(-1)?.id).toBe('v12')
    expect(preview.hidden).toBe(8)
  })

  it('does not shrink the preview when the current node is an early one', () => {
    const { nodes } = chain(20)
    const preview = buildVariationPreview('v1', nodes, 'v2')

    expect(preview.nodes).toHaveLength(VARIATION_PREVIEW_LENGTH)
  })

  /**
   * A variation nested inside this one. The reader is standing in it, so the
   * current node is not on this chain at all -- but the node the sub-line hangs
   * off is on the path to it, and drawing that node is what gives the sub-line
   * somewhere to be drawn from.
   */
  it('reaches past the fork a nested variation hangs off, given the current path', () => {
    const { nodes } = chain(20)
    // A sub-line off v10: an alternative to v11, so it is drawn *after* v11,
    // and v11 has to be on screen for it to have anything to follow.
    nodes.set('v10', { ...nodes.get('v10')!, children: ['v11', 'sub-1'] })
    nodes.set('sub-1', { ...nodes.get('v11')!, id: 'sub-1', san: 's1', uci: 's1', children: [] })
    const path = new Set(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'sub-1'])
    const preview = buildVariationPreview('v1', nodes, path)

    expect(preview.nodes).toHaveLength(11)
    expect(preview.nodes.at(-1)?.id).toBe('v11')
    expect(preview.hidden).toBe(9)
  })

  it('ignores a current node that belongs to some other line', () => {
    const { nodes } = chain(20)
    const preview = buildVariationPreview('v1', nodes, 'somewhere-else')

    expect(preview.nodes).toHaveLength(VARIATION_PREVIEW_LENGTH)
    expect(preview.hidden).toBe(14)
  })

  it('returns nothing for a node that is not in the tree', () => {
    const { nodes } = chain(3)
    expect(buildVariationPreview('missing', nodes)).toEqual({ nodes: [], hidden: 0 })
  })

  /** This walk runs during render, so a cycle must fail rather than hang. */
  it('stops on a cycle instead of walking forever', () => {
    const { nodes } = chain(3)
    nodes.set('v3', { ...nodes.get('v3')!, children: ['v1'] })

    const preview = buildVariationPreview('v1', nodes)
    expect(preview.nodes.map(node => node.id)).toEqual(['v1', 'v2', 'v3'])
    expect(preview.hidden).toBe(0)
  })
})
