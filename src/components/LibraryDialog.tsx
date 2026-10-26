import { useCallback, useLayoutEffect, useMemo, useRef, useState, useId } from 'react'
import { useDisarmAfter } from '../hooks/useDisarmAfter'
import { useModalFocus } from '../hooks/useModalFocus'
import {
    type LibraryGame,
    type LibrarySort,
    MAX_LIBRARY_NAME_LENGTH,
    MAX_LIBRARY_BACKUP_BYTES,
    MAX_LIBRARY_BACKUP_LENGTH,
    formatLibrarySize,
    getLibraryStats,
    libraryGameMatchesQuery,
    libraryPlayers,
    sameGameKey,
    sortLibraryGames,
} from '../engine/gameLibrary'
import type { LibraryWriteResult } from '../hooks/useGameLibrary'
import { IconClipboard, IconDownload, IconUpload, IconPlay, IconPencil, IconClose } from './icons'
import './NewGameDialog.css'
import './LibraryDialog.css'
import { MAX_SEARCH_QUERY_LENGTH } from '../engine/searchTerms'
import { formatLocalDate } from '../engine/localDate'
import { isCompositionKey } from './shortcutKeys'

type Props = {
    open: boolean
    games: LibraryGame[]
    loaded: boolean
    writeError?: string | null
    saving?: boolean
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
    onExportBackup: () => string | string[]
    /**
     * The library as a PGN database. The backup is JSON and only this app
     * reads it; a PGN opens anywhere.
     */
    onExportPgn: () => string
    onImportBackup: (json: string) => LibraryWriteResult
    /**
     * Whether anything saved here will outlive the tab. False when the browser
     * refuses both stores -- private mode, an enterprise policy, a full quota.
     * The dialog used to say "Saved to the library." either way, which was a
     * lie in exactly the case where the games were about to be lost.
     */
    storageIsDurable: boolean
}

/**
 * Rows rendered before "Show more". A full library is 500 games, and the whole
 * list re-renders on every keystroke, sort and star toggle, so mounting all of
 * them makes the dialog the most expensive thing on screen. Matches the page
 * size web-xiangqi's library panel already uses.
 */
const PAGE_SIZE = 100
const BACKUP_TOO_LARGE_MESSAGE = 'That backup is too large. Import one exported backup part at a time.'

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
    { value: 'recent', label: 'Recent' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'name', label: 'Name' },
    { value: 'moves', label: 'Length' },
]

function describeGame(game: LibraryGame): string {
    const { result, eco } = game.metadata
    const players = libraryPlayers(game.metadata, ' — ', '?')
    // Not twice: a suggested name already ends in the date, and the details
    // line under it repeated it -- "Queen's Gambit · 2026.09.26" over
    // "2026.09.26 · 3 ply".
    const date = game.metadata.date && !game.name.includes(game.metadata.date) ? game.metadata.date : undefined
    return [players, result, date, eco, `${game.moveCount} ply`].filter(Boolean).join(' · ')
}

