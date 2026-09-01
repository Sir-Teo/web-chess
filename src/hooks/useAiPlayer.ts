import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess, type Move } from 'chess.js'
import {
    detectEngineCapabilities,
    profileById,
    recommendedThreadCount,
    resolveProfile,
    type EngineCapabilities,
    type EngineProfile,
} from '../engine/profiles'
import { createStockfishWorker } from '../engine/stockfishWorker'
import {
    fetchTablebase,
    isTablebaseEligible,
    type TablebaseResult,
} from '../engine/tablebase'
import type { AiSearchHistory } from '../engine/playMode'
import { buildPositionCommand } from '../engine/uci'

export type AiDifficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

// Per Stockfish.js docs: UCI_LimitStrength + UCI_Elo (range 1320-3190)
// Skill Level alone is coarser (0-20) so we use Elo for a richer difficulty curve.
const DIFFICULTY_ELO: Record<AiDifficulty, number> = {
    1: 1320,
    2: 1500,
    3: 1700,
    4: 1900,
    5: 2100,
    6: 2300,
    7: 2600,
    8: 3190,
}

// movetime in ms per difficulty — give easier levels more think time
// so they can choose from more moves (and still not feel instant)
const DIFFICULTY_MOVETIME: Record<AiDifficulty, number> = {
    1: 200,
    2: 300,
    3: 400,
    4: 500,
    5: 700,
    6: 1000,
    7: 1500,
    8: 2000,
}

const BEGINNER_RANDOM_MOVE_CHANCE: Partial<Record<AiDifficulty, number>> = {
    1: 0.38,
    2: 0.20,
}
const EXACT_TABLEBASE_DIFFICULTY: AiDifficulty = 8
const TABLEBASE_AI_TIMEOUT_MS = 2500
const TABLEBASE_AI_ABORT_MESSAGE = 'AI tablebase request aborted.'

export const DIFFICULTY_LABELS: Record<AiDifficulty, string> = {
    1: 'Beginner',
    2: 'Novice',
    3: 'Club',
    4: 'Intermediate',
    5: 'Advanced',
    6: 'Expert',
    7: 'Master',
    8: 'Maximum',
}

/**
 * The options that set the opponent's strength, and only the ones the engine
 * will read.
 *
 * Stockfish documents that **`UCI_Elo` takes precedence over `Skill Level`**:
 * with `UCI_LimitStrength` on it derives its own internal level from the Elo
 * and the `Skill Level` option is not consulted. So every level below Maximum
 * was sending a third option the engine ignored -- and, worse, one that reads
 * as a second, disagreeing strength control to anyone in the Engine Lab
 * watching the values.
 *
 * Maximum is the exception and its `Skill Level 20` is load-bearing. It turns
 * `UCI_LimitStrength` *off*, at which point `Skill Level` starts being read
 * again -- and whatever an earlier difficulty left behind would silently
 * weaken the "Maximum" opponent. Sending 20 is what undoes that.
 */
export function aiDifficultyCommands(difficulty: AiDifficulty): string[] {
    if (difficulty === 8) {
        return [
            'setoption name UCI_LimitStrength value false',
            'setoption name Skill Level value 20',
        ]
    }

    return [
        'setoption name UCI_LimitStrength value true',
        `setoption name UCI_Elo value ${DIFFICULTY_ELO[difficulty]}`,
    ]
}

/**
 * How many threads the opponent searches on.
 *
 * One at every difficulty but Maximum, and that is not a compromise: one to
 * seven set `UCI_LimitStrength` with a `UCI_Elo`, and an Elo-capped search does
 * not get stronger with more threads. It would burn eight cores to keep playing
 * like a 1320. Maximum is the setting that turns the limit off, so it is the
 * only one where the cores buy anything -- roughly seven times the nodes in the
 * same 2000ms budget, measured in `docs/architecture.md`.
 *
 * Whether Maximum should mean maximum is the question that section leaves open.
 * It should: it is the level whose whole definition is "no limit", it is chosen
 * deliberately, and it is only busy for the two seconds it is thinking.
 */
