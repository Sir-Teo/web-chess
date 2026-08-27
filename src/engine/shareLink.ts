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
