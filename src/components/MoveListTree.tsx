import React, { memo, useEffect, useId, useRef } from 'react'
import type { GameTreeHandle, GameNode } from '../hooks/useGameTree'
import { IconPawn, IconBranch } from './icons'
import { buildVariationPreview } from './variationPreview'
import { isOnMainLine } from '../engine/moveTree'

type Props = {
    tree: GameTreeHandle
    onNavigate: (chess: ReturnType<GameTreeHandle['navigateTo']>) => void
    allowCommentEditing?: boolean
}

function scrollWithinMoveList(container: HTMLElement, element: HTMLElement) {
    const outerScrollPositions: Array<{ element: Element; left: number; top: number }> = []
    let parent = container.parentElement

    while (parent) {
        if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
            outerScrollPositions.push({
                element: parent,
                left: parent.scrollLeft,
                top: parent.scrollTop,
            })
        }
        parent = parent.parentElement
    }

    if (document.scrollingElement) {
        outerScrollPositions.push({
            element: document.scrollingElement,
            left: document.scrollingElement.scrollLeft,
            top: document.scrollingElement.scrollTop,
        })
    }

    element.scrollIntoView({ block: 'nearest', behavior: 'auto' })

    for (const { element: scrollElement, left, top } of outerScrollPositions) {
        scrollElement.scrollLeft = left
        scrollElement.scrollTop = top
    }
}

/**
 * Renders the game tree as a flat, numbered move list with inline variations.
 * Main line: "1. e4  e5   2. Nf3  Nc6 …"
 * Variation nodes are shown as indented continuation rows.
 */
export const MoveListTree = memo(function MoveListTree({ tree, onNavigate, allowCommentEditing = true }: Props) {
    const { current, mainLine, nodesSnapshot, navigateTo, promoteToMainLine } = tree
    const scrollRef = useRef<HTMLDivElement>(null)
    const commentId = useId()

    const line = mainLine()
    const currentComment = current.comment?.trim() ?? ''
    // A variation is a footnote until it is promoted: mainLine() is what the
    // review pass, the accuracy summary, the graphs and PGN export all read.
    const currentIsVariation = Boolean(current.move) && !isOnMainLine(nodesSnapshot, current.id)

    // Keyboard navigation on the container is already handled globally in App.tsx

    // Auto-scroll current node into view
    useEffect(() => {
        const container = scrollRef.current
        const el = container?.querySelector(`[data-node-id="${current.id}"]`) as HTMLElement | null
        if (!container || !el) return
        scrollWithinMoveList(container, el)
    }, [current.id])

    if (line.length <= 1) {
        return (
            <div className="empty-state">
                <span className="empty-state-icon"><IconPawn /></span>
                <p>Moves will appear here as you play or explore.</p>
            </div>
        )
    }

    // Build rows: pairs of (white move, black move) from the main line.
    // Beneath each pair, show any variation branches.
    const rows: React.ReactElement[] = []
    const pushVariationRows = (parent: GameNode) => {
        if (parent.children.length <= 1) return

        for (const varId of parent.children.slice(1)) {
            const { nodes: varLine, hidden } = buildVariationPreview(varId, nodesSnapshot, current.id)
            rows.push(
                <div key={`var-${parent.id}-${varId}`} className="mtree-variation">
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
                    {hidden > 0 && (
                        <span
                            className="mtree-var-more"
                            title={`${hidden} more move${hidden === 1 ? '' : 's'} in this variation`}
                            aria-label={`${hidden} more move${hidden === 1 ? '' : 's'} in this variation`}
                        >
                            +{hidden}
                        </span>
                    )}
                </div>,
            )
        }
    }

    const rootState = moveStateFromFen(line[0]?.fen)
    const rootNode = line[0]
    let renderedRootVariations = false
    let moveNum = rootState.moveNumber
    let sideToMove = rootState.sideToMove

    // line[0] is root (no move) - skip
    let i = 1
    while (i < line.length) {
        let whiteNode: GameNode | null = null
        let blackNode: GameNode | null = null
        const rowStartsWithBlack = sideToMove === 'b'

        if (sideToMove === 'w') {
            whiteNode = line[i] ?? null
            if (whiteNode) i += 1

            blackNode = line[i] ?? null
            if (blackNode) i += 1
        } else {
            blackNode = line[i] ?? null
            if (blackNode) i += 1
        }

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
                <span className="mtree-num">{rowStartsWithBlack ? `${moveNum}...` : moveNum}</span>
                {whiteEl}
                {blackEl}
            </div>
        )

        if (!renderedRootVariations && rootNode) {
            renderedRootVariations = true
            pushVariationRows(rootNode)
        }

        // Render any variation branches hanging off whiteNode or blackNode
        const varTargets = [whiteNode, blackNode].filter(Boolean) as GameNode[]
        for (const parent of varTargets) {
            pushVariationRows(parent)
        }

        if (blackNode) {
            moveNum += 1
            sideToMove = 'w'
        } else {
            sideToMove = 'b'
        }
    }

    return (
        <>
            <div className="mtree-scroll" ref={scrollRef} tabIndex={-1}>
                {rows}
            </div>
            {currentIsVariation && (
                <div className="mtree-branch-actions">
                    <button
                        type="button"
                        className="mtree-promote-btn"
                        onClick={() => promoteToMainLine(current.id)}
                        title="Make this line the main line, so the review and the exported PGN follow it"
                        aria-label={`Promote the line through ${current.san} to the main line`}
                    >
                        <IconBranch /> Promote to main line
                    </button>
                </div>
            )}
            {current.move && (allowCommentEditing || currentComment) && (
                <aside className="mtree-current-comment" aria-label="Current move comment">
                    {allowCommentEditing ? (
                        <>
                            <label htmlFor={commentId}>Move note</label>
                            <textarea
                                id={commentId}
                                className="mtree-comment-input"
                                value={current.comment ?? ''}
                                onChange={event => tree.setNodeComment(current.id, event.target.value)}
                                rows={3}
                                placeholder="Add a note"
                            />
                        </>
                    ) : (
                        <>
                            <span className="mtree-current-comment-label">Move note</span>
                            <p>{currentComment}</p>
                        </>
                    )}
                </aside>
            )}
        </>
    )
})

