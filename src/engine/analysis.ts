import { Chess, type Move } from 'chess.js'
import type { EngineLine } from '../hooks/useStockfishEngine'

export type EvalSnapshot = {
  cp: number
}

export type ReviewLabel = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'pending'

export type ReviewRow = {
  ply: number
  moveNumber: number
  san: string
  uci: string
  quality: ReviewLabel
  deltaCp?: number
}

export function scoreToCp(cp?: number, mate?: number): number | undefined {
  if (typeof mate === 'number') {
    if (mate > 0) return 10000
    if (mate < 0) return -10000
    return undefined
  }
  return cp
}

export function formatEvaluation(cp?: number, mate?: number): string {
  if (typeof mate === 'number') return `#${mate}`
  if (typeof cp === 'number') return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`
  return '...'
}

export function pvToSan(fen: string, line: EngineLine, maxMoves = 8): string {
  const replay = new Chess(fen)
  const moves = line.pv.slice(0, maxMoves)
  const chunks: string[] = []

  for (let index = 0; index < moves.length; index += 1) {
    const uci = moves[index]
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci[4]
    const moveNumber = replay.moveNumber()
    const sideToMove = replay.turn()
    const move = replay.move({ from, to, promotion })
    if (!move) break

    const prefix = sideToMove === 'w' ? `${moveNumber}.` : `${moveNumber}...`
    chunks.push(`${prefix} ${move.san}`)
  }

  return chunks.join(' ')
}

function qualityFromDelta(deltaCp: number): ReviewLabel {
  if (deltaCp >= -20) return 'best'
  if (deltaCp >= -70) return 'good'
  if (deltaCp >= -140) return 'inaccuracy'
  if (deltaCp >= -260) return 'mistake'
  return 'blunder'
}

function toUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

export function buildReviewRows(history: Move[], evaluationsByFen: Map<string, EvalSnapshot>): ReviewRow[] {
  const replay = new Chess()

  return history.map((move, index) => {
    const beforeFen = replay.fen()
    replay.move({ from: move.from, to: move.to, promotion: move.promotion })
    const afterFen = replay.fen()

    const before = evaluationsByFen.get(beforeFen)?.cp
    const after = evaluationsByFen.get(afterFen)?.cp
    if (typeof before !== 'number' || typeof after !== 'number') {
      return {
        ply: index + 1,
        moveNumber: Math.floor(index / 2) + 1,
        san: move.san,
        uci: toUci(move),
        quality: 'pending',
      }
    }

    // Engine score is POV side-to-move. After the move, perspective flips.
    const deltaCp = Math.round(-after - before)

    return {
      ply: index + 1,
      moveNumber: Math.floor(index / 2) + 1,
      san: move.san,
      uci: toUci(move),
      deltaCp,
      quality: qualityFromDelta(deltaCp),
    }
  })
}

export function summarizeReview(rows: ReviewRow[]): Record<ReviewLabel, number> {
  return rows.reduce<Record<ReviewLabel, number>>(
    (acc, row) => {
      acc[row.quality] += 1
      return acc
    },
    { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, pending: 0 },
  )
}
