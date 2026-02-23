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
            <div className="dialog-content" onClick={e => e.stopPropagation()}>
                <header className="dialog-header">
                    <h2>PGN Import & Export</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </header>

                <div className="dialog-body">
                    <div className="dialog-section mode-selector" style={{ marginBottom: '16px' }}>
                        <button
                            type="button"
                            className={`mode-card ${tab === 'import' ? 'active' : ''}`}
                            onClick={() => setTab('import')}
                            style={{ padding: '8px', minHeight: 'auto', textAlign: 'center' }}
                        >
                            <h3>Import PGN</h3>
                        </button>
                        <button
                            type="button"
                            className={`mode-card ${tab === 'export' ? 'active' : ''}`}
                            onClick={() => setTab('export')}
                            style={{ padding: '8px', minHeight: 'auto', textAlign: 'center' }}
                        >
                            <h3>Export PGN</h3>
                        </button>
                    </div>

                    {tab === 'import' && (
                        <div className="dialog-section">
                            <label className="dialog-label">Paste Portable Game Notation</label>
                            <textarea
                                className="input-textarea"
                                placeholder="[Event &quot;FIDE World Cup 2023&quot;]..."
                                value={importText}
                                onChange={e => setImportText(e.target.value)}
                                style={{
                                    width: '100%',
                                    height: '180px',
                                    resize: 'vertical',
                                    background: 'var(--bg-input)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    padding: '8px',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem'
                                }}
                            />
                            <div className="dialog-actions" style={{ marginTop: '16px' }}>
                                <button type="button" onClick={onClose}>Cancel</button>
                                <button type="button" className="btn-primary" onClick={handleImport} disabled={!importText.trim()}>
                                    Import Game
                                </button>
                            </div>
                        </div>
                    )}

                    {tab === 'export' && (
                        <div className="dialog-section">
                            <label className="dialog-label">Annotated Output</label>
                            <textarea
                                readOnly
                                value={exportText}
                                style={{
                                    width: '100%',
                                    height: '180px',
                                    resize: 'vertical',
                                    background: 'var(--bg-input)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    padding: '8px',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem'
                                }}
                            />
                            <div className="dialog-actions" style={{ marginTop: '16px' }}>
                                <button type="button" onClick={onClose}>Close</button>
                                <button type="button" className="btn-primary" onClick={() => navigator.clipboard.writeText(exportText)}>
                                    Copy to Clipboard
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
