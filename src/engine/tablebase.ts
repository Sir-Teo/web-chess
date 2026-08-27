import { withBoundedMapEntry } from '../hooks/cacheLimit'
import { fetchLichessResource } from './lichessQueue'

export type TablebaseCategory =
  | 'win'
  | 'unknown'
  | 'syzygy-win'
  | 'maybe-win'
  | 'cursed-win'
  | 'draw'
  | 'blessed-loss'
  | 'maybe-loss'
  | 'syzygy-loss'
  | 'loss'

export type TablebaseMove = {
  uci: string
  san: string
  category: TablebaseCategory
  dtz?: number | null
  preciseDtz?: number | null
  dtc?: number | null
  dtm?: number | null
  zeroing?: boolean
  checkmate?: boolean
  stalemate?: boolean
}

export type TablebaseResult = {
  fen: string
  category: TablebaseCategory
  dtz?: number | null
  preciseDtz?: number | null
  dtc?: number | null
  dtm?: number | null
  checkmate: boolean
  stalemate: boolean
  insufficientMaterial: boolean
  moves: TablebaseMove[]
  fetchedAt: number
}

const TABLEBASE_URL = 'https://tablebase.lichess.org/standard'
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const CACHE_STORAGE_KEY = 'webchess:tablebase-cache:v1'
const CACHE_ENTRY_LIMIT = 80
const BOARD_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const CATEGORY_VALUES = new Set<TablebaseCategory>([
  'win',
  'unknown',
  'syzygy-win',
  'maybe-win',
  'cursed-win',
  'draw',
  'blessed-loss',
  'maybe-loss',
  'syzygy-loss',
  'loss',
])
const UCI_MOVE_REGEX = /^[a-h][1-8][a-h][1-8][qrbn]?$/i
const MATERIAL_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

type CacheEntry = {
  expiresAt: number
  payload: TablebaseResult | null
}

type PawnSquare = {
  file: number
  rank: number
}

type BoardSummary = {
  pieceCount: number
  material: Record<'b' | 'w', number>
  pawns: Record<'b' | 'w', PawnSquare[]>
}