export function LibraryDialog({
    open,
    games,
    loaded,
    writeError,
    saving = false,
    currentPgn,
    suggestedName,
    onClose,
    onSave,
    onLoad,
    onRename,
    onDelete,
    onToggleFavorite,
    onExportBackup,
    onExportPgn,
    onImportBackup,
    storageIsDurable,
}: Props) {
    const [name, setName] = useState('')
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState<LibrarySort>('recent')
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [backupParts, setBackupParts] = useState<string[]>([])
    const [downloadedParts, setDownloadedParts] = useState<number[]>([])
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
    const renameInputRef = useRef<HTMLInputElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const renameButtonRef = useRef<HTMLButtonElement | null>(null)
    const renameReturnFocusRef = useRef<HTMLElement | null>(null)
    const disarmDelete = useCallback(() => setConfirmingDelete(null), [])
    useDisarmAfter(confirmingDelete !== null, disarmDelete)
    const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
    const moreFocusRef = useRef<string | null>(null)
    /*
     * The game this dialog has already put in the library, so one gesture
     * cannot put it there three times.
     *
     * **Measured**: three clicks on Save in a single tick produced three
     * entries, which the library dutifully disambiguated to "... (2)" and
     * "... (3)" because that is what it does with a name collision. A double
     * click on a button that looks like it did nothing is the most ordinary
     * mis-click there is, and `Save` was disabled only when there was nothing
     * to save.
     *
     * A ref as well as state, because the three clicks arrive before React can
     * re-render and the `disabled` attribute is still stale when the second
     * one lands; the ref is what the handler itself reads.
     *
     * The rule is the state the form is in afterwards: the same game, with no
     * name typed, is the save that already happened. Typing a name, or playing
     * on, asks for a genuinely different entry and re-enables it at once --
     * which is the one case where a second copy is what somebody means.
     */
    const [savedPgn, setSavedPgn] = useState<string | null>(null)
    const savedPgnRef = useRef<string | null>(null)
    const savedNameRef = useRef<string | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const titleId = useId()
    const nameId = useId()
    const searchId = useId()
    const renameId = useId()
    const renamingId = renaming?.id

    useModalFocus(open, panelRef, onClose, { initialFocus: '[data-library-name]' })

    useLayoutEffect(() => {
        if (!open) return
        if (renamingId) {
            renameInputRef.current?.focus()
            renameInputRef.current?.select()
            return
        }
        const target = renameReturnFocusRef.current
        renameReturnFocusRef.current = null
        if (!target) return
        // Restore after the renamed row has moved or left the filtered list.
        const frame = requestAnimationFrame(() => {
            if (target.isConnected) target.focus()
            else panelRef.current?.querySelector<HTMLElement>('input[type="search"], [data-library-done]')?.focus()
        })
        return () => cancelAnimationFrame(frame)
    }, [open, renamingId])

    const visible = useMemo(() => {
        const matched = games.filter(game => libraryGameMatchesQuery(game, query))
        const sorted = sortLibraryGames(matched, sort)
        // Favourites first, order within each group preserved.
        return [...sorted.filter(g => g.favorite), ...sorted.filter(g => !g.favorite)]
    }, [games, query, sort])

    const shown = useMemo(() => visible.slice(0, visibleLimit), [visible, visibleLimit])
    const hiddenCount = visible.length - shown.length
    const stats = useMemo(() => getLibraryStats(games), [games])

    // Continue through the newly revealed rows, including when the last page
    // removes Show more. Consume the request before later filtering or sorting.
    useLayoutEffect(() => {
        const id = moreFocusRef.current
        moreFocusRef.current = null
        if (!open || !id) return
        const row = [...panelRef.current?.querySelectorAll<HTMLElement>('[data-library-game-id]') ?? []]
            .find(element => element.dataset.libraryGameId === id)
        row?.querySelector<HTMLButtonElement>('button')?.focus()
        row?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }, [open, shown])

    // Changing what is listed starts the page count over, rather than keeping a
    // limit raised for a previous search. Batched with the state it belongs to,
    // so the full list is never rendered on the way.
    const changeQuery = (next: string) => {
        setRenaming(null)
        setQuery(next)
        setVisibleLimit(PAGE_SIZE)
    }

    const changeSort = (next: LibrarySort) => {
        setRenaming(null)
        setSort(next)
        setVisibleLimit(PAGE_SIZE)
    }

    const announce = (result: LibraryWriteResult, success: string) => {
        if (result.ok) {
            setError(null)
            // A write that succeeded but skipped something says what it skipped,
            // rather than a confirmation that would read as "all of it".
            setStatus(result.note ?? success)
        } else {
            setStatus(null)
            setError(result.error)
        }
    }

    const currentKey = sameGameKey(currentPgn)
    const alreadySaved = savedPgn !== null && savedPgn === currentKey && !name.trim()

    const handleSave = () => {
        if (!currentPgn || !loaded) return
        const typedName = name.trim()
        if (savedPgnRef.current === currentKey && (!typedName || savedNameRef.current === typedName)) return
        // An empty field saves under the name the field is showing: the
        // placeholder is the app's suggestion, and it knows the opening,
        // which the save path does not.
        const result = onSave(typedName || suggestedName, currentPgn)
        announce(result, storageIsDurable ? 'Saved to the library.' : 'Saved for this session only.')
        if (result.ok) {
            savedPgnRef.current = currentKey
            savedNameRef.current = typedName
            setSavedPgn(currentKey)
            setName('')
        }
    }

    const finishRenaming = (returnToSearch = false) => {
        // Restore after the commit: a renamed row can move in the sort order
        // or disappear from the current search results.
        renameReturnFocusRef.current = returnToSearch
            ? panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]') ?? null
            : renameButtonRef.current
        setRenaming(null)
    }

    const download = (text: string, filename: string, type: string) => {
        const blob = new Blob([text], { type })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
    }

    const today = () => formatLocalDate()

    const handleExportPgn = () => {
        const text = onExportPgn()
        if (!text) {
            setStatus(null)
            setError('There is nothing in the library to export yet.')
            return
        }
        download(text, `web-chess-library-${today()}.pgn`, 'application/x-chess-pgn')
        setError(null)
        setStatus(`Exported ${stats.count} ${stats.count === 1 ? 'game' : 'games'} as PGN.`)
    }

    const handleExport = () => {
        try {
            const result = onExportBackup()
            const parts = typeof result === 'string' ? [result] : result
            setDownloadedParts([])
            setBackupParts(parts.length > 1 ? parts : [])
            if (parts.length === 1) {
                download(parts[0], `web-chess-library-${today()}.json`, 'application/json')
            }
            setError(null)
            setStatus(parts.length > 1
                ? `Your library needs ${parts.length} backup files. Download every part below. To restore the full library, import each part.`
                : `Exported ${stats.count} ${stats.count === 1 ? 'game' : 'games'}.`)
        } catch {
            setStatus(null)
            setError('The backup could not be prepared. Export PGN to keep a copy of your games.')
        }
    }

    const handleImportFile = async (file: File | undefined) => {
        if (!file) return
        if (file.size > MAX_LIBRARY_BACKUP_BYTES) {
            setStatus(null)
            setError(BACKUP_TOO_LARGE_MESSAGE)
            return
        }
        try {
            const text = await file.text()
            if (text.length > MAX_LIBRARY_BACKUP_LENGTH) {
                setStatus(null)
                setError(BACKUP_TOO_LARGE_MESSAGE)
                return
            }
            announce(onImportBackup(text), 'Backup imported.')
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
                        <form className="library-save-row" onSubmit={event => {
                            event.preventDefault()
                            handleSave()
                        }}>
                            <input
                                id={nameId}
                                data-library-name
                                type="text"
                                value={name}
                                maxLength={MAX_LIBRARY_NAME_LENGTH}
                                placeholder={suggestedName || 'Untitled game'}
                                onChange={event => {
                                    // Editing explicitly asks for another copy; repeat
                                    // submissions before that edit belong to one save.
                                    savedNameRef.current = null
                                    setName(event.target.value)
                                }}
                                disabled={!currentPgn || !loaded}
                            />
                            <button
                                type="submit"
                                className="btn-start"
                                disabled={!currentPgn || !loaded || alreadySaved}
                                title={alreadySaved ? 'This game is already in the library. Type a name to save another copy.' : undefined}
                            >
                                Save
                            </button>
                        </form>
                        {!currentPgn && (
                            <p className="library-hint">Play or import a game to have something to save.</p>
                        )}
                    </div>

                    <div className="dialog-section">
                        {/* Nothing to search or sort until something is saved. */}
                        {games.length > 0 && <div className="library-toolbar">
                            <div className="library-search">
                                <input
                                    ref={searchInputRef}
                                    id={searchId}
                                    type="search"
                                    aria-label="Search saved games"
                                    aria-controls={`${searchId}-list`}
                                    aria-describedby={`${searchId}-results`}
                                    value={query}
                                    // Matching truncates past this anyway; stopping it at the
                                    // input keeps a pasted game out of React state as well.
                                    maxLength={MAX_SEARCH_QUERY_LENGTH}
                                    placeholder="Search players, event, opening…"
                                    onChange={event => changeQuery(event.target.value)}
                                />
                                {query.length > 0 && <button type="button" className="btn-cancel library-clear-search"
                                    aria-label="Clear saved-game search" title="Clear search"
                                    onClick={() => { changeQuery(''); searchInputRef.current?.focus() }}>
                                    <IconClose aria-hidden="true" />
                                </button>}
                            </div>
                            <div className="library-sort" role="group" aria-label="Sort saved games">
                                {SORT_OPTIONS.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={sort === option.value ? 'selected' : ''}
                                        aria-pressed={sort === option.value}
                                        onClick={() => changeSort(option.value)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>}

                        {!loaded && <p className="library-hint">Loading…</p>}
                        {loaded && !games.length && (
                            <p className="library-hint">Nothing saved yet.</p>
                        )}
                        <ul className="library-list" id={`${searchId}-list`}>
                            {shown.map(game => (
                                <li key={game.id} className={`library-row${renaming?.id === game.id ? ' library-row-editing' : ''}`}
                                    data-library-game-id={game.id}
                                    onKeyDown={event => {
                                        if (isCompositionKey(event.nativeEvent)) return
                                        if (event.key === 'Escape' && renaming?.id === game.id) {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            finishRenaming()
                                        }
                                    }}>
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
                                            onClick={event => {
                                                if (renaming?.id === game.id) {
                                                    finishRenaming()
                                                    return
                                                }
                                                renameButtonRef.current = event.currentTarget
                                                setConfirmingDelete(null)
                                                setRenaming({ id: game.id, name: game.name })
                                            }}
                                            aria-expanded={renaming?.id === game.id}
                                            aria-controls={renaming?.id === game.id ? renameId : undefined}
                                            aria-label={`Rename ${game.name}`}
                                            title="Rename"
                                        >
                                            <IconPencil />
                                        </button>
                                        {confirmingDelete === game.id ? (
                                            <button
                                                type="button"
                                                className="btn-cancel library-confirm-delete"
                                                onClick={event => {
                                                    const row = event.currentTarget.closest('.library-row')
                                                    const neighbor = row?.nextElementSibling ?? row?.previousElementSibling
                                                    const target = neighbor?.querySelector<HTMLElement>('[title="Delete"]')
                                                        ?? panelRef.current?.querySelector<HTMLElement>('input[type="search"], [data-library-done]')
                                                    requestAnimationFrame(() => { if (target?.isConnected) target.focus() })
                                                    onDelete(game.id)
                                                    setConfirmingDelete(null)
                                                    if (renaming?.id === game.id) setRenaming(null)
                                                }}
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
                                    {renaming?.id === game.id && (
                                        <form id={renameId} className="library-rename" onSubmit={event => {
                                            event.preventDefault()
                                            if (!renaming.name.trim()) return
                                            onRename(game.id, renaming.name.trim())
                                            setError(null)
                                            setStatus('Renamed saved game.')
                                            finishRenaming(Boolean(query.trim()))
                                        }}>
                                            <label htmlFor={`${renameId}-name`}>New game name</label>
                                            <div className="library-save-row">
                                                <input id={`${renameId}-name`} ref={renameInputRef}
                                                    value={renaming.name} maxLength={MAX_LIBRARY_NAME_LENGTH}
                                                    onChange={event => setRenaming({ id: game.id, name: event.target.value })} />
                                                <button type="submit" className="btn-start" disabled={!renaming.name.trim()}>Save name</button>
                                                <button type="button" className="btn-cancel" onClick={() => finishRenaming()}>Cancel</button>
                                            </div>
                                        </form>
                                    )}
                                </li>
                            ))}
                        </ul>

                        {hiddenCount > 0 && (
                            <button
                                type="button"
                                className="btn-cancel library-show-more"
                                aria-controls={`${searchId}-list`}
                                onClick={() => {
                                    moreFocusRef.current = visible[shown.length]?.id ?? null
                                    setVisibleLimit(limit => limit + PAGE_SIZE)
                                }}
                            >
                                Show {Math.min(hiddenCount, PAGE_SIZE)} more
                            </button>
                        )}

                        {/* While a search narrows the list, the count is of what
                            it found: "2 games" over one result read as though
                            the other had failed to draw. The library's size is
                            back once the search is cleared. */}
                        <div id={`${searchId}-results`} aria-live="polite" aria-atomic="true">
                            {loaded && games.length > 0 && <p className="library-hint">
                                {visible.length === 0 ? <>No saved game matches “{query}”.</> : <>
                                    {visible.length === games.length
                                        ? <>{stats.count} {stats.count === 1 ? 'game' : 'games'} · {stats.moves} ply · {formatLibrarySize(stats.size)}</>
                                        : <>{visible.length} of {stats.count} games match</>}
                                    {visible.length > PAGE_SIZE && <> · {shown.length} shown</>}
                                </>}
                            </p>}
                        </div>
                    </div>

                    {!storageIsDurable && (
                        <p className="dialog-note library-not-durable" role="status">
                            This browser is not letting the page store data, so saved games last only until
                            this tab closes. Export the library to keep them.
                        </p>
                    )}
                    {writeError && <p className="dialog-error" role="alert">{writeError}</p>}
                    {error && <p className="dialog-error" role="alert">{error}</p>}
                    {saving && <p className="library-status" role="status">Saving library changes…</p>}
                    {status && !writeError && !saving && <p className="library-status" role="status">{status}</p>}
                    {backupParts.length > 0 && (
                        <div className="library-backup-parts" aria-label="Backup files">
                            {backupParts.map((part, index) => (
                                <button type="button" className="btn-cancel" key={index} onClick={() => {
                                    download(part, `web-chess-library-${today()}-part-${index + 1}-of-${backupParts.length}.json`, 'application/json')
                                    setDownloadedParts(previous => previous.includes(index) ? previous : [...previous, index])
                                }}>
                                    <IconDownload /> {downloadedParts.includes(index) ? 'Download again' : 'Download'} part {index + 1} of {backupParts.length}
                                </button>
                            ))}
                            <p className="library-hint">{downloadedParts.length} of {backupParts.length} downloads started. Keep all parts together.</p>
                        </div>
                    )}
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
                        title={games.length
                            ? 'Every saved game with its details, as one file to keep'
                            : 'Nothing to back up yet — save a game first.'}
                    >
                        <IconDownload /> Export backup
                    </button>
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={handleExportPgn}
                        disabled={!games.length}
                        title={games.length
                            ? 'A PGN database every other chess program can open'
                            : 'Nothing to export yet — save a game first.'}
                    >
                        <IconDownload /> Export PGN
                    </button>
                    <button type="button" className="btn-start" data-library-done onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    )
}
