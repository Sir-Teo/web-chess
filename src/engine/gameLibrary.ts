/**
 * The saved-games model: a flat list of PGN games with the metadata the
 * library rows need. Pure data handling only — persistence lives alongside it
 * so this half stays testable without a browser.
 */
import { matchesSearchTerms, toSearchTerms } from './searchTerms'

export const MAX_LIBRARY_GAMES = 500
export const MAX_LIBRARY_PGN_LENGTH = 512_000
export const MAX_LIBRARY_NAME_LENGTH = 120
export const MAX_LIBRARY_BACKUP_LENGTH = 8_000_000

export const LIBRARY_BACKUP_FORMAT = 'web-chess-library'
export const LIBRARY_BACKUP_VERSION = 1

export type LibraryGameMetadata = {
  event?: string
  site?: string
  date?: string
  round?: string
  white?: string
  black?: string
  result?: string
  eco?: string
  opening?: string
  whiteElo?: number
  blackElo?: number
}

export type LibraryGame = {
  id: string
  name: string
  pgn: string
  createdAt: number
  updatedAt: number
  moveCount: number
  size: number
  favorite: boolean
  metadata: LibraryGameMetadata
}

export type LibrarySort = 'recent' | 'oldest' | 'name' | 'moves'

const HEADER_LINE = /^\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/
const SAN_TOKEN = /^(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?)[+#]?[!?]*$/
const RESULT_TOKEN = /^(?:1-0|0-1|1\/2-1\/2|\*)$/

function unescapePgnHeaderValue(value: string): string {
  return value.replace(/\\(["\\])/g, '$1')
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === '?' || trimmed === '-') return undefined
  return trimmed
}

function positiveIntOrUndefined(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined
}

export function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of String(pgn ?? '').split(/\r?\n/)) {
    const match = HEADER_LINE.exec(line)
    if (match) {
      headers[match[1]] = unescapePgnHeaderValue(match[2])
      continue
    }
    // Header block ends at the first non-header, non-blank line.
    if (line.trim()) break
  }
  return headers
}

export function extractLibraryMetadata(pgn: string): LibraryGameMetadata {
  const headers = parsePgnHeaders(pgn)
  return {
    event: trimmedOrUndefined(headers.Event),
    site: trimmedOrUndefined(headers.Site),
    date: trimmedOrUndefined(headers.Date),
    round: trimmedOrUndefined(headers.Round),
    white: trimmedOrUndefined(headers.White),
    black: trimmedOrUndefined(headers.Black),
    result: resultOrUndefined(headers.Result),
    eco: trimmedOrUndefined(headers.ECO),
    opening: trimmedOrUndefined(headers.Opening),
    whiteElo: positiveIntOrUndefined(headers.WhiteElo),
    blackElo: positiveIntOrUndefined(headers.BlackElo),
  }
}

/**
 * `*` is how a PGN says a game has no result yet, so it is a placeholder in
 * exactly the way `?` and `-` are -- but only in the Result tag, which is why
 * it does not belong in `trimmedOrUndefined`.
 *
 * Without this a row reads "Player 1 - Player 2 · * · 2026.08.31", showing a
 * person a token that means nothing to them, and every unfinished game carries
 * a `*` into the search index.
 */
function resultOrUndefined(value: string | undefined): string | undefined {
  const trimmed = trimmedOrUndefined(value)
  return trimmed === '*' ? undefined : trimmed
}

function stripPgnHeaders(pgn: string): string {
  const lines = String(pgn ?? '').split(/\r?\n/)
  let index = 0
  while (index < lines.length && (HEADER_LINE.test(lines[index]) || !lines[index].trim())) index += 1
  return lines.slice(index).join('\n')
}

/**
 * Replaces each `{...}` comment with a space in one pass. The obvious
 * `/\{[^}]*\}/g` backtracks from every `{` that has no closing brace, which is
 * quadratic on a file full of braces that is not really a PGN.
 */
function stripBlockComments(text: string): string {
  if (!text.includes('{')) return text

  let out = ''
  let index = 0
  for (;;) {
    const open = text.indexOf('{', index)
    if (open < 0) return out + text.slice(index)
    const close = text.indexOf('}', open + 1)
    if (close < 0) return out + text.slice(index)
    out += `${text.slice(index, open)} `
    index = close + 1
  }
}

/** Drops bracketed variations, honouring nesting, so only the main line is left. */
function stripVariations(movetext: string): string {
  let depth = 0
  let out = ''
  for (const char of movetext) {
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0) out += char
  }
  return out
}

