import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetLichessFetchQueueForTests } from '../engine/lichessQueue'
import {
    addStoppedSearchBestMoveAck,
    aiDifficultyCommands,
    consumeStoppedSearchBestMove,
    fetchExactTablebaseMove,
    pickBeginnerVarietyMove,
    pickExactTablebaseMove,
} from './useAiPlayer'

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
            'setoption name Skill Level value 0',
        ])

        expect(aiDifficultyCommands(4)).toEqual([
            'setoption name UCI_LimitStrength value true',
            'setoption name UCI_Elo value 1900',
            'setoption name Skill Level value 9',
        ])
    })

    it('turns off Stockfish strength limiting at maximum difficulty', () => {
        expect(aiDifficultyCommands(8)).toEqual([
            'setoption name UCI_LimitStrength value false',
            'setoption name Skill Level value 20',
        ])
        expect(aiDifficultyCommands(8).join(' ')).not.toContain('UCI_Elo')
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
