import './WdlBar.css'
import type { EvalSnapshot } from '../engine/analysis'

type Props = {
    fen: string
    evaluation?: EvalSnapshot
    orientation: 'white' | 'black'
}

export function WdlBar({ fen, evaluation, orientation }: Props) {
    const turn = fen.split(' ')[1] as 'w' | 'b'

    // Stockfish WDL values are typically per 1000.
    // Defaults represent a relatively equal starting evaluation
    let w = 333, d = 334, l = 333

    if (evaluation?.wdl) {
        w = evaluation.wdl.w
        d = evaluation.wdl.d
        l = evaluation.wdl.l
    }

    // Stockfish's reported WDL is always from the side-to-move's perspective
    const whiteWin = turn === 'w' ? w : l
    const draw = d
    const blackWin = turn === 'w' ? l : w

    // Convert to percentages (out of 100, assuming sum is 1000)
    const total = w + d + l
    const whitePct = (whiteWin / total) * 100
    const drawPct = (draw / total) * 100
    const blackPct = (blackWin / total) * 100

    // We want White on bottom normally, Black on top.
    // When flipped (orientation === 'black'), we invert this structure.
    const isFlipped = orientation === 'black'
    const topPct = isFlipped ? whitePct : blackPct
    const bottomPct = isFlipped ? blackPct : whitePct

    return (
        <div className="wdl-bar">
            <div
                className={`wdl-segment wdl-top ${isFlipped ? 'wdl-white' : 'wdl-black'}`}
                style={{ height: `${topPct}%` }}
            />
            <div
                className="wdl-segment wdl-draw"
                style={{ height: `${drawPct}%` }}
            />
            <div
                className={`wdl-segment wdl-bottom ${isFlipped ? 'wdl-black' : 'wdl-white'}`}
                style={{ height: `${bottomPct}%` }}
            />
        </div>
    )
}
