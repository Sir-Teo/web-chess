import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { SETUP_PIECE_OPTIONS, type SetupPiece } from '../engine/positionSetup'
import { isCompositionKey } from './shortcutKeys'

const TOOLS = [...SETUP_PIECE_OPTIONS, { piece: null, label: 'empty square eraser', glyph: '×' }]

export function PositionSetupPalette({ selectedPiece, onSelect }: {
    selectedPiece: SetupPiece | null
    onSelect: (piece: SetupPiece | null) => void
}) {
    const [focusedIndex, setFocusedIndex] = useState(() => TOOLS.findIndex(tool => tool.piece === selectedPiece))
    const buttons = useRef<Array<HTMLButtonElement | null>>([])
    const helpId = useId()
    const navigate = (event: KeyboardEvent, index: number) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isCompositionKey(event.nativeEvent)) return
        let next: number
        switch (event.key) {
            case 'ArrowLeft': next = (index + TOOLS.length - 1) % TOOLS.length; break
            case 'ArrowRight': next = (index + 1) % TOOLS.length; break
            case 'Home': next = 0; break
            case 'End': next = TOOLS.length - 1; break
            default: return
        }
        event.preventDefault()
        buttons.current[next]?.focus()
    }

    return <div className="fen-setup-palette" role="toolbar" aria-label="Piece palette" aria-describedby={helpId}>
        {TOOLS.map((tool, index) => <button
            key={tool.piece ?? 'eraser'}
            ref={button => { buttons.current[index] = button }}
            type="button"
            className={`fen-piece-btn${tool.piece === null ? ' eraser' : ''}${selectedPiece === tool.piece ? ' active' : ''}`}
            aria-pressed={selectedPiece === tool.piece}
            aria-label={`Select ${tool.label}`}
            title={tool.piece ? tool.label : 'Clear square'}
            tabIndex={focusedIndex === index ? 0 : -1}
            onFocus={() => setFocusedIndex(index)}
            onKeyDown={event => navigate(event, index)}
            onClick={() => { setFocusedIndex(index); onSelect(tool.piece) }}
        >{tool.glyph}</button>)}
        <span id={helpId} className="visually-hidden">Use Left and Right to move between tools, Home and End for the first and last tool. Enter or Space selects it. Tab moves to the board.</span>
    </div>
}
