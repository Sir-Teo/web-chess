let lichessFetchQueue: Promise<void> = Promise.resolve()
let lichessBackoffUntilMs = 0

export const LICHESS_RATE_LIMIT_COOLDOWN_MS = 60_000

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason
  return reason instanceof Error ? reason : new Error('Lichess request aborted.')
}

export function resetLichessFetchQueueForTests() {
  lichessFetchQueue = Promise.resolve()
  lichessBackoffUntilMs = 0
}

function waitForBackoff(signal: AbortSignal | null | undefined): Promise<void> | void {
  const delayMs = lichessBackoffUntilMs - Date.now()
  if (delayMs <= 0) return
  if (signal?.aborted) throw abortError(signal)

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)

    function onAbort() {
      clearTimeout(timeoutId)
      reject(signal ? abortError(signal) : new Error('Lichess request aborted.'))
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function recordRateLimit(response: Response) {
  if (response.status !== 429) return
  lichessBackoffUntilMs = Math.max(
    lichessBackoffUntilMs,
    Date.now() + LICHESS_RATE_LIMIT_COOLDOWN_MS,
  )
}

export function fetchLichessResource(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const signal = init.signal
  const run = async () => {
    if (signal?.aborted) throw abortError(signal)
    const backoffWait = waitForBackoff(signal)
    if (backoffWait) await backoffWait
    if (signal?.aborted) throw abortError(signal)
    const response = await fetch(input, init)
    recordRateLimit(response)
    return response
  }

  const request = lichessFetchQueue.then(run, run)
  lichessFetchQueue = request.then(
    () => undefined,
    () => undefined,
  )
  return request
}
