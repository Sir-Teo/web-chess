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
    pickBeginnerVarietyMove,
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
    it('occasionally returns legal non-engine moves for beginner levels', () => {
        const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

        expect(pickBeginnerVarietyMove(startFen, 1, () => 0)).toBe('a2a3')
        expect(pickBeginnerVarietyMove(startFen, 2, () => 0)).toBe('a2a3')
    })

    it('leaves stronger levels on pure Stockfish selection', () => {
        const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

        expect(pickBeginnerVarietyMove(startFen, 3, () => 0)).toBeNull()
        expect(pickBeginnerVarietyMove(startFen, 8, () => 0)).toBeNull()
    })

    it('skips variety when chance does not roll in or the FEN is invalid', () => {
        const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

        expect(pickBeginnerVarietyMove(startFen, 1, () => 0.99)).toBeNull()
        expect(pickBeginnerVarietyMove('not a fen', 1, () => 0)).toBeNull()
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
