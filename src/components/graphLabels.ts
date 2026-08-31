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
