export type NumericInputValue = number | ''

export type RequiredIntegerBounds = {
  min: number
  max: number
  fallback: number
}

export type OptionalIntegerBounds = {
  min: number
  max: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function parseIntegerInputValue(rawValue: string): NumericInputValue {
  const trimmed = rawValue.trim()
  if (!trimmed) return ''

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.round(parsed) : ''
}

export function normalizeRequiredIntegerInput(
  value: NumericInputValue,
  bounds: RequiredIntegerBounds,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return bounds.fallback
  return clamp(Math.round(value), bounds.min, bounds.max)
}

export function normalizeOptionalIntegerInput(
  value: NumericInputValue,
  bounds: OptionalIntegerBounds,
): NumericInputValue {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return clamp(Math.round(value), bounds.min, bounds.max)
}

export function optionalIntegerInputToNullable(
  value: NumericInputValue,
  bounds: OptionalIntegerBounds,
): number | null {
  const normalized = normalizeOptionalIntegerInput(value, bounds)
  return typeof normalized === 'number' ? normalized : null
}