/** Plies in the main line. Comments, variations, NAGs and results do not count. */
export function countPgnMoves(pgn: string): number {
  const movetext = stripVariations(
    stripBlockComments(stripPgnHeaders(pgn))
      .replace(/;[^\n]*/g, ' ')
      .replace(/\$\d+/g, ' '),
  )
  return movetext
    .split(/\s+/)
    .filter(token => token && !RESULT_TOKEN.test(token) && SAN_TOKEN.test(token))
    .length
}

export function suggestGameName(pgn: string): string {
  const { white, black, event, date } = extractLibraryMetadata(pgn)
  const players = white || black ? `${white ?? 'Unknown'} vs ${black ?? 'Unknown'}` : ''
  const parts = [players || event, date].filter(Boolean)
  return parts.join(' · ').slice(0, MAX_LIBRARY_NAME_LENGTH) || 'Untitled game'
}

export function getUniqueGameName(name: string, existingNames: Iterable<string>): string {
  const taken = new Set(existingNames)
  const base = name.trim().slice(0, MAX_LIBRARY_NAME_LENGTH) || 'Untitled game'
  if (!taken.has(base)) return base

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tail = ` (${suffix})`
    const candidate = `${base.slice(0, MAX_LIBRARY_NAME_LENGTH - tail.length)}${tail}`
    if (!taken.has(candidate)) return candidate
  }
  return base
}

let idCounter = 0

function makeLibraryId(now: number): string {
  idCounter += 1
  return `game-${now.toString(36)}-${idCounter.toString(36)}`
}

