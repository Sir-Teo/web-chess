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

/** Red — clearly worse. */
const WORST = { r: 248, g: 81, b: 73 }
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
  // Fainter as it gets worse, so the best move reads first even in monochrome.
  const alpha = (0.5 + 0.4 * t).toFixed(2)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
