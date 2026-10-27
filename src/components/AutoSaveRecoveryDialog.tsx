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
    positionStudy?: boolean
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
    onDownloadPgn?: () => void
    copyLabel?: string
    copying?: boolean
    copyError?: string
    /**
     * The saved game's PGN `Result`, when it has one. A game that ended is not
     * "in progress", and asking someone to pick up where they left off after a
     * checkmate offers something that cannot happen. Absent for a game that is
     * genuinely unfinished -- `*` never reaches here, because the library's
     * metadata already treats it as no result at all.
     */
    result?: string
}

/** How to describe a saved game that already has a result. */
function describeSavedOutcome(result: string | undefined): string | null {
    if (result === '1-0') return 'White won'
    if (result === '0-1') return 'Black won'
    if (result === '1/2-1/2') return 'Drawn'
    return null
}

export function AutoSaveRecoveryDialog({ savedAt, plyCount, positionStudy = false, onRestore, onDismiss, error, onCopyPgn, onDownloadPgn, copyLabel, copying, copyError, result }: Props) {
    const moveCount = Math.ceil(Math.max(0, plyCount) / 2)
    const outcome = describeSavedOutcome(result)
    const panelRef = useRef<HTMLDivElement>(null)
    // Dismissing clears the only recovery slot. An incidental Escape or tap
    // outside the panel must not make the same choice as Start fresh/Discard.
    useModalFocus(true, panelRef, onDismiss, { initialFocus: '[data-restore]', closeOnEscape: false })

    return (
        <div className="dialog-backdrop">
            <div
                ref={panelRef}
                className="dialog-panel auto-save-recovery"
                role="dialog"
                aria-modal="true"
                aria-labelledby="auto-save-title"
                aria-describedby="auto-save-body"
                onClick={event => event.stopPropagation()}
            >
                <header className="dialog-header">
                    <span className="dialog-icon"><IconRefresh /></span>
                    <h2 id="auto-save-title">{positionStudy ? 'Position study' : outcome ? 'Finished game' : 'Unfinished game'}</h2>
                </header>

                {/* Inside a section like every other dialog's copy: the body
                    carries no padding of its own, and a bare paragraph in it
                    sat flush against the panel's edge -- against the screen's,
                    on a phone, where the panel is the screen. */}
                <div className="dialog-body">
                    <div className="dialog-section">
                        <p id="auto-save-body">
                            {error
                                ? `That saved ${positionStudy ? 'position study' : 'game'} could not be read back: ${error}`
                                : positionStudy
                                    ? `A position study was open ${describeElapsed(savedAt)}. Pick up where you left off?`
                                : outcome
                                    ? `${outcome} in ${moveCount} ${moveCount === 1 ? 'move' : 'moves'}, ${describeElapsed(savedAt)}. Open it again?`
                                    : moveCount === 0
                                      ? `The starting position was ready ${describeElapsed(savedAt)}. Pick up where you left off?`
                                    : `${moveCount} ${moveCount === 1 ? 'move was' : 'moves were'} in progress ${describeElapsed(savedAt)}. Pick up where you left off?`}
                        </p>
                        {error && (
                            <p className="dialog-note">
                                Copy or download the PGN first. Discarding cannot be undone.
                            </p>
                        )}
                        {copyError && <p className="dialog-error" role="alert">{copyError}</p>}
                    </div>
                </div>

                <div className="dialog-actions">
                    {error
                        ? (
                            <>
                                <button type="button" className="btn-cancel" onClick={onDismiss}>Discard it</button>
                                {onDownloadPgn && <button type="button" className="btn-cancel" onClick={onDownloadPgn}>Download PGN</button>}
                                <button type="button" className="btn-start" data-restore aria-busy={copying || undefined} onClick={onCopyPgn}>
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
