import { useCallback, useMemo, useRef, useState } from 'react'
import { Chess, type Move } from 'chess.js'
import type { ReviewLabel } from '../engine/analysis'
import {
    promoteToMainLine as promoteNodesToMainLine,
    removeSubtree,
    variationRootId,
} from '../engine/moveTree'

// ── Types ────────────────────────────────────────────────────────────────────

export type GameNode = {
    id: string
    fen: string          // FEN after this move
    move: Move | null    // null only for root
    san: string          // '' for root
    uci: string          // '' for root
    parent: string | null
    children: string[]
    comment?: string
    suffix?: string
    nags?: string[]
    quality?: ReviewLabel
}

export type GameTreeImportEntry = {
    move: Move
    fen: string
    comment?: string
    suffix?: string
    nags?: string[]
    children?: GameTreeImportEntry[]
}

type GameTree = {
    nodes: Map<string, GameNode>
    rootId: string
    currentId: string
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _counter = 0
function nextId(): string {
    _counter += 1
    return `n${_counter}`
}

// ── Root factory ──────────────────────────────────────────────────────────────

const INITIAL_FEN = new Chess().fen()

function makeRoot(fen = INITIAL_FEN): GameNode {
    return {
        id: nextId(),
        fen,
        move: null,
        san: '',
        uci: '',
        parent: null,
        children: [],
    }
}

function makeTree(fen?: string): GameTree {
    const root = makeRoot(fen)
    return {
        nodes: new Map([[root.id, root]]),
        rootId: root.id,
        currentId: root.id,
    }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGameTree(startFen?: string) {
    const [treeState, setTreeState] = useState<GameTree>(() => makeTree(startFen))
    const treeRef = useRef<GameTree>(treeState)

    const publishTree = useCallback((nextTree: GameTree) => {
        treeRef.current = nextTree
        setTreeState(nextTree)
    }, [])

    // ── Selectors ─────────────────────────────────────────────────────────────

    const getNode = useCallback((id: string): GameNode | undefined => {
        return treeRef.current.nodes.get(id)
    }, [])

    const root = treeState.nodes.get(treeState.rootId)!
    const current = treeState.nodes.get(treeState.currentId) ?? root

    /**
     * Walk parent pointers from a node back to root, return ordered path root→node.
     */
    const pathToNode = useCallback((id: string): GameNode[] => {
        const tree = treeRef.current
        const path: GameNode[] = []
        let cur: GameNode | undefined = tree.nodes.get(id)
        while (cur) {
            path.unshift(cur)
            cur = cur.parent ? tree.nodes.get(cur.parent) : undefined
        }
        return path
    }, [])

    /**
     * The ordered main-line nodes (root → deepest first-child chain).
     */
    const mainLine = useCallback((): GameNode[] => {
        const tree = treeRef.current
        const line: GameNode[] = []
        let cur: GameNode | undefined = tree.nodes.get(tree.rootId)
        while (cur) {
            line.push(cur)
            const firstChildId = cur.children[0]
            cur = firstChildId ? tree.nodes.get(firstChildId) : undefined
        }
        return line
    }, [])

    /**
     * Ordered nodes from root to current (the "active path").
     */
    const currentPath = useCallback((): GameNode[] => {
        return pathToNode(treeRef.current.currentId)
    }, [pathToNode])

    // ── Mutations ─────────────────────────────────────────────────────────────

    /**
     * Add a move as a child of the current node.
     * If the exact same move already exists as a child, just navigate to it.
     * Returns the new (or existing) node id.
     *
     * `mainLine` decides what the move *is*. A new child is appended last, so
     * by default a move played from a position that already has a continuation
     * becomes a variation -- which is right in analysis and wrong in a game.
     * Take a move back while playing and play a different one, and without this
     * the move you abandoned is still the main line: the PGN exports it, the
     * auto-save stores it, and Review Game reviews it, while the game you are
     * actually playing sits in brackets.
     */
    const addMove = useCallback((move: Move, fen: string, options?: { mainLine?: boolean }): string => {
        const tree = treeRef.current
        const parent = tree.nodes.get(tree.currentId)
        if (!parent) return tree.currentId

        const uci = `${move.from}${move.to}${move.promotion ?? ''}`

        const publishPromoted = (nextTree: GameTree, id: string) => {
            const promoted = options?.mainLine ? promoteNodesToMainLine(nextTree.nodes, id) : null
            publishTree(promoted ? { ...nextTree, nodes: promoted, currentId: id } : { ...nextTree, currentId: id })
        }

        // De-dupe: check if an identical child already exists
        for (const childId of parent.children) {
            const child = tree.nodes.get(childId)
            if (child && child.uci === uci) {
                // Replaying a move that is already a variation still makes it
                // the game, or taking back and playing the same move again
                // would leave the line in brackets.
                publishPromoted(tree, childId)
                return childId
            }
        }

        const node: GameNode = {
            id: nextId(),
            fen,
            move,
            san: move.san,
            uci,
            parent: parent.id,
            children: [],
        }

        const nextNodes = new Map(tree.nodes)
        nextNodes.set(node.id, node)
        nextNodes.set(parent.id, { ...parent, children: [...parent.children, node.id] })
        publishPromoted({ ...tree, nodes: nextNodes }, node.id)
        return node.id
    }, [publishTree])

    /**
     * Replace the current tree with a single imported main-line in one render pass.
     * This avoids O(n) re-render thrashing during large PGN imports.
     */
    const loadMainLine = useCallback((entries: GameTreeImportEntry[], startFen?: string): string => {
        const nextTree = makeTree(startFen)
        let parent = nextTree.nodes.get(nextTree.rootId)!

        for (const entry of entries) {
            const move = entry.move
            const node: GameNode = {
                id: nextId(),
                fen: entry.fen,
                move,
                san: move.san,
                uci: `${move.from}${move.to}${move.promotion ?? ''}`,
                parent: parent.id,
                children: [],
                comment: entry.comment,
                suffix: entry.suffix,
                nags: entry.nags,
            }

            nextTree.nodes.set(node.id, node)
            parent.children.push(node.id)
            parent = node
        }

        publishTree({ ...nextTree, currentId: parent.id })
        return parent.id
    }, [publishTree])

    const loadTree = useCallback((entries: GameTreeImportEntry[], startFen?: string): string => {
        const nextTree = makeTree(startFen)
        const root = nextTree.nodes.get(nextTree.rootId)!

        const appendEntries = (parent: GameNode, childEntries: GameTreeImportEntry[]): GameNode | null => {
            let firstLineLeaf: GameNode | null = null

            for (const entry of childEntries) {
                const move = entry.move
                const node: GameNode = {
                    id: nextId(),
                    fen: entry.fen,
                    move,
                    san: move.san,
                    uci: `${move.from}${move.to}${move.promotion ?? ''}`,
                    parent: parent.id,
                    children: [],
                    comment: entry.comment,
                    suffix: entry.suffix,
                    nags: entry.nags,
                }

                nextTree.nodes.set(node.id, node)
                parent.children.push(node.id)

                const leaf = appendEntries(node, entry.children ?? []) ?? node
                if (!firstLineLeaf) firstLineLeaf = leaf
            }

            return firstLineLeaf
        }

        const current = appendEntries(root, entries) ?? root
        publishTree({ ...nextTree, currentId: current.id })
        return current.id
    }, [publishTree])

    /**
     * Navigate to an arbitrary node (by id).
     * Returns a Chess instance from the node's stored FEN.
     * Returns a new Chess() instance positioned at that node.
     */
    const navigateTo = useCallback((id: string): Chess => {
        const tree = treeRef.current
        const rootNode = tree.nodes.get(tree.rootId)
        const targetNode = tree.nodes.get(id)
        if (!targetNode) return new Chess(rootNode?.fen ?? INITIAL_FEN)

        publishTree({ ...tree, currentId: id })
        return new Chess(targetNode.fen)
    }, [publishTree])

    /** Step back one node along the active path */
    const goBack = useCallback((): Chess => {
        const tree = treeRef.current
        const cur = tree.nodes.get(tree.currentId)
        const rootNode = tree.nodes.get(tree.rootId)
        if (!cur || cur.parent === null) return new Chess(rootNode?.fen ?? INITIAL_FEN)
        return navigateTo(cur.parent)
    }, [navigateTo])

    /** Step forward to the first child of the current node (main line) */
    const goForward = useCallback((): Chess | null => {
        const tree = treeRef.current
        const cur = tree.nodes.get(tree.currentId)
        if (!cur || cur.children.length === 0) return null
        return navigateTo(cur.children[0])
    }, [navigateTo])

    /** Attach a quality label to a specific node */
    const setNodeQuality = useCallback((id: string, quality: ReviewLabel) => {
        const tree = treeRef.current
        const node = tree.nodes.get(id)
        if (!node) return
        if (node.quality === quality) return   // ← break the cascade
        const nextNodes = new Map(tree.nodes)
        nextNodes.set(id, { ...node, quality })
        publishTree({ ...tree, nodes: nextNodes })
    }, [publishTree])

    /** Attach or clear a user comment on a specific node. */
    const setNodeComment = useCallback((id: string, comment: string) => {
        const tree = treeRef.current
        const node = tree.nodes.get(id)
        if (!node || !node.move) return

        const normalized = comment.trim() ? comment : ''
        if ((node.comment ?? '') === normalized) return

        const nextNode = { ...node }
        if (normalized) nextNode.comment = normalized
        else delete nextNode.comment

        const nextNodes = new Map(tree.nodes)
        nextNodes.set(id, nextNode)
        publishTree({ ...tree, nodes: nextNodes })
    }, [publishTree])

    /** Attach quality labels to many nodes in one tree publish. */
    const setNodeQualities = useCallback((updates: Array<{ id: string; quality?: ReviewLabel }>) => {
        if (!updates.length) return

        const tree = treeRef.current
        let changed = false
        const nextNodes = new Map(tree.nodes)

        for (const update of updates) {
            const node = nextNodes.get(update.id)
            if (!node) continue
            if (update.quality === undefined) {
                if (node.quality === undefined) continue
                const nextNode = { ...node }
                delete nextNode.quality
                nextNodes.set(update.id, nextNode)
                changed = true
                continue
            }
            if (node.quality === update.quality) continue
            nextNodes.set(update.id, { ...node, quality: update.quality })
            changed = true
        }

        if (changed) publishTree({ ...tree, nodes: nextNodes })
    }, [publishTree])

    /**
     * Make the line through a node the main line.
     *
     * The main line is the first-child chain, and it is what `mainLine()`, the
     * review pass, the accuracy summary, the graphs and PGN export all read --
     * so before this, a better line found in analysis stayed a footnote: it was
     * never reviewed, never scored and never exported as the game.
     *
     * Returns whether anything moved, so a caller can say nothing happened
     * rather than claim it did.
     */
    const promoteToMainLine = useCallback((id: string): boolean => {
        const tree = treeRef.current
        const nextNodes = promoteNodesToMainLine(tree.nodes, id)
        if (!nextNodes) return false
        publishTree({ ...tree, nodes: nextNodes })
        return true
    }, [publishTree])

    /**
     * Discard the whole variation the given node belongs to, and return a Chess
     * at the move it hung off -- the same shape `navigateTo` returns, because
     * the caller has to move the board off a node that no longer exists.
     *
     * "The variation" is the branch, not the node: deleting from the cursor
     * would leave the first half of a discarded line behind, still drawn and
     * still exported. A node on the main line has no branch to discard, and
     * returns null rather than eating the game.
     */
    const deleteVariation = useCallback((id: string): Chess | null => {
        const tree = treeRef.current
        const branchId = variationRootId(tree.nodes, id)
        if (!branchId) return null

        const removal = removeSubtree(tree.nodes, branchId)
        if (!removal) return null

        const fallback = removal.nodes.get(removal.fallbackId)
        if (!fallback) return null

        const currentSurvives = removal.nodes.has(tree.currentId)
        publishTree({
            ...tree,
            nodes: removal.nodes,
            currentId: currentSurvives ? tree.currentId : removal.fallbackId,
        })

        return new Chess(currentSurvives ? tree.nodes.get(tree.currentId)!.fen : fallback.fen)
    }, [publishTree])

    /** Reset tree to a fresh starting position */
    const reset = useCallback((fen?: string) => {
        publishTree(makeTree(fen))
    }, [publishTree])

    // Expose a snapshot of all nodes (for renders that need to traverse)
    const nodesSnapshot = treeState.nodes

    return useMemo(() => ({
        // State
        current,
        root,
        nodesSnapshot,
        // Derived
        mainLine,
        currentPath,
        pathToNode,
        getNode,
        // Mutations
        addMove,
        loadMainLine,
        loadTree,
        navigateTo,
        goBack,
        goForward,
        setNodeQuality,
        setNodeComment,
        setNodeQualities,
        promoteToMainLine,
        deleteVariation,
        reset,
    }), [
        addMove,
        current,
        currentPath,
        deleteVariation,
        getNode,
        goBack,
        goForward,
        loadMainLine,
        loadTree,
        mainLine,
        navigateTo,
        nodesSnapshot,
        pathToNode,
        promoteToMainLine,
        reset,
        root,
        setNodeQuality,
        setNodeComment,
        setNodeQualities,
    ])
}

export type GameTreeHandle = ReturnType<typeof useGameTree>
