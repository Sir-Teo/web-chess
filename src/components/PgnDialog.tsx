import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { Square } from 'chess.js'
import { useModalFocus } from '../hooks/useModalFocus'
import type { GameNode } from '../hooks/useGameTree'
import type { EvalSnapshot } from '../engine/analysis'
import { parseFenCounterValue, validateFenForAnalysis } from '../engine/fen'
import { truncateUtf16 } from '../engine/textLength'
import {
    PGN_MULTIPLE_GAMES_ERROR,
    exportAnnotatedPgn,
    pgnImportContentError,
    splitPgnGames,
    type PgnExportOptions,
} from '../engine/pgn'
import {
    createEmptyPositionSetup,
    createStartingPositionSetup,
    canUseSetupCastlingRight,
    normalizeAvailableCastlingRights,
    parsePositionSetupFen,
    positionSetupToFen,
    setupEnPassantTargets,
    updateSetupCastlingRight,
    updateSetupFullmove,
    updateSetupEnPassant,
    updateSetupHalfmove,
    updateSetupSquare,
    updateSetupTurn,
    type PositionSetup,
    type SetupCastlingRight,
    type SetupPiece,
    type SetupTurn,
} from '../engine/positionSetup'
import { buildFenShareUrl } from '../engine/shareLink'
import { MAX_SHARED_GAME_CHARS, buildGameShareUrl } from '../engine/shareGame'
import { pgnDownloadFilename } from '../engine/pgnFilename'
import { chessComPositionUrl, lichessAnalysisUrl } from '../engine/externalLinks'
import {
    ARCHIVE_SOURCES,
    DEFAULT_ARCHIVE_GAMES,
    MAX_ARCHIVE_GAMES,
    clampArchiveGameCount,
    normalizeArchiveUsername,
    type ArchiveSource,
} from '../engine/gameArchives'
import { fetchArchiveGames } from '../engine/archiveFetch'
import { IconDownload, IconClipboard, IconUpload, IconFlip } from './icons'
import { fenTextForShareLink } from './pgnDialogHelpers'
import { isCompositionKey } from './shortcutKeys'
import { PositionCounterInput } from './PositionCounterInput'
import { PositionSetupBoard } from './PositionSetupBoard'
import { PositionSetupPalette } from './PositionSetupPalette'
import {
    MAX_PGN_IMPORT_BYTES,
    PGN_IMPORT_LIMIT_MESSAGE,
    describeImportSize,
    importTextIsTooBigToShow,
    pgnImportLengthError,
} from './pgnImportLimits'

// Using existing styles from NewGameDialog to maintain design consistency
import './NewGameDialog.css'

type PgnDialogProps = {
    open: boolean
    initialTab?: 'import' | 'fen' | 'export'
    onClose: () => void
    onImport: (pgn: string) => ImportResult
    onLoadFen: (fen: string) => ImportResult
    currentFen: string
    mainLineNodes: GameNode[]
    gameNodes: Map<string, GameNode>
    evaluations: Map<string, EvalSnapshot>
    pgnHeaders: Record<string, string>
    /** The opening on the board, which names a downloaded game that names nothing else. */
    openingName?: string
    /**
     * Add every game in a database file to the library. Absent when there is
     * no library to add to; the dialog then just reports that it cannot take
     * more than one game, which is what it always did.
     */
    onImportManyToLibrary?: (pgns: string[]) => ImportResult & { note?: string }
    /** A PGN dragged onto the window, to be read as though it had been picked. */
    droppedFile?: File | null
    /** Called once that file has been taken, so the same drop is not read twice. */
    onDroppedFileTaken?: () => void
}

type ImportResult = {
    ok: boolean
    error?: string
}

type CopyStatus = 'idle' | 'fen-copied' | 'link-copied' | 'game-link-copied' | 'pgn-copied' | 'failed'

const DEFAULT_EXPORT_OPTIONS: Required<PgnExportOptions> = {
    includeVariations: true,
    includeComments: true,
    includeEngineAnnotations: true,
    includeGlyphs: true,
}

/**
 * What an unusable username is told, whether it is typed at or pressed at.
 *
 * The Fetch button turns itself off for one, which is right and was the whole
 * of it: measured by typing "two words", a forty-character name and
 * "erik?tab=games" into the field and then leaving it, nothing was said while
 * typing, nothing was said on blur, and `aria-invalid` was never set. A reader
 * with a mouse had a dead button and no reason for it anywhere, and a reader on
 * a screen reader had a field that never announced itself as wrong. The
 * sentence existed already -- it was only reachable by pressing Enter.
 */
const ARCHIVE_USERNAME_ERROR = 'That is not a username. Type the name, or paste a link to the profile page.'

const SETUP_CASTLING_OPTIONS: Array<{ right: SetupCastlingRight; label: string; short: string }> = [
    { right: 'K', label: 'White kingside', short: 'K' },
    { right: 'Q', label: 'White queenside', short: 'Q' },
    { right: 'k', label: 'Black kingside', short: 'k' },
    { right: 'q', label: 'Black queenside', short: 'q' },
]

