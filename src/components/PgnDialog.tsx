import { useCallback, useId, useRef, useState } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import type { GameNode } from '../hooks/useGameTree'
import type { EvalSnapshot } from '../engine/analysis'
import { exportAnnotatedPgn } from '../engine/pgn'
import { IconDownload, IconClipboard, IconUpload } from './icons'

// Using existing styles from NewGameDialog to maintain design consistency
import './NewGameDialog.css'

type PgnDialogProps = {
    open: boolean
    onClose: () => void
    onImport: (pgn: string) => ImportResult
    onLoadFen: (fen: string) => ImportResult
    mainLineNodes: GameNode[]
    evaluations: Map<string, EvalSnapshot>
}

type ImportResult = {
    ok: boolean
    error?: string
}

export function PgnDialog({ open, onClose, onImport, onLoadFen, mainLineNodes, evaluations }: PgnDialogProps) {
    const [tab, setTab] = useState<'import' | 'fen' | 'export'>('import')
    const [importText, setImportText] = useState('')
    const [fenText, setFenText] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
    const panelRef = useRef<HTMLDivElement>(null)
    const titleId = useId()

    const resetFeedback = useCallback(() => {
        setError(null)
        setCopyStatus('idle')
    }, [])

    const closeDialog = useCallback(() => {
        resetFeedback()
        onClose()
    }, [onClose, resetFeedback])

    const handleImport = () => {
        const result = onImport(importText)
        if (result.ok) {
            setImportText('')
            closeDialog()
            return
        }
        setError(result.error ?? 'Could not import that PGN.')
    }

    const handleLoadFen = () => {
        const result = onLoadFen(fenText)
        if (result.ok) {
            setFenText('')
            closeDialog()
            return
        }
        setError(result.error ?? 'Could not load that FEN.')
    }

    const exportText = tab === 'export' ? exportAnnotatedPgn(mainLineNodes, evaluations) : ''

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(exportText)
            setCopyStatus('copied')
        } catch {
            setCopyStatus('failed')
        }
    }

    useModalFocus(open, panelRef, closeDialog)

    if (!open) return null

    return (
        <div className="dialog-backdrop" onClick={closeDialog}>
            <div
                ref={panelRef}
                className="dialog-panel pgn-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={e => e.stopPropagation()}
            >
                <header className="dialog-header">
                    <span className="dialog-icon"><IconDownload /></span>
                    <h2 id={titleId}>PGN Import & Export</h2>
                </header>

                <div className="dialog-body">
                    <div className="dialog-section mode-selector" style={{ paddingBottom: '0.4rem' }}>
                        <div className="mode-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                            <button
                                type="button"
                                className={`mode-card ${tab === 'import' ? 'selected' : ''}`}
                                onClick={() => {
                                    resetFeedback()
                                    setTab('import')
                                }}
                                aria-pressed={tab === 'import'}
                            >
                                <span className="mode-icon"><IconClipboard /></span>
                                <strong>Import</strong>
                            </button>
                            <button
                                type="button"
                                className={`mode-card ${tab === 'fen' ? 'selected' : ''}`}
                                onClick={() => {
                                    resetFeedback()
                                    setTab('fen')
                                }}
                                aria-pressed={tab === 'fen'}
                            >
                                <span className="mode-icon"><IconDownload /></span>
                                <strong>FEN</strong>
                            </button>
                            <button
                                type="button"
                                className={`mode-card ${tab === 'export' ? 'selected' : ''}`}
                                onClick={() => {
                                    resetFeedback()
                                    setTab('export')
                                }}
                                aria-pressed={tab === 'export'}
                            >
                                <span className="mode-icon"><IconUpload /></span>
                                <strong>Export</strong>
                            </button>
                        </div>
                    </div>

                    {tab === 'import' && (
                        <div className="dialog-section">
                            <label className="dialog-label">Paste Portable Game Notation</label>
                            <textarea
                                className="input-textarea"
                                placeholder="[Event &quot;FIDE World Cup 2023&quot;]..."
                                value={importText}
                                onChange={e => {
                                    setImportText(e.target.value)
                                    setError(null)
                                }}
                                aria-invalid={Boolean(error)}
                            />
                            {error && <p className="dialog-error" role="alert">{error}</p>}
                            <div className="dialog-actions">
                                <button type="button" className="btn-cancel" onClick={closeDialog}>Cancel</button>
                                <button type="button" className="btn-start" onClick={handleImport} disabled={!importText.trim()}>
                                    Import Game
                                </button>
                            </div>
                        </div>
                    )}

                    {tab === 'fen' && (
                        <div className="dialog-section">
                            <label className="dialog-label">Paste Forsyth-Edwards Notation</label>
                            <textarea
                                className="input-textarea"
                                placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                                value={fenText}
                                onChange={e => {
                                    setFenText(e.target.value)
                                    setError(null)
                                }}
                                aria-invalid={Boolean(error)}
                            />
                            {error && <p className="dialog-error" role="alert">{error}</p>}
                            <div className="dialog-actions">
                                <button type="button" className="btn-cancel" onClick={closeDialog}>Cancel</button>
                                <button type="button" className="btn-start" onClick={handleLoadFen} disabled={!fenText.trim()}>
                                    Load Position
                                </button>
                            </div>
                        </div>
                    )}

                    {tab === 'export' && (
                        <div className="dialog-section">
                            <label className="dialog-label">Annotated Output</label>
                            <textarea
                                className="input-textarea"
                                readOnly
                                value={exportText}
                            />
                            <div className="dialog-actions">
                                <button type="button" className="btn-cancel" onClick={closeDialog}>Close</button>
                                <button type="button" className="btn-start" onClick={handleCopy}>
                                    {copyStatus === 'copied' ? 'Copied' : 'Copy PGN'}
                                </button>
                            </div>
                            {copyStatus === 'failed' && (
                                <p className="dialog-error" role="alert">Clipboard access failed. Select the text and copy it manually.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
