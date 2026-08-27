import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchLichessResource,
  LICHESS_RATE_LIMIT_COOLDOWN_MS,
  resetLichessFetchQueueForTests,
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