export function PgnDialog({ open, initialTab = 'import', onClose, onImport, onLoadFen, currentFen, mainLineNodes, gameNodes, evaluations, pgnHeaders, openingName, onImportManyToLibrary, droppedFile, onDroppedFileTaken }: PgnDialogProps) {
    const [tab, setTab] = useState<'import' | 'fen' | 'export'>(initialTab)
    const [importText, setImportText] = useState('')
    const [fenText, setFenText] = useState(currentFen)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
    const [downloadFailure, setDownloadFailure] = useState<{ message: string } | null>(null)
    const [copiedText, setCopiedText] = useState<string | null>(null)
    const [exportTextSnapshot, setExportTextSnapshot] = useState<string | null>(null)
    const [exportOptions, setExportOptions] = useState(DEFAULT_EXPORT_OPTIONS)
    const [setup, setSetup] = useState<PositionSetup>(() => parsePositionSetupFen(currentFen) ?? createStartingPositionSetup())
    const [selectedSetupPiece, setSelectedSetupPiece] = useState<SetupPiece | null>('P')
    const [setupFlipped, setSetupFlipped] = useState(false)
    const [shareLinkFallback, setShareLinkFallback] = useState('')
    const [archiveSource, setArchiveSource] = useState<ArchiveSource>('lichess')
    const [archiveUsername, setArchiveUsername] = useState('')
    const [archiveCount, setArchiveCount] = useState(String(DEFAULT_ARCHIVE_GAMES))
    const [archiveBusy, setArchiveBusy] = useState(false)
    const [archiveUsernameBlurred, setArchiveUsernameBlurred] = useState(false)
    const [databaseBusy, setDatabaseBusy] = useState(false)
    /** What `handleImportDatabase` asks; the state is what the button shows. */
    const databaseBusyRef = useRef(false)
    const archiveAbortRef = useRef<AbortController | null>(null)
    const importRequestRef = useRef(0)
    const panelRef = useRef<HTMLDivElement>(null)
    const fenTextRef = useRef<HTMLTextAreaElement>(null)
    const exportTextRef = useRef<HTMLTextAreaElement>(null)
    const downloadFailureRef = useRef<HTMLDivElement>(null)
    const importFileInputRef = useRef<HTMLInputElement>(null)
    const wasOpenRef = useRef(false)
    const [importFileName, setImportFileName] = useState<string | null>(null)
    const titleId = useId()
    const importTextId = useId()
    const fenTextId = useId()
    const exportTextId = useId()
    const halfmoveId = useId()
    const fullmoveId = useId()
    const archiveUserId = useId()
    const archiveCountId = useId()
    const enPassantId = useId()
    const sideHelpId = useId()
    const castlingHelpId = useId()
    const downloadErrorId = useId()
    const feedbackGenerationRef = useRef(0)

    const resetFeedback = useCallback(() => {
        feedbackGenerationRef.current += 1
        setError(null)
        setStatus(null)
        setCopyStatus('idle')
        setDownloadFailure(null)
        setCopiedText(null)
        setExportTextSnapshot(null)
        setShareLinkFallback('')
    }, [])

    // A newer paste, file, or archive choice owns the import box. Cancel the
    // network request and invalidate file reads that cannot themselves abort.
    const cancelPendingImport = useCallback(() => {
        importRequestRef.current += 1
        archiveAbortRef.current?.abort()
        archiveAbortRef.current = null
        setArchiveBusy(false)
    }, [])

    const closeDialog = useCallback(() => {
        cancelPendingImport()
        resetFeedback()
        onClose()
    }, [cancelPendingImport, onClose, resetFeedback])

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

    const archiveSourceInfo = ARCHIVE_SOURCES.find(source => source.id === archiveSource) ?? ARCHIVE_SOURCES[0]
    const archiveGameCount = clampArchiveGameCount(archiveCount.trim() ? Number(archiveCount) : DEFAULT_ARCHIVE_GAMES)
    const archiveUsernameValid = normalizeArchiveUsername(archiveUsername) !== null
    /** Something is typed, it cannot be used, and the reader has moved on from it. */
    const archiveUsernameUnusable = archiveUsernameBlurred
        && archiveUsername.trim().length > 0
        && !archiveUsernameValid

    /**
     * Fetch the reader's own recent games into the box below.
     *
     * The result is dropped into the same textarea a pasted file lands in, so
     * everything downstream -- the multi-game notice, the "add them all to the
     * library" offer, the single-game import -- is the code that already runs
     * for a paste. Nothing here knows what a library is.
     */
    const handleFetchArchive = useCallback(async () => {
        const username = normalizeArchiveUsername(archiveUsername)
        if (!username) {
            setStatus(null)
            setError(ARCHIVE_USERNAME_ERROR)
            return
        }

        cancelPendingImport()
        setArchiveCount(String(archiveGameCount))
        const controller = new AbortController()
        archiveAbortRef.current = controller
        resetFeedback()
        setArchiveBusy(true)
        try {
            const games = await fetchArchiveGames(archiveSource, username, archiveGameCount, { signal: controller.signal })
            if (controller.signal.aborted) return
            if (games.length === 0) {
                setError(`${archiveSourceInfo.label} has no public games for “${username}”.`)
                return
            }
            const text = games.join('\n\n')
            const limitError = pgnImportLengthError(text)
            if (limitError) {
                setError(limitError)
                return
            }
            setImportText(text)
            setImportFileName(`${username} · ${archiveSourceInfo.label}`)
            setStatus(`Fetched ${games.length} ${games.length === 1 ? 'game' : 'games'} for ${username}.`)
        } catch (fetchError) {
            if (controller.signal.aborted) return
            setError(fetchError instanceof Error ? fetchError.message : 'Those games could not be fetched.')
        } finally {
            if (archiveAbortRef.current === controller) {
                archiveAbortRef.current = null
                setArchiveBusy(false)
            }
        }
    }, [archiveGameCount, archiveSource, archiveSourceInfo.label, archiveUsername, cancelPendingImport, resetFeedback])

    // A fetch outlives the dialog otherwise, and finishes into a component that
    // is no longer on screen.
    useEffect(() => () => {
        importRequestRef.current += 1
        archiveAbortRef.current?.abort()
    }, [])

    /**
     * Keep every game in the file.
     *
     * Reading them is the most expensive thing in this dialog -- each is parsed
     * before it is stored, which is 3.1s for the 500 the library holds on a
     * phone's processor -- and it happens on the thread that draws. So the
     * label is changed and the browser given two frames to paint it before the
     * work starts: without that the press produced three seconds of a frozen
     * screen with a button still looking as though it had not been pressed, and
     * the first sign of anything happening was the answer.
     */
    const handleImportDatabase = async () => {
        /*
         * The guard is a ref because `databaseBusy` is state, and state is not
         * readable in the tick it is set. **Measured** with a four-game file:
         * three clicks in one tick put **twelve** games in the library, each
         * press importing the whole file again.
         *
         * The two frames below make that worse rather than better. They are
         * there for a good reason -- see above -- but the button cannot
         * actually disable until React has rendered the label they are waiting
         * for, so the window this opens is the window a second press lands in.
         * A real database file is hundreds of games, and the press that
         * duplicates them is the one a reader makes *because* the screen has
         * not moved yet.
         */
        if (!databaseGames || !onImportManyToLibrary || databaseBusyRef.current) return
        databaseBusyRef.current = true
        setDatabaseBusy(true)
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        try {
            const result = onImportManyToLibrary(databaseGames)
            if (!result.ok) {
                setError(result.error ?? 'Those games could not be added.')
                return
            }
            setError(null)
            setStatus(result.note ?? `Added ${databaseGames.length} games to the library.`)
            setImportText('')
            setImportFileName(null)
        } finally {
            databaseBusyRef.current = false
            setDatabaseBusy(false)
        }
    }

    const handlePickImportFile = () => {
        cancelPendingImport()
        resetFeedback()
        importFileInputRef.current?.click()
    }

    const handleClearImport = () => {
        cancelPendingImport()
        setImportText('')
        setImportFileName(null)
        resetFeedback()
    }

    /**
     * Take a file, whether it was picked or dropped. The picker and the window
     * both end up here so a dragged file meets exactly the same limits, the
     * same messages and the same offer as one chosen through the button.
     */
    const loadImportFile = useCallback(async (file: File) => {
        cancelPendingImport()
        const request = importRequestRef.current
        resetFeedback()
        if (file.size > MAX_PGN_IMPORT_BYTES) {
            setImportFileName(null)
            setError(PGN_IMPORT_LIMIT_MESSAGE)
            return
        }

        try {
            const text = await file.text()
            if (request !== importRequestRef.current) return
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
            if (request !== importRequestRef.current) return
            setImportFileName(null)
            setError('Could not read that PGN file.')
        }
    }, [cancelPendingImport, resetFeedback])

    const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget
        const file = input.files?.[0]
        if (!file) return
        try {
            await loadImportFile(file)
        } finally {
            // Cleared either way, so picking the same file twice is still a change.
            input.value = ''
        }
    }

    // A file dropped on the window. The dialog is opened for it rather than the
    // board being changed behind the reader's back: a drop is a proposal, and
    // this is where proposals are looked at.
    useEffect(() => {
        if (!open || !droppedFile) return
        setTab('import')
        void loadImportFile(droppedFile)
        onDroppedFileTaken?.()
    }, [droppedFile, loadImportFile, onDroppedFileTaken, open])

    const setExportOption = (key: keyof PgnExportOptions, value: boolean) => {
        setExportOptions(options => ({ ...options, [key]: value }))
        resetFeedback()
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
    const displayedExportText = exportTextSnapshot ?? exportText
    useLayoutEffect(() => {
        if (open && downloadFailure) {
            downloadFailureRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
        }
    }, [downloadFailure, open])
    useLayoutEffect(() => {
        // Some browsers activate a button without moving focus. Explicit copy,
        // download or option changes refresh the reading, then hold it again.
        if (exportTextSnapshot === null && exportTextRef.current === document.activeElement) {
            setExportTextSnapshot(exportText)
        }
    }, [exportText, exportTextSnapshot])
    const fenValidation = useMemo(
        () => fenText.trim() ? validateFenForAnalysis(fenText) : null,
        [fenText],
    )
    const rawSetupFields = useMemo(() => fenText.trim().split(/\s+/), [fenText])
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
    const rawTurn = fenText.trim() ? rawSetupFields[1] : setup.turn
    const invalidSetupTurn = rawTurn !== 'w' && rawTurn !== 'b'
    const turnPreview = rawTurn === undefined ? ''
        : truncateUtf16(rawTurn, 32) + (rawTurn.length > 32 ? '…' : '')
    const enPassantTargets = setupEnPassantTargets(setup)
    const rawEnPassant = fenText.trim() ? rawSetupFields[3] : setup.enPassant
    const unavailableEnPassant = rawEnPassant !== '-' && !enPassantTargets.includes(rawEnPassant as Square)
    const enPassantPreview = rawEnPassant === undefined ? 'Missing in FEN'
        : 'Invalid: ' + truncateUtf16(rawEnPassant, 32) + (rawEnPassant.length > 32 ? '…' : '')
    const rawCastling = fenText.trim() ? rawSetupFields[2] : setup.castling
    const invalidSetupCastling = rawCastling === undefined || !/^[KQkq-]+$/.test(rawCastling)
    const castlingPreview = rawCastling === undefined ? ''
        : truncateUtf16(rawCastling, 32) + (rawCastling.length > 32 ? '…' : '')
    const availableCastlingRights = normalizeAvailableCastlingRights(setup)
    const unavailableCastlingRights = setup.castling !== availableCastlingRights
    const showCastlingRepair = invalidSetupCastling || unavailableCastlingRights
    const previewSetupFields = () => {
        const fields = positionSetupToFen(setup).split(' ')
        // Match the declarations and safe counter values shown by the editor.
        fields[2] = setup.castling
        fields[3] = setup.enPassant
        fields[4] = String(parseFenCounterValue(String(setup.halfmove)) ?? 0)
        fields[5] = String(Math.max(1, parseFenCounterValue(String(setup.fullmove)) ?? 1))
        return fields
    }
    const updateRawSetupFields = (updates: ReadonlyArray<readonly [1 | 2 | 3 | 4 | 5, string]>, complete = false) => {
        // Retain existing raw fields. Explicit counter edits can fill missing
        // trailing defaults; other metadata repairs leave them for the reader.
        const trimmed = fenText.trim()
        const fields = trimmed ? trimmed.split(/\s+/) : previewSetupFields()
        const index = complete ? 5 : Math.max(...updates.map(([index]) => index))
        if (fields.length <= index) {
            fields.push(...previewSetupFields().slice(fields.length, index + 1))
        }
        for (const [index, value] of updates) fields[index] = value
        syncFenTextAndSetup(fields.join(' '))
        resetFeedback()
    }
    const clearUnavailableCastlingRights = () => {
        updateRawSetupFields([[2, availableCastlingRights]])
        fenTextRef.current?.focus()
    }
    /**
     * A file too big for the box it landed in.
     *
     * Only the file path: a textarea lays out every character it holds, and
     * pouring a 15,000-game export into one cost 2.4s of frozen screen to show
     * twelve lines of text nobody can read or edit. What the reader needs from
     * a database -- its name, how many games are in it, and the offer to keep
     * them -- is on screen either way.
     */
    const loadedFileIsTooBigToShow = importTextIsTooBigToShow(importText, importFileName !== null)

    /**
     * The games in a pasted database file. Derived from the text rather than
     * set when Import is pressed, because a content error disables Import --
     * so the offer has to appear the moment the file is recognised, which is
     * also when the reader is looking for it.
     */
    const databaseGames = useMemo(
        () => (onImportManyToLibrary && importContentError === PGN_MULTIPLE_GAMES_ERROR
            ? splitPgnGames(importText)
            : null),
        [importContentError, importText, onImportManyToLibrary],
    )

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

    const copyText = async (text: string, success: Exclude<CopyStatus, 'idle' | 'failed'>, fallback = '') => {
        resetFeedback()
        // A permission prompt can outlive the draft, tab, or next copy action.
        const generation = feedbackGenerationRef.current
        try {
            await navigator.clipboard.writeText(text)
            if (generation === feedbackGenerationRef.current) {
                setCopyStatus(success)
                setCopiedText(text)
            }
        } catch {
            if (generation !== feedbackGenerationRef.current) return
            setCopyStatus('failed')
            setShareLinkFallback(fallback)
        }
    }

    const handleCopy = () => copyText(exportText, 'pgn-copied')
    const selectForManualCopy = (field: HTMLTextAreaElement | null) => {
        field?.focus()
        field?.select()
    }

    const handleDownload = () => {
        resetFeedback()
        let url: string | undefined
        let link: HTMLAnchorElement | undefined
        try {
            const blob = new Blob([exportText], { type: 'application/x-chess-pgn;charset=utf-8' })
            url = URL.createObjectURL(blob)
            link = document.createElement('a')
            link.href = url
            link.download = pgnDownloadFilename(pgnHeaders, openingName)
            document.body.append(link)
            link.click()
        } catch {
            setDownloadFailure({ message: 'PGN download failed.' })
        } finally {
            link?.remove()
            if (url) {
                const downloadUrl = url
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
            }
        }
    }

    const handleUseCurrentFen = () => {
        resetFeedback()
        syncFenTextAndSetup(currentFen)
    }

    const handleCopyFen = () => copyText(fenText.trim(), 'fen-copied')

    /**
     * The whole game in a link, where "Copy Share Link" on the FEN tab shares
     * only the position it reached. Refused rather than truncated past the
     * decoder's own bound — half a game in a link is worse than being told to
     * send the PGN.
     */
    // The main-line position on the board, so the link opens where the sender
    // is looking. A position off the main line is not in the link at all, and
    // opens at the end as before.
    const sharedPly = mainLineNodes.findIndex(node => node.fen === currentFen)
    const gameShareOpensMidGame = sharedPly >= 0 && sharedPly < mainLineNodes.length - 1
    const gameShareUrl = mainLineNodes.length > 1
        ? buildGameShareUrl(
            mainLineNodes[0]?.fen ?? currentFen,
            mainLineNodes.slice(1).map(node => node.uci).filter(Boolean),
            typeof window === 'undefined' ? 'https://localhost/' : window.location.href,
            sharedPly >= 0 ? sharedPly : undefined,
        )
        : null
    const fenShareUrl = fenShareValidation.ok
        ? buildFenShareUrl(fenTextForShareLink(fenText, currentFen),
            typeof window === 'undefined' ? 'https://localhost/' : window.location.href)
        : ''
    const gameShareTooLong = Boolean(gameShareUrl && gameShareUrl.length > MAX_SHARED_GAME_CHARS)
    /**
     * The same game on Lichess's board. A link rather than a button that
     * opens a window, because a link is never popup-blocked and can be
     * copied or opened however the reader likes.
     */
    const lichessUrl = lichessAnalysisUrl({
        rootFen: mainLineNodes[0]?.fen ?? currentFen,
        sanMoves: mainLineNodes.slice(1).map(node => node.san),
        fen: currentFen,
    })
    const gameShareDisabledReason = !gameShareUrl
        ? 'Play or import a game first — there are no moves to share.'
        : gameShareTooLong
            ? 'This game is too long for a link. Copy or download the PGN instead.'
            : null

    const handleCopyGameLink = async () => {
        resetFeedback()
        if (!gameShareUrl || gameShareTooLong) return
        await copyText(gameShareUrl, 'game-link-copied', gameShareUrl)
    }

    const handleCopyShareLink = async () => {
        resetFeedback()
        const fenToShare = fenTextForShareLink(fenText, currentFen)
        const validation = validateFenForAnalysis(fenToShare)
        if (!validation.ok) {
            setError(validation.error)
            return
        }

        await copyText(fenShareUrl, 'link-copied', fenShareUrl)
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
                                    cancelPendingImport()
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
                                    cancelPendingImport()
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
                                    cancelPendingImport()
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
                            <span className="dialog-label" id={`${archiveUserId}-label`}>Bring in your own games</span>
                            <div className="archive-fetch">
                                <div className="archive-source-row" role="group" aria-label="Where to fetch games from">
                                    {ARCHIVE_SOURCES.map(source => (
                                        <button
                                            key={source.id}
                                            type="button"
                                            className={`archive-source-btn ${archiveSource === source.id ? 'selected' : ''}`}
                                            aria-pressed={archiveSource === source.id}
                                            onClick={() => {
                                                cancelPendingImport()
                                                resetFeedback()
                                                setArchiveSource(source.id)
                                            }}
                                        >
                                            {source.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="archive-fetch-row">
                                    <input
                                        id={archiveUserId}
                                        className="archive-input"
                                        type="text"
                                        inputMode="text"
                                        autoComplete="off"
                                        autoCapitalize="off"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        placeholder={archiveSourceInfo.placeholder}
                                        aria-label={`Your ${archiveSourceInfo.label} username`}
                                        value={archiveUsername}
                                        // Only after the reader has left it: saying "that is not a
                                        // username" after the first letter of one is worse than saying
                                        // nothing.
                                        aria-invalid={archiveUsernameUnusable || undefined}
                                        aria-describedby={archiveUsernameUnusable ? `${archiveUserId}-error` : undefined}
                                        onChange={event => {
                                            cancelPendingImport()
                                            resetFeedback()
                                            setArchiveUsername(event.target.value)
                                            setArchiveUsernameBlurred(false)
                                        }}
                                        onBlur={() => setArchiveUsernameBlurred(true)}
                                        onKeyDown={event => {
                                            if (event.key !== 'Enter' || isCompositionKey(event.nativeEvent)) return
                                            event.preventDefault()
                                            void handleFetchArchive()
                                        }}
                                    />
                                    <div className="archive-count">
                                        <label htmlFor={archiveCountId}>Games</label>
                                        <input
                                            id={archiveCountId}
                                            type="number"
                                            min={1}
                                            max={MAX_ARCHIVE_GAMES}
                                            value={archiveCount}
                                            onChange={event => {
                                                cancelPendingImport()
                                                resetFeedback()
                                                setArchiveCount(event.target.value)
                                            }}
                                            onBlur={() => setArchiveCount(String(archiveGameCount))}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className={`${archiveBusy ? 'btn-cancel' : 'btn-start'} archive-fetch-btn`}
                                        onClick={() => {
                                            if (archiveBusy) {
                                                cancelPendingImport()
                                                setStatus('Fetch canceled. Your import text is unchanged.')
                                            } else {
                                                void handleFetchArchive()
                                            }
                                        }}
                                        disabled={!archiveBusy && !archiveUsernameValid}
                                    >
                                        {archiveBusy ? 'Cancel fetch' : 'Fetch'}
                                    </button>
                                </div>
                                {archiveUsernameUnusable ? (
                                    <p className="dialog-error" id={`${archiveUserId}-error`} role="alert">
                                        {ARCHIVE_USERNAME_ERROR}
                                    </p>
                                ) : (
                                    <p className="archive-hint" role="status">
                                        {archiveBusy ? 'Fetching games…' : 'Public games, no sign-in. They land in the box below, newest first.'}
                                    </p>
                                )}
                            </div>
                            <label className="dialog-label archive-paste-label" htmlFor={importTextId}>Or paste Portable Game Notation</label>
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
                            {loadedFileIsTooBigToShow ? (
                                <div className="dialog-file-summary">
                                    <p>
                                        {databaseGames
                                            ? `${databaseGames.length.toLocaleString()} games`
                                            : 'One game'}
                                        {` · ${describeImportSize(importText.length)} · too much to show here.`}
                                    </p>
                                    <button type="button" className="btn-cancel" onClick={handleClearImport}>
                                        Clear
                                    </button>
                                </div>
                            ) : (
                                <textarea
                                    id={importTextId}
                                    className="input-textarea"
                                    placeholder="[Event &quot;FIDE World Cup 2023&quot;]..."
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    value={importText}
                                    onChange={e => {
                                        cancelPendingImport()
                                        resetFeedback()
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
                                    aria-describedby={error ? `${importTextId}-error` : undefined}
                                />
                            )}
                            {error && <p id={`${importTextId}-error`} className="dialog-error" role="alert">{error}</p>}
                            {databaseGames && databaseGames.length > 1 && (
                                <div className="dialog-database-offer">
                                    <button
                                        type="button"
                                        className="btn-start"
                                        onClick={() => void handleImportDatabase()}
                                        disabled={databaseBusy}
                                    >
                                        {databaseBusy
                                            ? 'Adding…'
                                            : `Add ${databaseGames.length.toLocaleString()} games to the library`}
                                    </button>
                                </div>
                            )}
                            {status && <p className="library-status" role="status">{status}</p>}
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
                                <button type="button" className="btn-cancel" aria-pressed={setupFlipped}
                                    onClick={() => setSetupFlipped(flipped => !flipped)}>
                                    <IconFlip /> Flip board
                                </button>
                                <button type="button" className="btn-cancel" onClick={handleCopyFen} disabled={!fenText.trim()}>
                                    {copyStatus === 'fen-copied' && copiedText === fenText.trim() ? 'Copied FEN' : 'Copy FEN'}
                                </button>
                                <button type="button" className="btn-cancel" onClick={handleCopyShareLink} disabled={!canCopyShareLink}>
                                    <IconClipboard /> {copyStatus === 'link-copied' && copiedText === fenShareUrl ? 'Copied Link' : 'Copy Share Link'}
                                </button>
                            </div>
                            <div className="fen-setup-card" role="group" aria-label="Position setup">
                                <PositionSetupPalette selectedPiece={selectedSetupPiece} onSelect={setSelectedSetupPiece} />
                                <div className="fen-setup-grid">
                                    <PositionSetupBoard pieces={setup.pieces} selectedPiece={selectedSetupPiece} flipped={setupFlipped}
                                        onPlace={square => applySetupChange(current => updateSetupSquare(current, square, selectedSetupPiece))} />
                                    <div className="fen-setup-controls">
                                        <div className="fen-setup-control-block">
                                            <span className="dialog-label">Side</span>
                                            <div className="fen-side-toggle" role="group" aria-label="Side to move"
                                                aria-invalid={invalidSetupTurn || undefined}
                                                aria-describedby={invalidSetupTurn ? sideHelpId : undefined}>
                                                {([
                                                    { value: 'w', label: 'White' },
                                                    { value: 'b', label: 'Black' },
                                                ] as Array<{ value: SetupTurn; label: string }>).map(option => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        className={`mode-card fen-side-btn ${rawTurn === option.value ? 'selected' : ''}`}
                                                        aria-pressed={rawTurn === option.value}
                                                        onClick={() => {
                                                            const next = updateSetupTurn(setup, option.value)
                                                            // A missing EP field has no declaration to adjust.
                                                            updateRawSetupFields(next.turn === setup.turn || (Boolean(fenText.trim()) && rawSetupFields[3] === undefined)
                                                                ? [[1, next.turn]]
                                                                : [[1, next.turn], [3, next.enPassant]])
                                                        }}
                                                    >
                                                        <strong>{option.label}</strong>
                                                    </button>
                                                ))}
                                            </div>
                                            {invalidSetupTurn && <p id={sideHelpId} className="fen-setup-help fen-setup-raw-help">
                                                {rawTurn === undefined ? 'Missing in FEN.' : `FEN: “${turnPreview}”.`} Choose White or Black.
                                            </p>}
                                        </div>
                                        <div className="fen-setup-control-block">
                                            <span className="dialog-label">Castling</span>
                                            <div className="fen-castling-grid" role="group" aria-label="Castling rights"
                                                aria-invalid={showCastlingRepair || undefined}
                                                aria-describedby={showCastlingRepair ? castlingHelpId : undefined}>
                                                {SETUP_CASTLING_OPTIONS.map(option => {
                                                    const canCastle = canUseSetupCastlingRight(setup, option.right)
                                                    const declared = setup.castling.includes(option.right)
                                                    return (
                                                        <label
                                                            key={option.right}
                                                            className={`dialog-check-option fen-castling-option ${canCastle ? '' : 'disabled'}`}
                                                            title={canCastle ? option.label : `${option.label} needs the home king and rook`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                aria-label={option.label}
                                                                checked={declared}
                                                                disabled={!canCastle}
                                                                aria-invalid={declared && !canCastle || undefined}
                                                                aria-describedby={declared && !canCastle ? castlingHelpId : undefined}
                                                                onChange={event => {
                                                                    updateRawSetupFields([[2, updateSetupCastlingRight(setup, option.right, event.target.checked).castling]])
                                                                }}
                                                            />
                                                            <span>{option.short}</span>
                                                            <small>{canCastle ? option.label : 'Needs home king + rook'}</small>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                            {showCastlingRepair && <>
                                                <p id={castlingHelpId} className={`fen-setup-help${invalidSetupCastling ? ' fen-setup-raw-help' : ''}`}>
                                                    {invalidSetupCastling
                                                        ? <>{rawCastling === undefined ? 'Missing in FEN.' : `FEN: “${castlingPreview}”.`} Use the checked rights that have their home king and rook, or edit the FEN.</>
                                                        : 'Some declared castling rights are unavailable. Clear them, or correct the home king and rook.'}
                                                </p>
                                                <button type="button" className="btn-cancel" onClick={clearUnavailableCastlingRights}>
                                                    {invalidSetupCastling ? 'Fix castling' : 'Clear unavailable castling rights'}
                                                </button>
                                            </>}
                                        </div>
                                        <div className="fen-setup-control-block">
                                            <span className="dialog-label">Counters</span>
                                            <div className="fen-counter-grid">
                                                <div className="fen-counter-field">
                                                    <label htmlFor={halfmoveId}>Halfmove</label>
                                                    <PositionCounterInput
                                                        id={halfmoveId}
                                                        min={0}
                                                        value={setup.halfmove}
                                                        rawValue={rawSetupFields[4]}
                                                        position={setup}
                                                        onValueChange={value => updateRawSetupFields([[4, String(updateSetupHalfmove(setup, value).halfmove)]], true)}
                                                    />
                                                </div>
                                                <div className="fen-counter-field">
                                                    <label htmlFor={fullmoveId}>Fullmove</label>
                                                    <PositionCounterInput
                                                        id={fullmoveId}
                                                        min={1}
                                                        value={setup.fullmove}
                                                        rawValue={rawSetupFields[5]}
                                                        position={setup}
                                                        onValueChange={value => updateRawSetupFields([[5, String(updateSetupFullmove(setup, value).fullmove)]], true)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="fen-setup-control-block">
                                            <label className="fen-counter-field" htmlFor={enPassantId}>
                                                <span>En passant target</span>
                                                <select id={enPassantId}
                                                    value={rawEnPassant ?? ''}
                                                    aria-invalid={unavailableEnPassant || undefined}
                                                    aria-describedby={`${enPassantId}-help`}
                                                    onChange={event => updateRawSetupFields([[3,
                                                        updateSetupEnPassant(setup, event.target.value as Square | '-').enPassant]])}>
                                                    <option value="-">None</option>
                                                    {unavailableEnPassant && <option value={rawEnPassant ?? ''}>{enPassantPreview}</option>}
                                                    {enPassantTargets.map(square => <option key={square} value={square}>{square}</option>)}
                                                </select>
                                            </label>
                                            <p id={`${enPassantId}-help`} className="fen-setup-help">
                                                {unavailableEnPassant
                                                    ? rawEnPassant === undefined
                                                        ? 'Missing in FEN. Choose None or an available square.'
                                                        : 'This target is invalid. Choose None or an available square, or correct the board.'
                                                    : 'The square crossed by a pawn that just moved two squares.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <textarea
                                id={fenTextId}
                                ref={fenTextRef}
                                className="input-textarea fen-textarea"
                                /* FEN is case-sensitive: a phone capitalising
                                   the first letter turns Black's rook White. */
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                                value={fenText}
                                onChange={e => {
                                    syncFenTextAndSetup(e.target.value)
                                    resetFeedback()
                                }}
                                aria-invalid={Boolean(error || fenValidationError)}
                                aria-describedby={error || fenValidationError ? `${fenTextId}-error` : undefined}
                            />
                            {error && <p id={`${fenTextId}-error`} className="dialog-error" role="alert">{error}</p>}
                            {!error && fenValidationError && (
                                <p id={`${fenTextId}-error`} className="dialog-error" role="status">{fenValidationError}</p>
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
                                    <div className="dialog-share-fallback">
                                        <p className="dialog-error" role="alert">Clipboard access failed. Select the FEN text and copy it manually.</p>
                                        <button type="button" className="btn-cancel" onClick={() => selectForManualCopy(fenTextRef.current)}>
                                            Select FEN text
                                        </button>
                                    </div>
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
                                ref={exportTextRef}
                                className="input-textarea"
                                readOnly
                                value={displayedExportText}
                                onFocus={event => setExportTextSnapshot(event.currentTarget.value)}
                                onBlur={() => setExportTextSnapshot(null)}
                                aria-describedby={`${exportTextId}-help`}
                            />
                            <p id={`${exportTextId}-help`} className="dialog-export-help">
                                Text stays still while focused; updates resume when you leave this field.
                            </p>
                            {downloadFailure && (
                                <div ref={downloadFailureRef} id={downloadErrorId} className="dialog-share-fallback" role="alert">
                                    <p className="dialog-error">{downloadFailure.message}</p>
                                    <button type="button" className="btn-cancel" onClick={() => selectForManualCopy(exportTextRef.current)}>
                                        Select PGN text
                                    </button>
                                </div>
                            )}
                            {/* Two buttons on this tab can fail, and they fail
                                differently. The PGN is already in the box above, so
                                "select the text" is a real instruction for it. The
                                game link is not: it was built, stored in
                                `shareLinkFallback`, and -- until this branch existed
                                -- rendered only on the FEN tab, so a reader whose
                                clipboard was blocked got told to copy text that did
                                not contain the link they asked for, and had no way
                                to reach it at all. */}
                            {copyStatus === 'failed' && (
                                shareLinkFallback ? (
                                    <div className="dialog-share-fallback" role="alert">
                                        <p className="dialog-error">Clipboard access failed. Select the game link and copy it manually.</p>
                                        <input
                                            type="text"
                                            readOnly
                                            value={shareLinkFallback}
                                            aria-label="Game link fallback"
                                            onFocus={event => event.currentTarget.select()}
                                        />
                                    </div>
                                ) : (
                                    <div className="dialog-share-fallback">
                                        <p className="dialog-error" role="alert">Clipboard access failed. Select the text and copy it manually.</p>
                                        <button type="button" className="btn-cancel" onClick={() => selectForManualCopy(exportTextRef.current)}>
                                            Select PGN text
                                        </button>
                                    </div>
                                )
                            )}
                            {/* Under the output rather than in the button row, which
                                already holds four actions at the dialog's width. */}
                            <p className="dialog-external-link">
                                <a
                                    href={lichessUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={mainLineNodes.length > 1
                                        ? 'Open this game on the Lichess analysis board'
                                        : 'Open this position on the Lichess analysis board'}
                                >
                                    Open in Lichess ↗
                                </a>
                                {' · '}
                                <a
                                    href={chessComPositionUrl(currentFen)}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open this position on the chess.com analysis board"
                                >
                                    Open in chess.com ↗
                                </a>
                            </p>
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
                        <button type="button" className="btn-cancel" onClick={handleDownload}
                            aria-describedby={downloadFailure ? downloadErrorId : undefined}>
                            Download PGN
                        </button>
                        <button
                            type="button"
                            className="btn-cancel"
                            onClick={handleCopyGameLink}
                            disabled={Boolean(gameShareDisabledReason)}
                            title={gameShareDisabledReason ?? (gameShareOpensMidGame
                                ? 'A link to this whole game that opens at the move on the board'
                                : 'A link that opens this whole game, not just the position')}
                            aria-label={gameShareDisabledReason
                                ? `Copy game link unavailable. ${gameShareDisabledReason}`
                                : gameShareOpensMidGame
                                    ? 'Copy a link to this whole game, opening at this move'
                                    : 'Copy a link to this whole game'}
                        >
                            <IconClipboard /> {copyStatus === 'game-link-copied' && copiedText === gameShareUrl ? 'Copied Link' : 'Copy Game Link'}
                        </button>
                        <button type="button" className="btn-start" onClick={handleCopy}>
                            {copyStatus === 'pgn-copied' && copiedText === displayedExportText ? 'Copied' : 'Copy PGN'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
