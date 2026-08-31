import { describe, expect, it } from 'vitest'
import {
  MARK_COLORS,
  hasSquareMarks,
  markColorForModifiers,
  squareMarkStyle,
  toggleSquareMark,
} from './boardMarks'

describe('board mark colours', () => {
  it('gives a bare right-click the primary colour', () => {
    expect(markColorForModifiers({})).toBe(MARK_COLORS.primary)
  })

  it('reads Shift first, so it wins over a Control held at the same time', () => {
    expect(markColorForModifiers({ shiftKey: true })).toBe(MARK_COLORS.alternate)
    expect(markColorForModifiers({ shiftKey: true, ctrlKey: true })).toBe(MARK_COLORS.alternate)
  })

  it('treats Control, Meta and Option as the same third colour', () => {
    expect(markColorForModifiers({ ctrlKey: true })).toBe(MARK_COLORS.tertiary)
    expect(markColorForModifiers({ metaKey: true })).toBe(MARK_COLORS.tertiary)
    expect(markColorForModifiers({ altKey: true })).toBe(MARK_COLORS.tertiary)
  })

  it('uses none of the colours the engine already owns on this board', () => {
    const engineColours = [
      '#ffaa00', // the move that was played
      '#a78bfa', // the threat probe
      '#3fb950', // the top candidate
      '#f85149', // the worst candidate
    ]
    for (const colour of Object.values(MARK_COLORS)) {
      expect(engineColours).not.toContain(colour.toLowerCase())
    }
  })
})

describe('toggling square marks', () => {
  it('adds a mark, then removes it when the same colour is asked for again', () => {
    const once = toggleSquareMark({}, 'e4', MARK_COLORS.primary)
    expect(once).toEqual({ e4: MARK_COLORS.primary })
    expect(toggleSquareMark(once, 'e4', MARK_COLORS.primary)).toEqual({})
  })

  it('recolours rather than clearing when the modifier changes', () => {
    const blue = toggleSquareMark({}, 'd5', MARK_COLORS.primary)
    expect(toggleSquareMark(blue, 'd5', MARK_COLORS.alternate)).toEqual({ d5: MARK_COLORS.alternate })
  })

  it('leaves the marks it was given alone', () => {
    const before = { e4: MARK_COLORS.primary }
    toggleSquareMark(before, 'e4', MARK_COLORS.primary)
    expect(before).toEqual({ e4: MARK_COLORS.primary })
  })

  it('keeps other squares when one is toggled', () => {
    const marks = toggleSquareMark({ a1: MARK_COLORS.primary }, 'h8', MARK_COLORS.tertiary)
    expect(marks).toEqual({ a1: MARK_COLORS.primary, h8: MARK_COLORS.tertiary })
  })
})

describe('painting a marked square', () => {
  it('rings the square instead of filling it, so the piece stays readable', () => {
    const style = squareMarkStyle(MARK_COLORS.primary)
    expect(style.boxShadow).toContain(MARK_COLORS.primary)
    expect(style.backgroundColor).toBe(`${MARK_COLORS.primary}26`)
  })
})

describe('hasSquareMarks', () => {
  it('is false for an empty set and true once anything is marked', () => {
    expect(hasSquareMarks({})).toBe(false)
    expect(hasSquareMarks({ e4: MARK_COLORS.primary })).toBe(true)
  })
})
