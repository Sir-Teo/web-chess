import './WdlBar.css'
import type { EvalSnapshot } from '../engine/analysis'
import { evalBarSplit, evalBarWhiteShare } from '../engine/evalBar'

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
    // Where the bar's boundary goes, which is not the same as White's share of
    // the split once there is a draw band. See `evalBarWhiteShare`.
    const whiteShare = evalBarWhiteShare(fen, evaluation) ?? 50
    const label = split && split.draw === 0
        ? `Win chances: White ${whitePct.toFixed(1)}%, Black ${blackPct.toFixed(1)}%`
        : `Win chances: White ${whitePct.toFixed(1)}%, Draw ${drawPct.toFixed(1)}%, Black ${blackPct.toFixed(1)}%`

    // We want White on bottom normally, Black on top.
    // When flipped (orientation === 'black'), we invert this structure.
    const isFlipped = orientation === 'black'
    const topPct = isFlipped ? whiteShare : 100 - whiteShare
    const bottomPct = 100 - topPct

    return (
        <div className={`wdl-bar${isFlipped ? ' is-flipped' : ''}`} role="img" aria-label={label} title={label}>
            <div
                className={`wdl-segment wdl-top ${isFlipped ? 'wdl-white' : 'wdl-black'}`}
                style={{ height: `${topPct}%` }}
            />
            <div
                className={`wdl-segment wdl-bottom ${isFlipped ? 'wdl-black' : 'wdl-white'}`}
                style={{ height: `${bottomPct}%` }}
            />
            {drawPct > 0 && (
                // Measured from White's end of the bar, so it straddles the
                // boundary above: White's share, then the draws.
                <div
                    className="wdl-draw"
                    style={{ [isFlipped ? 'top' : 'bottom']: `${whitePct}%`, height: `${drawPct}%` }}
                />
            )}
        </div>
    )
}
