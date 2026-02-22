import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveProfile } from '../engine/profiles'

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

type AiStatus = 'loading' | 'ready' | 'thinking' | 'error'

export function useAiPlayer() {
    const workerRef = useRef<Worker | null>(null)
    const isReadyRef = useRef(false)
    const resolveRef = useRef<((move: string | null) => void) | null>(null)
    const [status, setStatus] = useState<AiStatus>('loading')
    const difficultyRef = useRef<AiDifficulty>(4)

    // Boot a fresh lite-single worker for the AI player
    useEffect(() => {
        const capabilities = {
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
            hardwareConcurrency: navigator.hardwareConcurrency || 1,
            isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
        }

        const profile = resolveProfile('auto', capabilities)
        let worker: Worker

        try {
            worker = new Worker(profile.workerPath)
        } catch {
            setStatus('error')
            return
        }

        workerRef.current = worker
        isReadyRef.current = false

        worker.onmessage = (event: MessageEvent<string>) => {
            const line = event.data

            if (line === 'uciok') {
                worker.postMessage('isready')
            }

            if (line === 'readyok') {
                isReadyRef.current = true
                applyDifficulty(worker, difficultyRef.current)
                setStatus('ready')
            }

            if (line.startsWith('bestmove ')) {
                const parts = line.split(' ')
                const move = parts[1] ?? null
                setStatus('ready')
                resolveRef.current?.(move === '(none)' ? null : move)
                resolveRef.current = null
            }
        }

        worker.onerror = () => {
            setStatus('error')
            resolveRef.current?.(null)
            resolveRef.current = null
        }

        worker.postMessage('uci')

        return () => {
            try { worker.postMessage('quit') } catch { /* already gone */ }
            worker.terminate()
            workerRef.current = null
            isReadyRef.current = false
            resolveRef.current?.(null)
            resolveRef.current = null
        }
    }, [])

    const applyDifficulty = (worker: Worker, difficulty: AiDifficulty) => {
        const elo = DIFFICULTY_ELO[difficulty]
        // Per Stockfish.js docs (stockfishjs-research-2026-02-22.md):
        // UCI_LimitStrength (check) + UCI_Elo (spin, 1320-3190)
        worker.postMessage('setoption name UCI_LimitStrength value true')
        worker.postMessage(`setoption name UCI_Elo value ${elo}`)
        // Also set Skill Level for redundancy on lite builds that may use it
        const skillLevel = Math.round(((difficulty - 1) / 7) * 20)
        worker.postMessage(`setoption name Skill Level value ${skillLevel}`)
    }

    const setDifficulty = useCallback((difficulty: AiDifficulty) => {
        difficultyRef.current = difficulty
        if (workerRef.current && isReadyRef.current) {
            applyDifficulty(workerRef.current, difficulty)
        }
    }, [])

    /** Request the engine to pick a move for the given position.
     *  Returns a promise resolving to a UCI move string (e.g. "e2e4") or null. */
    const requestMove = useCallback(
        (fen: string, difficulty: AiDifficulty): Promise<string | null> => {
            const worker = workerRef.current
            if (!worker || !isReadyRef.current) return Promise.resolve(null)

            return new Promise((resolve) => {
                resolveRef.current = resolve
                setStatus('thinking')

                const movetime = DIFFICULTY_MOVETIME[difficulty]
                worker.postMessage('stop')
                worker.postMessage(`position fen ${fen}`)
                // Per docs: "go movetime N" is the clean way to get a single best move
                worker.postMessage(`go movetime ${movetime}`)
            })
        },
        [],
    )

    return { status, requestMove, setDifficulty }
}
