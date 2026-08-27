import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetLichessFetchQueueForTests } from './lichessQueue'
import { buildSamplePgnUrl, fetchSamplePgn } from './samplePgn'

describe('sample PGN client', () => {
  afterEach(() => {
    resetLichessFetchQueueForTests()
    vi.unstubAllGlobals()
  })

  it('requests compact PGN exports from Lichess', () => {
    const url = new URL(buildSamplePgnUrl('A2cM3wqU'))

    expect(url.origin).toBe('https://lichess.org')
    expect(url.pathname).toBe('/game/export/A2cM3wqU')
    expect(url.searchParams.get('moves')).toBe('true')
    expect(url.searchParams.get('tags')).toBe('true')
    expect(url.searchParams.get('clocks')).toBe('false')
    expect(url.searchParams.get('evals')).toBe('false')
    expect(url.searchParams.get('opening')).toBe('true')
    expect(url.searchParams.get('literate')).toBe('false')
  })

  it('passes abort signals and PGN accept headers through fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '[Event "Test"]\n\n1. e4 e5 1/2-1/2',
    })
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    await expect(fetchSamplePgn({ id: 'sample', lichessGameId: 'A2cM3wqU' }, controller.signal))
      .resolves.toContain('1. e4')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/game/export/A2cM3wqU?')
    expect(options.signal).toBe(controller.signal)
    expect(options.headers).toEqual({ Accept: 'application/x-chess-pgn' })
  })

  it('does not return text when the request is aborted during parsing', async () => {
    let resolveTextStarted: () => void = () => {}
    let resolveText: (value: string) => void = () => {}
    const textStarted = new Promise<void>(resolve => {
      resolveTextStarted = resolve
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => {
        resolveTextStarted()
        return new Promise<string>(resolve => {
          resolveText = resolve
        })
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const pending = fetchSamplePgn({ id: 'sample', lichessGameId: 'A2cM3wqU' }, controller.signal)
    await textStarted

    controller.abort()
    resolveText('[Event "Stale"]')

    await expect(pending).rejects.toThrow()
  })

  it('shows a clear rate-limit message for sample PGN exports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchSamplePgn({ id: 'sample', lichessGameId: 'A2cM3wqU' }))
      .rejects.toThrow('Lichess sample game rate limit reached; try again in a minute.')
  })
})
