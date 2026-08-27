import type { EvalSnapshot } from './analysis'
import { withBoundedMapEntry } from '../hooks/cacheLimit'
import { fetchLichessResource } from './lichessQueue'

export type CloudEvalRequest = {
  fen: string
  multiPv?: number
}

export type CloudEvalLine = {
  moves: string[]
  cp?: number
  mate?: number
}

export type CloudEvalResult = {
  fen: string
  depth: number
  knodes: number
  pvs: CloudEvalLine[]
  fetchedAt: number
}

const CLOUD_EVAL_URL = 'https://lichess.org/api/cloud-eval'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_STORAGE_KEY = 'webchess:cloud-eval-cache:v1'
const CACHE_ENTRY_LIMIT = 120
const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/i

type CacheEntry = {
  expiresAt: number
  payload: CloudEvalResult | null
}

let responseCache = new Map<string, CacheEntry>()
let storageCacheRaw: string | null | undefined
let storageCacheSnapshot: Record<string, unknown> = {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function positiveInt(value: unknown, fallback = 0): number {
  if (!isFiniteNumber(value)) return fallback
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : fallback
}

export function normalizeCloudEvalMultiPv(value: number | undefined): number {
  if (!isFiniteNumber(value)) return 1
  return Math.max(1, Math.min(5, Math.round(value)))
}

export function normalizeCloudEvalFen(fen: string): string {
  const parts = fen.trim().split(/\s+/g)
  return parts.length >= 4 ? parts.slice(0, 4).join(' ') : fen.trim()
}

export function cloudEvalRequestKey(request: CloudEvalRequest): string {
  return `${normalizeCloudEvalFen(request.fen)}|${normalizeCloudEvalMultiPv(request.multiPv)}`
}

function readStorageCache(): Record<string, unknown> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY)
    if (raw === storageCacheRaw) return storageCacheSnapshot
    if (!raw) {
      storageCacheRaw = raw
      storageCacheSnapshot = {}
      return storageCacheSnapshot
    }
    const parsed = JSON.parse(raw)
    storageCacheRaw = raw
    storageCacheSnapshot = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, CacheEntry>
      : {}
    return storageCacheSnapshot
  } catch {
    storageCacheRaw = undefined
    storageCacheSnapshot = {}
    return {}
  }
}

function writeStorageCache(cache: Record<string, CacheEntry>) {
  if (typeof window === 'undefined') return
  try {
    const serialized = JSON.stringify(cache)
    window.localStorage.setItem(CACHE_STORAGE_KEY, serialized)
    storageCacheRaw = serialized
    storageCacheSnapshot = cache
  } catch {
    // Cache persistence is optional; ignore private-mode/quota failures.
  }
}

function writeStorageCacheEntry(key: string, entry: CacheEntry) {
  const now = Date.now()
  const stored = { ...readStorageCache() }
  stored[key] = entry

  const pruned = Object.fromEntries(
    Object.entries(stored)
      .map(([entryKey, value]) => [entryKey, parseCacheEntry(value)] as const)
      .filter((entry): entry is readonly [string, CacheEntry] => entry[1] !== null && entry[1].expiresAt > now)
      .sort(([, a], [, b]) => b.expiresAt - a.expiresAt)
      .slice(0, CACHE_ENTRY_LIMIT),
  )
  writeStorageCache(pruned)
}

function parseCachedResult(raw: unknown): CloudEvalResult | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  if (typeof payload.fen !== 'string') return null
  if (!isFiniteNumber(payload.depth) || !isFiniteNumber(payload.knodes) || !isFiniteNumber(payload.fetchedAt)) return null

  const pvs: CloudEvalLine[] = []
  if (Array.isArray(payload.pvs)) {
    for (const item of payload.pvs) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      if (!Array.isArray(row.moves)) continue
      const moves = row.moves.filter((move): move is string => typeof move === 'string' && UCI_MOVE_REGEX.test(move))
      if (!moves.length) continue
      if (isFiniteNumber(row.cp)) {
        pvs.push({ moves, cp: Math.round(row.cp) })
      } else if (isFiniteNumber(row.mate)) {
        pvs.push({ moves, mate: Math.round(row.mate) })
      }
    }
  }

  if (!pvs.length) return null

  return {
    fen: normalizeCloudEvalFen(payload.fen),
    depth: positiveInt(payload.depth),
    knodes: positiveInt(payload.knodes),
    pvs,
    fetchedAt: payload.fetchedAt,
  }
}

function parseCacheEntry(raw: unknown): CacheEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  if (!isFiniteNumber(entry.expiresAt)) return null
  if (entry.payload === null) return { expiresAt: entry.expiresAt, payload: null }
  const payload = parseCachedResult(entry.payload)
  return payload ? { expiresAt: entry.expiresAt, payload } : null
}

