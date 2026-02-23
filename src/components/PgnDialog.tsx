import { useState } from 'react'
import type { GameNode } from '../hooks/useGameTree'
import type { EvalSnapshot } from '../engine/analysis'
import { exportAnnotatedPgn } from '../engine/pgn'

// Using existing styles from NewGameDialog to maintain design consistency
import './NewGameDialog.css'

type PgnDialogProps = {
    open: boolean
    onClose: () => void
    onImport: (pgn: string) => void
    mainLineNodes: GameNode[]
    evaluations: Map<string, EvalSnapshot>
}

export function PgnDialog({ open, onClose, onImport, mainLineNodes, evaluations }: PgnDialogProps) {
    const [tab, setTab] = useState<'import' | 'export'>('import')
    const [importText, setImportText] = useState('')

    if (!open) return null

    const handleImport = () => {
        onImport(importText)
        onClose()
    }

    const exportText = tab === 'export' ? exportAnnotatedPgn(mainLineNodes, evaluations) : ''

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className="dialog-content pgn-dialog" onClick={e => e.stopPropagation()}>
                <header className="dialog-header">
                    <span className="dialog-icon">📥</span>
                    <h2>PGN Import & Export</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </header>

                <div className="dialog-body">
                    <div className="dialog-section mode-selector" style={{ paddingBottom: '0.4rem' }}>
                        <div className="mode-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <button
                                type="button"
                                className={`mode-card ${tab === 'import' ? 'selected' : ''}`}
                                onClick={() => setTab('import')}
                            >
                                <span className="mode-icon">📋</span>
                                <strong>Import</strong>
                            </button>
                            <button
                                type="button"
                                className={`mode-card ${tab === 'export' ? 'selected' : ''}`}
                                onClick={() => setTab('export')}
                            >
                                <span className="mode-icon">📤</span>
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
                                onChange={e => setImportText(e.target.value)}
                            />
                            <div className="dialog-actions">
                                <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                                <button type="button" className="btn-start" onClick={handleImport} disabled={!importText.trim()}>
                                    Import Game
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
                                <button type="button" className="btn-cancel" onClick={onClose}>Close</button>
                                <button type="button" className="btn-start" onClick={() => navigator.clipboard.writeText(exportText)}>
                                    Copy PGN
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