export function aiThreadCount(
    profile: EngineProfile,
    capabilities: EngineCapabilities,
    difficulty: AiDifficulty,
): number {
    if (difficulty !== 8) return 1
    return recommendedThreadCount(profile, capabilities)
}

type AiStatus = 'loading' | 'ready' | 'thinking' | 'stopping' | 'error' | 'disabled'
const STOPPED_SEARCH_ACK_TIMEOUT_MS = 10_000

export function consumeStoppedSearchBestMove(pendingStoppedSearches: number): {
    ignore: boolean
    remaining: number
} {
    if (!Number.isFinite(pendingStoppedSearches) || pendingStoppedSearches <= 0) {
        return { ignore: false, remaining: 0 }
    }

    return { ignore: true, remaining: Math.max(0, Math.floor(pendingStoppedSearches) - 1) }
}

export function addStoppedSearchBestMoveAck(pendingStoppedSearches: number): number {
    if (!Number.isFinite(pendingStoppedSearches) || pendingStoppedSearches <= 0) return 1
    return Math.floor(pendingStoppedSearches) + 1
}

function moveToUci(move: Move): string {
    return `${move.from}${move.to}${move.promotion ?? ''}`
}

export function pickBeginnerVarietyMove(
    fen: string,
    difficulty: AiDifficulty,
    random = Math.random,
): string | null {
    const chance = BEGINNER_RANDOM_MOVE_CHANCE[difficulty]
    if (!chance) return null
    if (random() >= chance) return null

    try {
        const chess = new Chess(fen)
        const moves = chess.moves({ verbose: true })
        if (!moves.length) return null
        const index = Math.min(moves.length - 1, Math.floor(random() * moves.length))
        return moveToUci(moves[index]!)
    } catch {
        return null
    }
}

export function pickExactTablebaseMove(result: TablebaseResult | null): string | null {
    return result?.moves[0]?.uci ?? null
}

function abortLinkedController(controller: AbortController, signal?: AbortSignal) {
    const reason = signal?.reason
    controller.abort(reason instanceof Error ? reason : new Error(TABLEBASE_AI_ABORT_MESSAGE))
}

export async function fetchExactTablebaseMove(
    fen: string,
    difficulty: AiDifficulty,
    signal?: AbortSignal,
): Promise<string | null> {
    if (difficulty !== EXACT_TABLEBASE_DIFFICULTY) return null
    if (!isTablebaseEligible(fen)) return null

    const controller = new AbortController()
    let onAbort: (() => void) | null = null

    if (signal?.aborted) {
        abortLinkedController(controller, signal)
    } else if (signal) {
        onAbort = () => abortLinkedController(controller, signal)
        signal.addEventListener('abort', onAbort, { once: true })
    }

    const timeout = setTimeout(
        () => controller.abort(new Error('AI tablebase request timed out.')),
        TABLEBASE_AI_TIMEOUT_MS,
    )
    try {
        return pickExactTablebaseMove(await fetchTablebase(fen, controller.signal))
    } catch {
        return null
    } finally {
        clearTimeout(timeout)
        if (signal && onAbort) signal.removeEventListener('abort', onAbort)
    }
}

