import { withBoundedMapEntry } from '../hooks/cacheLimit'
import { fetchLichessResource, lichessRateLimitMessage } from './lichessQueue'
import { createStorageCache } from './storageCache'

export type OpeningDatabaseSource = 'masters' | 'lichess'
export type OpeningSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical'

export type OpeningExplorerRequest = {
  source: OpeningDatabaseSource
  fen?: string
  moves: string[]
  speeds?: OpeningSpeed[]
  ratings?: number[]
  authToken?: string
}

export type OpeningExplorerMove = {
  uci: string
  san: string
  averageRating?: number
  white: number
  draws: number
  black: number
  opening?: {
    eco: string
    name: string
  } | null
}

export type OpeningExplorerGame = {
  uci?: string
  id?: string
  winner?: 'white' | 'black' | null
  speed?: string
  mode?: string
  year?: number
  month?: string
  white?: { name?: string; rating?: number }
  black?: { name?: string; rating?: number }
}

export type OpeningExplorerResponse = {
  white: number
  draws: number
  black: number
  moves: OpeningExplorerMove[]
  topGames: OpeningExplorerGame[]
  recentGames: OpeningExplorerGame[]
  opening?: {
    eco: string
    name: string
  } | null
}

const EXPLORER_BASE_URL = 'https://explorer.lichess.org'
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_STORAGE_KEY = 'webchess:opening-explorer-cache:v1'
const CACHE_ENTRY_LIMIT = 80
const AUTH_REQUIRED_MESSAGE = 'Opening Explorer requires a Lichess API token.'
const AUTH_REJECTED_MESSAGE = 'Opening Explorer rejected the Lichess API token.'

type CacheEntry = {
  expiresAt: number
  payload: OpeningExplorerResponse
}

let responseCache = new Map<string, CacheEntry>()
const storageCache = createStorageCache<OpeningExplorerResponse>({
  storageKey: CACHE_STORAGE_KEY,
  entryLimit: CACHE_ENTRY_LIMIT,
  parsePayload: raw => parseCachedPayload(raw),
})


function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nonNegativeInt(value: unknown, fallback = 0): number {
  if (!isFiniteNumber(value)) return fallback
  const rounded = Math.round(value)
  return rounded < 0 ? fallback : rounded
}

function clampUniqueInts(values: number[] | undefined, min: number, max: number): number[] {
  if (!values?.length) return []
  const seen = new Set<number>()
  const normalized: number[] = []
  for (const value of values) {
    if (!isFiniteNumber(value)) continue
    const rounded = Math.round(value)
    if (rounded < min || rounded > max) continue
    if (seen.has(rounded)) continue
    seen.add(rounded)
    normalized.push(rounded)
  }
  return normalized
}

