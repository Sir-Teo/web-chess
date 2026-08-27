import { describe, expect, it } from 'vitest'
import {
  normalizeOptionalIntegerInput,
  normalizeRequiredIntegerInput,
  optionalIntegerInputToNullable,
  parseIntegerInputValue,
} from './numericInput'

describe('numeric input helpers', () => {
  it('parses editable number input values without manufacturing zeroes', () => {
    expect(parseIntegerInputValue('')).toBe('')
    expect(parseIntegerInputValue('   ')).toBe('')
    expect(parseIntegerInputValue('350')).toBe(350)
    expect(parseIntegerInputValue('15.6')).toBe(16)
    expect(parseIntegerInputValue('not-a-number')).toBe('')
    expect(parseIntegerInputValue('Infinity')).toBe('')
  })

  it('normalizes required integer inputs with bounds and fallback', () => {
    const bounds = { min: 50, max: 30_000, fallback: 500 }

    expect(normalizeRequiredIntegerInput('', bounds)).toBe(500)
    expect(normalizeRequiredIntegerInput(Number.NaN, bounds)).toBe(500)
    expect(normalizeRequiredIntegerInput(25, bounds)).toBe(50)
    expect(normalizeRequiredIntegerInput(35_000, bounds)).toBe(30_000)
    expect(normalizeRequiredIntegerInput(750.4, bounds)).toBe(750)
  })

  it('normalizes optional integer inputs without filling blank values', () => {
    const bounds = { min: 1, max: 500 }

    expect(normalizeOptionalIntegerInput('', bounds)).toBe('')
    expect(normalizeOptionalIntegerInput(Number.POSITIVE_INFINITY, bounds)).toBe('')
    expect(normalizeOptionalIntegerInput(-3, bounds)).toBe(1)
    expect(normalizeOptionalIntegerInput(900, bounds)).toBe(500)
    expect(optionalIntegerInputToNullable('', bounds)).toBeNull()
    expect(optionalIntegerInputToNullable(42, bounds)).toBe(42)
  })
})
