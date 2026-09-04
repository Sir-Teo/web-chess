/**
 * Your own games, fetched by username.
 *
 * The app could already read a PGN database and link out to Lichess; what it
 * could not do is the thing people actually want a review board for — "show me
 * the five blitz games I just lost". That meant leaving the app, exporting from
 * Lichess or chess.com, and pasting the file back in. Both sites publish the
 * games without a token, and both allow the request from a browser, so the trip
 * was never necessary.
 *
 * Only the addressing and the sorting live here. The fetching is in
 * `archiveFetch.ts`, and what comes back is handed to `splitPgnGames` and the
 * library importer that the paste path already uses — a downloaded database and
 * a pasted one are the same thing, and should stay one code path.
 */

export type ArchiveSource = 'lichess' | 'chesscom'

export type ArchiveSourceInfo = {
  id: ArchiveSource
  label: string
  /** Where a reader would find the name, for the field's placeholder. */
  placeholder: string
}

export const ARCHIVE_SOURCES: ArchiveSourceInfo[] = [
  { id: 'lichess', label: 'Lichess', placeholder: 'lichess username' },
  { id: 'chesscom', label: 'Chess.com', placeholder: 'chess.com username' },
]

/** The most one fetch will bring back, whatever is asked for. */
export const MAX_ARCHIVE_GAMES = 50
/** What the field starts on: enough to review a session, small enough to be quick. */
export const DEFAULT_ARCHIVE_GAMES = 10

export function clampArchiveGameCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ARCHIVE_GAMES
  return Math.min(MAX_ARCHIVE_GAMES, Math.max(1, Math.floor(value)))
}

/**
 * A username, from whatever the reader pasted.
 *
 * People paste the profile link as often as they type the name, so `@foo`,
 * `lichess.org/@/foo` and `chess.com/member/foo` all resolve to `foo`.
 *
 * The result goes into a URL path, so the character set is the security
 * boundary and not a politeness: a name is rejected rather than escaped if it
 * holds anything that could steer the request somewhere else. Both sites use
 * the same alphabet, so one rule covers both.
 */
export function normalizeArchiveUsername(raw: string): string | null {
  let value = String(raw ?? '').trim()
  if (!value) return null

  // A pasted profile link, in the forms either site hands out. Only these:
  // an earlier version fell back to "the last path segment of anything", which
  // read `http://evil` as the player `evil` and `a/b/../../admin` as `admin`.
  // Neither could steer the request anywhere -- the alphabet below sees to
  // that -- but inventing a name out of a URL this module does not recognise is
  // a worse answer than saying so.
  const fromUrl = value.match(/(?:lichess\.org\/@\/|chess\.com\/(?:member|members)\/)([^/?#\s]+)/i)
  if (fromUrl) value = fromUrl[1]

  value = value.replace(/^@+/, '').trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/.test(value)) return null
  return value
}

/**
 * Lichess's game export.
 *
 * `sort=dateDesc` is already the default; naming it means a change of default
 * cannot silently turn "your last ten games" into your first ten. Clocks and
 * opening tags are asked for because the review reads both — a `[%clk]` beside
 * a blunder is the explanation the centipawns never carry. Evaluations are not:
 * they are Lichess's own analysis, and this app has an engine.
 */
export function lichessArchiveUrl(username: string, max: number): string {
  const count = clampArchiveGameCount(max)
  const query = new URLSearchParams({
    max: String(count),
    sort: 'dateDesc',
    clocks: 'true',
    opening: 'true',
    evals: 'false',
  })
  return `https://lichess.org/api/games/user/${encodeURIComponent(username)}?${query}`
}

export function chessComArchivesUrl(username: string): string {
  return `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`
}

export type ArchiveMonth = { year: number; month: number }

/**
 * The months a chess.com player has games in, newest first.
 *
 * The endpoint answers with absolute URLs. Those are read for their year and
 * month and then thrown away, and the URL to fetch is rebuilt from the username
 * this app already holds: a list of addresses supplied by a remote service is
 * not a list of addresses to fetch, however well-known the service.
 */
export function parseChessComArchiveMonths(payload: unknown): ArchiveMonth[] {
  const archives = (payload as { archives?: unknown })?.archives
  if (!Array.isArray(archives)) return []
  const months: ArchiveMonth[] = []
  for (const entry of archives) {
    if (typeof entry !== 'string') continue
    const match = entry.match(/\/games\/(\d{4})\/(\d{2})\s*$/)
    if (!match) continue
    const year = Number(match[1])
    const month = Number(match[2])
    if (!Number.isFinite(year) || month < 1 || month > 12) continue
    months.push({ year, month })
  }
  months.sort((a, b) => (b.year - a.year) || (b.month - a.month))
  return months
}

export function chessComMonthPgnUrl(username: string, { year, month }: ArchiveMonth): string {
  const paddedMonth = String(month).padStart(2, '0')
  return `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${paddedMonth}/pgn`
}

/**
 * A game's date and time, as one sortable string, or null when it has none.
 *
 * `UTCDate` is preferred over `Date` because chess.com writes both and they
 * disagree: `Date` is the player's local day. The PGN date separator is a dot
 * and the fields are already fixed-width, so the concatenation sorts correctly
 * as text and needs no parsing into a real date.
 */
export function archiveGameTimestamp(pgn: string): string | null {
  const tag = (name: string) => pgn.match(new RegExp(`\\[${name}\\s+"([^"]*)"\\]`))?.[1]?.trim()
  const date = tag('UTCDate') ?? tag('Date')
  if (!date || !/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return null
  const time = tag('UTCTime') ?? tag('Time')
  return `${date} ${/^\d{2}:\d{2}:\d{2}$/.test(time ?? '') ? time : '00:00:00'}`
}

/**
 * The most recent `max` games in a PGN database.
 *
 * Not "the last `max` in the file", which is what this wanted to be: a
 * chess.com month is not in date order. Its July archive holds daily games that
 * *finished* in July and started in June, appended after the live games and out
 * of order among themselves — checked against a real account rather than
 * assumed, because the ordering is documented nowhere.
 *
 * Games with no readable date keep their position behind the dated ones rather
 * than being dropped: an undated game is still a game the reader asked for.
 */
export function latestGamesFromPgn(games: string[], max: number): string[] {
  const count = clampArchiveGameCount(max)
  const ordered = games
    .map((pgn, index) => ({ pgn, index, at: archiveGameTimestamp(pgn) }))
    .sort((a, b) => {
      if (a.at && b.at) return a.at === b.at ? a.index - b.index : (a.at < b.at ? 1 : -1)
      if (a.at) return -1
      if (b.at) return 1
      return a.index - b.index
    })
  return ordered.slice(0, count).map(entry => entry.pgn)
}

/**
 * What to say when a fetch comes back wrong.
 *
 * A status code is not a sentence, and the two sites disagree about which one
 * they use for an unknown player -- Lichess answers 404 with a web page, so
 * nothing useful can be read out of the body either way.
 */
export function archiveErrorMessage(source: ArchiveSource, status: number, username: string): string {
  const site = source === 'lichess' ? 'Lichess' : 'Chess.com'
  if (status === 404) return `${site} has no player called “${username}”.`
  if (status === 429) return `${site} is rate limiting this request. Try again in a minute.`
  if (status >= 500) return `${site} is having trouble right now. Try again shortly.`
  return `${site} refused the request (${status}).`
}
