export type SpinOptionBounds = {
  defaultValue?: string
  min?: number
  max?: number
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || !value.trim()) return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function normalizeSpinOptionInput(option: SpinOptionBounds, rawValue: string): number {
  const parsed = finiteNumber(rawValue) ?? finiteNumber(option.defaultValue) ?? finiteNumber(option.min) ?? finiteNumber(option.max) ?? 0
  const rounded = Math.round(parsed)
  const min = finiteNumber(option.min)
  const max = finiteNumber(option.max)

  if (min !== undefined && rounded < min) return min
  if (max !== undefined && rounded > max) return max
  return rounded
}
