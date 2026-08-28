import { useMemo, useRef, useState, useId } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import {
    type LibraryGame,
    type LibrarySort,
    formatLibrarySize,
    getLibraryStats,
    libraryGameMatchesQuery,
    sortLibraryGames,
} from '../engine/gameLibrary'
import type { LibraryWriteResult } from '../hooks/useGameLibrary'
import { IconClipboard, IconDownload, IconUpload, IconPlay, IconRefresh } from './icons'
import './NewGameDialog.css'
import './LibraryDialog.css'

type Props = {
    open: boolean
    games: LibraryGame[]
    loaded: boolean
    /** Empty when there is no game worth saving yet. */
    currentPgn: string
    suggestedName: string
    onClose: () => void
    onSave: (name: string, pgn: string) => LibraryWriteResult
    /** Reports a parse failure so a corrupted saved game says so instead of doing nothing. */
    onLoad: (game: LibraryGame) => LibraryWriteResult
    onRename: (id: string, name: string) => void
    onDelete: (id: string) => void
    onToggleFavorite: (id: string) => void
    onExportBackup: () => string
    onImportBackup: (json: string) => LibraryWriteResult
}

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
    { value: 'recent', label: 'Recent' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'name', label: 'Name' },
    { value: 'moves', label: 'Length' },
]

function describeGame(game: LibraryGame): string {
    const { white, black, result, date, eco } = game.metadata
    const players = white || black ? `${white ?? '?'} — ${black ?? '?'}` : null
    return [players, result, date, eco, `${game.moveCount} ply`].filter(Boolean).join(' · ')
}