function normalizeMoves(moves: string[]): string[] {
  return moves
    .map(move => move.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeFen(fen: string | undefined): string {
  return fen?.trim().replace(/\s+/g, ' ') ?? ''
}

export function normalizeOpeningExplorerFenKey(fen: string | undefined): string {
  const normalized = normalizeFen(fen)
  const parts = normalized.split(/\s+/g)
  return parts.length >= 4 ? parts.slice(0, 4).join(' ') : normalized
}

function normalizeAuthToken(authToken: string | undefined): string {
  const trimmed = authToken?.trim() ?? ''
  return trimmed.replace(/^Bearer(?:\s+|$)/i, '').trim()
}

export function hasOpeningExplorerAuthToken(authToken: string | undefined): boolean {
  return Boolean(normalizeAuthToken(authToken))
}

/**
 * What clicking a book move actually does, said out loud.
 *
 * The row is a button whose contents are "Nf3 47.5% 47,100" -- a description
 * of the data, not of the action -- so its accessible name was that string and
 * nothing else. And the action is not the one every other site has trained
 * people to expect: clicking a move in Lichess's explorer *plays* it, while
 * this restricts the engine's search to it. A control that does something
 * other than the convention has to say so, to a screen reader and in a
 * tooltip.
 *
 * The tablebase rows next to it already carry a composed label; this is the
 * same courtesy for the explorer.
 */
export function openingMoveActionLabel(
  san: string,
  games: number,
  sharePercent: number,
): string {
  return `Analyze only ${san}: ${games.toLocaleString()} games, `
    + `${sharePercent.toFixed(1)}% of this position`
}

export function openingExplorerGameCount(response: Pick<OpeningExplorerResponse, 'white' | 'draws' | 'black'>): number {
  return Math.max(0, response.white) + Math.max(0, response.draws) + Math.max(0, response.black)
}

export function shouldContinueOpeningBookLine(
  response: Pick<OpeningExplorerResponse, 'white' | 'draws' | 'black' | 'moves'>,
  nextMoveUci: string,
): boolean {
  return openingExplorerGameCount(response) > 0
    && response.moves.some(move => move.uci === nextMoveUci)
}

function authHeaders(authToken: string | undefined): HeadersInit {
  const token = normalizeAuthToken(authToken)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function requestCacheKey(request: OpeningExplorerRequest): string {
  const fen = normalizeOpeningExplorerFenKey(request.fen)
  const moves = normalizeMoves(request.moves)
  const speeds = (request.speeds ?? []).slice().sort().join(',')
  const ratings = clampUniqueInts(request.ratings, 400, 3200).sort((a, b) => a - b).join(',')
  return [request.source, fen, moves.join(','), speeds, ratings].join('|')
}

function buildUrl(request: OpeningExplorerRequest): string {
  const sourcePath = request.source === 'masters' ? 'masters' : 'lichess'
  const url = new URL(`${EXPLORER_BASE_URL}/${sourcePath}`)
  const fen = normalizeFen(request.fen)
  const moves = normalizeMoves(request.moves)
  if (fen) url.searchParams.set('fen', fen)
  if (moves.length) url.searchParams.set('play', moves.join(','))

  if (request.source === 'lichess') {
    const speeds = (request.speeds ?? []).filter(Boolean)
    if (speeds.length) url.searchParams.set('speeds', speeds.join(','))

    const ratings = clampUniqueInts(request.ratings, 400, 3200)
    if (ratings.length) url.searchParams.set('ratings', ratings.join(','))
  }

  return url.toString()
}

function parseMove(raw: unknown): OpeningExplorerMove | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.uci !== 'string' || typeof row.san !== 'string') return null

  const opening =
    row.opening && typeof row.opening === 'object'
      ? {
          eco: typeof (row.opening as Record<string, unknown>).eco === 'string'
            ? (row.opening as Record<string, unknown>).eco as string
            : '',
          name: typeof (row.opening as Record<string, unknown>).name === 'string'
            ? (row.opening as Record<string, unknown>).name as string
            : '',
        }
      : null

  return {
    uci: row.uci,
    san: row.san,
    averageRating: isFiniteNumber(row.averageRating) ? Math.round(row.averageRating) : undefined,
    white: nonNegativeInt(row.white),
    draws: nonNegativeInt(row.draws),
    black: nonNegativeInt(row.black),
    opening: opening && opening.name ? opening : null,
  }
}

function parseGames(raw: unknown): OpeningExplorerGame[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      uci: typeof item.uci === 'string' ? item.uci : undefined,
      id: typeof item.id === 'string' ? item.id : undefined,
      winner: item.winner === 'white' || item.winner === 'black' ? item.winner : null,
      speed: typeof item.speed === 'string' ? item.speed : undefined,
      mode: typeof item.mode === 'string' ? item.mode : undefined,
      year: isFiniteNumber(item.year) ? Math.round(item.year) : undefined,
      month: typeof item.month === 'string' ? item.month : undefined,
      white: item.white && typeof item.white === 'object'
        ? {
            name: typeof (item.white as Record<string, unknown>).name === 'string'
              ? (item.white as Record<string, unknown>).name as string
              : undefined,
            rating: isFiniteNumber((item.white as Record<string, unknown>).rating)
              ? Math.round((item.white as Record<string, unknown>).rating as number)
              : undefined,
          }
        : undefined,
      black: item.black && typeof item.black === 'object'
        ? {
            name: typeof (item.black as Record<string, unknown>).name === 'string'
              ? (item.black as Record<string, unknown>).name as string
              : undefined,
            rating: isFiniteNumber((item.black as Record<string, unknown>).rating)
              ? Math.round((item.black as Record<string, unknown>).rating as number)
              : undefined,
          }
        : undefined,
    }))
}

