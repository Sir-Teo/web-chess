export type OpeningDatabaseSource = 'masters' | 'lichess'
export type OpeningSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical'

export type OpeningExplorerRequest = {
  source: OpeningDatabaseSource
  moves: string[]
  speeds?: OpeningSpeed[]
  ratings?: number[]
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

const EXPLORER_BASE_URL = 'https://explorer.lichess.ovh'
const CACHE_TTL_MS = 5 * 60 * 1000

type CacheEntry = {
  expiresAt: number
  payload: OpeningExplorerResponse
}

const responseCache = new Map<string, CacheEntry>()

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

function requestCacheKey(request: OpeningExplorerRequest): string {
  const moves = normalizeMoves(request.moves)
  const speeds = (request.speeds ?? []).slice().sort().join(',')
  const ratings = clampUniqueInts(request.ratings, 400, 3200).sort((a, b) => a - b).join(',')
  return [request.source, moves.join(','), speeds, ratings].join('|')
}

function buildUrl(request: OpeningExplorerRequest): string {
  const sourcePath = request.source === 'masters' ? 'masters' : 'lichess'
  const url = new URL(`${EXPLORER_BASE_URL}/${sourcePath}`)
  const moves = normalizeMoves(request.moves)
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

function readCached(request: OpeningExplorerRequest): OpeningExplorerResponse | null {
  const key = requestCacheKey(request)
  const cached = responseCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(key)
    return null
  }
  return cached.payload
}

function writeCached(request: OpeningExplorerRequest, payload: OpeningExplorerResponse) {
  responseCache.set(requestCacheKey(request), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  })
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

  const response = await fetch(buildUrl(request), { signal })
  if (!response.ok) {
    throw new Error(`Opening Explorer request failed (${response.status}).`)
  }

  const raw = await response.json()
  const parsed = parseResponse(raw)
  writeCached(request, parsed)
  return parsed
}

export async function prefetchOpeningExplorer(request: OpeningExplorerRequest): Promise<void> {
  if (readCached(request)) return
  try {
    await fetchOpeningExplorer(request)
  } catch {
    // Ignore prefetch errors; live views will show fetch status as needed.
  }
}

