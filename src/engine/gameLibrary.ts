/**
 * The saved-games model: a flat list of PGN games with the metadata the
 * library rows need. Pure data handling only — persistence lives alongside it
 * so this half stays testable without a browser.
 */

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
    result: trimmedOrUndefined(headers.Result),
    eco: trimmedOrUndefined(headers.ECO),
    opening: trimmedOrUndefined(headers.Opening),
    whiteElo: positiveIntOrUndefined(headers.WhiteElo),
    blackElo: positiveIntOrUndefined(headers.BlackElo),
  }
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

export function getLibraryGameSearchText(game: LibraryGame): string {
  const { white, black, event, site, date, result, eco, opening } = game.metadata
  return [game.name, white, black, event, site, date, result, eco, opening]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function libraryGameMatchesQuery(game: LibraryGame, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = getLibraryGameSearchText(game)
  return needle.split(/\s+/).every(term => haystack.includes(term))
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
