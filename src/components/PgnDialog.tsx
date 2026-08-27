import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { GameNode } from '../hooks/useGameTree'
import type { EvalSnapshot } from '../engine/analysis'
import { validateFenForAnalysis } from '../engine/fen'
import { exportAnnotatedPgn, pgnImportContentError, type PgnExportOptions } from '../engine/pgn'
import {
    createEmptyPositionSetup,
    createStartingPositionSetup,
    canUseSetupCastlingRight,
    hasSetupCastlingRight,
    parsePositionSetupFen,
    positionSetupToFen,
    SETUP_BOARD_SQUARES,
    SETUP_PIECE_OPTIONS,
    setupPieceGlyph,
    setupPieceLabel,
    updateSetupCastlingRight,
    updateSetupFullmove,
    updateSetupHalfmove,
    updateSetupSquare,
    updateSetupTurn,
    type PositionSetup,
    type SetupCastlingRight,
    type SetupPiece,
    type SetupTurn,
} from '../engine/positionSetup'
import { buildFenShareUrl } from '../engine/shareLink'
import { IconDownload, IconClipboard, IconUpload } from './icons'
import { fenTextForShareLink } from './pgnDialogHelpers'
import { MAX_PGN_IMPORT_BYTES, PGN_IMPORT_LIMIT_MESSAGE, pgnImportLengthError } from './pgnImportLimits'

// Using existing styles from NewGameDialog to maintain design consistency
import './NewGameDialog.css'

type PgnDialogProps = {
    open: boolean
    onClose: () => void
    onImport: (pgn: string) => ImportResult
    onLoadFen: (fen: string) => ImportResult
    currentFen: string
    mainLineNodes: GameNode[]
    gameNodes: Map<string, GameNode>
    evaluations: Map<string, EvalSnapshot>
    pgnHeaders: Record<string, string>
}

type ImportResult = {
    ok: boolean
    error?: string
}

type CopyStatus = 'idle' | 'fen-copied' | 'link-copied' | 'pgn-copied' | 'failed'

const DEFAULT_EXPORT_OPTIONS: Required<PgnExportOptions> = {
    includeVariations: true,
    includeComments: true,
    includeEngineAnnotations: true,
    includeGlyphs: true,
}

const SETUP_CASTLING_OPTIONS: Array<{ right: SetupCastlingRight; label: string; short: string }> = [
    { right: 'K', label: 'White kingside', short: 'K' },
    { right: 'Q', label: 'White queenside', short: 'Q' },
    { right: 'k', label: 'Black kingside', short: 'k' },
    { right: 'q', label: 'Black queenside', short: 'q' },
]

function isDialogFocusableElement(element: HTMLElement): boolean {
    if (element.hasAttribute('disabled') || element.tabIndex === -1) return false

    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false

    return element.getClientRects().length > 0
}

