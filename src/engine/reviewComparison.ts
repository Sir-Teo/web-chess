import type { GameNode } from '../hooks/useGameTree'
import { formatWhitePovEvaluation, normalizeWhitePovCp, normalizeWhitePovWdl, type EvalSnapshot } from './analysis'
import type { ReviewSnapshot } from './reviewSession'
import { reviewLineKey, type SavedReview } from './savedReviews'
import { reviewTargetFens } from './batchReview'

export type ReviewComparisonRow = {
  node: GameNode
  label: string
  open?: EvalSnapshot
  saved?: EvalSnapshot
  changePawns: number | null
  scoreChanged: boolean
  bestMoveChanged: boolean
  wdlChanged: boolean
  differs: boolean
}

export function compareReviews(line: GameNode[], open: ReviewSnapshot, saved: SavedReview) {
  if (open.lineEndId !== line.at(-1)?.id || saved.lineKey !== reviewLineKey(line)) return null
  const previous = new Map(saved.evaluations)
  const targets = reviewTargetFens(line)
  const rows: ReviewComparisonRow[] = []
  for (const [index, node] of line.entries()) {
    if (!targets.has(node.fen)) continue
    const current = open.evaluations.get(node.fen)
    const earlier = previous.get(node.fen)
    const paired = Boolean(current && earlier)
    const scoreChanged = paired && (current!.mate !== earlier!.mate || (current!.mate === undefined && current!.cp !== earlier!.cp))
    const bestMoveChanged = Boolean(current?.bestMove && earlier?.bestMove && current.bestMove !== earlier.bestMove)
    const wdlChanged = Boolean(current?.wdl && earlier?.wdl
      && (current.wdl.w !== earlier.wdl.w || current.wdl.d !== earlier.wdl.d || current.wdl.l !== earlier.wdl.l))
    rows.push({
      node,
      label: index === 0 ? 'Start' : `${line[index - 1].fen.split(' ')[5]}${node.move?.color === 'b' ? '...' : '.'} ${node.san}`,
      open: current, saved: earlier,
      changePawns: current && earlier && current.mate === undefined && earlier.mate === undefined
        ? normalizeWhitePovCp(node.fen, current.cp - earlier.cp) / 100 : null,
      scoreChanged, bestMoveChanged, wdlChanged,
      differs: scoreChanged || bestMoveChanged || wdlChanged || Boolean(current) !== Boolean(earlier)
        || Boolean(current?.bestMove) !== Boolean(earlier?.bestMove) || Boolean(current?.wdl) !== Boolean(earlier?.wdl),
    })
  }
  return {
    rows,
    paired: rows.filter(row => row.open && row.saved).length,
    missingOpen: rows.filter(row => !row.open).length,
    missingSaved: rows.filter(row => !row.saved).length,
    changedScores: rows.filter(row => row.scoreChanged).length,
    changedBestMoves: rows.filter(row => row.bestMoveChanged).length,
    changedWdl: rows.filter(row => row.wdlChanged).length,
  }
}

export function comparisonScore(fen: string, reading: EvalSnapshot | undefined): string {
  return reading ? formatWhitePovEvaluation(fen, reading.cp, reading.mate) : 'Not reviewed'
}

export function comparisonWdl(fen: string, reading: EvalSnapshot | undefined): string {
  const wdl = reading?.wdl && normalizeWhitePovWdl(fen, reading.wdl)
  return wdl ? `${wdl.white.toFixed(1)} / ${wdl.draw.toFixed(1)} / ${wdl.black.toFixed(1)}%` : 'Not recorded'
}
