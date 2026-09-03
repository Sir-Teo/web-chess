import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetLichessFetchQueueForTests } from '../engine/lichessQueue'
import {
    addStoppedSearchBestMoveAck,
    AI_MIN_MOVETIME_MS,
    aiDifficultyCommands,
    aiMovetimeMs,
    aiThreadCount,
    consumeStoppedSearchBestMove,
    fetchExactTablebaseMove,
    aiMultiPv,
    pickVarietyMove,
    pickExactTablebaseMove,
} from './useAiPlayer'
import { profileById, recommendedThreadCount } from '../engine/profiles'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    resetLichessFetchQueueForTests()
})

describe('AI difficulty UCI commands', () => {
    it('limits strength for beginner-friendly difficulty levels', () => {
        expect(aiDifficultyCommands(1)).toEqual([
            'setoption name UCI_LimitStrength value true',
            'setoption name UCI_Elo value 1320',
        ])

        expect(aiDifficultyCommands(4)).toEqual([
            'setoption name UCI_LimitStrength value true',
            'setoption name UCI_Elo value 1900',
        ])
    })

    /**
     * Stockfish reads `UCI_Elo` in preference to `Skill Level` while
     * `UCI_LimitStrength` is on, so a `Skill Level` sent alongside it is a
     * second strength control that does nothing -- and disagrees with the one
     * that works.
     */
    it('does not send a Skill Level the engine will ignore', () => {
        for (const difficulty of [1, 2, 3, 4, 5, 6, 7] as const) {
            expect(aiDifficultyCommands(difficulty).join(' ')).not.toContain('Skill Level')
        }
    })

    it('turns off Stockfish strength limiting at maximum difficulty', () => {
        expect(aiDifficultyCommands(8)).toEqual([
            'setoption name UCI_LimitStrength value false',
            'setoption name Skill Level value 20',
        ])
        expect(aiDifficultyCommands(8).join(' ')).not.toContain('UCI_Elo')
    })

    /**
     * Maximum's `Skill Level 20` is the one that matters: it is the only level
     * that turns `UCI_LimitStrength` off, and with it off the engine starts
     * reading `Skill Level` again -- so without this, a game switched down to
     * Novice and back up would leave "Maximum" playing at whatever level the
     * old code had last written.
     */
    it('restores full skill when it stops limiting strength', () => {
        expect(aiDifficultyCommands(8)).toContain('setoption name Skill Level value 20')
    })
})

describe('AI stopped-search bestmove routing', () => {
    it('ignores exactly one bestmove for each stopped search acknowledgement', () => {
        expect(consumeStoppedSearchBestMove(0)).toEqual({ ignore: false, remaining: 0 })
        expect(consumeStoppedSearchBestMove(1)).toEqual({ ignore: true, remaining: 0 })
        expect(consumeStoppedSearchBestMove(3)).toEqual({ ignore: true, remaining: 2 })
    })

    it('normalizes malformed pending counts', () => {
        expect(consumeStoppedSearchBestMove(-1)).toEqual({ ignore: false, remaining: 0 })
        expect(consumeStoppedSearchBestMove(Number.NaN)).toEqual({ ignore: false, remaining: 0 })
        expect(consumeStoppedSearchBestMove(2.8)).toEqual({ ignore: true, remaining: 1 })
    })

    it('records one pending bestmove acknowledgement for every stopped search', () => {
        expect(addStoppedSearchBestMoveAck(0)).toBe(1)
        expect(addStoppedSearchBestMoveAck(-1)).toBe(1)
        expect(addStoppedSearchBestMoveAck(Number.NaN)).toBe(1)
        expect(addStoppedSearchBestMoveAck(2.8)).toBe(3)
    })
})

