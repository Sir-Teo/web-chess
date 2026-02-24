import { useEffect, useId, useRef, useState } from 'react'
import type { GameNode } from '../hooks/useGameTree'
import type { EvalSnapshot } from '../engine/analysis'
import { exportAnnotatedPgn } from '../engine/pgn'
import { IconDownload, IconClipboard, IconUpload } from './icons'

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
    const panelRef = useRef<HTMLDivElement>(null)
    const titleId = useId()

    const handleImport = () => {
        onImport(importText)
        onClose()
    }

    const exportText = tab === 'export' ? exportAnnotatedPgn(mainLineNodes, evaluations) : ''

    useEffect(() => {
        if (!open) return

        const previouslyFocused = document.activeElement as HTMLElement | null
        const panelEl = panelRef.current
        if (!panelEl) return

        const focusableSelector = [
            'button:not([disabled])',
            '[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(', ')

        const getFocusable = () =>
            Array.from(panelEl.querySelectorAll<HTMLElement>(focusableSelector))
                .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)

        const focusable = getFocusable()
        focusable[0]?.focus()

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
                return
            }

            if (event.key !== 'Tab') return
            const currentFocusable = getFocusable()
            if (!currentFocusable.length) return

            const first = currentFocusable[0]
            const last = currentFocusable[currentFocusable.length - 1]
            const active = document.activeElement as HTMLElement | null

            if (event.shiftKey) {
                if (active === first || !panelEl.contains(active)) {
                    event.preventDefault()
                    last.focus()
                }
                return
            }

            if (active === last || !panelEl.contains(active)) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            previouslyFocused?.focus?.()
        }
    }, [onClose, open])

    if (!open) return null

    return (
        <div className="dialog-backdrop" onClick={onClose}>
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
                        <div className="mode-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <button
                                type="button"
                                className={`mode-card ${tab === 'import' ? 'selected' : ''}`}
                                onClick={() => setTab('import')}
                                aria-pressed={tab === 'import'}
                            >
                                <span className="mode-icon"><IconClipboard /></span>
                                <strong>Import</strong>
                            </button>
                            <button
                                type="button"
                                className={`mode-card ${tab === 'export' ? 'selected' : ''}`}
                                onClick={() => setTab('export')}
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
