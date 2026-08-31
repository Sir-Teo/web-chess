let lichessFetchQueue: Promise<void> = Promise.resolve()
let lichessBackoffUntilMs = 0

export const LICHESS_RATE_LIMIT_COOLDOWN_MS = 60_000
/** A header asking for longer than this is honoured only up to here. */
export const LICHESS_MAX_COOLDOWN_MS = 120_000

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

/**
 * `Retry-After` is either a count of seconds or an HTTP date. Anything absent,
 * unparseable or already past falls back to the fixed cooldown, and everything
 * is capped so a confused or hostile header cannot park the queue for an hour.
 *
 * Ported from web-katrain's `ogsQueue.ts`. Waiting a flat minute matches
 * Lichess's published advice, but it ignores the server saying it wants longer
 * — and retrying early is what turns a throttle into a ban.
 */
export function parseRetryAfterMs(headerValue: string | null, nowMs: number): number {
  if (!headerValue) return LICHESS_RATE_LIMIT_COOLDOWN_MS

  const trimmed = headerValue.trim()
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds)) {
    if (seconds <= 0) return LICHESS_RATE_LIMIT_COOLDOWN_MS
    return Math.min(seconds * 1000, LICHESS_MAX_COOLDOWN_MS)
  }

  const dateMs = Date.parse(trimmed)
  if (Number.isFinite(dateMs)) {
    const waitMs = dateMs - nowMs
    if (waitMs <= 0) return LICHESS_RATE_LIMIT_COOLDOWN_MS
    return Math.min(waitMs, LICHESS_MAX_COOLDOWN_MS)
  }

  return LICHESS_RATE_LIMIT_COOLDOWN_MS
}

function recordRateLimit(response: Response) {
  if (response.status !== 429) return
  const now = Date.now()
  const waitMs = parseRetryAfterMs(response.headers?.get?.('Retry-After') ?? null, now)
  lichessBackoffUntilMs = Math.max(lichessBackoffUntilMs, now + waitMs)
}

/**
 * How long the shared backoff still has to run, for copy that would otherwise
 * have to guess. Mirrors web-katrain's `getOgsBackoffRemainingMs`.
 */
export function getLichessBackoffRemainingMs(now = Date.now()): number {
  return Math.max(0, lichessBackoffUntilMs - now)
}

/**
 * The message shown when Lichess throttles us.
 *
 * Every caller had its own copy of "try again in a minute", which stopped being
 * true when the backoff started honouring `Retry-After` and could run to two
 * minutes. One sentence, asked of the queue, so the next endpoint added here
 * cannot quote a number that has moved.
 */
export function lichessRateLimitMessage(what: string, now = Date.now()): string {
  const seconds = Math.ceil(getLichessBackoffRemainingMs(now) / 1000)
  return seconds > 0
    ? `${what} rate limit reached; try again in about ${seconds}s.`
    : `${what} rate limit reached; try again shortly.`
}

/**
 * Whether a rejection is the caller cancelling rather than the network failing.
 *
 * `fetch` rejects with an `AbortError` when its signal fires, and this module's
 * own cancellations carry the word too. Both have to pass through untouched, or
 * navigating away from a position becomes a connection error.
 */
export function isLichessAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /abort/i.test(error.message)
}

/**
 * The message shown when Lichess cannot be reached at all.
 *
 * `fetch` rejects with `TypeError: Failed to fetch` for a dropped connection, a
 * blocked request, DNS, CORS — and that string reached the panel verbatim. The
 * sibling of `lichessRateLimitMessage`, and here for the same reason: one
 * sentence, written for a person, so every endpoint says the same thing. It
 * ends with the fact that matters, which is that nothing local has stopped.
 */
export function lichessUnreachableMessage(what: string): string {
  return `${what} could not be reached. Check your connection — the board and the local engine keep working without it.`
}

/**
 * @param label What to call this endpoint if it cannot be reached at all. Most
 * panels prefix the message with their own name — "Cloud eval: ..." — so the
 * plain "Lichess" is right for those; only a panel that renders the message
 * bare needs a longer one.
 */
export function fetchLichessResource(
  input: RequestInfo | URL,
  init: RequestInit = {},
  label = 'Lichess',
): Promise<Response> {
  const signal = init.signal
  const run = async () => {
    if (signal?.aborted) throw abortError(signal)
    const backoffWait = waitForBackoff(signal)
    if (backoffWait) await backoffWait
    if (signal?.aborted) throw abortError(signal)
    let response: Response
    try {
      response = await fetch(input, init)
    } catch (error) {
      if (signal?.aborted || isLichessAbortError(error)) throw error
      throw new Error(lichessUnreachableMessage(label))
    }
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
