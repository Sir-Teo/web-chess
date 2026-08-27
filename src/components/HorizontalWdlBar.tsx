import { normalizeWhitePovWdl } from '../engine/analysis'
import './HorizontalWdlBar.css'

type Props = {
    fen: string
    wdl: { w: number; d: number; l: number }
    orientation?: 'white' | 'black'
}

export function HorizontalWdlBar({ fen, wdl, orientation = 'white' }: Props) {
    const normalized = normalizeWhitePovWdl(fen, wdl)
    if (!normalized) return null

    const { white: whitePct, draw: drawPct, black: blackPct } = normalized

    const isFlipped = orientation === 'black'
    const leftPct = isFlipped ? blackPct : whitePct
    const rightPct = isFlipped ? whitePct : blackPct

    // Title text for tooltip
    const text = isFlipped
        ? `Black: ${blackPct.toFixed(1)}% | Draw: ${drawPct.toFixed(1)}% | White: ${whitePct.toFixed(1)}%`
        : `White: ${whitePct.toFixed(1)}% | Draw: ${drawPct.toFixed(1)}% | Black: ${blackPct.toFixed(1)}%`

    return (
        <div className="horizontal-wdl-bar" role="img" aria-label={text} title={text}>
            <div
                className={`hw-segment hw-left ${isFlipped ? 'hw-black' : 'hw-white'}`}
                style={{ width: `${leftPct}%` }}
            />
            <div
                className="hw-segment hw-draw"
                style={{ width: `${drawPct}%` }}
            />
            <div
                className={`hw-segment hw-right ${isFlipped ? 'hw-white' : 'hw-black'}`}
                style={{ width: `${rightPct}%` }}
            />
        </div>
    )
}
