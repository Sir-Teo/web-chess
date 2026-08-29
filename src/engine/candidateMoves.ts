import { Chess, type Move, type Square } from 'chess.js'
import { isUciMove } from './uci'
import { scoreToCp } from './analysis'

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

/**
 * What the Coach panel says about the engine's move: a few short tags, one
 * sentence, and how far ahead of the alternatives it is.
 *
 * This was three functions at the top of `App.tsx`. They were already pure, so
 * nothing about them needed a component — but nothing exported them either, so
 * the entire explanation a beginner reads had no test. It lives here beside
 * `parseCandidateMoveInput`, which already owns candidate moves.
 *
 * The summary is a priority chain, and the order is the rule: a mate is
 * described as a mate even when it is also a capture, and "matches the book
 * move" only surfaces when nothing more concrete applies. The order is
 * behaviour, so the tests walk it.
 */
export function lineScoreForCandidate(line: { cp?: number; mate?: number }): number | null {
  const cp = scoreToCp(line.cp, line.mate)
  return typeof cp === 'number' ? cp : null
}

export function formatCandidateGap(gapCp: number | null): string | null {
  if (gapCp === null) return null
  if (gapCp >= 5000) return 'mate swing'
  if (gapCp <= 10) return 'same tier'
  return `+${(gapCp / 100).toFixed(2)} vs #2`
}

export function describeBestMove(
  fen: string,
  moveUci: string | null,
  lines: Array<{ cp?: number; mate?: number; pv: string[] }>,
  openingTopMove?: string,
  tablebaseTopMove?: string,
): { tags: string[]; summary: string; gapLabel: string | null } | null {
  if (!moveUci || moveUci.length < 4) return null

  const replay = new Chess(fen)
  let move: ReturnType<typeof replay.move>
  try {
    move = replay.move({
      from: moveUci.slice(0, 2) as Square,
      to: moveUci.slice(2, 4) as Square,
      promotion: moveUci[4],
    })
  } catch {
    return null
  }
  if (!move) return null

  const tags: string[] = []
  const san = move.san
  const fromRank = move.from[1]
  const centerSquares = new Set(['d4', 'e4', 'd5', 'e5'])

  if (san.includes('#')) tags.push('Mate')
  else if (san.includes('+')) tags.push('Check')
  if (move.captured) tags.push('Capture')
  if (move.flags.includes('k') || move.flags.includes('q')) tags.push('Castle')
  if (move.promotion) tags.push('Promotion')
  if (tablebaseTopMove === moveUci) tags.push('Tablebase')
  if (openingTopMove === moveUci) tags.push('Book')
  if (move.piece === 'p' && centerSquares.has(move.to)) tags.push('Center')
  if ((move.piece === 'n' || move.piece === 'b') && (fromRank === '1' || fromRank === '8')) tags.push('Develop')

  const uniqueCandidateLines = lines.reduce<Array<{ cp?: number; mate?: number; pv: string[] }>>((acc, line) => {
    const candidate = line.pv[0]
    if (!candidate || acc.some(item => item.pv[0] === candidate)) return acc
    return [...acc, line]
  }, [])
  const primaryLine = uniqueCandidateLines.find(line => line.pv[0] === moveUci) ?? uniqueCandidateLines[0]
  const alternativeLine = uniqueCandidateLines.find(line => line.pv[0] !== moveUci)
  const primaryScore = primaryLine ? lineScoreForCandidate(primaryLine) : null
  const alternativeScore = alternativeLine ? lineScoreForCandidate(alternativeLine) : null
  const gapCp = primaryScore !== null && alternativeScore !== null
    ? Math.max(0, primaryScore - alternativeScore)
    : null
  const gapLabel = formatCandidateGap(gapCp)

  let summary = 'Best engine candidate; use the line to check the plan.'
  if (san.includes('#')) summary = 'Forces mate. The follow-up line matters more than material.'
  else if (san.includes('+')) summary = 'Creates a forcing move, so the reply choices are narrower.'
  else if (move.captured) summary = 'Starts with a capture; compare the recapture in the principal variation.'
  else if (move.flags.includes('k') || move.flags.includes('q')) summary = 'Improves king safety and connects the rooks.'
  else if (tablebaseTopMove === moveUci) summary = 'Matches the exact tablebase move for this endgame.'
  else if (openingTopMove === moveUci) summary = 'Matches the leading book move from the selected opening source.'
  else if (move.piece === 'p' && centerSquares.has(move.to)) summary = 'Claims central space and opens lines for pieces.'
  else if ((move.piece === 'n' || move.piece === 'b') && (fromRank === '1' || fromRank === '8')) summary = 'Develops a piece while keeping the position flexible.'
  else if (gapCp !== null && gapCp >= 80) summary = 'The top candidate is meaningfully ahead of the alternatives.'
  else if (gapCp !== null && gapCp <= 20) summary = 'Several candidate moves are close; choose by plan and preparation.'

  return {
    tags: tags.length ? tags.slice(0, 4) : ['Candidate'],
    summary,
    gapLabel,
  }
}
