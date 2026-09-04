/**
 * Fetching a player's own games from Lichess or chess.com.
 *
 * The addressing is in `gameArchives.ts`; this is the part that talks to the
 * network. What comes back is a list of PGN texts, which is exactly what the
 * paste path already hands the library importer — a downloaded database and a
 * pasted one stay one code path, so the counting, naming, deduplication and
 * ceilings are all the ones that are already tested.
 *
 * Lichess goes through `fetchLichessResource` so it shares the app's single
 * queue and its `Retry-After` backoff with cloud eval, the explorer and the
 * tablebase: three panels already talk to that host, and a fourth that ignored
 * the throttle would get all four banned. chess.com has no such shared state
 * and is fetched directly.
 */

import { fetchLichessResource, isLichessAbortError } from './lichessQueue'
import { splitPgnGames } from './pgn'
import {
  archiveErrorMessage,
  chessComArchivesUrl,
  chessComMonthPgnUrl,
  clampArchiveGameCount,
  parseChessComArchiveMonths,
  latestGamesFromPgn,
  lichessArchiveUrl,
  type ArchiveSource,
} from './gameArchives'

/**
 * How far back to look on chess.com for enough games.
 *
 * Lichess answers "the last N games" in one request. chess.com only publishes
 * whole months, so a player who has not played this month needs the one before.
 * Six covers a lapsed season without turning one click into a year of requests.
 */
export const MAX_CHESSCOM_MONTHS = 6

/**
 * A ceiling on what one fetch will hold in memory, across every month it reads.
 *
 * One month of a very active account measured 1.5 MB, so a six-month walk can
 * be large. This stops before it is unreasonable rather than after.
 */
export const MAX_ARCHIVE_BYTES = 8_000_000

export type ArchiveRequester = (url: string, init: RequestInit) => Promise<Response>

export type FetchArchiveOptions = {
  signal?: AbortSignal
  /** Overridden by the tests, which have no network. */
  requesters?: Partial<Record<ArchiveSource, ArchiveRequester>>
}

const defaultRequesters: Record<ArchiveSource, ArchiveRequester> = {
  lichess: (url, init) => fetchLichessResource(url, init, 'Lichess'),
  chesscom: (url, init) => fetch(url, init),
}

/** The sibling of `lichessUnreachableMessage`, for the host that has none. */
export function archiveUnreachableMessage(source: ArchiveSource): string {
  const site = source === 'lichess' ? 'Lichess' : 'Chess.com'
  return `${site} could not be reached. Check your connection — the board and the local engine keep working without it.`
}

async function request(
  source: ArchiveSource,
  url: string,
  options: FetchArchiveOptions,
  accept: string,
): Promise<Response> {
  const requester = options.requesters?.[source] ?? defaultRequesters[source]
  try {
    return await requester(url, { headers: { Accept: accept }, signal: options.signal })
  } catch (error) {
    if (options.signal?.aborted || isLichessAbortError(error)) throw error
    // `fetchLichessResource` has already turned a dropped connection into a
    // sentence; anything raw from `fetch` still reads "Failed to fetch".
    if (error instanceof Error && error.message.includes('could not be reached')) throw error
    throw new Error(archiveUnreachableMessage(source))
  }
}

async function fetchLichessGames(
  username: string,
  max: number,
  options: FetchArchiveOptions,
): Promise<string[]> {
  const response = await request('lichess', lichessArchiveUrl(username, max), options, 'application/x-chess-pgn')
  if (!response.ok) throw new Error(archiveErrorMessage('lichess', response.status, username))
  return splitPgnGames(await response.text())
}

async function fetchChessComGames(
  username: string,
  max: number,
  options: FetchArchiveOptions,
): Promise<string[]> {
  const listResponse = await request('chesscom', chessComArchivesUrl(username), options, 'application/json')
  if (!listResponse.ok) throw new Error(archiveErrorMessage('chesscom', listResponse.status, username))

  const months = parseChessComArchiveMonths(await listResponse.json()).slice(0, MAX_CHESSCOM_MONTHS)

  const games: string[] = []
  let bytes = 0
  for (const month of months) {
    if (games.length >= max || bytes >= MAX_ARCHIVE_BYTES) break
    const monthResponse = await request('chesscom', chessComMonthPgnUrl(username, month), options, 'application/x-chess-pgn')
    // A month that will not load is skipped rather than failing the walk: the
    // months either side of it are still the games the reader asked for.
    if (!monthResponse.ok) continue
    const text = await monthResponse.text()
    bytes += text.length
    games.push(...splitPgnGames(text))
  }
  return games
}

/**
 * The most recent games a player has on one site, newest first.
 *
 * Throws with a sentence a panel can print. An abort passes straight through,
 * because a reader who changed their mind is not an error.
 */
export async function fetchArchiveGames(
  source: ArchiveSource,
  username: string,
  max: number,
  options: FetchArchiveOptions = {},
): Promise<string[]> {
  const count = clampArchiveGameCount(max)
  const games = source === 'lichess'
    ? await fetchLichessGames(username, count, options)
    : await fetchChessComGames(username, count, options)
  return latestGamesFromPgn(games, count)
}
