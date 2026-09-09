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

/**
 * How much of the bar White fills — the one number the bar is drawing.
 *
 * The split above is what the reading *says*; this is where the bar's boundary
 * goes, and the two are not the same thing once a draw band is in play.
 * Stockfish calls the start position roughly `wdl 83 912 5`, so drawing the
 * split literally gave White 8% of the bar beside a label reading "+0.4" and a
 * verdict reading "53% for White". The bar was the only thing on the screen
 * disagreeing, because it was the only thing reading the split rather than the
 * score.
 *
 * So the boundary is the score's winning chances, on the same
 * {@link winPercentFromCp} curve the winrate card, the trend graph, the
 * accuracy and the Coach verdict all use. A forced mate fills the bar. A
 * reading whose score is not a number — the one shape that leaves the curve
 * nothing to work from — falls back to the split's expected score, White's
 * share plus half the draws, which is the same quantity by another route.
 *
 * The draws keep their place in the bar: the band spans them, straddling this
 * boundary, so it still says how drawish the position is without deciding
 * where the crossover looks like it is.
 */
export function evalBarWhiteShare(fen: string, evaluation: EvalSnapshot | undefined): number | null {
  if (!evaluation) return null
  if (typeof evaluation.mate === 'number' && evaluation.mate !== 0) {
    return normalizeWhitePovMate(fen, evaluation.mate) > 0 ? 100 : 0
  }
  if (typeof evaluation.cp === 'number' && Number.isFinite(evaluation.cp)) {
    return winPercentFromCp(normalizeWhitePovCp(fen, evaluation.cp))
  }
  const wdl = evaluation.wdl ? normalizeWhitePovWdl(fen, evaluation.wdl) : null
  return wdl ? wdl.white + wdl.draw / 2 : null
}