export function createLibraryGame(name: string, pgn: string, now: number, id?: string): LibraryGame {
  const text = String(pgn ?? '')
  return {
    id: id ?? makeLibraryId(now),
    name: name.trim().slice(0, MAX_LIBRARY_NAME_LENGTH) || suggestGameName(text),
    pgn: text,
    createdAt: now,
    updatedAt: now,
    moveCount: countPgnMoves(text),
    size: text.length,
    favorite: false,
    metadata: extractLibraryMetadata(text),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Turns whatever came back from storage into games we are willing to render.
 * Anything oversized, malformed, or duplicated by id is dropped rather than
 * trusted, so a corrupted store cannot take the library down with it.
 */
export function normalizeLibraryGames(value: unknown, now = 0): LibraryGame[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const games: LibraryGame[] = []

  for (const entry of value) {
    if (games.length >= MAX_LIBRARY_GAMES) break
    if (!isRecord(entry)) continue

    const pgn = typeof entry.pgn === 'string' ? entry.pgn : ''
    if (!pgn || pgn.length > MAX_LIBRARY_PGN_LENGTH) continue

    const id = typeof entry.id === 'string' && entry.id ? entry.id : makeLibraryId(now)
    if (seen.has(id)) continue
    seen.add(id)

    const createdAt = finiteTimestamp(entry.createdAt, now)
    const rawName = typeof entry.name === 'string' ? entry.name.trim() : ''
    games.push({
      id,
      name: (rawName || suggestGameName(pgn)).slice(0, MAX_LIBRARY_NAME_LENGTH),
      pgn,
      createdAt,
      updatedAt: finiteTimestamp(entry.updatedAt, createdAt),
      moveCount: countPgnMoves(pgn),
      size: pgn.length,
      favorite: entry.favorite === true,
      metadata: extractLibraryMetadata(pgn),
    })
  }

  return games
}

export type LibraryBackupMerge = {
  /** The list to commit. Existing games are never displaced. */
  games: LibraryGame[]
  /** Games from the backup that were added. */
  added: number
  /** Games from the backup already in the library, so not added twice. */
  duplicates: number
  /** Games from the backup there was no room for under the cap. */
  omitted: number
}

/**
 * Merge a restored backup into the library, keeping what is already there.
 *
 * The cap has to be applied *here*, deliberately, rather than left to
 * `normalizeLibraryGames`. That function stops at {@link MAX_LIBRARY_GAMES}
 * and drops the rest, and the import used to hand it the additions first --
 * so importing a 300-game backup into a 400-game library kept all 300 new
 * games and threw away 200 of the reader's own, silently, and reported
 * success. Saving a game has always refused when the library is full; this is
 * the same rule for the other way in.
 *
 * Existing games keep their places and the backup fills whatever room is
 * left, in the order the file lists them, so what is dropped is the tail of
 * something the reader still has a copy of.
 */
export function mergeLibraryBackup(
  existing: LibraryGame[],
  restored: LibraryGame[],
): LibraryBackupMerge {
  const existingIds = new Set(existing.map(game => game.id))
  const names = existing.map(game => game.name)
  const room = Math.max(0, MAX_LIBRARY_GAMES - existing.length)

  const additions: LibraryGame[] = []
  let duplicates = 0
  let omitted = 0

  for (const game of restored) {
    if (existingIds.has(game.id)) { duplicates++; continue }
    if (additions.length >= room) { omitted++; continue }
    const name = getUniqueGameName(game.name, [...names, ...additions.map(item => item.name)])
    additions.push({ ...game, name })
  }

  return {
    games: additions.length ? [...additions, ...existing] : existing,
    added: additions.length,
    duplicates,
    omitted,
  }
}

/**
 * What to tell the reader about a merge, or null when it went entirely to plan.
 *
 * Silence is right only when every game in the file was added. Anything
 * skipped -- already held, or no room -- is a difference between what they
 * handed over and what they got, and they should hear it from the app rather
 * than notice it later.
 */
export function backupMergeNote(merge: LibraryBackupMerge): string | null {
  const plural = (count: number) => (count === 1 ? 'game' : 'games')
  const parts: string[] = []

  if (merge.duplicates > 0) {
    parts.push(`${merge.duplicates} ${plural(merge.duplicates)} already in the library`)
  }
  if (merge.omitted > 0) {
    parts.push(`${merge.omitted} ${plural(merge.omitted)} left out — the library holds ${MAX_LIBRARY_GAMES}`)
  }
  if (!parts.length) return null

  const added = merge.added > 0
    ? `Added ${merge.added} ${plural(merge.added)}; `
    : 'Added nothing: '
  return `${added}${parts.join(', ')}.`
}

/**
 * What to say after adding a batch of games from one file.
 *
 * Same rule as {@link backupMergeNote}: silence only when everything the
 * reader handed over went in. A file with three unreadable games in it is a
 * difference they should hear about now rather than discover later.
 */
export function libraryImportNote(counts: {
  added: number
  unreadable: number
  omitted: number
}): string | null {
  const plural = (count: number) => (count === 1 ? 'game' : 'games')
  const parts: string[] = []

  if (counts.unreadable > 0) {
    parts.push(`${counts.unreadable} ${plural(counts.unreadable)} could not be read`)
  }
  if (counts.omitted > 0) {
    parts.push(`${counts.omitted} ${plural(counts.omitted)} left out — the library holds ${MAX_LIBRARY_GAMES}`)
  }

  const added = `Added ${counts.added} ${plural(counts.added)} to the library`
  if (!parts.length) return `${added}.`
  return `${added}; ${parts.join(', ')}.`
}

export function getLibraryGameSearchText(game: LibraryGame): string {
  const { white, black, event, site, date, result, eco, opening } = game.metadata
  return [game.name, white, black, event, site, date, result, eco, opening]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function libraryGameMatchesQuery(game: LibraryGame, query: string): boolean {
  const terms = toSearchTerms(query)
  if (terms.length === 0) return true
  return matchesSearchTerms(getLibraryGameSearchText(game), terms)
}

export function sortLibraryGames(games: LibraryGame[], sort: LibrarySort): LibraryGame[] {
  const sorted = [...games]
  switch (sort) {
    case 'oldest':
      return sorted.sort((a, b) => a.updatedAt - b.updatedAt)
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'moves':
      return sorted.sort((a, b) => b.moveCount - a.moveCount)
    case 'recent':
    default:
      return sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export function formatLibrarySize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getLibraryStats(games: LibraryGame[]): { count: number; moves: number; size: number } {
  return games.reduce(
    (stats, game) => ({
      count: stats.count + 1,
      moves: stats.moves + game.moveCount,
      size: stats.size + game.size,
    }),
    { count: 0, moves: 0, size: 0 },
  )
}

export function createLibraryBackup(games: LibraryGame[]): string {
  return JSON.stringify({
    format: LIBRARY_BACKUP_FORMAT,
    version: LIBRARY_BACKUP_VERSION,
    games: games.map(({ id, name, pgn, createdAt, updatedAt, favorite }) => ({
      id,
      name,
      pgn,
      createdAt,
      updatedAt,
      favorite,
    })),
  })
}

export function parseLibraryBackup(json: string, now = 0): LibraryGame[] {
  if (typeof json !== 'string' || json.length > MAX_LIBRARY_BACKUP_LENGTH) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!isRecord(parsed) || parsed.format !== LIBRARY_BACKUP_FORMAT) return []
  return normalizeLibraryGames(parsed.games, now)
}
