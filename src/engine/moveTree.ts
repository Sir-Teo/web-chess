import type { GameNode } from '../hooks/useGameTree'

/**
 * Tree shape operations, kept out of the hook so they can be tested without a
 * renderer -- the same split `useStockfishEngine` and `useAiPlayer` already
 * make for their parsing and their difficulty tables.
 *
 * The main line is the first-child chain from the root. That single convention
 * is what `mainLine()`, the review pass, the accuracy summary, the graphs and
 * PGN export all read, so moving a node to the front of its parent's children
 * is the whole of "make this the main line".
 */

/** Whether a node sits on the first-child chain from the root. */
export function isOnMainLine(nodes: Map<string, GameNode>, id: string): boolean {
  let cursor = nodes.get(id)
  if (!cursor) return false

  const seen = new Set<string>()
  while (cursor?.parent) {
    if (seen.has(cursor.id)) return false
    seen.add(cursor.id)

    const parent = nodes.get(cursor.parent)
    if (!parent) return false
    if (parent.children[0] !== cursor.id) return false
    cursor = parent
  }

  return true
}

/**
 * Make the line through `id` the main line, and return the nodes to use next.
 *
 * Returns null when nothing moved -- the node is already on the main line, or
 * it is not in the tree -- so a caller can skip publishing a tree that would be
 * identical in everything but identity.
 *
 * Every ancestor is walked, not just the immediate parent: a variation inside a
 * variation has to win at each fork above it, or the chain from the root still
 * turns off before it reaches the node.
 */
export function promoteToMainLine(
  nodes: Map<string, GameNode>,
  id: string,
): Map<string, GameNode> | null {
  if (!nodes.has(id)) return null

  const next = new Map(nodes)
  const seen = new Set<string>()
  let changed = false
  let cursor: GameNode | undefined = next.get(id)

  while (cursor?.parent) {
    if (seen.has(cursor.id)) break
    seen.add(cursor.id)

    const parent = next.get(cursor.parent)
    if (!parent) break

    const index = parent.children.indexOf(cursor.id)
    if (index > 0) {
      const children = [...parent.children]
      children.splice(index, 1)
      children.unshift(cursor.id)
      next.set(parent.id, { ...parent, children })
      changed = true
    }

    cursor = next.get(parent.id)
  }

  return changed ? next : null
}

/**
 * The node where the line through `id` left the main line, or null when `id` is
 * on the main line.
 *
 * This is what "this line" means to a reader standing inside a variation: not
 * the move under the cursor, but the branch that move belongs to. Deleting from
 * the cursor instead would leave the first half of a discarded line behind,
 * still shown, still exported.
 */
export function variationRootId(nodes: Map<string, GameNode>, id: string): string | null {
  let cursor = nodes.get(id)
  if (!cursor) return null

  const seen = new Set<string>()
  while (cursor?.parent) {
    if (seen.has(cursor.id)) return null
    seen.add(cursor.id)

    const parent = nodes.get(cursor.parent)
    if (!parent) return null
    if (parent.children[0] !== cursor.id) return cursor.id
    cursor = parent
  }

  return null
}

export type SubtreeRemoval = {
  nodes: Map<string, GameNode>
  /** Where to stand once the branch is gone: the parent it hung off. */
  fallbackId: string
  removedCount: number
}

/**
 * Remove a node and everything below it.
 *
 * Returns null for the root and for a node that is not in the tree, so there is
 * no way to ask for an empty tree by accident.
 */
export function removeSubtree(
  nodes: Map<string, GameNode>,
  id: string,
): SubtreeRemoval | null {
  const target = nodes.get(id)
  if (!target?.parent) return null

  const parent = nodes.get(target.parent)
  if (!parent) return null

  const next = new Map(nodes)
  const stack = [id]
  const removed = new Set<string>()

  while (stack.length) {
    const currentId = stack.pop()!
    if (removed.has(currentId)) continue
    removed.add(currentId)

    const node = next.get(currentId)
    if (!node) continue
    next.delete(currentId)
    stack.push(...node.children)
  }

  next.set(parent.id, { ...parent, children: parent.children.filter(child => child !== id) })

  return { nodes: next, fallbackId: parent.id, removedCount: removed.size }
}
