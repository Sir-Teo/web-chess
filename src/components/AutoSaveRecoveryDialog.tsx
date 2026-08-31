import { useRef } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import { IconRefresh } from './icons'
import { describeElapsed } from './elapsedLabel'
import './NewGameDialog.css'

type Props = {
    savedAt: number
    /**
     * Plies, which is what the auto-save slot stores and what the library
     * reports. Chess counts in full moves, so the copy converts: a 116-ply
     * game is on move 58, and "116 moves were in progress" reads to any
     * player as a game twice as long as the one they left.
     */
    plyCount: number
    onRestore: () => void
    onDismiss: () => void
    /**
     * Why the last Restore did not work. Present only after one failed, and it
     * changes what the dialog is for: the game cannot be loaded, so the choice
     * is no longer restore-or-discard but take-it-elsewhere-or-discard.
     */
    error?: string | null
    /** Hands the unreadable PGN to the clipboard, so it is not simply lost. */
    onCopyPgn?: () => void
    copyLabel?: string
}

export function AutoSaveRecoveryDialog({ savedAt, plyCount, onRestore, onDismiss, error, onCopyPgn, copyLabel }: Props) {
    const moveCount = Math.ceil(Math.max(0, plyCount) / 2)
    const panelRef = useRef<HTMLDivElement>(null)
    useModalFocus(true, panelRef, onDismiss, { initialFocus: '[data-restore]' })

    return (
        <div className="dialog-backdrop" onClick={onDismiss}>
            <div
                ref={panelRef}
                className="dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="auto-save-title"
                aria-describedby="auto-save-body"
                onClick={event => event.stopPropagation()}
            >
                <header className="dialog-header">
                    <span className="dialog-icon"><IconRefresh /></span>
                    <h2 id="auto-save-title">Unfinished game</h2>
                </header>

                <div className="dialog-body">
                    <p id="auto-save-body">
                        {error
                            ? `That unfinished game could not be read back: ${error}`
                            : `${moveCount} ${moveCount === 1 ? 'move was' : 'moves were'} in progress ${describeElapsed(savedAt)}. Pick up where you left off?`}
                    </p>
                    {error && (
                        <p className="dialog-note">
                            Copy it first if you want to keep the moves — discarding is the only way to stop
                            being asked, and it cannot be undone.
                        </p>
                    )}
                </div>

                <div className="dialog-actions">
                    {error
                        ? (
                            <>
                                <button type="button" className="btn-cancel" onClick={onDismiss}>Discard it</button>
                                <button type="button" className="btn-start" data-restore onClick={onCopyPgn}>
                                    {copyLabel ?? 'Copy PGN'}
                                </button>
                            </>
                        )
                        : (
                            <>
                                <button type="button" className="btn-cancel" onClick={onDismiss}>Start fresh</button>
                                <button type="button" className="btn-start" data-restore onClick={onRestore}>Restore</button>
                            </>
                        )}
                </div>
            </div>
        </div>
    )
}
