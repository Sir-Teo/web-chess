import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchLichessResource,
  LICHESS_RATE_LIMIT_COOLDOWN_MS,
  resetLichessFetchQueueForTests,
  parseRetryAfterMs,
  LICHESS_MAX_COOLDOWN_MS,
  getLichessBackoffRemainingMs,
} from './lichessQueue'

function deferredResponse() {
  let resolve: (response: Response) => void = () => {}
  const promise = new Promise<Response>(nextResolve => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('Lichess request queue', () => {
  afterEach(() => {
    vi.useRealTimers()
    resetLichessFetchQueueForTests()
    vi.unstubAllGlobals()
  })

  it('serializes remote requests so only one Lichess fetch starts at a time', async () => {
    const first = deferredResponse()
    const second = deferredResponse()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', fetchMock)

    const firstRequest = fetchLichessResource('https://lichess.org/one')
    const secondRequest = fetchLichessResource('https://lichess.org/two')

    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    first.resolve(new Response('one'))
    await expect(firstRequest).resolves.toBeInstanceOf(Response)
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    second.resolve(new Response('two'))
    await expect(secondRequest).resolves.toBeInstanceOf(Response)
  })

  it('skips queued requests that are aborted before they start', async () => {
    const first = deferredResponse()
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise)
    vi.stubGlobal('fetch', fetchMock)

    const firstRequest = fetchLichessResource('https://lichess.org/one')
    const controller = new AbortController()
    const secondRequest = fetchLichessResource('https://lichess.org/two', {
      signal: controller.signal,
    })

    controller.abort(new Error('cancelled'))
    first.resolve(new Response('one'))

    await expect(firstRequest).resolves.toBeInstanceOf(Response)
    await expect(secondRequest).rejects.toThrow('cancelled')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('waits before starting the next request after a rate limit response', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLichessResource('https://lichess.org/one')).resolves.toHaveProperty('status', 429)

    const secondRequest = fetchLichessResource('https://lichess.org/two')
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(LICHESS_RATE_LIMIT_COOLDOWN_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await expect(secondRequest).resolves.toBeInstanceOf(Response)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cancels a queued request while it is waiting for rate limit cooldown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLichessResource('https://lichess.org/one')).resolves.toHaveProperty('status', 429)

    const controller = new AbortController()
    const secondRequest = fetchLichessResource('https://lichess.org/two', {
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort(new Error('cancelled during cooldown'))

    await expect(secondRequest).rejects.toThrow('cancelled during cooldown')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('honouring Retry-After on a 429', () => {
  const NOW = 1_700_000_000_000

  it('falls back to the fixed cooldown when the header is absent', () => {
    expect(parseRetryAfterMs(null, NOW)).toBe(LICHESS_RATE_LIMIT_COOLDOWN_MS)
    expect(parseRetryAfterMs('', NOW)).toBe(LICHESS_RATE_LIMIT_COOLDOWN_MS)
  })

  it('reads a count of seconds', () => {
    expect(parseRetryAfterMs('90', NOW)).toBe(90_000)
    expect(parseRetryAfterMs('  5  ', NOW)).toBe(5_000)
  })

  it('reads an HTTP date', () => {
    expect(parseRetryAfterMs(new Date(NOW + 45_000).toUTCString(), NOW)).toBeGreaterThan(44_000)
  })

  it('caps a header that asks for far too long', () => {
    // A confused or hostile server must not park the queue for an hour.
    expect(parseRetryAfterMs('3600', NOW)).toBe(LICHESS_MAX_COOLDOWN_MS)
    expect(parseRetryAfterMs(new Date(NOW + 86_400_000).toUTCString(), NOW))
      .toBe(LICHESS_MAX_COOLDOWN_MS)
  })

  it('ignores a header that is junk, negative or already past', () => {
    expect(parseRetryAfterMs('soon', NOW)).toBe(LICHESS_RATE_LIMIT_COOLDOWN_MS)
    expect(parseRetryAfterMs('-30', NOW)).toBe(LICHESS_RATE_LIMIT_COOLDOWN_MS)
    expect(parseRetryAfterMs('0', NOW)).toBe(LICHESS_RATE_LIMIT_COOLDOWN_MS)
    expect(parseRetryAfterMs(new Date(NOW - 10_000).toUTCString(), NOW))
      .toBe(LICHESS_RATE_LIMIT_COOLDOWN_MS)
  })

  it('never waits less than the fixed cooldown would have', () => {
    // The change may only lengthen a wait, never shorten one.
    for (const header of [null, '', 'junk', '-1', '0', '1', '30']) {
      const waited = parseRetryAfterMs(header, NOW)
      if (header === '1' || header === '30') continue
      expect(waited).toBeGreaterThanOrEqual(LICHESS_RATE_LIMIT_COOLDOWN_MS)
    }
  })
})

describe('reporting how long the backoff has left', () => {
  it('is nothing when no throttle is in effect', () => {
    expect(getLichessBackoffRemainingMs()).toBe(0)
  })

  it('never reports a negative wait once the backoff has passed', () => {
    // Copy that says "try again in -3s" is worse than saying nothing.
    expect(getLichessBackoffRemainingMs(Date.now() + 10_000_000)).toBe(0)
  })
})
