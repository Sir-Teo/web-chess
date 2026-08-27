import { describe, expect, it } from 'vitest'
import { buildFenShareUrl, normalizeFenForShare, parseFenShareHash } from './shareLink'

describe('share link helpers', () => {
  it('normalizes FEN whitespace before encoding links', () => {
    const fen = '8/8/8/8/8/8/4K3/6k1   w   -   -   0   1'
    const url = buildFenShareUrl(fen, 'https://example.test/web-chess/?x=1#old')

    expect(url).toBe('https://example.test/web-chess/?x=1#fen=8%2F8%2F8%2F8%2F8%2F8%2F4K3%2F6k1%20w%20-%20-%200%201')
    expect(parseFenShareHash(new URL(url).hash)).toBe('8/8/8/8/8/8/4K3/6k1 w - - 0 1')
  })

  it('ignores empty or unrelated hashes', () => {
    expect(normalizeFenForShare('  a   b  ')).toBe('a b')
    expect(parseFenShareHash('')).toBeNull()
    expect(parseFenShareHash('#line=e2e4')).toBeNull()
  })
})
