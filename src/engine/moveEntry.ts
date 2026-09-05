import { Chess, type Move } from 'chess.js'

/** Parse one legal move without changing the game or guessing a promotion. */
export function parseMoveEntry(fen: string, input: string): Move | null {
  const token = input.trim().replace(/0/g, 'O')
  if (!token || token.length > 16 || /\s/.test(token)) return null
  try {
    const chess = new Chess(fen)
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(token)) {
      const uci = token.toLowerCase()
      return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    }
    return chess.move(token, { strict: true })
  } catch {
    return null
  }
}
