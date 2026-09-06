import { Chess, type Move } from 'chess.js'

/**
 * What a reader types, straightened into the forms the strict parser reads.
 *
 * chess.js takes SAN as printed -- `Nf3`, `exd5`, `O-O`, `e8=Q` -- and the
 * from-to pair below, but nothing looser: `nf3`, `0-0`, `e8q` were all refused
 * as typed, with a message saying to use `Nf3`, which is what the reader
 * thought they had done. A lowercase `b` is left alone on purpose: `bxc3` is a
 * pawn capture and `Bxc3` a bishop's, and only the reader knows which.
 */
export function normalizeMoveEntry(input: string): string {
  let token = input.trim()
  if (!token) return ''
  // Castling typed with zeros or a lowercase o, as it often is.
  if (/^[0oO]-[0oO](-[0oO])?[+#]?$/.test(token)) return token.replace(/[0o]/g, 'O')
  // A lowercase piece letter ahead of a square or a capture. Not `b`.
  token = token.replace(/^([kqrn])(?=[a-h1-8x])/, letter => letter.toUpperCase())
  // A promotion piece written without the `=`, or in lowercase: `e8q`, `e8=q`.
  const promotion = token.match(/^([a-h]?x?[a-h][18])=?([qrbnQRBN])([+#]?)$/)
  if (promotion) token = `${promotion[1]}=${promotion[2].toUpperCase()}${promotion[3]}`
  return token
}

/** Parse one legal move without changing the game or guessing a promotion. */
export function parseMoveEntry(fen: string, input: string): Move | null {
  const token = normalizeMoveEntry(input)
  if (!token || token.length > 16 || /\s/.test(token)) return null
  try {
    const chess = new Chess(fen)
    if (/^[a-h][1-8]-?[a-h][1-8]=?[qrbn]?$/i.test(token)) {
      const uci = token.toLowerCase().replace(/[-=]/g, '')
      return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    }
    return chess.move(token, { strict: true })
  } catch {
    return null
  }
}