export function useAiPlayer(enabled = true) {
    const workerRef = useRef<Worker | null>(null)
    const isReadyRef = useRef(false)
    const resolveRef = useRef<((move: string | null) => void) | null>(null)
    const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const stopAckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const tablebaseRequestControllerRef = useRef<AbortController | null>(null)
    const ignoredBestMoveCountRef = useRef(0)
    /**
     * The thread count this worker was last told, and how many `readyok`s are
     * still owed before it is safe to search.
     *
     * `setoption name Threads` tears down and rebuilds the engine's thread
     * pool, and on the multi-threaded WASM build a `go` issued in the same tick
     * as that rebuild never answers -- one `go`, no `bestmove`, the engine
     * stuck for good. That is the hang `useStockfishEngine` records, and it is
     * the reason the opponent had no thread count at all: there was nowhere
     * safe to put one without a handshake. This is the handshake.
     */
    const appliedThreadsRef = useRef<number | null>(null)
    const awaitingReadyRef = useRef(0)
    const [status, setStatus] = useState<AiStatus>('loading')
    const [profileName, setProfileName] = useState('Stockfish')
    /**
     * The build to fall back to when the chosen one will not boot.
     *
     * The analysis engine has had this since it existed; the opponent had not,
     * and the two degrade very differently. Analysis without its preferred
     * build is analysis on fewer threads. An opponent without its build is no
     * opponent at all: `requestMove` returns null forever and the engine simply
     * never plays, which is a game that cannot be started rather than a game
     * that is a little weaker.
     *
     * `lite-single-local` is the floor -- no isolation, no pthreads, nothing to
     * fail past -- so a failure there is a real failure and stops here.
     */
    const [fallbackProfileId, setFallbackProfileId] = useState<'lite-single-local' | null>(null)
    /** What the Play panel reports, so "Maximum" can say what it is costing. */
    const [threadCount, setThreadCount] = useState(1)
    const difficultyRef = useRef<AiDifficulty>(4)

    const clearRequestTimeout = useCallback(() => {
        if (!requestTimeoutRef.current) return
        clearTimeout(requestTimeoutRef.current)
        requestTimeoutRef.current = null
    }, [])

    const clearStopAckTimeout = useCallback(() => {
        if (!stopAckTimeoutRef.current) return
        clearTimeout(stopAckTimeoutRef.current)
        stopAckTimeoutRef.current = null
    }, [])

    const cancelTablebaseRequest = useCallback(() => {
        const controller = tablebaseRequestControllerRef.current
        if (!controller) return
        tablebaseRequestControllerRef.current = null
        controller.abort(new Error(TABLEBASE_AI_ABORT_MESSAGE))
    }, [])

    const releaseStoppedSearch = useCallback(() => {
        ignoredBestMoveCountRef.current = 0
        clearStopAckTimeout()
        if (enabled && workerRef.current && isReadyRef.current) {
            setStatus('ready')
        }
    }, [clearStopAckTimeout, enabled])

    const settleRequest = useCallback((move: string | null) => {
        clearRequestTimeout()
        const resolve = resolveRef.current
        resolveRef.current = null
        resolve?.(move)
    }, [clearRequestTimeout])

    const finishRequest = useCallback((move: string | null, nextStatus: AiStatus) => {
        settleRequest(move)
        setStatus(nextStatus)
    }, [settleRequest])

    /**
     * Set the opponent's strength, and the thread count that strength wants.
     *
     * Returns whether it is safe to search straight after. It is not when the
     * thread count changed: the pool is being rebuilt, an `isready` is
     * outstanding, and a `go` before its `readyok` is the hang described on
     * `appliedThreadsRef`. The caller waits for `ready` and asks again.
     */
    const applyStrength = useCallback((
        worker: Worker,
        difficulty: AiDifficulty,
        profile: EngineProfile,
        capabilities: EngineCapabilities,
    ): boolean => {
        for (const command of aiDifficultyCommands(difficulty)) {
            worker.postMessage(command)
        }

        const threads = aiThreadCount(profile, capabilities, difficulty)
        if (appliedThreadsRef.current === threads) return true

        appliedThreadsRef.current = threads
        worker.postMessage(`setoption name Threads value ${threads}`)
        awaitingReadyRef.current += 1
        isReadyRef.current = false
        setStatus('loading')
        worker.postMessage('isready')
        return false
    }, [])

    // Boot a fresh Stockfish worker for the AI player.
    useEffect(() => {
        let active = true
        let worker: Worker | null = null
        let workerBlobUrl: string | undefined

        if (!enabled) {
            workerRef.current = null
            isReadyRef.current = false
            cancelTablebaseRequest()
            settleRequest(null)
            queueMicrotask(() => {
                if (active) setStatus('disabled')
            })
            return () => {
                active = false
            }
        }

        const capabilities = detectEngineCapabilities()
        const profile = fallbackProfileId
            ? profileById(fallbackProfileId)
            : resolveProfile('auto', capabilities)

        try {
            const created = createStockfishWorker(profile)
            worker = created.worker
            workerBlobUrl = created.blobUrl
        } catch {
            const canFallBack = profile.id !== 'lite-single-local'
            queueMicrotask(() => {
                if (!active) return
                setStatus(canFallBack ? 'loading' : 'error')
                if (canFallBack) setFallbackProfileId('lite-single-local')
            })
            return () => {
                active = false
                if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl)
            }
        }

        workerRef.current = worker
        isReadyRef.current = false
        appliedThreadsRef.current = null
        awaitingReadyRef.current = 0
        queueMicrotask(() => {
            if (active) {
                setProfileName(profile.name)
                setThreadCount(aiThreadCount(profile, capabilities, difficultyRef.current))
            }
        })

        const failWorker = () => {
            isReadyRef.current = false
            ignoredBestMoveCountRef.current = 0
            cancelTablebaseRequest()
            clearStopAckTimeout()
            // 'loading' rather than 'error' when there is somewhere to fall
            // back to: the effect is about to re-run with the simpler build, and
            // reporting a failure the app is in the middle of recovering from
            // puts a red card on screen for as long as a boot takes.
            const canFallBack = profile.id !== 'lite-single-local'
            finishRequest(null, canFallBack ? 'loading' : 'error')
            if (workerRef.current === worker) workerRef.current = null
            try {
                worker?.terminate()
            } catch {
                // Ignore shutdown errors from workers that are already gone.
            }
            if (canFallBack) setFallbackProfileId('lite-single-local')
        }

        worker.onmessage = (event: MessageEvent<unknown>) => {
            if (!active) return
            if (typeof event.data !== 'string') return
            const lines = event.data.split(/\r?\n/g).map(line => line.trim()).filter(Boolean)

            for (const line of lines) {
                if (line.startsWith('__BOOT_ERROR__:')) {
                    failWorker()
                    return
                }

                if (line === 'uciok') {
                    worker?.postMessage('isready')
                }

                if (line === 'readyok' && worker) {
                    if (awaitingReadyRef.current > 0) awaitingReadyRef.current -= 1
                    // Re-applied on every handshake, which is cheap and means
                    // the record of what the worker has been told cannot drift
                    // from what it was actually sent.
                    applyStrength(worker, difficultyRef.current, profile, capabilities)
                    if (awaitingReadyRef.current > 0) continue
                    isReadyRef.current = true
                    setStatus('ready')
                }

                if (line.startsWith('bestmove ')) {
                    const stoppedSearchAck = consumeStoppedSearchBestMove(ignoredBestMoveCountRef.current)
                    if (stoppedSearchAck.ignore) {
                        ignoredBestMoveCountRef.current = stoppedSearchAck.remaining
                        if (ignoredBestMoveCountRef.current === 0) {
                            clearStopAckTimeout()
                        }
                        if (!resolveRef.current && workerRef.current && isReadyRef.current) {
                            setStatus('ready')
                        }
                        continue
                    }

                    const parts = line.split(' ')
                    const move = parts[1] ?? null
                    finishRequest(move === '(none)' ? null : move, 'ready')
                }
            }
        }

        worker.onerror = () => {
            if (!active) return
            failWorker()
        }

        worker.postMessage('uci')

        return () => {
            active = false
            try { worker?.postMessage('quit') } catch { /* already gone */ }
            worker?.terminate()
            workerRef.current = null
            isReadyRef.current = false
            ignoredBestMoveCountRef.current = 0
            cancelTablebaseRequest()
            clearStopAckTimeout()
            settleRequest(null)
            if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl)
        }
    }, [applyStrength, cancelTablebaseRequest, clearStopAckTimeout, enabled, fallbackProfileId, finishRequest, settleRequest])

    const setDifficulty = useCallback((difficulty: AiDifficulty) => {
        difficultyRef.current = difficulty
        const worker = workerRef.current
        if (!worker || !isReadyRef.current) return
        const capabilities = detectEngineCapabilities()
        const profile = fallbackProfileId
            ? profileById(fallbackProfileId)
            : resolveProfile('auto', capabilities)
        setThreadCount(aiThreadCount(profile, capabilities, difficulty))
        applyStrength(worker, difficulty, profile, capabilities)
    }, [applyStrength, fallbackProfileId])

    const cancelRequest = useCallback(() => {
        const worker = workerRef.current
        cancelTablebaseRequest()
        clearRequestTimeout()
        if (resolveRef.current) {
            if (worker) {
                ignoredBestMoveCountRef.current = addStoppedSearchBestMoveAck(ignoredBestMoveCountRef.current)
                setStatus('stopping')
                clearStopAckTimeout()
                stopAckTimeoutRef.current = setTimeout(releaseStoppedSearch, STOPPED_SEARCH_ACK_TIMEOUT_MS)
            }
            try { worker?.postMessage('stop') } catch { /* worker may already be gone */ }
            settleRequest(null)
            return
        }
        if (enabled && worker && isReadyRef.current) setStatus('ready')
    }, [cancelTablebaseRequest, clearRequestTimeout, clearStopAckTimeout, enabled, releaseStoppedSearch, settleRequest])

    /** Request the engine to pick a move for the given position.
     *  Returns a promise resolving to a UCI move string (e.g. "e2e4") or null. */
    const requestMove = useCallback(
        (fen: string, difficulty: AiDifficulty, history?: AiSearchHistory): Promise<string | null> => {
            if (!enabled) return Promise.resolve(null)

            return (async () => {
                cancelTablebaseRequest()
                const tablebaseController = new AbortController()
                tablebaseRequestControllerRef.current = tablebaseController
                const exactMove = await fetchExactTablebaseMove(fen, difficulty, tablebaseController.signal)
                if (tablebaseRequestControllerRef.current === tablebaseController) {
                    tablebaseRequestControllerRef.current = null
                }
                if (tablebaseController.signal.aborted) return null
                if (exactMove) return exactMove

                const worker = workerRef.current
                const varietyMove = pickBeginnerVarietyMove(fen, difficulty)
                if (varietyMove) return varietyMove
                if (!worker || !isReadyRef.current || resolveRef.current) return null
                if (ignoredBestMoveCountRef.current > 0) return null

                if (difficultyRef.current !== difficulty) {
                    difficultyRef.current = difficulty
                    const capabilities = detectEngineCapabilities()
                    const activeProfile = fallbackProfileId
                        ? profileById(fallbackProfileId)
                        : resolveProfile('auto', capabilities)
                    setThreadCount(aiThreadCount(activeProfile, capabilities, difficulty))
                    // A thread change is not safe to search behind. The status
                    // goes back to 'loading' and returns to 'ready' on the
                    // handshake, which is what re-enters the caller's loop.
                    if (!applyStrength(worker, difficulty, activeProfile, capabilities)) return null
                }

                return new Promise((resolve) => {
                    resolveRef.current = resolve
                    setStatus('thinking')

                    const movetime = DIFFICULTY_MOVETIME[difficulty]
                    requestTimeoutRef.current = setTimeout(() => {
                        ignoredBestMoveCountRef.current = addStoppedSearchBestMoveAck(ignoredBestMoveCountRef.current)
                        setStatus('stopping')
                        clearStopAckTimeout()
                        stopAckTimeoutRef.current = setTimeout(releaseStoppedSearch, STOPPED_SEARCH_ACK_TIMEOUT_MS)
                        try { worker.postMessage('stop') } catch { /* worker may already be gone */ }
                        settleRequest(null)
                    }, movetime + 10_000)
                    // With the moves that led here, not just the position: the
                    // engine builds its repetition history from them, and
                    // without it cannot see that a position has occurred before.
                    worker.postMessage(buildPositionCommand(fen, history?.moves, history?.rootFen))
                    // Per docs: "go movetime N" is the clean way to get a single best move
                    worker.postMessage(`go movetime ${movetime}`)
                })
            })()
        },
        [applyStrength, cancelTablebaseRequest, clearStopAckTimeout, enabled, fallbackProfileId, releaseStoppedSearch, settleRequest],
    )

    return { status, requestMove, setDifficulty, cancelRequest, profileName, threadCount }
}
