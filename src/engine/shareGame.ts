import { Chess, type Move } from 'chess.js'
import { normalizeUciMoves } from './uci'

/**
 * A whole game in a link, not just a position.
 *
 * `shareLink.ts` puts a FEN in the hash, which shares where a game *got to* and
 * loses how it got there — the moves, the variations, the review. Sending
 * somebody a game meant exporting a PGN and pasting it into a message.
 * web-xiangqi's `shareTree.ts` already does this for its board, and
 * `docs/architecture.md` cites it; this is the same idea with this app's
 * constraints.
 *
 * The encoding is deliberately not a PGN. A PGN of a 60-ply game is well over a
 * kilobyte before escaping and most of it is punctuation; the moves themselves
 * are four characters each. So the payload is the root FEN and the UCI moves,
 * joined, and base64url'd only to survive a URL — no compression, because there
 * is nothing here worth the code.
 *
 *     <root fen>|<uci> <uci> <uci> ...
 *
 * A 100-ply game from the standard opening position comes to roughly 500
 * characters of payload and 700 of base64, which every browser and every chat
 * client carries without complaint.
 */

const GAME_HASH_KEY = 'game'
const PAYLOAD_SEPARATOR = '|'

/**
 * The most encoded text this will decode.
 *
 * Bounded *before* decoding, which is the thing the FEN share deliberately does
 * not need: that one rejects on the rank count before doing any real work,
 * while this base64-decodes and then replays every move on a real board. The
 * limit is xiangqi's, and it is generous — 8,000 characters is about 1,300
 * plies, an order of magnitude past the longest game ever played.
 */
export const MAX_SHARED_GAME_CHARS = 8_000

export type SharedGame = {
  rootFen: string
  /** Validated UCI, in order. Not yet checked against the position. */
  moves: string[]
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function encodeSharedGame(rootFen: string, moves: string[]): string {
  const normalized = normalizeUciMoves(moves)
  return toBase64Url(`${rootFen.trim().replace(/\s+/g, ' ')}${PAYLOAD_SEPARATOR}${normalized.join(' ')}`)
}

/**
 * Read a payload back, or nothing.
 *
 * Nothing is thrown and nothing is trusted: a link is the most hostile input
 * this app takes, and it is read during the first render. Anything past the
 * length bound is refused before it is decoded, an unreadable FEN is refused
 * before any move is replayed, and a move the position will not take ends the
 * game there rather than discarding the moves before it — a truncated link
 * should still show as much of the game as it really carries.
 */
export function decodeSharedGame(encoded: string): SharedGame | null {
  if (!encoded || encoded.length > MAX_SHARED_GAME_CHARS) return null

  const text = fromBase64Url(encoded)
  if (!text) return null

  const separator = text.indexOf(PAYLOAD_SEPARATOR)
  if (separator < 0) return null

  const rootFen = text.slice(0, separator).trim()
  if (!rootFen) return null

  let position: Chess
  try {
    position = new Chess(rootFen)
  } catch {
    return null
  }

  const moves = normalizeUciMoves(text.slice(separator + 1).split(/\s+/g).filter(Boolean))
  return { rootFen: position.fen(), moves }
}

export type ReplayedSharedMove = {
  move: Move
  /** The position after this move. */
  fen: string
}

/**
 * Replay a shared game onto a board, stopping at the first move that will not
 * go. Returns what was actually playable, which may be nothing.
 */
export function replaySharedGame(shared: SharedGame): ReplayedSharedMove[] {
  let position: Chess
  try {
    position = new Chess(shared.rootFen)
  } catch {
    return []
  }

  const played: ReplayedSharedMove[] = []
  for (const uci of shared.moves) {
    let move: Move | null
    try {
      move = position.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) ?? null
    } catch {
      break
    }
    if (!move) break
    played.push({ move, fen: position.fen() })
  }
  return played
}

export function buildGameShareUrl(rootFen: string, moves: string[], href: string): string {
  const url = new URL(href)
  url.hash = `${GAME_HASH_KEY}=${encodeSharedGame(rootFen, moves)}`
  return url.toString()
}

export function parseGameShareHash(hash: string): SharedGame | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.trim()) return null
  // Bound the whole hash too: `URLSearchParams` on a megabyte of text is work
  // done before the payload's own limit ever gets a look.
  if (raw.length > MAX_SHARED_GAME_CHARS + 64) return null

  const encoded = new URLSearchParams(raw).get(GAME_HASH_KEY)
  return encoded ? decodeSharedGame(encoded) : null
}
