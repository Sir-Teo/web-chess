import React, { memo, useEffect, useId, useRef, useState } from 'react'
import type { GameTreeHandle, GameNode } from '../hooks/useGameTree'
import { IconPawn, IconBranch } from './icons'
import { buildVariationPreview } from './variationPreview'
import { isOnMainLine } from '../engine/moveTree'
import { moveNumberPrefix } from '../engine/moveLabels'

type Props = {
    tree: GameTreeHandle
    onNavigate: (chess: ReturnType<GameTreeHandle['navigateTo']>) => void
    allowCommentEditing?: boolean
}

/**
 * How many levels deep a variation is drawn before the walk stops and says
 * so. Annotated games nest two or three deep; past this the brackets are
 * wider than the panel, and the reader is better served by stepping into the
 * line, where it becomes the one being drawn from.
 */
const MAX_VARIATION_DEPTH = 6

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
 * Variation nodes are shown as indented continuation rows, and a variation
 * inside a variation is drawn in brackets within its row, the way a PGN
 * writes it.
 */
export const MoveListTree = memo(function MoveListTree({ tree, onNavigate, allowCommentEditing = true }: Props) {
    const { current, mainLine, currentPath, nodesSnapshot, navigateTo, promoteToMainLine, deleteVariation } = tree
    // Two-step, because there is no undo anywhere in this app and a discarded
    // line is a discarded analysis. Reset whenever the reader moves, so the
    // armed state never outlives the move it was armed for.
    const [deleteArmed, setDeleteArmed] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const commentId = useId()

    const line = mainLine()
    // Every node between the root and the reader, so a variation can tell
    // whether the line the reader is standing in hangs off one of its moves.
    const currentPathIds = new Set(currentPath().map(node => node.id))
    const currentComment = current.comment?.trim() ?? ''
    // A variation is a footnote until it is promoted: mainLine() is what the
    // review pass, the accuracy summary, the graphs and PGN export all read.
    const currentIsVariation = Boolean(current.move) && !isOnMainLine(nodesSnapshot, current.id)

    // Keyboard navigation on the container is already handled globally in App.tsx

    // Auto-scroll current node into view
    useEffect(() => {
        setDeleteArmed(false)
    }, [current.id])

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

    /**
     * A variation as one flowing line: its moves in order and, after any move
     * that has alternatives of its own, those alternatives in brackets. The
     * list used to walk only the first-child chain, so a variation inside a
     * variation -- every annotated game has them -- was in the tree, in the
     * exported PGN, and nowhere on screen.
     *
     * Numbered the way a PGN is: the first move of a line always, every White
     * move, and a Black move that follows a bracket, because without the
     * number "(2... Nc6 3. Bc4) Nf6" does not say whose move Nf6 is.
     */
    const renderVariation = (startId: string, depth: number): React.ReactNode[] => {
        const { nodes: chainNodes, hidden } = buildVariationPreview(startId, nodesSnapshot, currentPathIds)
        const items: React.ReactNode[] = []
        let needsNumber = true

        chainNodes.forEach((node, index) => {
            const prefix = moveNumberPrefix(node.fen)
            const isWhiteMove = prefix !== null && !prefix.endsWith('...')
            items.push(
                <MoveChip
                    key={node.id}
                    node={node}
                    isCurrent={node.id === current.id}
                    onClick={() => onNavigate(navigateTo(node.id))}
                    compact
                    prefix={needsNumber || isWhiteMove ? prefix : null}
                />,
            )
            needsNumber = false

            // Alternatives to this move hang off the move before it, and are
            // drawn after it -- the order the PGN writes them in. The first
            // move of the line has none here: its own alternatives are the
            // other lines at the same fork, drawn beside this one.
            if (index === 0) return
            const fork = chainNodes[index - 1]!
            for (const alternativeId of fork.children.slice(1)) {
                if (depth >= MAX_VARIATION_DEPTH) {
                    items.push(
                        <span
                            key={`${alternativeId}-deep`}
                            className="mtree-var-more"
                            title="A deeper variation. Step into this line to read it."
                            aria-label="A deeper variation. Step into this line to read it."
                        >
                            (…)
                        </span>,
                    )
                    continue
                }
                items.push(<span key={`${alternativeId}-open`} className="mtree-var-paren" aria-hidden="true">(</span>)
                items.push(...renderVariation(alternativeId, depth + 1))
                items.push(<span key={`${alternativeId}-close`} className="mtree-var-paren" aria-hidden="true">)</span>)
                needsNumber = true
            }
        })

        if (hidden > 0) {
            items.push(
                <span
                    key={`${startId}-more`}
                    className="mtree-var-more"
                    title={`${hidden} more move${hidden === 1 ? '' : 's'} in this variation`}
                    aria-label={`${hidden} more move${hidden === 1 ? '' : 's'} in this variation`}
                >
                    +{hidden}
                </span>,
            )
        }

        return items
    }

    // Build rows: pairs of (white move, black move) from the main line.
    // Beneath each pair, show any variation branches.
    const rows: React.ReactElement[] = []
    const pushVariationRows = (parent: GameNode) => {
        if (parent.children.length <= 1) return

        for (const varId of parent.children.slice(1)) {
            rows.push(
                <div key={`var-${parent.id}-${varId}`} className="mtree-variation">
                    <span className="mtree-var-marker"><IconBranch /></span>
                    {renderVariation(varId, 1)}
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
                    <button
                        type="button"
                        className={`mtree-delete-btn ${deleteArmed ? 'armed' : ''}`}
                        onClick={() => {
                            if (!deleteArmed) {
                                setDeleteArmed(true)
                                return
                            }
                            setDeleteArmed(false)
                            const chess = deleteVariation(current.id)
                            if (chess) onNavigate(chess)
                        }}
                        onBlur={() => setDeleteArmed(false)}
                        title={deleteArmed
                            ? 'Discard this whole line. There is no undo.'
                            : 'Discard this line and everything after it'}
                        aria-label={deleteArmed
                            ? `Confirm discarding the line through ${current.san}. There is no undo.`
                            : `Discard the line through ${current.san}`}
                    >
                        {deleteArmed ? 'Discard? Click again' : 'Discard line'}
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
    /** "12." or "12...", printed ahead of the move where the line needs it. */
    prefix?: string | null
}

function MoveChip({ node, isCurrent, onClick, compact, prefix }: ChipProps) {
    const q = node.quality
    const displaySan = `${node.san}${node.suffix ?? ''}`
    const nagText = node.nags?.length ? node.nags.map(nag => `$${nag}`).join(' ') : ''
    // Always numbered for a screen reader, whatever the row shows: the button
    // is read on its own, and "e6" with nothing to place it is not a move.
    const numbered = `${moveNumberPrefix(node.fen) ?? ''} ${displaySan}`.trim()
    const labelParts = [
        `Go to ${compact ? 'variation move' : 'move'} ${numbered}`,
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
            {prefix && <span className="mtree-chip-num" aria-hidden="true">{prefix}</span>}
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
