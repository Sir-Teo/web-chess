import {
  normalizeWhitePovCp,
  normalizeWhitePovMate,
  normalizeWhitePovWdl,
  winPercentFromCp,
  type EvalSnapshot,
} from './analysis'

/**
 * The bar from a score alone, when the reading carries no WDL.
 *
 * A cloud evaluation, an `[%eval]` read out of a PGN and a search with
 * `UCI_ShowWDL` off all have a score and no win/draw/loss split -- and the
 * bar drew every one of them as an even three-way split under a position it
 * had a number for. This is the classic evaluation bar every other board
 * draws: White's share is White's winning chances on the same curve the
 * trend graph and the accuracy read, with no draw band because nothing
 * measured one. A forced mate fills the bar for the side that has it.
 */
export function evalBarSplit(fen: string, evaluation: EvalSnapshot | undefined) {
  if (!evaluation) return null
  if (evaluation.wdl) {
    const normalized = normalizeWhitePovWdl(fen, evaluation.wdl)
    if (normalized) return normalized
  }
  if (typeof evaluation.mate === 'number' && evaluation.mate !== 0) {
    const white = normalizeWhitePovMate(fen, evaluation.mate) > 0 ? 100 : 0
    return { white, draw: 0, black: 100 - white }
  }
  if (typeof evaluation.cp === 'number' && Number.isFinite(evaluation.cp)) {
    const white = winPercentFromCp(normalizeWhitePovCp(fen, evaluation.cp))
    return { white, draw: 0, black: 100 - white }
  }
  return null
}
