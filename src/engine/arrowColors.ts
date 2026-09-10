/**
 * The colour a candidate move's arrow is drawn in.
 *
 * Ranked *by how much worse than best*, in absolute centipawns, rather than by
 * rank. Relative ranking alone would paint a near-equal second choice
 * blunder-red, which misreads the position: three moves within a tenth of a
 * pawn are three good moves, not one good move and two bad ones.
 */

/** A move this far behind the best is drawn fully red. */
export const ARROW_LOSS_SCALE_CP = 150

/**
 * Red — clearly worse. Dark, because red and green are the pair a red-green
 * deficiency takes away, and this scale's whole job is telling its two ends
 * apart.
 *
 * The faintness below was meant to carry that, and measured with
 * `distanceAsSeen` it does not: a bright `#f85149` at 0.5 over a mid square
 * lands at almost the luminance of the green at 0.9, because fading it moved
 * it *toward* the square rather than away. Over the forest board the two ends
 * of the scale came out **2.8** apart for deutan vision, on the scale
 * `boardMarks` calls 2 "only side by side" -- best move and blunder, one
 * colour. Taken down to `#601010` they are **26.0** apart, and 2.36:1 in plain
 * luminance, so the ordering survives with no colour vision at all.
 */
const WORST = { r: 96, g: 16, b: 16 }
/** Green — as good as best. This is the green the hint and the coach use. */
const BEST = { r: 63, g: 185, b: 80 }

export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function topArrowColor(centipawnLoss: number): string {
  const t = 1 - clamp01(Math.max(0, centipawnLoss) / ARROW_LOSS_SCALE_CP)
  const r = Math.round(WORST.r + (BEST.r - WORST.r) * t)
  const g = Math.round(WORST.g + (BEST.g - WORST.g) * t)
  const b = Math.round(WORST.b + (BEST.b - WORST.b) * t)
  // Still fainter as it gets worse, so the best move reads first even in
  // monochrome -- but over a narrower range now that the worse end is dark
  // enough to recede on its own. At 0.5 a bad move faded into the square
  // instead of behind the good one.
  const alpha = (0.7 + 0.25 * t).toFixed(2)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
