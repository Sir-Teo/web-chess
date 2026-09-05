import './WdlBar.css'
import type { EvalSnapshot } from '../engine/analysis'
import { evalBarSplit } from '../engine/evalBar'

/** Shown until the engine has an opinion: an even split, as 333/334/333 was. */
const EVEN_SPLIT = { white: 33.3, draw: 33.4, black: 33.3 }


type Props = {
    fen: string
    evaluation?: EvalSnapshot
    orientation: 'white' | 'black'
}

export function WdlBar({ fen, evaluation, orientation }: Props) {
    const split = evalBarSplit(fen, evaluation)
    const { white: whitePct, draw: drawPct, black: blackPct } = split ?? EVEN_SPLIT
    const label = split && split.draw === 0
        ? `Win chances: White ${whitePct.toFixed(1)}%, Black ${blackPct.toFixed(1)}%`
        : `Win chances: White ${whitePct.toFixed(1)}%, Draw ${drawPct.toFixed(1)}%, Black ${blackPct.toFixed(1)}%`

    // We want White on bottom normally, Black on top.
    // When flipped (orientation === 'black'), we invert this structure.
    const isFlipped = orientation === 'black'
    const topPct = isFlipped ? whitePct : blackPct
    const bottomPct = isFlipped ? blackPct : whitePct

    return (
        <div className="wdl-bar" role="img" aria-label={label} title={label}>
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
