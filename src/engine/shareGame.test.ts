import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  MAX_SHARED_GAME_CHARS,
  buildGameShareUrl,
  decodeSharedGame,
  encodeSharedGame,
  parseGameShareHash,
  replaySharedGame,
} from './shareGame'

const START = new Chess().fen()
const HREF = 'https://example.test/web-chess/'
const SICILIAN = ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6']

function sansOf(rootFen: string, moves: string[]): string[] {
  const shared = decodeSharedGame(encodeSharedGame(rootFen, moves))!
  return replaySharedGame(shared).map(entry => entry.move.san)
}

describe('a game in a link', () => {
  it('round-trips the position it started from and the moves that followed', () => {
    const decoded = decodeSharedGame(encodeSharedGame(START, SICILIAN))
    expect(decoded?.rootFen).toBe(START)
    expect(decoded?.moves).toEqual(SICILIAN)
  })

  it('replays into real moves', () => {
    expect(sansOf(START, SICILIAN)).toEqual(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'])
  })

  it('carries a game that did not start from the initial position', () => {
    const endgame = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1'
    expect(sansOf(endgame, ['e3d4', 'e6d6'])).toEqual(['Kd4', 'Kd6'])
  })

  it('keeps a promotion, which is the one move UCI needs a fifth character for', () => {
    expect(sansOf('8/P6k/8/8/8/8/7K/8 w - - 0 1', ['a7a8q'])).toEqual(['a8=Q'])
    expect(sansOf('8/P6k/8/8/8/8/7K/8 w - - 0 1', ['a7a8n'])).toEqual(['a8=N'])
  })

  it('survives a URL and comes back through the hash', () => {
    const url = buildGameShareUrl(START, SICILIAN, HREF)
    expect(url.startsWith(HREF + '#game=')).toBe(true)
    const parsed = parseGameShareHash(new URL(url).hash)
    expect(parsed?.moves).toEqual(SICILIAN)
  })

  it('shares an empty game as a position, not as nothing', () => {
    const parsed = parseGameShareHash(new URL(buildGameShareUrl(START, [], HREF)).hash)
    expect(parsed?.rootFen).toBe(START)
    expect(parsed?.moves).toEqual([])
  })

  /**
   * The payload is base64url so it can sit in a hash untouched: `+`, `/` and
   * `=` all mean something there, and a link that a chat client mangles is not
   * a link.
   */
  it('encodes to something a URL carries without escaping', () => {
    expect(encodeSharedGame(START, SICILIAN)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('stays a reasonable length for a long game', () => {
    const chess = new Chess()
    const moves: string[] = []
    let seed = 7
    while (moves.length < 120 && !chess.isGameOver()) {
      const legal = chess.moves({ verbose: true })
      seed = (seed * 1103515245 + 12345) % 2147483648
      const chosen = legal[seed % legal.length]
      chess.move(chosen)
      moves.push(`${chosen.from}${chosen.to}${chosen.promotion ?? ''}`)
    }
    const encoded = encodeSharedGame(START, moves)
    expect(moves.length).toBeGreaterThan(100)
    expect(encoded.length).toBeLessThan(1200)
    expect(decodeSharedGame(encoded)?.moves).toEqual(moves)
  })
})

describe('a link this app did not write', () => {
  /**
   * A link is the most hostile input here, and it is read during the first
   * render. Everything below returns null rather than throwing.
   */
  it('refuses anything past the length bound before decoding it', () => {
    expect(decodeSharedGame('A'.repeat(MAX_SHARED_GAME_CHARS + 1))).toBeNull()
    expect(parseGameShareHash('#game=' + 'A'.repeat(MAX_SHARED_GAME_CHARS + 200))).toBeNull()
  })

  it('refuses text that is not base64, or base64 that is not a payload', () => {
    expect(decodeSharedGame('not base64 !!!')).toBeNull()
    expect(decodeSharedGame(btoa('no separator here'))).toBeNull()
    expect(decodeSharedGame('')).toBeNull()
  })

  it('refuses a payload whose position will not load', () => {
    expect(decodeSharedGame(encodeSharedGame('total nonsense', ['e2e4']))).toBeNull()
    expect(decodeSharedGame(encodeSharedGame('', ['e2e4']))).toBeNull()
  })

  it('drops move tokens that are not UCI rather than the whole game', () => {
    const decoded = decodeSharedGame(encodeSharedGame(START, ['e2e4', 'Nf3', 'e7e5', 'zz99']))
    expect(decoded?.moves).toEqual(['e2e4', 'e7e5'])
  })

  /** A truncated or edited link should show as much as it really carries. */
  it('replays up to the first move the position will not take', () => {
    const shared = decodeSharedGame(encodeSharedGame(START, ['e2e4', 'e2e4', 'g1f3']))!
    expect(replaySharedGame(shared).map(entry => entry.move.san)).toEqual(['e4'])
  })

  it('ignores a hash that is empty or about something else', () => {
    expect(parseGameShareHash('')).toBeNull()
    expect(parseGameShareHash('#')).toBeNull()
    expect(parseGameShareHash('#fen=' + encodeURIComponent(START))).toBeNull()
  })

  it('does not throw on a replay whose root is unusable', () => {
    expect(replaySharedGame({ rootFen: 'nonsense', moves: ['e2e4'] })).toEqual([])
  })
})