export function PgnDialog({ open, onClose, onImport, onLoadFen, currentFen, mainLineNodes, gameNodes, evaluations, pgnHeaders }: PgnDialogProps) {
    const [tab, setTab] = useState<'import' | 'fen' | 'export'>('import')
    const [importText, setImportText] = useState('')
    const [fenText, setFenText] = useState(currentFen)
    const [error, setError] = useState<string | null>(null)
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
    const [exportOptions, setExportOptions] = useState(DEFAULT_EXPORT_OPTIONS)
    const [setup, setSetup] = useState<PositionSetup>(() => parsePositionSetupFen(currentFen) ?? createStartingPositionSetup())
    const [selectedSetupPiece, setSelectedSetupPiece] = useState<SetupPiece | null>('P')
    const [shareLinkFallback, setShareLinkFallback] = useState('')
    const panelRef = useRef<HTMLDivElement>(null)
    const importFileInputRef = useRef<HTMLInputElement>(null)
    const wasOpenRef = useRef(false)
    const [importFileName, setImportFileName] = useState<string | null>(null)
    const titleId = useId()
    const importTextId = useId()
    const fenTextId = useId()
    const exportTextId = useId()
    const halfmoveId = useId()
    const fullmoveId = useId()

    const resetFeedback = useCallback(() => {
        setError(null)
        setCopyStatus('idle')
        setShareLinkFallback('')
    }, [])

    const closeDialog = useCallback(() => {
        resetFeedback()
        onClose()
    }, [onClose, resetFeedback])

    const handleImport = () => {
        const importError = pgnImportLengthError(importText) ?? pgnImportContentError(importText)
        if (importError) {
            setError(importError)
            return
        }

        const result = onImport(importText)
        if (result.ok) {
            setImportText('')
            setImportFileName(null)
            closeDialog()
            return
        }
        setError(result.error ?? 'Could not import that PGN.')
    }

    const handlePickImportFile = () => {
        resetFeedback()
        importFileInputRef.current?.click()
    }

    const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget
        const file = input.files?.[0]
        if (!file) return

        resetFeedback()
        if (file.size > MAX_PGN_IMPORT_BYTES) {
            setImportFileName(null)
            setError(PGN_IMPORT_LIMIT_MESSAGE)
            input.value = ''
            return
        }

        try {
            const text = await file.text()
            const limitError = pgnImportLengthError(text)
            if (limitError) {
                setImportFileName(null)
                setError(limitError)
                return
            }
            setImportText(text)
            setImportFileName(file.name)
            setError(pgnImportContentError(text))
        } catch {
            setImportFileName(null)
            setError('Could not read that PGN file.')
        } finally {
            input.value = ''
        }
    }

    const setExportOption = (key: keyof PgnExportOptions, value: boolean) => {
        setExportOptions(options => ({ ...options, [key]: value }))
        setCopyStatus('idle')
    }

    const syncFenTextAndSetup = useCallback((nextFen: string) => {
        setFenText(nextFen)
        const parsed = parsePositionSetupFen(nextFen)
        if (parsed) setSetup(parsed)
    }, [])

    const applySetupChange = useCallback((updater: (current: PositionSetup) => PositionSetup) => {
        setSetup(current => {
            const next = updater(current)
            setFenText(positionSetupToFen(next))
            return next
        })
        resetFeedback()
    }, [resetFeedback])

    const loadSetupPreset = useCallback((nextSetup: PositionSetup) => {
        setSetup(nextSetup)
        setFenText(positionSetupToFen(nextSetup))
        resetFeedback()
    }, [resetFeedback])

    useEffect(() => {
        if (!open) {
            wasOpenRef.current = false
            return
        }
        if (wasOpenRef.current) return

        wasOpenRef.current = true
        syncFenTextAndSetup(currentFen)
    }, [currentFen, open, syncFenTextAndSetup])

    const exportText = useMemo(
        () => tab === 'export'
            ? exportAnnotatedPgn(
                mainLineNodes,
                evaluations,
                pgnHeaders,
                exportOptions.includeVariations ? gameNodes : undefined,
                exportOptions,
            )
            : '',
        [evaluations, exportOptions, gameNodes, mainLineNodes, pgnHeaders, tab],
    )
    const fenValidation = useMemo(
        () => fenText.trim() ? validateFenForAnalysis(fenText) : null,
        [fenText],
    )
    const fenValidationError = fenValidation && !fenValidation.ok ? fenValidation.error : null
    const fenShareValidation = useMemo(
        () => validateFenForAnalysis(fenTextForShareLink(fenText, currentFen)),
        [currentFen, fenText],
    )
    const importContentError = useMemo(
        () => importText.trim() ? pgnImportContentError(importText) : null,
        [importText],
    )
    const canLoadFen = Boolean(fenText.trim()) && !fenValidationError
    const canCopyShareLink = fenShareValidation.ok
    const canImportPgn = Boolean(importText.trim()) && !importContentError

    const handleLoadFen = () => {
        if (fenValidationError) {
            setError(fenValidationError)
            return
        }

        const result = onLoadFen(fenText)
        if (result.ok) {
            setFenText('')
            closeDialog()
            return
        }
        setError(result.error ?? 'Could not load that FEN.')
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(exportText)
            setCopyStatus('pgn-copied')
        } catch {
            setCopyStatus('failed')
        }
    }

    const handleDownload = () => {
        const blob = new Blob([exportText], { type: 'application/x-chess-pgn;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `web-chess-${new Date().toISOString().slice(0, 10)}.pgn`
        document.body.append(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }

    const handleUseCurrentFen = () => {
        resetFeedback()
        syncFenTextAndSetup(currentFen)
    }

    const handleCopyCurrentFen = async () => {
        resetFeedback()
        syncFenTextAndSetup(currentFen)
        try {
            await navigator.clipboard.writeText(currentFen)
            setCopyStatus('fen-copied')
        } catch {
            setCopyStatus('failed')
        }
    }

    const handleCopyShareLink = async () => {
        resetFeedback()
        const fenToShare = fenTextForShareLink(fenText, currentFen)
        const validation = validateFenForAnalysis(fenToShare)
        if (!validation.ok) {
            setError(validation.error)
            return
        }

        const shareUrl = buildFenShareUrl(fenToShare, window.location.href)
        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopyStatus('link-copied')
        } catch {
            setCopyStatus('failed')
            setShareLinkFallback(shareUrl)
        }
    }

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
                .filter(isDialogFocusableElement)

        const focusable = getFocusable()
        focusable[0]?.focus()

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                closeDialog()
                return
            }

            if (event.key !== 'Tab') return
            const currentFocusable = getFocusable()
            if (!currentFocusable.length) return

            const first = currentFocusable[0]
            const last = currentFocusable[currentFocusable.length - 1]
            const active = document.activeElement as HTMLElement | null
            const activeIsFocusable = active ? currentFocusable.includes(active) : false

            if (event.shiftKey) {
                if (active === first || !activeIsFocusable) {
                    event.preventDefault()
                    last.focus()
                }
                return
            }

            if (active === last || !activeIsFocusable) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            if (previouslyFocused && document.contains(previouslyFocused)) {
                previouslyFocused.focus?.()
            }
        }
    }, [closeDialog, open])

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
                                <span className="mode-icon"><IconUpload /></span>
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
                                <span className="mode-icon"><IconClipboard /></span>
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
                                <span className="mode-icon"><IconDownload /></span>
                                <strong>Export</strong>
                            </button>
                        </div>
                    </div>

                    {tab === 'import' && (
                        <div className="dialog-section">
                            <label className="dialog-label" htmlFor={importTextId}>Paste Portable Game Notation</label>
                            <div className="dialog-quick-actions">
                                <input
                                    ref={importFileInputRef}
                                    className="dialog-file-input"
                                    type="file"
                                    accept=".pgn,.txt,application/x-chess-pgn,text/plain"
                                    onChange={event => void handleImportFileChange(event)}
                                />
                                <button type="button" className="btn-cancel" onClick={handlePickImportFile}>
                                    <IconUpload /> Open PGN File
                                </button>
                                {importFileName && (
                                    <span className="dialog-file-name" title={importFileName}>{importFileName}</span>
                                )}
                            </div>
                            <textarea
                                id={importTextId}
                                className="input-textarea"
                                placeholder="[Event &quot;FIDE World Cup 2023&quot;]..."
                                value={importText}
                                onChange={e => {
                                    const nextText = e.target.value
                                    const limitError = pgnImportLengthError(nextText)
                                    if (limitError) {
                                        setError(limitError)
                                        return
                                    }
                                    setImportText(nextText)
                                    setImportFileName(null)
                                    setError(nextText.trim() ? pgnImportContentError(nextText) : null)
                                }}
                                aria-invalid={Boolean(error)}
                            />
                            {error && <p className="dialog-error" role="alert">{error}</p>}
                        </div>
                    )}

                    {tab === 'fen' && (
                        <div className="dialog-section">
                            <label className="dialog-label" htmlFor={fenTextId}>Paste Forsyth-Edwards Notation</label>
                            <div className="dialog-quick-actions">
                                <button type="button" className="btn-cancel" onClick={handleUseCurrentFen}>
                                    Use Current Position
                                </button>
                                <button type="button" className="btn-cancel" onClick={() => loadSetupPreset(createStartingPositionSetup())}>
                                    Start Position
                                </button>
                                <button type="button" className="btn-cancel" onClick={() => loadSetupPreset(createEmptyPositionSetup())}>
                                    Clear Board
                                </button>
                                <button type="button" className="btn-cancel" onClick={handleCopyCurrentFen}>
                                    {copyStatus === 'fen-copied' ? 'Copied FEN' : 'Copy Current FEN'}
                                </button>
                                <button type="button" className="btn-cancel" onClick={handleCopyShareLink} disabled={!canCopyShareLink}>
                                    <IconClipboard /> {copyStatus === 'link-copied' ? 'Copied Link' : 'Copy Share Link'}
                                </button>
                            </div>
                            <div className="fen-setup-card" aria-label="Position setup">
                                <div className="fen-setup-palette" aria-label="Piece palette">
                                    {SETUP_PIECE_OPTIONS.map(option => (
                                        <button
                                            key={option.piece}
                                            type="button"
                                            className={`fen-piece-btn ${selectedSetupPiece === option.piece ? 'active' : ''}`}
                                            aria-pressed={selectedSetupPiece === option.piece}
                                            aria-label={`Select ${option.label}`}
                                            title={option.label}
                                            onClick={() => setSelectedSetupPiece(option.piece)}
                                        >
                                            {option.glyph}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className={`fen-piece-btn eraser ${selectedSetupPiece === null ? 'active' : ''}`}
                                        aria-pressed={selectedSetupPiece === null}
                                        aria-label="Select empty square eraser"
                                        title="Clear square"
                                        onClick={() => setSelectedSetupPiece(null)}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="fen-setup-grid">
                                    <div className="fen-setup-board" role="group" aria-label="Editable chessboard">
                                        {SETUP_BOARD_SQUARES.map(square => {
                                            const piece = setup.pieces[square]
                                            const squareLabel = piece ? setupPieceLabel(piece) : 'empty square'
                                            const actionLabel = selectedSetupPiece
                                                ? `place ${setupPieceLabel(selectedSetupPiece)}`
                                                : 'clear square'
                                            return (
                                                <button
                                                    key={square}
                                                    type="button"
                                                    className={`fen-setup-square ${piece && piece === piece.toLowerCase() ? 'black-piece' : ''}`}
                                                    aria-label={`${square}, ${squareLabel}, ${actionLabel}`}
                                                    onClick={() => applySetupChange(current => updateSetupSquare(current, square, selectedSetupPiece))}
                                                >
                                                    {piece ? setupPieceGlyph(piece) : ''}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div className="fen-setup-controls">
                                        <div className="fen-setup-control-block">
                                            <span className="dialog-label">Side</span>
                                            <div className="fen-side-toggle" aria-label="Side to move">
                                                {([
                                                    { value: 'w', label: 'White' },
                                                    { value: 'b', label: 'Black' },
                                                ] as Array<{ value: SetupTurn; label: string }>).map(option => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        className={`mode-card fen-side-btn ${setup.turn === option.value ? 'selected' : ''}`}
                                                        aria-pressed={setup.turn === option.value}
                                                        onClick={() => applySetupChange(current => updateSetupTurn(current, option.value))}
                                                    >
                                                        <strong>{option.label}</strong>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="fen-setup-control-block">
                                            <span className="dialog-label">Castling</span>
                                            <div className="fen-castling-grid" role="group" aria-label="Castling rights">
                                                {SETUP_CASTLING_OPTIONS.map(option => {
                                                    const canCastle = canUseSetupCastlingRight(setup, option.right)
                                                    return (
                                                        <label
                                                            key={option.right}
                                                            className={`dialog-check-option fen-castling-option ${canCastle ? '' : 'disabled'}`}
                                                            title={canCastle ? option.label : `${option.label} needs the home king and rook`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                aria-label={option.label}
                                                                checked={hasSetupCastlingRight(setup, option.right)}
                                                                disabled={!canCastle}
                                                                onChange={event => {
                                                                    applySetupChange(current =>
                                                                        updateSetupCastlingRight(current, option.right, event.target.checked),
                                                                    )
                                                                }}
                                                            />
                                                            <span>{option.short}</span>
                                                            <small>{canCastle ? option.label : 'Needs home king + rook'}</small>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className="fen-setup-control-block">
                                            <span className="dialog-label">Counters</span>
                                            <div className="fen-counter-grid">
                                                <label className="fen-counter-field" htmlFor={halfmoveId}>
                                                    <span>Halfmove</span>
                                                    <input
                                                        id={halfmoveId}
                                                        type="number"
                                                        min={0}
                                                        step={1}
                                                        inputMode="numeric"
                                                        value={setup.halfmove}
                                                        onChange={event => {
                                                            applySetupChange(current =>
                                                                updateSetupHalfmove(current, Number(event.target.value)),
                                                            )
                                                        }}
                                                    />
                                                </label>
                                                <label className="fen-counter-field" htmlFor={fullmoveId}>
                                                    <span>Fullmove</span>
                                                    <input
                                                        id={fullmoveId}
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        inputMode="numeric"
                                                        value={setup.fullmove}
                                                        onChange={event => {
                                                            applySetupChange(current =>
                                                                updateSetupFullmove(current, Number(event.target.value)),
                                                            )
                                                        }}
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <textarea
                                id={fenTextId}
                                className="input-textarea fen-textarea"
                                placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                                value={fenText}
                                onChange={e => {
                                    syncFenTextAndSetup(e.target.value)
                                    setError(null)
                                    setCopyStatus('idle')
                                }}
                                aria-invalid={Boolean(error || fenValidationError)}
                            />
                            {error && <p className="dialog-error" role="alert">{error}</p>}
                            {!error && fenValidationError && (
                                <p className="dialog-error" role="status">{fenValidationError}</p>
                            )}
                            {copyStatus === 'failed' && (
                                shareLinkFallback ? (
                                    <div className="dialog-share-fallback" role="alert">
                                        <p className="dialog-error">Clipboard access failed. Select the share link and copy it manually.</p>
                                        <input
                                            type="text"
                                            readOnly
                                            value={shareLinkFallback}
                                            aria-label="Share link fallback"
                                            onFocus={event => event.currentTarget.select()}
                                        />
                                    </div>
                                ) : (
                                    <p className="dialog-error" role="alert">Clipboard access failed. The current FEN is in the text box.</p>
                                )
                            )}
                        </div>
                    )}

                    {tab === 'export' && (
                        <div className="dialog-section">
                            <label className="dialog-label" htmlFor={exportTextId}>Annotated Output</label>
                            <div className="dialog-export-options" role="group" aria-label="Export options">
                                <label className="dialog-check-option">
                                    <input
                                        type="checkbox"
                                        checked={exportOptions.includeVariations}
                                        onChange={event => setExportOption('includeVariations', event.target.checked)}
                                    />
                                    <span>Variations</span>
                                </label>
                                <label className="dialog-check-option">
                                    <input
                                        type="checkbox"
                                        checked={exportOptions.includeComments}
                                        onChange={event => setExportOption('includeComments', event.target.checked)}
                                    />
                                    <span>Comments</span>
                                </label>
                                <label className="dialog-check-option">
                                    <input
                                        type="checkbox"
                                        checked={exportOptions.includeEngineAnnotations}
                                        onChange={event => setExportOption('includeEngineAnnotations', event.target.checked)}
                                    />
                                    <span>Engine evals</span>
                                </label>
                                <label className="dialog-check-option">
                                    <input
                                        type="checkbox"
                                        checked={exportOptions.includeGlyphs}
                                        onChange={event => setExportOption('includeGlyphs', event.target.checked)}
                                    />
                                    <span>Glyphs</span>
                                </label>
                            </div>
                            <textarea
                                id={exportTextId}
                                className="input-textarea"
                                readOnly
                                value={exportText}
                            />
                            {copyStatus === 'failed' && (
                                <p className="dialog-error" role="alert">Clipboard access failed. Select the text and copy it manually.</p>
                            )}
                        </div>
                    )}
                </div>
                {tab === 'import' && (
                    <div className="dialog-actions">
                        <button type="button" className="btn-cancel" onClick={closeDialog}>Cancel</button>
                        <button type="button" className="btn-start" onClick={handleImport} disabled={!canImportPgn}>
                            Import & Analyze
                        </button>
                    </div>
                )}
                {tab === 'fen' && (
                    <div className="dialog-actions">
                        <button type="button" className="btn-cancel" onClick={closeDialog}>Cancel</button>
                        <button type="button" className="btn-start" onClick={handleLoadFen} disabled={!canLoadFen}>
                            Load & Analyze
                        </button>
                    </div>
                )}
                {tab === 'export' && (
                    <div className="dialog-actions">
                        <button type="button" className="btn-cancel" onClick={closeDialog}>Close</button>
                        <button type="button" className="btn-cancel" onClick={handleDownload}>
                            Download PGN
                        </button>
                        <button type="button" className="btn-start" onClick={handleCopy}>
                            {copyStatus === 'pgn-copied' ? 'Copied' : 'Copy PGN'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
