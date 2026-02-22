import { useCallback, useRef, useState } from 'react'
import { Chess, type Move } from 'chess.js'
import type { ReviewLabel } from '../engine/analysis'

// ── Types ────────────────────────────────────────────────────────────────────

export type GameNode = {
    id: string
    fen: string          // FEN after this move
    move: Move | null    // null only for root
    san: string          // '' for root
    uci: string          // '' for root
    parent: string | null
    children: string[]
    quality?: ReviewLabel
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
    const treeRef = useRef<GameTree>(makeTree(startFen))
    const [tick, setTick] = useState(0)

    // Force re-render after mutations
    const bump = useCallback(() => setTick(t => t + 1), [])

    // ── Selectors ─────────────────────────────────────────────────────────────

    const getNode = useCallback((id: string): GameNode | undefined => {
        return treeRef.current.nodes.get(id)
    }, [])

    const current = getNode(treeRef.current.currentId) ?? makeRoot()
    const root = getNode(treeRef.current.rootId) ?? makeRoot()

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
     */
    const addMove = useCallback((move: Move, fen: string): string => {
        const tree = treeRef.current
        const parent = tree.nodes.get(tree.currentId)
        if (!parent) return tree.currentId

        const uci = `${move.from}${move.to}${move.promotion ?? ''}`

        // De-dupe: check if an identical child already exists
        for (const childId of parent.children) {
            const child = tree.nodes.get(childId)
            if (child && child.uci === uci) {
                tree.currentId = childId
                bump()
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

        tree.nodes.set(node.id, node)
        parent.children.push(node.id)
        tree.currentId = node.id
        bump()
        return node.id
    }, [bump])

    /**
     * Navigate to an arbitrary node (by id).
     * Rebuilds the chess game state from the path so callers can extract `game`.
     * Returns a new Chess() instance positioned at that node.
     */
    const navigateTo = useCallback((id: string): Chess => {
        const tree = treeRef.current
        if (!tree.nodes.has(id)) return new Chess()

        tree.currentId = id
        bump()

        // Reconstruct chess state by replaying moves from root
        const path = pathToNode(id)
        const chess = new Chess()
        for (const node of path) {
            if (node.move) {
                chess.move({ from: node.move.from, to: node.move.to, promotion: node.move.promotion })
            }
        }
        return chess
    }, [bump, pathToNode])

    /** Step back one node along the active path */
    const goBack = useCallback((): Chess => {
        const tree = treeRef.current
        const cur = tree.nodes.get(tree.currentId)
        if (!cur || cur.parent === null) return new Chess()
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
        node.quality = quality
        bump()
    }, [bump])

    /** Reset tree to a fresh starting position */
    const reset = useCallback((fen?: string) => {
        treeRef.current = makeTree(fen)
        bump()
    }, [bump])

    // Expose a snapshot of all nodes (for renders that need to traverse)
    const nodesSnapshot = treeRef.current.nodes

    return {
        // State
        current,
        root,
        nodesSnapshot,
        tick,
        // Derived
        mainLine,
        currentPath,
        pathToNode,
        getNode,
        // Mutations
        addMove,
        navigateTo,
        goBack,
        goForward,
        setNodeQuality,
        reset,
    }
}

export type GameTreeHandle = ReturnType<typeof useGameTree>
