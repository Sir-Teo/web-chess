import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { MoveListTree } from './MoveListTree'
import type { GameNode, GameTreeHandle } from '../hooks/useGameTree'

/**
 * A line as a PGN reads: a move is a string, and an array of lines after a
 * move is the set of alternatives to it.
 *
 *   ['e4', 'e5', 'Nf3', [['Nc3', 'Nf6']], 'Nc6']  ==  1. e4 e5 2. Nf3 (2. Nc3 Nf6) 2... Nc6
 */
type Line = Array<string | Line[]>

let counter = 0

function addLine(nodes: Map<string, GameNode>, parentId: string, line: Line) {
    let parent = nodes.get(parentId)!
    let last: GameNode | null = null

    for (const token of line) {
        if (typeof token === 'string') {
            const chess = new Chess(parent.fen)
            const move = chess.move(token)
            const node: GameNode = {
                id: `n${++counter}`,
                fen: chess.fen(),
                move,
                san: move.san,
                uci: `${move.from}${move.to}${move.promotion ?? ''}`,
                parent: parent.id,
                children: [],
            }
            nodes.set(node.id, node)
            parent.children.push(node.id)
            last = node
            parent = node
            continue
        }

        // Alternatives to the last move hang off the move before it.
        for (const alternative of token) addLine(nodes, last!.parent!, alternative)
    }
}

function buildTree(line: Line, rootFen = new Chess().fen()): { nodes: Map<string, GameNode>; rootId: string } {
    const nodes = new Map<string, GameNode>()
    const root: GameNode = { id: `n${++counter}`, fen: rootFen, move: null, san: '', uci: '', parent: null, children: [] }
    nodes.set(root.id, root)
    addLine(nodes, root.id, line)
    return { nodes, rootId: root.id }
}

function findBySan(nodes: Map<string, GameNode>, san: string, occurrence = 0): GameNode {
    const matches = [...nodes.values()].filter(node => node.san === san)
    const node = matches[occurrence]
    if (!node) throw new Error(`No node ${san} #${occurrence}`)
    return node
}

function handle(nodes: Map<string, GameNode>, rootId: string, currentId = rootId): GameTreeHandle {
    const pathToNode = (id: string): GameNode[] => {
        const path: GameNode[] = []
        let cursor = nodes.get(id)
        while (cursor) {
            path.unshift(cursor)
            cursor = cursor.parent ? nodes.get(cursor.parent) : undefined
        }
        return path
    }
    const mainLine = (): GameNode[] => {
        const line: GameNode[] = []
        let cursor = nodes.get(rootId)
        while (cursor) {
            line.push(cursor)
            cursor = cursor.children[0] ? nodes.get(cursor.children[0]) : undefined
        }
        return line
    }

    return {
        current: nodes.get(currentId)!,
        root: nodes.get(rootId)!,
        nodesSnapshot: nodes,
        mainLine,
        currentPath: () => pathToNode(currentId),
        pathToNode,
        getNode: (id: string) => nodes.get(id),
        addMove: vi.fn(),
        loadMainLine: vi.fn(),
        loadTree: vi.fn(),
        navigateTo: vi.fn(() => new Chess()),
        goBack: vi.fn(),
        goForward: vi.fn(),
        setNodeQuality: vi.fn(),
        setNodeComment: vi.fn(),
        setNodeQualities: vi.fn(),
        promoteToMainLine: vi.fn(),
        deleteVariation: vi.fn(),
        reset: vi.fn(),
    } as unknown as GameTreeHandle
}

/** The list as a reader sees it: text only, one space between tokens. */
function readable(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

const NESTED: Line = [
    'e4', 'e5', 'Nf3',
    [['Nc3', 'Nf6', [['Nc6', 'Bc4', [['f4', 'exf4']], 'Bc5']], 'f4']],
    'Nc6', 'Bb5', 'a6',
    [['Nf6', 'O-O']],
    'Ba4',
]

describe('MoveListTree variations', () => {
    it('draws a variation nested inside a variation, in brackets and numbered', () => {
        const { nodes, rootId } = buildTree(NESTED)
        const text = readable(renderToStaticMarkup(<MoveListTree tree={handle(nodes, rootId)} onNavigate={vi.fn()} />))

        // The whole of 2. Nc3 Nf6 (2... Nc6 3. Bc4 (3. f4 exf4) 3... Bc5) 3. f4,
        // which the list used to show as "Nc3 Nf6 f4".
        expect(text).toContain('2. Nc3 Nf6 ( 2... Nc6 3. Bc4 ( 3. f4 exf4 ) 3... Bc5 ) 3. f4')
        expect(text).toContain('3... Nf6 4. O-O')
    })

    it('numbers the first move of a line and every White move, but not a Black reply', () => {
        const { nodes, rootId } = buildTree(NESTED)
        const text = readable(renderToStaticMarkup(<MoveListTree tree={handle(nodes, rootId)} onNavigate={vi.fn()} />))

        // Nf6 follows 2. Nc3 directly and needs no number of its own; Bc5
        // follows a bracket and does.
        expect(text).toContain('2. Nc3 Nf6 (')
        expect(text).toContain(') 3... Bc5')
        expect(text).not.toContain('2... Nf6')
    })

    it('always gives a screen reader the numbered move, whatever the row prints', () => {
        const { nodes, rootId } = buildTree(NESTED)
        const html = renderToStaticMarkup(<MoveListTree tree={handle(nodes, rootId)} onNavigate={vi.fn()} />)

        expect(html).toContain('aria-label="Go to move 1... e5"')
        expect(html).toContain('aria-label="Go to variation move 2... Nc6"')
    })

    it('reaches the sub-line the reader is standing in, past the preview cap', () => {
        // A variation of eight moves, with a sub-line branching from its
        // eighth. The cap alone would cut the variation at six and the sub-line
        // with it, leaving the current move nowhere on screen.
        const long: Line = [
            'e4', 'e5', 'Nf3',
            [['Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'Nf3', 'Bc5', [['Nc6', 'd4']], 'd4']],
            'Nc6',
        ]
        const { nodes, rootId } = buildTree(long)
        const inSubLine = findBySan(nodes, 'd4', 0)
        const html = renderToStaticMarkup(<MoveListTree tree={handle(nodes, rootId, inSubLine.id)} onNavigate={vi.fn()} />)
        const text = readable(html)

        // Bc5 follows 5. Nf3 directly and takes no number; the sub-line's
        // first move does, and the one move past it is reported, not dropped.
        expect(text).toContain('5. Nf3 Bc5 ( 5... Nc6 6. d4 ) +1')
        expect(html).toContain('aria-current="step"')
    })
})
