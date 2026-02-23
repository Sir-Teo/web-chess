import './HorizontalWdlBar.css'

type Props = {
    wdl: { w: number; d: number; l: number }
    orientation?: 'white' | 'black'
}

export function HorizontalWdlBar({ wdl, orientation = 'white' }: Props) {
    const total = wdl.w + wdl.d + wdl.l
    // fallback if sum is zero
    if (total === 0) return null

    const whitePct = (wdl.w / total) * 100
    const drawPct = (wdl.d / total) * 100
    const blackPct = (wdl.l / total) * 100

    const isFlipped = orientation === 'black'
    const leftPct = isFlipped ? blackPct : whitePct
    const rightPct = isFlipped ? whitePct : blackPct

    // Title text for tooltip
    const text = isFlipped
        ? `Black: ${blackPct.toFixed(1)}% | Draw: ${drawPct.toFixed(1)}% | White: ${whitePct.toFixed(1)}%`
        : `White: ${whitePct.toFixed(1)}% | Draw: ${drawPct.toFixed(1)}% | Black: ${blackPct.toFixed(1)}%`

    return (
        <div className="horizontal-wdl-bar" title={text}>
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
