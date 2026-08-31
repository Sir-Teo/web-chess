import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchLichessResource,
  LICHESS_RATE_LIMIT_COOLDOWN_MS,
  resetLichessFetchQueueForTests,
  parseRetryAfterMs,
  LICHESS_MAX_COOLDOWN_MS,
  getLichessBackoffRemainingMs,
  lichessRateLimitMessage,
  isLichessAbortError,
  lichessUnreachableMessage,
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

describe('the rate-limit message every Lichess caller shares', () => {
  it('names the endpoint and the real remaining wait', () => {
    const now = Date.now()
    expect(lichessRateLimitMessage('Lichess tablebase', now)).toContain('Lichess tablebase')
  })

  it('says "shortly" rather than a number when nothing is left to wait', () => {
    const msg = lichessRateLimitMessage('Opening Explorer', Date.now() + 10_000_000)
    expect(msg).toContain('shortly')
    expect(msg).not.toMatch(/-?\d+s/)
  })

  it('never quotes a fixed minute, which is what went stale', () => {
    expect(lichessRateLimitMessage('X')).not.toContain('in a minute')
  })
})

describe('when Lichess cannot be reached at all', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetLichessFetchQueueForTests()
  })

  /**
   * `fetch` rejects with `TypeError: Failed to fetch` for a dropped connection,
   * a blocked request, DNS or CORS, and that string used to reach the panel
   * verbatim — a browser internal shown to somebody who is simply offline.
   */
  it('replaces the browser string with a sentence, naming the endpoint', async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    await expect(fetchLichessResource('https://lichess.org/x', {}, 'The Lichess tablebase'))
      .rejects.toThrow(/^The Lichess tablebase could not be reached\./)
  })

  it('says the local half still works, because that is the fact that matters', async () => {
    expect(lichessUnreachableMessage('Cloud eval')).toContain('local engine keep working')
  })

  it('falls back to a generic name rather than an empty sentence', async () => {
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    await expect(fetchLichessResource('https://lichess.org/x')).rejects.toThrow(/^Lichess could not be reached/)
  })

  /** Navigating away from a position must not read as a connection error. */
  it('lets an abort through untouched', async () => {
    globalThis.fetch = (() => {
      const error = new Error('The operation was aborted.')
      error.name = 'AbortError'
      return Promise.reject(error)
    }) as typeof fetch
    await expect(fetchLichessResource('https://lichess.org/x', {}, 'Cloud eval'))
      .rejects.toThrow(/aborted/i)
  })

  it('recognises both shapes of cancellation and nothing else', () => {
    const aborted = new Error('nothing useful')
    aborted.name = 'AbortError'
    expect(isLichessAbortError(aborted)).toBe(true)
    expect(isLichessAbortError(new Error('Lichess request aborted.'))).toBe(true)
    expect(isLichessAbortError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isLichessAbortError('failed')).toBe(false)
  })

  it('leaves a response that arrived alone, however bad its status', async () => {
    globalThis.fetch = (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch
    const response = await fetchLichessResource('https://lichess.org/x', {}, 'Cloud eval')
    expect(response.status).toBe(503)
  })
})
