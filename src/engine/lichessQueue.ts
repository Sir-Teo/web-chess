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
 * How long one request may take before this queue stops waiting for it.
 *
 * This matters more than a timeout usually does, because the queue is serial:
 * every request chains off the one before, so a request that never settles
 * never lets the next one start. **Measured** against a host that accepts the
 * connection and then says nothing: one hanging `/api/cloud-eval` at 3.5s, and
 * after it, navigating four plies asked for nothing and pressing Fetch sent no
 * request at all -- the button sat at "Fetching…" while its request waited
 * behind a cloud evaluation that would never arrive. Cloud scores, the opening
 * explorer, the tablebase and the archive fetch all come through here, so one
 * silent socket stopped every one of them until the page was reloaded.
 *
 * Shorter than the archive's own twenty seconds, and deliberately: these are
 * small JSON reads that a working host answers in well under a second, and
 * every one of them is holding the queue while it waits.
 */
export const LICHESS_REQUEST_TIMEOUT_MS = 10_000

export function lichessTimedOutMessage(what: string): string {
  return `${what} did not answer in time. The board and the local engine keep working without it.`
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
  timeoutMs = LICHESS_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const signal = init.signal
  const run = async () => {
    if (signal?.aborted) throw abortError(signal)
    const backoffWait = waitForBackoff(signal)
    if (backoffWait) await backoffWait
    if (signal?.aborted) throw abortError(signal)
    let response: Response
    // Its own controller, so the timeout can cancel the request in flight while
    // the caller's own abort still passes through untouched.
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort()
    signal?.addEventListener('abort', abortFromCaller)
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // Raced rather than left to the signal alone: a transport that ignores it
      // would otherwise hold the queue for ever with a timeout attached and
      // doing nothing.
      response = await Promise.race([
        fetch(input, { ...init, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true
            controller.abort()
            reject(new Error(lichessTimedOutMessage(label)))
          }, timeoutMs)
        }),
      ])
    } catch (error) {
      // Before the abort passthrough, and it has to be: the timeout cancels the
      // request, so what comes back is an abort. The other way round, every
      // timeout would read as the caller changing its mind.
      if (timedOut) throw new Error(lichessTimedOutMessage(label))
      if (signal?.aborted || isLichessAbortError(error)) throw error
      throw new Error(lichessUnreachableMessage(label))
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', abortFromCaller)
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