let responseCache = new Map<string, CacheEntry>()
let storageCacheRaw: string | null | undefined
let storageCacheSnapshot: Record<string, unknown> = {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nullableInt(value: unknown): number | null | undefined {
  if (value === null) return null
  if (!isFiniteNumber(value)) return undefined
  return Math.round(value)
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function fieldValue(row: Record<string, unknown>, preferred: string, fallback: string): unknown {
  return Object.prototype.hasOwnProperty.call(row, preferred) ? row[preferred] : row[fallback]
}

function categoryValue(value: unknown): TablebaseCategory | null {
  return typeof value === 'string' && CATEGORY_VALUES.has(value as TablebaseCategory)
    ? value as TablebaseCategory
    : null
}

export function tablebaseMoveCategoryForPlayer(category: TablebaseCategory): TablebaseCategory {
  switch (category) {
    case 'win':
      return 'loss'
    case 'syzygy-win':
      return 'syzygy-loss'
    case 'maybe-win':
      return 'maybe-loss'
    case 'cursed-win':
      return 'blessed-loss'
    case 'blessed-loss':
      return 'cursed-win'
    case 'maybe-loss':
      return 'maybe-win'
    case 'syzygy-loss':
      return 'syzygy-win'
    case 'loss':
      return 'win'
    case 'draw':
    case 'unknown':
      return category
  }
}

export function normalizeTablebaseFen(fen: string): string {
  const parts = fen.trim().split(/\s+/g)
  if (parts.length >= 5) return [...parts.slice(0, 5), '1'].join(' ')
  return parts.length >= 4 ? [...parts.slice(0, 4), '0', '1'].join(' ') : fen.trim()
}

function summarizeBoard(fen: string): BoardSummary {
  const board = normalizeTablebaseFen(fen).split(' ')[0] ?? ''
  const summary: BoardSummary = {
    pieceCount: 0,
    material: { b: 0, w: 0 },
    pawns: { b: [], w: [] },
  }

  let file = 0
  let rank = 8
  for (const char of board) {
    if (char === '/') {
      file = 0
      rank -= 1
      continue
    }
    if (/^[1-8]$/.test(char)) {
      file += Number(char)
      continue
    }

    const piece = char.toLowerCase()
    if (!Object.prototype.hasOwnProperty.call(MATERIAL_VALUES, piece)) {
      file += 1
      continue
    }

    const color = char === piece ? 'b' : 'w'
    summary.pieceCount += 1
    summary.material[color] += MATERIAL_VALUES[piece] ?? 0
    if (piece === 'p' && file >= 0 && file < BOARD_FILES.length && rank >= 1 && rank <= 8) {
      summary.pawns[color].push({ file, rank })
    }
    file += 1
  }

  return summary
}

export function tablebasePieceCount(fen: string): number {
  return summarizeBoard(fen).pieceCount
}

function hasOpposingPawnPair(summary: BoardSummary): boolean {
  return summary.pawns.w.some(whitePawn =>
    summary.pawns.b.some(blackPawn =>
      whitePawn.file === blackPawn.file && whitePawn.rank < blackPawn.rank,
    ),
  )
}

function isOp1EightPieceEligible(summary: BoardSummary): boolean {
  return summary.pieceCount === 8
    && summary.material.w > 1
    && summary.material.b > 1
    && hasOpposingPawnPair(summary)
}

export function isTablebaseEligible(fen: string): boolean {
  const summary = summarizeBoard(fen)
  return (summary.pieceCount > 0 && summary.pieceCount <= 7)
    || isOp1EightPieceEligible(summary)
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
      ? parsed as Record<string, unknown>
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
    // Tablebase caching is optional; ignore private-mode/quota failures.
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

function parseCachedResult(raw: unknown): TablebaseResult | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  const category = categoryValue(payload.category)
  if (!category) return null
  if (typeof payload.fen !== 'string' || !isFiniteNumber(payload.fetchedAt)) return null

  return {
    fen: normalizeTablebaseFen(payload.fen),
    category,
    dtz: nullableInt(payload.dtz),
    preciseDtz: nullableInt(fieldValue(payload, 'preciseDtz', 'precise_dtz')),
    dtc: nullableInt(payload.dtc),
    dtm: nullableInt(payload.dtm),
    checkmate: booleanValue(payload.checkmate),
    stalemate: booleanValue(payload.stalemate),
    insufficientMaterial: booleanValue(payload.insufficientMaterial),
    moves: Array.isArray(payload.moves)
      ? payload.moves.map(parseMove).filter((move): move is TablebaseMove => Boolean(move))
      : [],
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

function readCacheEntry(fen: string): CacheEntry | null {
  const key = normalizeTablebaseFen(fen)
  const now = Date.now()
  const cached = responseCache.get(key)
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

function readCached(fen: string): TablebaseResult | null {
  return readCacheEntry(fen)?.payload ?? null
}

function writeCached(fen: string, payload: TablebaseResult) {
  const key = normalizeTablebaseFen(fen)
  const entry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  }
  responseCache = withBoundedMapEntry(responseCache, key, entry, CACHE_ENTRY_LIMIT)
  writeStorageCacheEntry(key, entry)
}

function writeCachedMissing(fen: string) {
  const key = normalizeTablebaseFen(fen)
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
  throw reason instanceof Error ? reason : new Error('Lichess tablebase request aborted.')
}

function parseMove(raw: unknown): TablebaseMove | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.uci !== 'string' || !UCI_MOVE_REGEX.test(row.uci)) return null
  if (typeof row.san !== 'string') return null
  const category = categoryValue(row.category)
  if (!category) return null

  return {
    uci: row.uci,
    san: row.san,
    category,
    dtz: nullableInt(row.dtz),
    preciseDtz: nullableInt(fieldValue(row, 'precise_dtz', 'preciseDtz')),
    dtc: nullableInt(row.dtc),
    dtm: nullableInt(row.dtm),
    zeroing: booleanValue(row.zeroing),
    checkmate: booleanValue(row.checkmate),
    stalemate: booleanValue(row.stalemate),
  }
}

export function parseTablebaseResponse(fen: string, raw: unknown): TablebaseResult | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  const category = categoryValue(payload.category)
  if (!category) return null

  return {
    fen: normalizeTablebaseFen(fen),
    category,
    dtz: nullableInt(payload.dtz),
    preciseDtz: nullableInt(payload.precise_dtz),
    dtc: nullableInt(payload.dtc),
    dtm: nullableInt(payload.dtm),
    checkmate: booleanValue(payload.checkmate),
    stalemate: booleanValue(payload.stalemate),
    insufficientMaterial: booleanValue(payload.insufficient_material),
    moves: Array.isArray(payload.moves)
      ? payload.moves.map(parseMove).filter((move): move is TablebaseMove => Boolean(move))
      : [],
    fetchedAt: Date.now(),
  }
}

function buildUrl(fen: string): string {
  const url = new URL(TABLEBASE_URL)
  url.searchParams.set('fen', normalizeTablebaseFen(fen))
  return url.toString()
}

export function getCachedTablebase(fen: string): TablebaseResult | null {
  return readCached(fen)
}

export function hasCachedTablebaseMiss(fen: string): boolean {
  return readCacheEntry(fen)?.payload === null
}

export async function fetchTablebase(fen: string, signal?: AbortSignal): Promise<TablebaseResult | null> {
  if (!isTablebaseEligible(fen)) return null

  const cached = readCacheEntry(fen)
  if (cached) return cached.payload

  const response = await fetchLichessResource(buildUrl(fen), {
    signal,
    headers: { Accept: 'application/json' },
  })
  throwIfAborted(signal)

  if (response.status === 404) {
    writeCachedMissing(fen)
    return null
  }
  if (response.status === 429) {
    throw new Error('Lichess tablebase rate limit reached; try again in a minute.')
  }
  if (!response.ok) {
    throw new Error(`Lichess tablebase request failed (${response.status}).`)
  }

  const raw = await response.json()
  throwIfAborted(signal)

  const parsed = parseTablebaseResponse(fen, raw)
  if (parsed) writeCached(fen, parsed)
  return parsed
}
