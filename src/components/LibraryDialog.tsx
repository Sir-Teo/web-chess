import { useCallback, useLayoutEffect, useMemo, useRef, useState, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react'
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
import { isCompositionKey, isPlainShortcut, isTypingTarget } from './shortcutKeys'

type Props = {
    open: boolean
    games: LibraryGame[]
    loaded: boolean
    writeError?: string | null
    saving?: boolean
    /** Empty when there is no game worth saving yet. */
    currentPgn: string
    positionStudy?: boolean
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
const PGN_DOWNLOAD_ERROR = 'The browser could not start the PGN download. Try Export PGN again.'
const BACKUP_DOWNLOAD_ERROR = 'The browser could not start the backup download. Try Export backup again.'
const backupPartDownloadError = (index: number) => `The browser could not start backup part ${index + 1}. Try that part again.`
const ROW_BUTTONS = '.library-favorite, .library-row-actions > button'
const BACKUP_TOO_LARGE_MESSAGE = 'That backup is too large. Import one exported backup part at a time.'

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
    { value: 'recent', label: 'Recent first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'name', label: 'Name (A–Z)' },
    { value: 'moves', label: 'Longest first' },
    { value: 'date', label: 'Game date' },
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
    positionStudy = false,
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
    const [starredOnly, setStarredOnly] = useState(false)
    const [sort, setSort] = useState<LibrarySort>('recent')
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [readingBackup, setReadingBackup] = useState(false)
    const backupReadGenerationRef = useRef(0)
    const [backupParts, setBackupParts] = useState<string[]>([])
    const [downloadedParts, setDownloadedParts] = useState<number[]>([])
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
    const renameInputRef = useRef<HTMLInputElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const starredFilterRef = useRef<HTMLButtonElement>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const showMoreRef = useRef<HTMLButtonElement>(null)
    const moreReturnActionRef = useRef(1)
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
    const errorId = useId()
    const backupReadStatusId = useId()
    const renamingId = renaming?.id

    useModalFocus(open, panelRef, onClose, { initialFocus: '[data-library-name]' })

    // Closing the dialog cancels the pending read before it can import data.
    useLayoutEffect(() => () => { backupReadGenerationRef.current += 1 }, [])

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
            if (document.activeElement !== document.body) return
            if (target.isConnected) target.focus()
            else panelRef.current?.querySelector<HTMLElement>('input[type="search"], [data-library-done]')?.focus()
        })
        return () => cancelAnimationFrame(frame)
    }, [open, renamingId])

    const visible = useMemo(() => {
        const matched = games.filter(game => (!starredOnly || game.favorite) && libraryGameMatchesQuery(game, query))
        const sorted = sortLibraryGames(matched, sort)
        // Favourites first, order within each group preserved.
        return [...sorted.filter(g => g.favorite), ...sorted.filter(g => !g.favorite)]
    }, [games, query, sort, starredOnly])

    const shown = useMemo(() => visible.slice(0, visibleLimit), [visible, visibleLimit])
    const hiddenCount = visible.length - shown.length
    const stats = useMemo(() => getLibraryStats(games), [games])
    const emptyResultsMessage = starredOnly && !query.trim()
        ? 'No starred games yet.'
        : `No ${starredOnly ? 'starred' : 'saved'} game matches “${query}”.`

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

    const focusRowAction = (row: Element | undefined, actionIndex: number) => {
        const target = row?.querySelectorAll<HTMLButtonElement>(ROW_BUTTONS)[actionIndex]
        target?.focus()
        target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    }

    const navigateRows = (event: ReactKeyboardEvent<HTMLUListElement>) => {
        if (event.defaultPrevented || isCompositionKey(event.nativeEvent) || !isPlainShortcut(event.nativeEvent)
            || isTypingTarget(event.target) || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        const button = (event.target as Element).closest('button')
        const row = button?.closest('[data-library-game-id]')
        if (!row || !button) return
        const actionIndex = [...row.querySelectorAll<HTMLButtonElement>(ROW_BUTTONS)].indexOf(button)
        if (actionIndex < 0) return // Inline editing buttons keep their own keys.
        const rows = [...event.currentTarget.querySelectorAll('[data-library-game-id]')]
        const index = rows.indexOf(row)
        if (index < 0) return
        event.preventDefault()
        if (event.key === 'ArrowUp' && index === 0) {
            searchInputRef.current?.focus()
        } else if (event.key === 'ArrowDown' && index === rows.length - 1) {
            moreReturnActionRef.current = actionIndex
            showMoreRef.current?.focus()
        } else {
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
                : index + (event.key === 'ArrowDown' ? 1 : -1)
            focusRowAction(rows[next], actionIndex)
        }
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
        let url: string | undefined
        let link: HTMLAnchorElement | undefined
        try {
            url = URL.createObjectURL(new Blob([text], { type }))
            link = document.createElement('a')
            link.href = url
            link.download = filename
            document.body.append(link)
            link.click()
        } finally {
            link?.remove()
            if (url) {
                const downloadUrl = url
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
            }
        }
    }

    const today = () => formatLocalDate()

    const handleExportPgn = () => {
        try {
            const text = onExportPgn()
            if (!text) {
                setStatus(null)
                setError('There is nothing in the library to export yet.')
                return
            }
            download(text, `web-chess-library-${today()}.pgn`, 'application/x-chess-pgn')
            setError(null)
            setStatus(`Exported ${stats.count} ${stats.count === 1 ? 'game' : 'games'} as PGN.`)
        } catch {
            setStatus(null)
            setError(PGN_DOWNLOAD_ERROR)
        }
    }

    const handleExport = () => {
        let parts: string[]
        try {
            const result = onExportBackup()
            parts = typeof result === 'string' ? [result] : result
            setDownloadedParts([])
            setBackupParts(parts.length > 1 ? parts : [])
        } catch {
            setStatus(null)
            setError('The backup could not be prepared. Export PGN to keep a copy of your games.')
            return
        }
        try {
            if (parts.length === 1) download(parts[0], `web-chess-library-${today()}.json`, 'application/json')
            setError(null)
            setStatus(parts.length > 1
                ? `Your library needs ${parts.length} backup files. Download every part below. To restore the full library, import each part.`
                : `Exported ${stats.count} ${stats.count === 1 ? 'game' : 'games'}.`)
        } catch {
            setStatus(null)
            setError(BACKUP_DOWNLOAD_ERROR)
        }
    }

    const handleDownloadPart = (part: string, index: number) => {
        setStatus(null)
        try {
            download(part, `web-chess-library-${today()}-part-${index + 1}-of-${backupParts.length}.json`, 'application/json')
            setDownloadedParts(previous => previous.includes(index) ? previous : [...previous, index])
            setError(null)
        } catch {
            setError(backupPartDownloadError(index))
        }
    }

    const cancelBackupRead = () => {
        backupReadGenerationRef.current += 1
        setReadingBackup(false)
        setError(null)
        setStatus('Backup import canceled.')
    }

    const handleImportFile = async (file: File | undefined) => {
        if (!file) return
        const generation = ++backupReadGenerationRef.current
        setStatus(null)
        setError(null)
        if (file.size > MAX_LIBRARY_BACKUP_BYTES) {
            setReadingBackup(false)
            setError(BACKUP_TOO_LARGE_MESSAGE)
            return
        }
        setReadingBackup(true)
        try {
            const text = await file.text()
            if (generation !== backupReadGenerationRef.current) return
            if (text.length > MAX_LIBRARY_BACKUP_LENGTH) {
                setError(BACKUP_TOO_LARGE_MESSAGE)
                return
            }
            announce(onImportBackup(text), 'Backup imported.')
        } catch {
            if (generation !== backupReadGenerationRef.current) return
            setStatus(null)
            setError('That file could not be read.')
        } finally {
            if (generation === backupReadGenerationRef.current) setReadingBackup(false)
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
                        {currentPgn ? <>
                            <label className="dialog-label" htmlFor={nameId}>{positionStudy ? 'Save the current position study' : 'Save the current game'}</label>
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
                        </> : (
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
                                    aria-keyshortcuts="ArrowDown"
                                    aria-controls={`${searchId}-list`}
                                    aria-describedby={`${searchId}-results ${searchId}-keys`}
                                    title="Search saved games. Press Down Arrow to browse the results."
                                    value={query}
                                    // Matching truncates past this anyway; stopping it at the
                                    // input keeps a pasted game out of React state as well.
                                    maxLength={MAX_SEARCH_QUERY_LENGTH}
                                    placeholder="Search players, event, opening…"
                                    onChange={event => changeQuery(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key !== 'ArrowDown' || isCompositionKey(event.nativeEvent) || !isPlainShortcut(event.nativeEvent)) return
                                        if (!listRef.current?.firstElementChild) return
                                        event.preventDefault()
                                        focusRowAction(listRef.current.firstElementChild, 1)
                                    }}
                                />
                                {query.length > 0 && <button type="button" className="btn-cancel library-clear-search"
                                    aria-label="Clear saved-game search" title="Clear search"
                                    onClick={() => { changeQuery(''); searchInputRef.current?.focus() }}>
                                    <IconClose aria-hidden="true" />
                                </button>}
                                <button
                                    ref={starredFilterRef}
                                    type="button"
                                    className="btn-cancel library-starred-filter"
                                    aria-pressed={starredOnly}
                                    aria-label="Starred only"
                                    title={starredOnly ? 'Show all saved games' : 'Show only starred games'}
                                    aria-controls={`${searchId}-list`}
                                    onClick={() => {
                                        setStarredOnly(value => !value)
                                        setVisibleLimit(PAGE_SIZE)
                                        setRenaming(null)
                                        setConfirmingDelete(null)
                                    }}
                                >
                                    <span aria-hidden="true">{starredOnly ? '★' : '☆'}</span>
                                    <span className="library-starred-label">Starred only</span>
                                </button>
                            </div>
                            <select className="library-sort" aria-label="Sort saved games"
                                title={sort === 'date' ? 'Newest game dates first, with starred games pinned. Unknown date parts sort last.' : undefined}
                                value={sort} onChange={event => changeSort(event.target.value as LibrarySort)}>
                                {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>}

                        {!loaded && <p className="library-hint">Loading…</p>}
                        {loaded && !games.length && (
                            <p className="library-hint">Nothing saved yet.</p>
                        )}
                        {games.length > 0 && <span id={`${searchId}-keys`} className="visually-hidden">
                            Press Down Arrow to browse results. Within a row, Up and Down move between games;
                            Home and End jump to the first and last shown games. Up from the first row returns to search.
                        </span>}
                        <ul ref={listRef} className="library-list" id={`${searchId}-list`}
                            aria-keyshortcuts="ArrowUp ArrowDown Home End" onKeyDown={navigateRows}>
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
                                            onClick={event => {
                                                const trigger = event.currentTarget
                                                if (starredOnly && game.favorite) {
                                                    const row = trigger.closest('li')
                                                    const neighbor = row?.nextElementSibling ?? row?.previousElementSibling
                                                    const target = neighbor?.querySelector<HTMLButtonElement>('.library-favorite') ?? starredFilterRef.current
                                                    requestAnimationFrame(() => {
                                                        if (document.activeElement !== document.body && document.activeElement !== trigger) return
                                                        if (target?.isConnected) target.focus()
                                                    })
                                                }
                                                onToggleFavorite(game.id)
                                            }}
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
                                                onKeyDown={event => { if (event.key === 'Enter' && event.repeat) event.preventDefault() }}
                                                onClick={event => {
                                                    const trigger = event.currentTarget
                                                    const row = trigger.closest('.library-row')
                                                    const neighbor = row?.nextElementSibling ?? row?.previousElementSibling
                                                    const target = neighbor?.querySelector<HTMLElement>('[title="Delete"]')
                                                        ?? panelRef.current?.querySelector<HTMLElement>('input[type="search"], [data-library-done]')
                                                    requestAnimationFrame(() => {
                                                        // Preserve a reader's later choice of another field.
                                                        if (document.activeElement !== document.body && document.activeElement !== trigger) return
                                                        // Deleting the final game also removes search.
                                                        const next = target?.isConnected ? target
                                                            : panelRef.current?.querySelector<HTMLElement>('[data-library-done]')
                                                        next?.focus()
                                                    })
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
                                                onKeyDown={event => { if (event.key === 'Enter' && event.repeat) event.preventDefault() }}
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
                                ref={showMoreRef}
                                type="button"
                                className="btn-cancel library-show-more"
                                aria-controls={`${searchId}-list`}
                                onKeyDown={event => {
                                    if (event.key !== 'ArrowUp' || isCompositionKey(event.nativeEvent) || !isPlainShortcut(event.nativeEvent)) return
                                    event.preventDefault()
                                    focusRowAction(listRef.current?.lastElementChild ?? undefined, moreReturnActionRef.current)
                                }}
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
                                {visible.length === 0 ? <>{emptyResultsMessage}</> : <>
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
                    {error && <p id={errorId} className="dialog-error" role="alert">{error}</p>}
                    {readingBackup && <p id={backupReadStatusId} className="library-status" role="status">Reading backup…</p>}
                    {saving && <p className="library-status" role="status">Saving library changes…</p>}
                    {status && !writeError && !saving && <p className="library-status" role="status">{status}</p>}
                    {backupParts.length > 0 && (
                        <div className="library-backup-parts" role="group" aria-label="Backup files">
                            {backupParts.map((part, index) => (
                                <button type="button" className="btn-cancel" key={index}
                                    aria-describedby={error === backupPartDownloadError(index) ? errorId : undefined}
                                    onClick={() => handleDownloadPart(part, index)}>
                                    <IconDownload /> {downloadedParts.includes(index) ? 'Download again' : 'Download'} part {index + 1} of {backupParts.length}
                                </button>
                            ))}
                            <p className="library-hint" role="status">{downloadedParts.length} of {backupParts.length} downloads started. Keep all parts together.</p>
                        </div>
                    )}
                </div>

                <div className="dialog-actions">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        disabled={readingBackup}
                        className="dialog-file-input"
                        onChange={event => {
                            void handleImportFile(event.target.files?.[0])
                            event.target.value = ''
                        }}
                    />
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => readingBackup ? cancelBackupRead() : fileInputRef.current?.click()}
                        aria-describedby={readingBackup ? backupReadStatusId : undefined}
                    >
                        {readingBackup ? <><IconClose /> Cancel import</> : <><IconUpload /> Import backup</>}
                    </button>
                    <button
                        type="button"
                        className="btn-cancel"
                        onClick={handleExport}
                        aria-describedby={error === BACKUP_DOWNLOAD_ERROR ? errorId : undefined}
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
                        aria-describedby={error === PGN_DOWNLOAD_ERROR ? errorId : undefined}
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