function parseOpening(raw: unknown): { eco: string; name: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const opening = raw as Record<string, unknown>
  if (typeof opening.eco !== 'string' || typeof opening.name !== 'string') return null
  return { eco: opening.eco, name: opening.name }
}

function parseResponse(raw: unknown): OpeningExplorerResponse {
  if (!raw || typeof raw !== 'object') {
    return { white: 0, draws: 0, black: 0, moves: [], topGames: [], recentGames: [], opening: null }
  }
  const payload = raw as Record<string, unknown>
  const movesRaw = Array.isArray(payload.moves) ? payload.moves : []

  return {
    white: nonNegativeInt(payload.white),
    draws: nonNegativeInt(payload.draws),
    black: nonNegativeInt(payload.black),
    moves: movesRaw.map(parseMove).filter((move): move is OpeningExplorerMove => Boolean(move)),
    topGames: parseGames(payload.topGames),
    recentGames: parseGames(payload.recentGames),
    opening: parseOpening(payload.opening),
  }
}

function parseCachedPayload(raw: unknown): OpeningExplorerResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  if (!isFiniteNumber(payload.white) || !isFiniteNumber(payload.draws) || !isFiniteNumber(payload.black)) return null
  if (!Array.isArray(payload.moves) || !Array.isArray(payload.topGames) || !Array.isArray(payload.recentGames)) return null
  return parseResponse(raw)
}

function readCached(request: OpeningExplorerRequest): OpeningExplorerResponse | null {
  const key = requestCacheKey(request)
  const cached = responseCache.get(key)
  const now = Date.now()
  if (cached) {
    if (cached.expiresAt > now) return cached.payload
    responseCache.delete(key)
  }

  const stored = storageCache.read(key)
  // This service never records a miss, so a null payload can only come from a
  // cache someone else wrote; read it as absent.
  if (!stored?.payload) return null
  if (stored.expiresAt <= now) return null

  const entry: CacheEntry = { expiresAt: stored.expiresAt, payload: stored.payload }
  responseCache = withBoundedMapEntry(responseCache, key, entry, CACHE_ENTRY_LIMIT)
  return entry.payload
}

function writeCached(request: OpeningExplorerRequest, payload: OpeningExplorerResponse) {
  const key = requestCacheKey(request)
  const entry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  }
  responseCache = withBoundedMapEntry(responseCache, key, entry, CACHE_ENTRY_LIMIT)
  storageCache.write(key, entry)
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return
  const reason = signal.reason
  throw reason instanceof Error ? reason : new Error('Opening Explorer request aborted.')
}

export function getCachedOpeningExplorer(request: OpeningExplorerRequest): OpeningExplorerResponse | null {
  return readCached(request)
}

export async function fetchOpeningExplorer(
  request: OpeningExplorerRequest,
  signal?: AbortSignal,
): Promise<OpeningExplorerResponse> {
  const cached = readCached(request)
  if (cached) return cached

  if (!normalizeAuthToken(request.authToken)) {
    throw new Error(AUTH_REQUIRED_MESSAGE)
  }

  const response = await fetchLichessResource(buildUrl(request), {
    signal,
    headers: authHeaders(request.authToken),
  }, 'Lichess')
  throwIfAborted(signal)

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(AUTH_REJECTED_MESSAGE)
    }
    if (response.status === 429) {
      throw new Error(lichessRateLimitMessage('Opening Explorer'))
    }
    throw new Error(`Opening Explorer request failed (${response.status}).`)
  }

  const raw = await response.json()
  throwIfAborted(signal)

  const parsed = parseResponse(raw)
  writeCached(request, parsed)
  return parsed
}

export async function prefetchOpeningExplorer(request: OpeningExplorerRequest, signal?: AbortSignal): Promise<void> {
  if (readCached(request)) return
  if (!normalizeAuthToken(request.authToken)) return
  try {
    await fetchOpeningExplorer(request, signal)
  } catch {
    // Ignore prefetch errors; live views will show fetch status as needed.
  }
}
