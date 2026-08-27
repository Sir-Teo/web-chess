import { Chess, type Move } from 'chess.js'
import { isUciMove } from './uci'

export type ParsedCandidateMoveInput = {
  validMoves: string[]
  invalidTokens: string[]
}

function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function legalUciMove(fen: string, token: string): string | null {
  const normalized = token.trim().toLowerCase()
  if (!isUciMove(normalized)) return null

  try {
    const position = new Chess(fen)
    const move = position.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      promotion: normalized[4],
    })
    return move ? moveToUci(move) : null
  } catch {
    return null
  }
}

function legalSanMove(fen: string, token: string): string | null {
  try {
    const position = new Chess(fen)
    const move = position.move(token.trim())
    return move ? moveToUci(move) : null
  } catch {
    return null
  }
}

export function parseCandidateMoveInput(input: string, fen: string): ParsedCandidateMoveInput {
  const tokens = input
    .split(/[,\s]+/g)
    .map(move => move.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const parsed: ParsedCandidateMoveInput = { invalidTokens: [], validMoves: [] }

  for (const token of tokens) {
    const uci = legalUciMove(fen, token) ?? legalSanMove(fen, token)
    if (!uci) {
      parsed.invalidTokens.push(token)
      continue
    }

    if (seen.has(uci)) continue
    seen.add(uci)
    parsed.validMoves.push(uci)
  }

  return parsed
}
