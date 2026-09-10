import { GAME_HASH_KEY } from './shareGame'

const FEN_HASH_KEY = 'fen'

export function normalizeFenForShare(fen: string): string {
  return fen.trim().replace(/\s+/g, ' ')
}

export function buildFenShareUrl(fen: string, href: string): string {
  const url = new URL(href)
  url.hash = `${FEN_HASH_KEY}=${encodeURIComponent(normalizeFenForShare(fen))}`
  return url.toString()
}

export function parseFenShareHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.trim()) return null

  const params = new URLSearchParams(raw)
  const fen = params.get(FEN_HASH_KEY)
  return fen ? normalizeFenForShare(fen) : null
}

/**
 * Whether a hash claims to carry a shared position or game at all.
 *
 * Both parsers answer `null` for "there was nothing here" and for "there was
 * something here and it did not work", and those want different answers: the
 * first is an ordinary visit, the second is a reader who followed a link
 * somebody sent them and needs telling why the board is not what they were
 * promised. Measured by opening the app on a truncated `#fen=` -- the sort a
 * chat app makes of a long link -- it dropped to the starting position in Play
 * mode and said nothing at all.
 *
 * The key alone, because whether the value is any good is the parsers' job.
 */
export function hashCarriesShare(hash: string): boolean {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.trim()) return false
  const params = new URLSearchParams(raw)
  for (const key of [FEN_HASH_KEY, GAME_HASH_KEY]) {
    const value = params.get(key)
    if (value && value.trim()) return true
  }
  return false
}
