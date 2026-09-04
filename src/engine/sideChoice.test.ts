import { describe, expect, it } from 'vitest'
import { SIDE_CHOICES, isSideChoice, resolveSideChoice } from './sideChoice'

describe('resolveSideChoice', () => {
  it('plays the colour that was asked for', () => {
    expect(resolveSideChoice('white')).toBe('white')
    expect(resolveSideChoice('black')).toBe('black')
    // A named colour ignores the roll entirely.
    expect(resolveSideChoice('white', 0.99)).toBe('white')
    expect(resolveSideChoice('black', 0.01)).toBe('black')
  })

  it('splits random down the middle of Math.random()’s range', () => {
    expect(resolveSideChoice('random', 0)).toBe('white')
    expect(resolveSideChoice('random', 0.4999)).toBe('white')
    expect(resolveSideChoice('random', 0.5)).toBe('black')
    expect(resolveSideChoice('random', 0.9999)).toBe('black')
  })

  it('still picks a side when the roll is not a number', () => {
    expect(resolveSideChoice('random', Number.NaN)).toBe('black')
  })

  it('is even over many rolls, which is the only property that matters', () => {
    const whites = Array.from({ length: 1000 }, (_unused, i) => resolveSideChoice('random', i / 1000))
      .filter(side => side === 'white').length
    expect(whites).toBe(500)
  })
})

describe('isSideChoice', () => {
  it('accepts the three and nothing else', () => {
    for (const { id } of SIDE_CHOICES) expect(isSideChoice(id)).toBe(true)
    expect(isSideChoice('w')).toBe(false)
    expect(isSideChoice(null)).toBe(false)
    expect(isSideChoice('')).toBe(false)
  })
})
