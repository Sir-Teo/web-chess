import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchOpeningExplorer,
  hasOpeningExplorerAuthToken,
  normalizeOpeningExplorerFenKey,
  openingExplorerGameCount,
  prefetchOpeningExplorer,
  shouldContinueOpeningBookLine,
} from './openingExplorer'

describe('opening explorer client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fails fast without a Lichess API token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchOpeningExplorer({ source: 'masters', moves: [] })).rejects.toThrow(
      'Opening Explorer requires a Lichess API token.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes bearer tokens before auth gating', () => {
    expect(hasOpeningExplorerAuthToken('')).toBe(false)
    expect(hasOpeningExplorerAuthToken('Bearer   ')).toBe(false)
    expect(hasOpeningExplorerAuthToken('Bearer test-token')).toBe(true)
    expect(hasOpeningExplorerAuthToken('test-token')).toBe(true)
  })

  it('normalizes opening cache keys to board-state FEN fields', () => {
    const fenA = '8/8/8/8/8/8/4K3/6k1 w - - 0 1'
    const fenB = '8/8/8/8/8/8/4K3/6k1 w - - 14 72'

    expect(normalizeOpeningExplorerFenKey(fenA)).toBe('8/8/8/8/8/8/4K3/6k1 w - -')
    expect(normalizeOpeningExplorerFenKey(fenA)).toBe(normalizeOpeningExplorerFenKey(fenB))
  })

  it('detects when a reviewed line should stop opening-book prefetching', () => {
    const inBook = {
      white: 10,
      draws: 5,
      black: 3,
      moves: [{ uci: 'e7e5', san: 'e5', white: 4, draws: 2, black: 1 }],
    }
    const noGames = {
      white: 0,
      draws: 0,
      black: 0,
      moves: [{ uci: 'e7e5', san: 'e5', white: 0, draws: 0, black: 0 }],
    }

    expect(openingExplorerGameCount(inBook)).toBe(18)
    expect(shouldContinueOpeningBookLine(inBook, 'e7e5')).toBe(true)
    expect(shouldContinueOpeningBookLine(inBook, 'c7c5')).toBe(false)
    expect(shouldContinueOpeningBookLine(noGames, 'e7e5')).toBe(false)
  })

  it('sends bearer auth, normalizes filters, and caches responses by position', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        white: 10,
        draws: 5,
        black: 3,
        moves: [{ uci: 'e7e5', san: 'e5', white: 4, draws: 2, black: 1 }],
        topGames: [],
        recentGames: [],
        opening: { eco: 'C20', name: 'King Pawn Game' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = {
      source: 'lichess' as const,
      fen: '8/8/8/8/8/8/4K3/6k1 w - - 0 1',
      moves: [' e2e4 '],
      speeds: ['rapid' as const, 'blitz' as const],
      ratings: [1600, 5000],
      authToken: 'Bearer test-token',
    }

    const first = await fetchOpeningExplorer(request)
    const second = await fetchOpeningExplorer({
      ...request,
      fen: '8/8/8/8/8/8/4K3/6k1 w - - 42 99',
      authToken: 'Bearer other-token',
    })

    expect(first.white).toBe(10)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, options] = fetchMock.mock.calls[0] as [string, { headers: HeadersInit }]
    const parsedUrl = new URL(url)
    expect(url).toContain('https://explorer.lichess.org/lichess?')
    expect(parsedUrl.searchParams.get('fen')).toBe(request.fen)
    expect(url).toContain('play=e2e4')
    expect(url).toContain('speeds=rapid%2Cblitz')
    expect(url).toContain('ratings=1600')
    expect(url).not.toContain('5000')
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' })
  })

  it('does not prefetch when the token is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await prefetchOpeningExplorer({ source: 'masters', moves: ['d2d4'] })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('passes abort signals through prefetch requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        white: 1,
        draws: 0,
        black: 0,
        moves: [],
        topGames: [],
        recentGames: [],
        opening: null,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    await prefetchOpeningExplorer(
      { source: 'masters', moves: ['c2c4'], authToken: 'test-token' },
      controller.signal,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(options.signal).toBe(controller.signal)
  })

  it('does not cache a response aborted during parsing', async () => {
    let resolveJson: (payload: unknown) => void = () => {}
    let resolveJsonStarted: () => void = () => {}
    const jsonStarted = new Promise<void>(resolve => {
      resolveJsonStarted = resolve
    })
    const abortedPayload = {
      white: 99,
      draws: 0,
      black: 0,
      moves: [],
      topGames: [],
      recentGames: [],
      opening: null,
    }
    const freshPayload = {
      white: 2,
      draws: 1,
      black: 3,
      moves: [],
      topGames: [],
      recentGames: [],
      opening: null,
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

    const controller = new AbortController()
    const request = {
      source: 'masters' as const,
      moves: ['g1f3'],
      authToken: 'test-token',
    }
    const pending = fetchOpeningExplorer(request, controller.signal)
    await jsonStarted

    controller.abort()
    resolveJson(abortedPayload)

    await expect(pending).rejects.toThrow()
    await expect(fetchOpeningExplorer(request)).resolves.toEqual(freshPayload)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('hydrates valid responses from browser storage before requiring auth', async () => {
    const payload = {
      white: 1,
      draws: 2,
      black: 3,
      moves: [],
      topGames: [],
      recentGames: [],
      opening: { eco: 'D00', name: 'Queen Pawn Game' },
    }
    const stored = {
      'masters||d2d4||': {
        expiresAt: Date.now() + 60_000,
        payload,
      },
    }
    const fetchMock = vi.fn()
    const localStorageMock = {
      getItem: vi.fn(() => JSON.stringify(stored)),
      setItem: vi.fn(),
    }

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { localStorage: localStorageMock })

    await expect(fetchOpeningExplorer({ source: 'masters', moves: ['d2d4'] })).resolves.toEqual(payload)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reuses the parsed browser storage snapshot across repeated misses', async () => {
    const stored = {
      'masters||d2d4||': {
        expiresAt: Date.now() + 60_000,
        payload: {
          white: 1,
          draws: 0,
          black: 0,
          moves: [],
          topGames: [],
          recentGames: [],
          opening: null,
        },
      },
    }
    const fetchMock = vi.fn()
    const localStorageMock = {
      getItem: vi.fn(() => JSON.stringify(stored)),
      setItem: vi.fn(),
    }
    const parseSpy = vi.spyOn(JSON, 'parse')

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { localStorage: localStorageMock })

    await expect(fetchOpeningExplorer({ source: 'masters', moves: ['a2a3'] })).rejects.toThrow(
      'Opening Explorer requires a Lichess API token.',
    )
    await expect(fetchOpeningExplorer({ source: 'masters', moves: ['h2h3'] })).rejects.toThrow(
      'Opening Explorer requires a Lichess API token.',
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(parseSpy).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed browser storage entries before auth gating', async () => {
    const stored = {
      'masters||h2h3||': {
        expiresAt: Date.now() + 60_000,
        payload: { moves: 'not-an-array' },
      },
    }
    const fetchMock = vi.fn()
    const localStorageMock = {
      getItem: vi.fn(() => JSON.stringify(stored)),
      setItem: vi.fn(),
    }

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { localStorage: localStorageMock })

    await expect(fetchOpeningExplorer({ source: 'masters', moves: ['h2h3'] })).rejects.toThrow(
      'Opening Explorer requires a Lichess API token.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
