import { describe, expect, it } from 'vitest'
import { normalizeSpinOptionInput } from './options'

describe('engine option normalization', () => {
  it('rounds and clamps spin option values to engine bounds', () => {
    expect(normalizeSpinOptionInput({ min: 1, max: 1024 }, '2048')).toBe(1024)
    expect(normalizeSpinOptionInput({ min: 1, max: 1024 }, '-8')).toBe(1)
    expect(normalizeSpinOptionInput({ min: 1, max: 1024 }, '15.6')).toBe(16)
  })

  it('falls back to the default or nearest bound instead of returning NaN', () => {
    expect(normalizeSpinOptionInput({ defaultValue: '16', min: 1, max: 1024 }, '')).toBe(16)
    expect(normalizeSpinOptionInput({ min: 2, max: 64 }, 'not-a-number')).toBe(2)
    expect(normalizeSpinOptionInput({}, 'Infinity')).toBe(0)
  })
})