function readCacheEntry(request: CloudEvalRequest): CacheEntry | null {
  const key = cloudEvalRequestKey(request)
  const cached = responseCache.get(key)
  const now = Date.now()
  if (cached) {
    if (cached.expiresAt > now) return cached
    responseCache.delete(key)
  }

  const stored = parseCacheEntry(readStorageCache()[key])
  if (!stored) return null
  if (stored.expiresAt <= now) return null

  responseCache = withBoundedMapEntry(responseCache, key, stored, CACHE_ENTRY_LIMIT)
  return stored
}

function readCached(request: CloudEvalRequest): CloudEvalResult | null {
  return readCacheEntry(request)?.payload ?? null
}

function writeCached(request: CloudEvalRequest, payload: CloudEvalResult) {
  const key = cloudEvalRequestKey(request)
  const entry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  }
  responseCache = withBoundedMapEntry(responseCache, key, entry, CACHE_ENTRY_LIMIT)
  writeStorageCacheEntry(key, entry)
}

function writeCachedMissing(request: CloudEvalRequest) {
  const key = cloudEvalRequestKey(request)
  const entry: CacheEntry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload: null,
  }
  responseCache = withBoundedMapEntry(responseCache, key, entry, CACHE_ENTRY_LIMIT)
  writeStorageCacheEntry(key, entry)
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return
  const reason = signal.reason
  throw reason instanceof Error ? reason : new Error('Lichess cloud eval request aborted.')
}

function buildUrl(request: CloudEvalRequest): string {
  const url = new URL(CLOUD_EVAL_URL)
  url.searchParams.set('fen', normalizeCloudEvalFen(request.fen))
  url.searchParams.set('multiPv', String(normalizeCloudEvalMultiPv(request.multiPv)))
  return url.toString()
}

function parseLine(raw: unknown): CloudEvalLine | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.moves !== 'string') return null

  const moves = row.moves
    .trim()
    .split(/\s+/g)
    .filter(move => UCI_MOVE_REGEX.test(move))

  if (!moves.length) return null

  if (isFiniteNumber(row.cp)) return { moves, cp: Math.round(row.cp) }
  if (isFiniteNumber(row.mate)) return { moves, mate: Math.round(row.mate) }
  return null
}

export function parseCloudEvalResponse(raw: unknown): CloudEvalResult | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  if (typeof payload.fen !== 'string') return null

  const pvs = Array.isArray(payload.pvs)
    ? payload.pvs.map(parseLine).filter((line): line is CloudEvalLine => Boolean(line))
    : []

  if (!pvs.length) return null

  return {
    fen: normalizeCloudEvalFen(payload.fen),
    depth: positiveInt(payload.depth),
    knodes: positiveInt(payload.knodes),
    pvs,
    fetchedAt: Date.now(),
  }
}

export function getCachedCloudEvaluation(request: CloudEvalRequest): CloudEvalResult | null {
  return readCached(request)
}

export function hasCachedCloudEvaluationMiss(request: CloudEvalRequest): boolean {
  return readCacheEntry(request)?.payload === null
}

export async function fetchCloudEvaluation(
  request: CloudEvalRequest,
  signal?: AbortSignal,
): Promise<CloudEvalResult | null> {
  const cached = readCacheEntry(request)
  if (cached) return cached.payload

  const response = await fetchLichessResource(buildUrl(request), {
    signal,
    headers: { Accept: 'application/json' },
  })
  throwIfAborted(signal)

  if (response.status === 404) {
    writeCachedMissing(request)
    return null
  }
  if (response.status === 429) {
    throw new Error('Lichess cloud eval rate limit reached; try again in a minute.')
  }
  if (!response.ok) {
    throw new Error(`Lichess cloud eval request failed (${response.status}).`)
  }

  const raw = await response.json()
  throwIfAborted(signal)

  const parsed = parseCloudEvalResponse(raw)
  if (parsed) writeCached(request, parsed)
  return parsed
}

export function cloudLineToSideToMoveScore(
  fen: string,
  line: CloudEvalLine,
): { cp?: number; mate?: number } {
  const turn = fen.split(/\s+/g)[1]
  const factor = turn === 'b' ? -1 : 1
  return {
    cp: isFiniteNumber(line.cp) ? line.cp * factor : undefined,
    mate: isFiniteNumber(line.mate) ? line.mate * factor : undefined,
  }
}

function scoreToRequiredCp(cp?: number, mate?: number): number | null {
  if (isFiniteNumber(mate)) {
    if (mate > 0) return 10000
    if (mate < 0) return -10000
    return null
  }
  return isFiniteNumber(cp) ? cp : null
}

export function cloudEvalToSnapshot(fen: string, result: CloudEvalResult): EvalSnapshot | null {
  const topLine = result.pvs[0]
  if (!topLine) return null
  const score = cloudLineToSideToMoveScore(fen, topLine)
  const cp = scoreToRequiredCp(score.cp, score.mate)
  if (cp === null) return null

  return {
    cp,
    mate: score.mate,
    bestMove: topLine.moves[0],
    depth: result.depth,
    nodes: result.knodes * 1000,
    mode: 'custom',
    purpose: 'cloud-eval',
    searchedAt: result.fetchedAt,
  }
}
