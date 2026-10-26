import { useId, useRef, useState, type KeyboardEvent } from 'react'
import type { Square } from 'chess.js'
import { SETUP_BOARD_SQUARES, setupPieceGlyph, setupPieceLabel, type PositionSetup, type SetupPiece } from '../engine/positionSetup'
import { isCompositionKey } from './shortcutKeys'

export function PositionSetupBoard({ pieces, selectedPiece, flipped = false, onPlace }: {
    pieces: PositionSetup['pieces']
    selectedPiece: SetupPiece | null
    flipped?: boolean
    onPlace: (square: Square) => void
}) {
    const [focusedSquare, setFocusedSquare] = useState<Square>('a8')
    const buttons = useRef<Array<HTMLButtonElement | null>>([])
    const helpId = useId()
    const squares = flipped ? [...SETUP_BOARD_SQUARES].reverse() : SETUP_BOARD_SQUARES
    const ranks = flipped ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['8', '7', '6', '5', '4', '3', '2', '1']
    const files = flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

    const navigate = (event: KeyboardEvent, index: number) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isCompositionKey(event.nativeEvent)) return
        const file = index % 8
        let next: number
        switch (event.key) {
            case 'ArrowLeft': next = file > 0 ? index - 1 : index; break
            case 'ArrowRight': next = file < 7 ? index + 1 : index; break
            case 'ArrowUp': next = index >= 8 ? index - 8 : index; break
            case 'ArrowDown': next = index < 56 ? index + 8 : index; break
            case 'Home': next = index - file; break
            case 'End': next = index + 7 - file; break
            default: return
        }
        event.preventDefault()
        buttons.current[next]?.focus()
    }

    return <div className="fen-setup-board-region">
        <div className="fen-setup-board-frame">
            <div className="fen-setup-ranks" aria-hidden="true">
                {ranks.map(rank => <span key={rank}>{rank}</span>)}
            </div>
            <div className="fen-setup-board" role="group" aria-label="Editable chessboard" aria-describedby={helpId}>
                {squares.map((square, index) => {
                    const piece = pieces[square]
                    const squareLabel = piece ? setupPieceLabel(piece) : 'empty square'
                    const actionLabel = selectedPiece ? `place ${setupPieceLabel(selectedPiece)}` : 'clear square'
                    return <button
                        key={square}
                        ref={button => { buttons.current[index] = button }}
                        type="button"
                        className={`fen-setup-square ${piece && piece === piece.toLowerCase() ? 'black-piece' : ''}`}
                        aria-label={`${square}, ${squareLabel}, ${actionLabel}`}
                        tabIndex={focusedSquare === square ? 0 : -1}
                        onFocus={() => setFocusedSquare(square)}
                        onKeyDown={event => navigate(event, index)}
                        onClick={() => { setFocusedSquare(square); onPlace(square) }}
                    >
                        {piece ? setupPieceGlyph(piece) : ''}
                    </button>
                })}
            </div>
            <div className="fen-setup-files" aria-hidden="true">
                {files.map(file => <span key={file}>{file}</span>)}
            </div>
        </div>
        <p id={helpId} className="fen-setup-help">{flipped ? 'Black' : 'White'} at the bottom. Arrow keys move between squares. Home and End move along a rank. Enter or Space places the selected piece or erases.</p>
    </div>
}
