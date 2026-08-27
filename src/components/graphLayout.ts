export const GRAPH_HEIGHT = 220
export const GRAPH_PAD_LEFT = 52
export const GRAPH_PAD_RIGHT = 20
export const GRAPH_PAD_TOP = 16
export const GRAPH_PAD_BOTTOM = 34
export const GRAPH_BASE_WIDTH = 300
export const GRAPH_PX_PER_PLY = 16
export const GRAPH_MAX_WIDTH = 4096

export function graphWidthForIndex(maxIndex: number): number {
  const normalizedMaxIndex = Number.isFinite(maxIndex) ? Math.max(0, Math.floor(maxIndex)) : 0
  const naturalWidth = Math.max(
    GRAPH_BASE_WIDTH,
    GRAPH_PAD_LEFT + GRAPH_PAD_RIGHT + (normalizedMaxIndex * GRAPH_PX_PER_PLY),
  )

  return Math.min(GRAPH_MAX_WIDTH, naturalWidth)
}

export function graphTickStep(maxIndex: number): number {
  const normalizedMaxIndex = Number.isFinite(maxIndex) ? Math.max(0, Math.floor(maxIndex)) : 0
  if (normalizedMaxIndex <= 20) return 4

  const roughStep = Math.max(4, Math.round(normalizedMaxIndex / 10))
  return roughStep % 2 === 0 ? roughStep : roughStep + 1
}
