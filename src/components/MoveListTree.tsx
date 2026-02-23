import React, { useEffect, useRef } from 'react'
import type { GameTreeHandle, GameNode } from '../hooks/useGameTree'
import { IconPawn, IconBranch } from './icons'

type Props = {
    tree: GameTreeHandle
    onNavigate: (chess: ReturnType<GameTreeHandle['navigateTo']>) => void
}

/**
 * Renders the game tree as a flat, numbered move list with inline variations.
 * Main line: "1. e4  e5   2. Nf3  Nc6 …"
 * Variation nodes are shown as indented continuation rows.
 */
export function MoveListTree({ tree, onNavigate }: Props) {
    const { current, mainLine, nodesSnapshot, navigateTo } = tree
    const scrollRef = useRef<HTMLDivElement>(null)

    const line = mainLine()

    // Keyboard navigation on the container is already handled globally in App.tsx

    // Auto-scroll current node into view
    useEffect(() => {
        const el = document.querySelector(`[data-node-id="${current.id}"]`) as HTMLElement | null
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, [current.id])

    if (line.length <= 1) {
        return (
            <div className="empty-state">
                <span className="empty-state-icon"><IconPawn /></span>
                <p>Play some moves — they'll appear here with analysis.</p>
            </div>
        )
    }

    // Build rows: pairs of (white move, black move) from the main line.
    // Beneath each pair, show any variation branches.
    const rows: React.ReactElement[] = []
    // line[0] is root (no move) — skip
    let i = 1
    while (i < line.length) {
        const whiteNode = line[i]
        const blackNode = line[i + 1] ?? null
        const moveNum = Math.ceil(i / 2)
        const isWhiteTurn = i % 2 === 1

        const whiteEl = whiteNode ? (
            <MoveChip
                key={whiteNode.id}
                node={whiteNode}
                isCurrent={whiteNode.id === current.id}
                onClick={() => onNavigate(navigateTo(whiteNode.id))}
            />
        ) : <span className="mtree-spacer" />

        const blackEl = blackNode ? (
            <MoveChip
                key={blackNode.id}
                node={blackNode}
                isCurrent={blackNode.id === current.id}
                onClick={() => onNavigate(navigateTo(blackNode.id))}
            />
        ) : <span className="mtree-spacer" />

        rows.push(
            <div key={`row-${moveNum}`} className="mtree-row">
                <span className="mtree-num">{isWhiteTurn ? moveNum : ''}</span>
                {whiteEl}
                {blackEl}
            </div>
        )

        // Render any variation branches hanging off whiteNode or blackNode
        const varTargets = [whiteNode, blackNode].filter(Boolean) as GameNode[]
        for (const parent of varTargets) {
            if (parent.children.length > 1) {
                // children[0] is main line — show the rest as variations
                const varChildren = parent.children.slice(1)
                for (const varId of varChildren) {
                    const varLine = buildVariationLine(varId, nodesSnapshot)
                    rows.push(
                        <div key={`var-${varId}`} className="mtree-variation">
                            <span className="mtree-var-marker"><IconBranch /></span>
                            {varLine.map(vn => (
                                <MoveChip
                                    key={vn.id}
                                    node={vn}
                                    isCurrent={vn.id === current.id}
                                    onClick={() => onNavigate(navigateTo(vn.id))}
                                    compact
                                />
                            ))}
                        </div>
                    )
                }
            }
        }

        i += 2
    }

    return (
        <div className="mtree-scroll" ref={scrollRef} tabIndex={-1}>
            {rows}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────

type ChipProps = {
    node: GameNode
    isCurrent: boolean
    onClick: () => void
    compact?: boolean
}

function MoveChip({ node, isCurrent, onClick, compact }: ChipProps) {
    const q = node.quality
    return (
        <button
            data-node-id={node.id}
            type="button"
            className={[
                'mtree-chip',
                isCurrent ? 'mtree-chip-active' : '',
                q ? `quality-${q}` : '',
                compact ? 'mtree-chip-compact' : '',
            ].filter(Boolean).join(' ')}
            onClick={onClick}
            title={q ? `${node.san} — ${q}` : node.san}
        >
            {node.san}
            {q && q !== 'pending' && (
                <span className="mtree-quality-dot" aria-label={q} />
            )}
        </button>
    )
}

/** Walk the first-child chain from a node to build a short variation line */
function buildVariationLine(startId: string, nodes: Map<string, GameNode>): GameNode[] {
    const line: GameNode[] = []
    let cur = nodes.get(startId)
    let limit = 6 // cap variation preview length
    while (cur && limit-- > 0) {
        line.push(cur)
        cur = cur.children[0] ? nodes.get(cur.children[0]) : undefined
    }
    return line
}