describe('AI beginner move variety', () => {
    /** The rolls in order: whether to vary, then which alternative. */
    const rolls = (...values: number[]) => {
        let index = 0
        return () => values[index++] ?? 0
    }
    const lines = [
        { multipv: 1, cp: 30, move: 'e2e4' },
        { multipv: 2, cp: -20, move: 'd2d4' },
        { multipv: 3, cp: -150, move: 'g1f3' },
        { multipv: 4, cp: -400, move: 'a2a3' },
    ]

    it('plays the engine move at every level above Novice', () => {
        for (const difficulty of [3, 4, 5, 6, 7, 8] as const) {
            expect(pickVarietyMove(difficulty, lines, 'e2e4', rolls(0, 0))).toBe('e2e4')
        }
    })

    it('plays the engine move most of the time at the weakest levels too', () => {
        expect(pickVarietyMove(1, lines, 'e2e4', rolls(0.99, 0))).toBe('e2e4')
        expect(pickVarietyMove(2, lines, 'e2e4', rolls(0.5, 0))).toBe('e2e4')
    })

    it('varies within a window of the best line, never to a random legal move', () => {
        // Beginner's window admits d4 and Nf3; the -4.00 a3 is out.
        expect(pickVarietyMove(1, lines, 'e2e4', rolls(0, 0))).toBe('d2d4')
        expect(pickVarietyMove(1, lines, 'e2e4', rolls(0, 0.99))).toBe('g1f3')
        // Novice's narrower window admits d4 alone.
        expect(pickVarietyMove(2, lines, 'e2e4', rolls(0, 0.99))).toBe('d2d4')
    })

    it('keeps a mate out of the window in either direction', () => {
        const mating = [
            { multipv: 1, mate: 2, move: 'd1h5' },
            { multipv: 2, cp: 40, move: 'e2e4' },
        ]
        expect(pickVarietyMove(1, mating, 'd1h5', rolls(0, 0))).toBe('d1h5')
        const mated = [
            { multipv: 1, cp: 10, move: 'e2e4' },
            { multipv: 2, mate: -3, move: 'f2f3' },
        ]
        expect(pickVarietyMove(1, mated, 'e2e4', rolls(0, 0))).toBe('e2e4')
    })

    it('falls back to the engine move when there is nothing close enough to choose', () => {
        const lopsided = [{ multipv: 1, cp: 500, move: 'e2e4' }, { multipv: 2, cp: -300, move: 'a2a3' }]
        expect(pickVarietyMove(1, lopsided, 'e2e4', rolls(0, 0))).toBe('e2e4')
        expect(pickVarietyMove(1, [], 'e2e4', rolls(0, 0))).toBe('e2e4')
        expect(pickVarietyMove(1, lines, null, rolls(0, 0))).toBeNull()
    })

    it('asks the engine for the lines it needs', () => {
        expect(aiMultiPv(1)).toBe(4)
        expect(aiMultiPv(2)).toBe(4)
        expect(aiMultiPv(3)).toBe(1)
        expect(aiMultiPv(8)).toBe(1)
    })
})

describe('AI exact tablebase move selection', () => {
    it('uses the first tablebase move because Lichess returns best moves first', () => {
        expect(pickExactTablebaseMove({
            fen: '8/8/8/8/8/8/4K3/7k w - - 0 1',
            category: 'win',
            checkmate: false,
            stalemate: false,
            insufficientMaterial: false,
            fetchedAt: 1,
            moves: [
                { uci: 'e2f3', san: 'Kf3', category: 'loss', dtz: -2 },
                { uci: 'e2e1', san: 'Ke1', category: 'draw', dtz: 0 },
            ],
        })).toBe('e2f3')
    })

    it('preserves tablebase ordering instead of re-ranking locally', () => {
        expect(pickExactTablebaseMove({
            fen: '8/8/8/8/8/8/4K3/7k w - - 0 1',
            category: 'win',
            checkmate: false,
            stalemate: false,
            insufficientMaterial: false,
            fetchedAt: 1,
            moves: [
                { uci: 'e2e3', san: 'Ke3', category: 'draw', dtz: 0 },
                { uci: 'e2f3', san: 'Kf3', category: 'loss', dtz: -2 },
            ],
        })).toBe('e2e3')
    })

    it('returns null when no exact moves are available', () => {
        expect(pickExactTablebaseMove(null)).toBeNull()
        expect(pickExactTablebaseMove({
            fen: '8/8/8/8/8/8/4K3/7k w - - 0 1',
            category: 'draw',
            checkmate: false,
            stalemate: false,
            insufficientMaterial: true,
            fetchedAt: 1,
            moves: [],
        })).toBeNull()
    })

    it('skips the remote exact lookup when the AI request is already cancelled', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const controller = new AbortController()
        controller.abort(new Error('cancelled before lookup'))

        await expect(fetchExactTablebaseMove(
            '8/8/8/8/8/8/2K5/5k2 w - - 13 1',
            8,
            controller.signal,
        )).resolves.toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('aborts an in-flight exact lookup when the AI request is cancelled', async () => {
        let fetchSignal: AbortSignal | undefined
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            fetchSignal = init?.signal ?? undefined
            return new Promise<Response>((_resolve, reject) => {
                fetchSignal?.addEventListener('abort', () => {
                    reject(fetchSignal?.reason instanceof Error ? fetchSignal.reason : new Error('aborted'))
                }, { once: true })
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const controller = new AbortController()
        const pending = fetchExactTablebaseMove(
            '8/8/8/8/8/8/3K4/5k2 w - - 14 1',
            8,
            controller.signal,
        )

        await Promise.resolve()
        expect(fetchMock).toHaveBeenCalledTimes(1)

        controller.abort(new Error('cancelled during lookup'))

        await expect(pending).resolves.toBeNull()
        expect(fetchSignal?.aborted).toBe(true)
    })

    it('waits no longer than the move budget it was given', async () => {
        // A reply that never comes. The flat 2.5s this used to wait is most
        // of a bullet move; the budget is what the caller can actually spend.
        vi.useFakeTimers()
        let fetchSignal: AbortSignal | undefined
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            fetchSignal = init?.signal ?? undefined
            return new Promise<Response>((_resolve, reject) => {
                fetchSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
            })
        })
        vi.stubGlobal('fetch', fetchMock)

        const pending = fetchExactTablebaseMove('8/8/8/8/8/8/3K4/5k2 w - - 14 1', 8, undefined, 300)
        let settled = false
        void pending.then(() => { settled = true })

        await vi.advanceTimersByTimeAsync(299)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(settled).toBe(false)

        await vi.advanceTimersByTimeAsync(1)
        await expect(pending).resolves.toBeNull()
        expect(fetchSignal?.aborted).toBe(true)
    })

    it('never waits past its own ceiling, whatever budget it is handed', async () => {
        vi.useFakeTimers()
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        }))
        vi.stubGlobal('fetch', fetchMock)

        const pending = fetchExactTablebaseMove('8/8/8/8/8/8/3K4/5k2 w - - 14 1', 8, undefined, 60_000)
        await vi.advanceTimersByTimeAsync(2_500)
        await expect(pending).resolves.toBeNull()
    })
})