// ─────────────────────────────────────────────────────────────────────────────

function moveStateFromFen(fen?: string): { sideToMove: 'w' | 'b'; moveNumber: number } {
    const parts = fen?.split(/\s+/) ?? []
    const sideToMove = parts[1] === 'b' ? 'b' : 'w'
    const moveNumber = Number(parts[5])

    return {
        sideToMove,
        moveNumber: Number.isInteger(moveNumber) && moveNumber > 0 ? moveNumber : 1,
    }
}

type ChipProps = {
    node: GameNode
    isCurrent: boolean
    onClick: () => void
    compact?: boolean
}

function MoveChip({ node, isCurrent, onClick, compact }: ChipProps) {
    const q = node.quality
    const displaySan = `${node.san}${node.suffix ?? ''}`
    const nagText = node.nags?.length ? node.nags.map(nag => `$${nag}`).join(' ') : ''
    const labelParts = [
        `Go to ${compact ? 'variation move' : 'move'} ${displaySan}`,
        nagText,
        isCurrent ? 'current position' : '',
        q ? `review ${q}` : '',
        node.comment ? 'has comment' : '',
    ].filter(Boolean)
    const title = [
        displaySan,
        nagText,
        q,
        node.comment,
    ].filter(Boolean).join(' - ')

    return (
        <button
            data-node-id={node.id}
            type="button"
            aria-label={labelParts.join(', ')}
            aria-current={isCurrent ? 'step' : undefined}
            className={[
                'mtree-chip',
                isCurrent ? 'mtree-chip-active' : '',
                q ? `quality-${q}` : '',
                compact ? 'mtree-chip-compact' : '',
            ].filter(Boolean).join(' ')}
            onClick={onClick}
            title={title}
        >
            {displaySan}
            {((q && q !== 'pending') || node.comment) && (
                <span className="mtree-chip-markers" aria-hidden="true">
                    {q && q !== 'pending' && <span className="mtree-quality-dot" />}
                    {node.comment && <span className="mtree-comment-dot" />}
                </span>
            )}
        </button>
    )
}
