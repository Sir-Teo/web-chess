/* Axis labels are move numbers ("18...", "100."), drawn at 13px and centred on
   their tick. Below this spacing they run into each other — measured at 25px
   for a two-digit label and 34px for a three-digit one. */
export const GRAPH_MIN_TICK_SPACING = 38

/* The plotted box, in the same units the rendered <svg> uses. Keep
   GRAPH_HEIGHT in sync with --graph-height in index.css, which sizes it. */
export const GRAPH_HEIGHT = 160
export const GRAPH_PAD_LEFT = 52
export const GRAPH_PAD_RIGHT = 20
export const GRAPH_PAD_TOP = 16
export const GRAPH_PAD_BOTTOM = 34
/* A trend graph exists to show the shape of a game at a glance. At the old
   16px per ply an 84-ply game drew 1400px into a ~259px rail, so only a keyhole
   of the curve was ever visible. It now fills whatever width it is given, and
   only games long enough to squeeze plies below this floor scroll at all. */
export const GRAPH_MIN_PX_PER_PLY = 2
/* What a graph is drawn at before its container has been measured. */
export const GRAPH_FALLBACK_WIDTH = 260

/** The width a graph needs: the space it is given, or more if it must scroll. */
export function graphWidthForIndex(maxIndex: number, available: number): number {
  const intrinsic = GRAPH_PAD_LEFT + GRAPH_PAD_RIGHT + (maxIndex * GRAPH_MIN_PX_PER_PLY)
  return Math.max(available, intrinsic)
}

export function clampGraphIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(index, 0), maxIndex)
}

/**
 * Where a key press moves the graph's cursor, or null for a key the graph does
 * not claim — which is what lets everything else reach the page.
 */
export function graphKeyboardTarget(key: string, currentIndex: number, maxIndex: number): number | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampGraphIndex(currentIndex - 1, maxIndex)
    case 'ArrowRight':
    case 'ArrowUp':
      return clampGraphIndex(currentIndex + 1, maxIndex)
    case 'Home':
      return 0
    case 'End':
      return maxIndex
    case 'PageDown':
      return clampGraphIndex(currentIndex - 10, maxIndex)
    case 'PageUp':
      return clampGraphIndex(currentIndex + 10, maxIndex)
    default:
      return null
  }
}
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
