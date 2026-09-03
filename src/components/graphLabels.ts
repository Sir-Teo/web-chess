export type GraphPointLabel = {
  index: number
  label: string
}

/**
 * The tick under a point on the trend graph: a bare move number.
 *
 * It used to be the label's first token, which is "7." for a White move and
 * "7..." for a Black one — and an axis reading "7... 14... 21..." looks like
 * text that did not fit rather than like Black's seventh move. The axis has
 * room for a number and nothing else, and which side moved is already carried
 * by `formatGraphPositionLabel`, which is what the tooltip and the slider's
 * accessible value read.
 */
export function formatGraphAxisLabel(point: GraphPointLabel): string {
  const label = point.label.trim()
  if (point.index <= 0 || label.toLowerCase() === 'start') return 'Start'

  const first = label.split(/\s+/, 1)[0] ?? label
  const number = first.replace(/\.+$/, '')
  return number || first
}

export function formatGraphPositionLabel(point: GraphPointLabel | undefined, index: number): string {
  if (index <= 0) return 'Start position'

  const label = point?.label.trim()
  if (label && label.toLowerCase() !== 'start') return `After ${label}`

  return `After move ${index}`
}

/**
 * What the slider announces for the selected ply: the position, and the
 * reading when there is one. It used to name the position alone, so a
 * screen-reader user scrubbing the graph heard "After 12. Nf3" and never
 * the number the graph exists to show.
 */
export function describeWinratePosition(
  point: (GraphPointLabel & { whiteWinrate: number }) | undefined,
  index: number,
): string {
  const where = formatGraphPositionLabel(point, index)
  return point ? `${where}, ${point.whiteWinrate.toFixed(1)}% for White` : where
}

export function describeWdlPosition(
  point: (GraphPointLabel & { white: number; draw: number; black: number }) | undefined,
  index: number,
): string {
  const where = formatGraphPositionLabel(point, index)
  return point
    ? `${where}, White ${point.white.toFixed(0)}%, draw ${point.draw.toFixed(0)}%, Black ${point.black.toFixed(0)}%`
    : where
}

/**
 * The position, as short as the graph's own axis writes it: the move that
 * reached it, "Start", or the ply when the series has no move for it. The
 * readout has a rail's width to live in -- about 190px of plot -- so the
 * "After ..." of the accessible label is spent elsewhere.
 */
function shortGraphPositionLabel(point: GraphPointLabel | undefined, index: number): string {
  if (index <= 0) return 'Start'
  const label = point?.label.trim()
  if (label && label.toLowerCase() !== 'start') return label
  return `Move ${index}`
}

/**
 * What the pointer is over on the winrate graph: the position and its
 * reading, or the position and the fact that it has none yet -- a ply the
 * series skipped is still a ply, and the readout should say so rather than
 * go blank across a gap.
 */
export function formatWinrateReadout(
  point: (GraphPointLabel & { whiteWinrate: number }) | undefined,
  index: number,
): string {
  const where = shortGraphPositionLabel(point, index)
  return point ? `${where} · ${point.whiteWinrate.toFixed(1)}% White` : `${where} · no reading`
}

/** The same, for the three-way split. Whole percentages: three of them have to fit on a line. */
export function formatWdlReadout(
  point: (GraphPointLabel & { white: number; draw: number; black: number }) | undefined,
  index: number,
): string {
  const where = shortGraphPositionLabel(point, index)
  return point
    ? `${where} · W ${point.white.toFixed(0)} · D ${point.draw.toFixed(0)} · B ${point.black.toFixed(0)}`
    : `${where} · no reading`
}
