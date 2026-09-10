import { describe, expect, it } from 'vitest'
import { buildFenShareUrl, normalizeFenForShare, parseFenShareHash, hashCarriesShare } from './shareLink'

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

/**
 * Telling "there was nothing in the hash" from "there was something and it did
 * not work". Both parsers answer null to each, and the two want different
 * answers: the first is an ordinary visit, the second is a reader following a
 * link somebody sent them, who needs telling why the board is not the one they
 * were promised.
 */
describe('hashCarriesShare', () => {
  it('is true for a link that claims a position or a game, however broken', () => {
    expect(hashCarriesShare('#fen=8/8/8/8/8/8/4K3/6k1%20w%20-%20-%200%201')).toBe(true)
    // The shapes a chat app makes of a long link.
    expect(hashCarriesShare('#fen=r1bqkbnr%2Fpppp1ppp%2F2n5%2F4p')).toBe(true)
    expect(hashCarriesShare('#fen=hello%20world')).toBe(true)
    expect(hashCarriesShare('#game=abc123')).toBe(true)
    expect(hashCarriesShare('game=abc123')).toBe(true)
  })

  it('is false for a visit that shares nothing', () => {
    expect(hashCarriesShare('')).toBe(false)
    expect(hashCarriesShare('#')).toBe(false)
    expect(hashCarriesShare('#line=e2e4')).toBe(false)
  })

  /** A key with nothing after it is not a share, it is a stray character. */
  it('is false for a key with an empty value', () => {
    expect(hashCarriesShare('#fen=')).toBe(false)
    expect(hashCarriesShare('#game=')).toBe(false)
    expect(hashCarriesShare('#fen=%20%20')).toBe(false)
  })
})
