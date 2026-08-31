/**
 * What to tell a reader when the engine will not start.
 *
 * The worker reports the browser's own words -- "Uncaught TypeError: Failed to
 * fetch", or an `importScripts` failure quoting a URL -- and those were shown
 * as they came. They name a cause a browser understands and nothing a reader
 * can do about it, which is the same complaint `lichessUnreachableMessage`
 * answers for the network panels.
 *
 * The raw line is not lost: it is already in the Engine Lab console, which is
 * where that level of detail belongs.
 *
 * Everything the app can still do without an engine is worth saying, because
 * it is nearly everything -- the board, the move list, PGN, the library and
 * pass-and-play are all untouched by a dead engine.
 */

const CANNOT_DOWNLOAD = /failed to fetch|importscripts|networkerror|load failed|err_|net::/i
const OUT_OF_MEMORY = /out of memory|memory access|rangeerror|allocation|oom/i
const NEEDS_ISOLATION = /sharedarraybuffer|cross-origin|crossoriginisolated|atomics/i

/**
 * @param profileName The engine build that failed, so a reader switching
 * profiles can tell which one is broken.
 * @param raw Whatever the worker said. Kept as the fallback, because an
 * unrecognised failure is better shown than swallowed.
 */
export function engineBootFailureMessage(profileName: string, raw: string): string {
  const detail = String(raw ?? '').trim()

  if (NEEDS_ISOLATION.test(detail)) {
    return `${profileName} needs cross-origin isolation, which this page does not have. `
      + 'Reload the page, or choose a single-threaded engine profile.'
  }

  if (OUT_OF_MEMORY.test(detail)) {
    return `${profileName} ran out of memory while starting. `
      + 'Try a smaller hash size, or a Lite profile.'
  }

  if (CANNOT_DOWNLOAD.test(detail)) {
    return `${profileName} could not be downloaded. Check your connection and reload — `
      + 'the board, the move list and everything that does not need an engine keep working.'
  }

  // Unrecognised. Say what happened, and only add a full stop if it needs one:
  // the browser's messages usually bring their own, and two looked like a typo.
  const punctuated = /[.!?]$/.test(detail) ? detail : `${detail}.`
  return detail
    ? `${profileName} could not be started: ${punctuated}`
    : `${profileName} could not be started.`
}
