import type { GameNode } from '../hooks/useGameTree'

/**
 * How many moves of a variation the move list shows before it starts hiding
 * them. A variation is a side note; the main line is the thing being read.
 */
export const VARIATION_PREVIEW_LENGTH = 6

export type VariationPreview = {
  /** The nodes to render, in order. */
  nodes: GameNode[]
  /** How many further moves the variation has that are not rendered. */
  hidden: number
}

/**
 * The slice of a variation the move list should draw.
 *
 * Walks the first-child chain from `startId`, the way the main line is walked,
 * and cuts it at {@link VARIATION_PREVIEW_LENGTH} -- except that it always
 * reaches the current node.
 *
 * That exception is the point. The cap on its own was silent and it could hide
 * the position the reader is standing on: navigate seven moves into a variation
 * and the list had no chip for the current node, so nothing was highlighted,
 * nothing carried `aria-current`, and the auto-scroll had nothing to scroll to.
 * The move list stopped answering "where am I", which is most of its job.
 *
 * Whatever is still cut is reported in `hidden` rather than dropped quietly, so
 * the caller can say so.
 */
export function buildVariationPreview(
  startId: string,
  nodes: Map<string, GameNode>,
  currentId?: string,
): VariationPreview {
  const chain: GameNode[] = []
  let cursor = nodes.get(startId)
  const seen = new Set<string>()

  // Guarded against a cycle: the tree should not have one, but this walk runs
  // during render and a loop here would hang the tab rather than fail.
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    chain.push(cursor)
    const firstChildId = cursor.children[0]
    cursor = firstChildId ? nodes.get(firstChildId) : undefined
  }

  const currentIndex = currentId ? chain.findIndex(node => node.id === currentId) : -1
  const shown = Math.max(VARIATION_PREVIEW_LENGTH, currentIndex + 1)

  return {
    nodes: chain.slice(0, shown),
    hidden: Math.max(0, chain.length - shown),
  }
}