export function LibraryDialog({
    open,
    games,
    loaded,
    currentPgn,
    suggestedName,
    onClose,
    onSave,
    onLoad,
    onRename,
    onDelete,
    onToggleFavorite,
    onExportBackup,
    onImportBackup,
}: Props) {
    const [name, setName] = useState('')
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState<LibrarySort>('recent')
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const titleId = useId()
    const nameId = useId()
    const searchId = useId()

    useModalFocus(open, panelRef, onClose, { initialFocus: '[data-library-name]' })

    const visible = useMemo(() => {
        const matched = games.filter(game => libraryGameMatchesQuery(game, query))
        const sorted = sortLibraryGames(matched, sort)
        // Favourites first, order within each group preserved.
        return [...sorted.filter(g => g.favorite), ...sorted.filter(g => !g.favorite)]
    }, [games, query, sort])

    const stats = useMemo(() => getLibraryStats(games), [games])

    const announce = (result: LibraryWriteResult, success: string) => {
        if (result.ok) {
            setError(null)
            setStatus(success)
        } else {
            setStatus(null)
            setError(result.error)
        }
    }

    const handleSave = () => {
        announce(onSave(name, currentPgn), 'Saved to the library.')
        setName('')
    }

    const handleExport = () => {
        const blob = new Blob([onExportBackup()], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `web-chess-library-${new Date().toISOString().slice(0, 10)}.json`
        link.click()
        URL.revokeObjectURL(url)
        setStatus(`Exported ${stats.count} ${stats.count === 1 ? 'game' : 'games'}.`)
    }

    const handleImportFile = async (file: File | undefined) => {
        if (!file) return
        try {
            announce(onImportBackup(await file.text()), 'Backup imported.')
        } catch {
            setStatus(null)
            setError('That file could not be read.')
        }
    }

    if (!open) return null

    return (
        <div className="dialog-backdrop" onClick={onClose}>
            <div
                ref={panelRef}
                className="dialog-panel library-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={event => event.stopPropagation()}
            >
                <header className="dialog-header">
                    <span className="dialog-icon"><IconClipboard /></span>
                    <h2 id={titleId}>Library</h2>
                </header>

                <div className="dialog-body">
                    <div className="dialog-section">
                        <label className="dialog-label" htmlFor={nameId}>Save the current game</label>
                        <div className="library-save-row">
                            <input
                                id={nameId}
                                data-library-name
                                type="text"
                                value={name}
                                placeholder={suggestedName || 'Untitled game'}
                                onChange={event => setName(event.target.value)}
                                onKeyDown={event => { if (event.key === 'Enter') handleSave() }}
                                disabled={!currentPgn}
                            />
                            <button
                                type="button"
                                className="btn-start"
                                onClick={handleSave}
                                disabled={!currentPgn}
                            >
                                Save
                            </button>
                        </div>
                        {!currentPgn && (
                            <p className="library-hint">Play or import a game to have something to save.</p>
                        )}
                    </div>

                    <div className="dialog-section">
                        <div className="library-toolbar">
                            <input
                                id={searchId}
                                type="search"
                                aria-label="Search saved games"
                                value={query}
                                placeholder="Search players, event, opening…"
                                onChange={event => setQuery(event.target.value)}
                            />
                            <div className="library-sort" role="group" aria-label="Sort saved games">
                                {SORT_OPTIONS.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={sort === option.value ? 'selected' : ''}
                                        aria-pressed={sort === option.value}
                                        onClick={() => setSort(option.value)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!loaded && <p className="library-hint">Loading…</p>}
                        {loaded && !games.length && (
                            <p className="library-hint">Nothing saved yet.</p>
                        )}
                        {loaded && games.length > 0 && !visible.length && (
                            <p className="library-hint">No saved game matches “{query}”.</p>
                        )}

                        <ul className="library-list">
                            {visible.map(game => (
                                <li key={game.id} className="library-row">
                                    <div className="library-row-main">
                                        <button
                                            type="button"
                                            className="library-favorite"
                                            aria-pressed={game.favorite}
                                            aria-label={game.favorite ? `Unstar ${game.name}` : `Star ${game.name}`}
                                            title={game.favorite ? 'Starred' : 'Not starred'}
                                            onClick={() => onToggleFavorite(game.id)}
                                        >
                                            {game.favorite ? '★' : '☆'}
                                        </button>
                                        <div className="library-row-text">
                                            <strong>{game.name}</strong>
                                            <span>{describeGame(game)}</span>
                                        </div>
                                    </div>
                                    <div className="library-row-actions">
                                        <button
                                            type="button"
                                            className="btn-cancel"
                                            onClick={() => announce(onLoad(game), 'Loaded.')}
                                            aria-label={`Load ${game.name}`}
                                            title="Load"
                                        >
                                            <IconPlay />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-cancel"
                                            onClick={() => {
                                                const next = window.prompt('Rename saved game', game.name)
                                                if (next !== null) onRename(game.id, next)
                                            }}
                                            aria-label={`Rename ${game.name}`}
                                            title="Rename"
                                        >
                                            <IconRefresh />
                                        </button>
                                        {confirmingDelete === game.id ? (
                                            <button
                                                type="button"
                                                className="btn-cancel library-confirm-delete"
                                                onClick={() => { onDelete(game.id); setConfirmingDelete(null) }}
                                                onBlur={() => setConfirmingDelete(null)}
                                                aria-label={`Confirm deleting ${game.name}`}
                                            >
                                                Sure?
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn-cancel"
                                                onClick={() => setConfirmingDelete(game.id)}
                                                aria-label={`Delete ${game.name}`}
                                                title="Delete"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {games.length > 0 && (
                            <p className="library-hint">
                                {stats.count} {stats.count === 1 ? 'game' : 'games'} · {stats.moves} ply · {formatLibrarySize(stats.size)}
                            </p>
                        )}
                    </div>

                    {error && <p className="dialog-error" role="alert">{error}</p>}
                    {status && <p className="library-status" role="status">{status}</p>}
                </div>

                <div className="dialog-actions">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="dialog-file-input"
                        onChange={event => {
                            void handleImportFile(event.target.files?.[0])
                            event.target.value = ''
                        }}
                    />
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <IconUpload /> Import backup
                    </button>
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={handleExport}
                        disabled={!games.length}
                    >
                        <IconDownload /> Export backup
                    </button>
                    <button type="button" className="btn-start" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    )
}
