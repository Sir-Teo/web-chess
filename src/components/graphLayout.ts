/* Axis labels are move numbers ("18...", "100."), drawn at 13px and centred on
   their tick. Below this spacing they run into each other — measured at 25px
   for a two-digit label and 34px for a three-digit one. */
export const GRAPH_MIN_TICK_SPACING = 38

/**
 * Plies between x-axis ticks.
 *
 * `innerWidth` is the plot area the ticks have to share. A step chosen from the
 * ply count alone overlapped its labels as soon as the graph was squeezed into
 * the rail: a 116-ply game at a tick every 12 plies drew them 24px apart.
 */
export function graphTickStep(maxIndex: number, innerWidth = Number.POSITIVE_INFINITY): number {
  const normalizedMaxIndex = Number.isFinite(maxIndex) ? Math.max(0, Math.floor(maxIndex)) : 0
  if (normalizedMaxIndex <= 0) return 4

  const byDensity = normalizedMaxIndex <= 20 ? 4 : Math.max(4, Math.round(normalizedMaxIndex / 10))
  const width = Number.isFinite(innerWidth) ? Math.max(0, innerWidth) : 0
  const byWidth = width > 0
    ? Math.ceil((GRAPH_MIN_TICK_SPACING * normalizedMaxIndex) / width)
    : 0

  const step = Math.max(byDensity, byWidth)
  return step % 2 === 0 ? step : step + 1
}