describe('AI thread count', () => {
    const threaded = profileById('lite-multi-local')
    const capable = {
        sharedArrayBuffer: true,
        crossOriginIsolated: true,
        hardwareConcurrency: 16,
        deviceMemoryGb: 16,
        isMobile: false,
    }

    /**
     * One to seven cap the engine with `UCI_Elo`, and an Elo-capped search does
     * not get stronger with more threads -- it burns the cores and still plays
     * like a 1320.
     */
    it('leaves an Elo-capped opponent on one thread', () => {
        for (const difficulty of [1, 2, 3, 4, 5, 6, 7] as const) {
            expect(aiThreadCount(threaded, capable, difficulty)).toBe(1)
        }
    })

    it('gives Maximum the threads the device can spare', () => {
        expect(aiThreadCount(threaded, capable, 8)).toBe(recommendedThreadCount(threaded, capable))
        expect(aiThreadCount(threaded, capable, 8)).toBeGreaterThan(1)
    })

    it('stays on one thread where threads are not available at all', () => {
        expect(aiThreadCount(profileById('lite-single-local'), capable, 8)).toBe(1)
        expect(aiThreadCount(threaded, { ...capable, crossOriginIsolated: false }, 8)).toBe(1)
        expect(aiThreadCount(threaded, { ...capable, isMobile: true }, 8)).toBe(1)
    })
})

describe('AI move budget', () => {
    it('uses the difficulty budget when there is no clock', () => {
        expect(aiMovetimeMs(8)).toBe(2000)
        expect(aiMovetimeMs(1, null)).toBe(200)
    })

    /**
     * The defect. `DIFFICULTY_MOVETIME[8]` is 2000ms, so Maximum on a 1+0 clock
     * spent two seconds a move on a sixty second clock and flagged itself
     * around move thirty, never having been told there was a clock.
     */
    it('shrinks with the clock instead of flagging', () => {
        const bullet = (remainingMs: number) => aiMovetimeMs(8, { remainingMs, incrementMs: 0 })
        expect(bullet(60_000)).toBe(2000)
        expect(bullet(30_000)).toBe(1000)
        expect(bullet(10_000)).toBe(333)
        expect(bullet(2_000)).toBe(67)
        // Whatever is left, it never asks for more than it has.
        for (const remaining of [60_000, 30_000, 10_000, 2_000, 400, 120, 0]) {
            expect(bullet(remaining)).toBeLessThanOrEqual(Math.max(AI_MIN_MOVETIME_MS, remaining))
        }
    })

    it('spends the increment it is about to be given back', () => {
        expect(aiMovetimeMs(8, { remainingMs: 180_000, incrementMs: 2_000 }))
            .toBe(Math.round(180_000 / 30 + 2_000 * 0.8))
    })

    /**
     * The same rule that gives them one thread: an Elo-capped search does not
     * get better with more time, so a long think would only make a beginner
     * wait for a move that was already decided.
     */
    it('never lets a capped level think longer than its own budget', () => {
        for (const difficulty of [1, 2, 3, 4, 5, 6, 7] as const) {
            const generous = aiMovetimeMs(difficulty, { remainingMs: 900_000, incrementMs: 10_000 })
            expect(generous).toBeLessThanOrEqual(aiMovetimeMs(difficulty))
        }
    })

    it('lets Maximum use a long clock, which is what a long clock is for', () => {
        expect(aiMovetimeMs(8, { remainingMs: 900_000, incrementMs: 10_000 }))
            .toBeGreaterThan(aiMovetimeMs(8))
    })

    it('always leaves something to move with', () => {
        expect(aiMovetimeMs(8, { remainingMs: 0, incrementMs: 0 })).toBe(AI_MIN_MOVETIME_MS)
        expect(aiMovetimeMs(8, { remainingMs: -5_000, incrementMs: -1 })).toBe(AI_MIN_MOVETIME_MS)
    })
})
