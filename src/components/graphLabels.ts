export type GraphPointLabel = {
  index: number
  label: string
}

export function formatGraphAxisLabel(point: GraphPointLabel): string {
  const label = point.label.trim()
  if (point.index <= 0 || label.toLowerCase() === 'start') return 'Start'

  return label.split(/\s+/, 1)[0] ?? label
}

export function formatGraphPositionLabel(point: GraphPointLabel | undefined, index: number): string {
  if (index <= 0) return 'Start position'

  const label = point?.label.trim()
  if (label && label.toLowerCase() !== 'start') return `After ${label}`

  return `After move ${index}`
}
