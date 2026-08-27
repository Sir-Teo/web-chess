import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cloudEvalRequestKey,
  cloudEvalToSnapshot,
  cloudLineToSideToMoveScore,
  fetchCloudEvaluation,
  hasCachedCloudEvaluationMiss,
  normalizeCloudEvalFen,
  normalizeCloudEvalMultiPv,
  parseCloudEvalResponse,
} from './cloudEval'

describe('cloud eval parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes cache keys to the position fields that affect engine eval', () => {
    const fenA = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const fenB = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 7 42'

    expect(normalizeCloudEvalFen(fenA)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
    expect(cloudEvalRequestKey({ fen: fenA, multiPv: 9 })).toBe(cloudEvalRequestKey({ fen: fenB, multiPv: 5 }))
  })

  it('normalizes cloud MultiPV requests to finite Lichess-supported values', () => {
    expect(normalizeCloudEvalMultiPv(Number.NaN)).toBe(1)
    expect(normalizeCloudEvalMultiPv(Number.POSITIVE_INFINITY)).toBe(1)
    expect(normalizeCloudEvalMultiPv(0)).toBe(1)
    expect(normalizeCloudEvalMultiPv(2.6)).toBe(3)
    expect(normalizeCloudEvalMultiPv(99)).toBe(5)
  })

  it('parses centipawn and mate PVs from Lichess responses', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)

    const parsed = parseCloudEvalResponse({
      fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      knodes: 106325,
      depth: 29,
      pvs: [
        { moves: 'd1e2 d8e7 a2a4', cp: 41 },
        { moves: 'c2c3 a7a6 b5a4', mate: -6 },
        { moves: '', cp: 12 },
      ],
    })

    expect(parsed).toEqual({
      fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -',
      knodes: 106325,
      depth: 29,
      fetchedAt: 1_700_000_000_000,
      pvs: [
        { moves: ['d1e2', 'd8e7', 'a2a4'], cp: 41 },
        { moves: ['c2c3', 'a7a6', 'b5a4'], mate: -6 },
      ],
    })

    vi.useRealTimers()
  })

  it('converts White POV cloud scores into side-to-move snapshots', () => {
    const result = parseCloudEvalResponse({
      fen: '8/8/8/8/8/8/4k3/4K3 b - -',
      knodes: 12,
      depth: 35,
      pvs: [{ moves: 'e2d2 e1d1', cp: 80 }],
    })

    expect(result).not.toBeNull()
    expect(cloudLineToSideToMoveScore('8/8/8/8/8/8/4k3/4K3 b - - 0 1', result!.pvs[0]!)).toEqual({ cp: -80 })
    expect(cloudEvalToSnapshot('8/8/8/8/8/8/4k3/4K3 b - - 0 1', result!)).toMatchObject({
      cp: -80,
      depth: 35,
      nodes: 12_000,
      mode: 'custom',
      purpose: 'cloud-eval',
    })
  })

  it('drops non-finite cloud scores before creating eval snapshots', () => {
    const fen = '8/8/8/8/8/8/4k3/4K3 b - - 0 1'
    const result = {
      fen: normalizeCloudEvalFen(fen),
      depth: 20,
      knodes: 10,
      fetchedAt: 1_700_000_000_000,
      pvs: [{ moves: ['e2d2'], cp: Number.NaN }],
    }

    expect(cloudLineToSideToMoveScore(fen, result.pvs[0]!)).toEqual({
      cp: undefined,
      mate: undefined,
    })
    expect(cloudEvalToSnapshot(fen, result)).toBeNull()
    expect(cloudEvalToSnapshot(fen, {
      ...result,
      pvs: [{ moves: ['e2d2'], mate: Number.POSITIVE_INFINITY }],
    })).toBeNull()
  })

  it('does not cache a response aborted during parsing', async () => {
    let resolveJson: (payload: unknown) => void = () => {}
    let resolveJsonStarted: () => void = () => {}
    const jsonStarted = new Promise<void>(resolve => {
      resolveJsonStarted = resolve
    })
    const abortedPayload = {
      fen: '8/8/8/8/8/8/4K3/6k1 w - -',
      knodes: 99,
      depth: 99,
      pvs: [{ moves: 'e2e3', cp: 99 }],
    }
    const freshPayload = {
      fen: '8/8/8/8/8/8/4K3/6k1 w - -',
      knodes: 2,
      depth: 2,
      pvs: [{ moves: 'e2e3', cp: 0 }],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => {
          resolveJsonStarted()
          return new Promise(resolve => {
            resolveJson = resolve
          })
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => freshPayload,
      })
    vi.stubGlobal('fetch', fetchMock)

    const request = { fen: '8/8/8/8/8/8/4K3/6k1 w - - 0 1', multiPv: 1 }
    const controller = new AbortController()
    const pending = fetchCloudEvaluation(request, controller.signal)
    await jsonStarted

    controller.abort()
    resolveJson(abortedPayload)

    await expect(pending).rejects.toThrow()
    await expect(fetchCloudEvaluation(request)).resolves.toMatchObject({
      depth: 2,
      knodes: 2,
      pvs: [{ moves: ['e2e3'], cp: 0 }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('hydrates valid cloud eval responses from browser storage', async () => {
    const request = { fen: '8/8/8/8/8/8/7K/6k1 w - - 0 1', multiPv: 1 }
    const payload = {
      fen: normalizeCloudEvalFen(request.fen),
      knodes: 77,
      depth: 33,
      fetchedAt: 1_700_000_000_000,
      pvs: [{ moves: ['h2g2'], cp: 12 }],
    }
    const localStorageMock = {
      getItem: vi.fn(() => JSON.stringify({
        [cloudEvalRequestKey(request)]: {
          expiresAt: Date.now() + 60_000,
          payload,
        },
      })),
      setItem: vi.fn(),
    }
    const fetchMock = vi.fn()

    vi.stubGlobal('window', { localStorage: localStorageMock })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCloudEvaluation(request)).resolves.toEqual(payload)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('persists missing cloud eval responses to avoid repeated 404 requests', async () => {
    const request = { fen: '8/8/8/8/8/8/5K2/7k w - - 0 1', multiPv: 1 }
    let storageRaw: string | null = null
    const localStorageMock = {
      getItem: vi.fn(() => storageRaw),
      setItem: vi.fn((_: string, nextValue: string) => {
        storageRaw = nextValue
      }),
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    vi.stubGlobal('window', { localStorage: localStorageMock })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCloudEvaluation(request)).resolves.toBeNull()
    await expect(fetchCloudEvaluation(request)).resolves.toBeNull()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(hasCachedCloudEvaluationMiss(request)).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storageRaw ?? '{}')[cloudEvalRequestKey(request)]).toMatchObject({
      payload: null,
    })
  })

  it('ignores malformed browser storage entries before fetching fresh cloud evals', async () => {
    const request = { fen: '8/8/8/8/8/8/6K1/7k w - - 0 1', multiPv: 1 }
    const freshPayload = {
      fen: normalizeCloudEvalFen(request.fen),
      knodes: 8,
      depth: 8,
      pvs: [{ moves: 'g2g3', cp: 0 }],
    }
    const localStorageMock = {
      getItem: vi.fn(() => JSON.stringify({
        [cloudEvalRequestKey(request)]: {
          expiresAt: Date.now() + 60_000,
          payload: { fen: request.fen, pvs: [{ moves: 'not-an-array', cp: Number.NaN }] },
        },
      })),
      setItem: vi.fn(),
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => freshPayload,
    })

    vi.stubGlobal('window', { localStorage: localStorageMock })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCloudEvaluation(request)).resolves.toMatchObject({
      depth: 8,
      knodes: 8,
      pvs: [{ moves: ['g2g3'], cp: 0 }],
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reuses the parsed browser storage snapshot across repeated cloud misses', async () => {
    const stored = {
      [cloudEvalRequestKey({ fen: '8/8/8/8/8/8/4K3/6k1 w - - 0 1', multiPv: 1 })]: {
        expiresAt: Date.now() + 60_000,
        payload: {
          fen: normalizeCloudEvalFen('8/8/8/8/8/8/4K3/6k1 w - - 0 1'),
          knodes: 1,
          depth: 1,
          fetchedAt: 1_700_000_000_000,
          pvs: [{ moves: ['e2e3'], cp: 0 }],
        },
      },
    }
    const localStorageMock = {
      getItem: vi.fn(() => JSON.stringify(stored)),
      setItem: vi.fn(),
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fen: normalizeCloudEvalFen('8/8/8/8/8/8/5K2/6k1 w - - 0 1'),
        knodes: 2,
        depth: 2,
        pvs: [{ moves: 'f2f3', cp: 0 }],
      }),
    })
    const parseSpy = vi.spyOn(JSON, 'parse')

    vi.stubGlobal('window', { localStorage: localStorageMock })
    vi.stubGlobal('fetch', fetchMock)

    await fetchCloudEvaluation({ fen: '8/8/8/8/8/8/5K2/6k1 w - - 0 1', multiPv: 1 })
    await fetchCloudEvaluation({ fen: '8/8/8/8/8/8/5K2/6k1 w - - 1 2', multiPv: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest in-memory cloud eval entries', async () => {
    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    }
    const fetchMock = vi.fn(async (url: string) => {
      const fen = new URL(url).searchParams.get('fen') ?? ''
      return {
        ok: true,
        json: async () => ({
          fen,
          knodes: 1,
          depth: 1,
          pvs: [{ moves: 'e2e3', cp: 0 }],
        }),
      }
    })
    const requestFor = (index: number) => ({
      fen: `8/8/8/8/8/8/4K3/6k1 w K${index} - 0 1`,
      multiPv: 1,
    })

    vi.stubGlobal('window', { localStorage: localStorageMock })
    vi.stubGlobal('fetch', fetchMock)

    for (let index = 0; index < 121; index += 1) {
      await fetchCloudEvaluation(requestFor(index))
    }
    await fetchCloudEvaluation(requestFor(0))

    expect(fetchMock).toHaveBeenCalledTimes(122)
  })
})
