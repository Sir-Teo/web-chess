import { describe, expect, it } from 'vitest'
import { BOARD_THEMES, compositeOver, contrastRatio } from './boardThemes'
import { type ColorVision, distanceAsSeen } from './colorVision'
import {
  LAST_MOVE_COLOR,
  LAST_MOVE_RING_ALPHA,
  LAST_MOVE_WASH_ALPHA,
  MARK_COLORS,
  hasSquareMarks,
  lastMoveSquareStyle,
  markColorForModifiers,
  squareMarkStyle,
  toggleSquareMark,
} from './boardMarks'

const VISIONS: ColorVision[] = ['normal', 'protan', 'deutan', 'tritan']

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

describe('the move that was played', () => {
  /**
   * The hard case, and the reason the ring exists. The default scheme's squares
   * are a cream and a brown, so amber laid over them as a wash barely moves the
   * colour: measured over all five schemes and all three colour visions, the
   * strongest wash worth drawing reaches ΔE 13 and 1.14:1. An edge does not
   * have that problem, because it separates by shape.
   */
  it('rings the squares in a line every scheme can carry', () => {
    let worst = Infinity
    let where = ''
    for (const theme of BOARD_THEMES) {
      for (const [tag, square] of [['light', theme.light], ['dark', theme.dark]] as const) {
        for (const vision of VISIONS) {
          const seen = distanceAsSeen(LAST_MOVE_COLOR, square, vision)
          if (seen < worst) {
            worst = seen
            where = `${theme.id} ${tag} square, ${vision}`
          }
        }
      }
    }
    // The bar the move hints are held to, which the wash below cannot reach.
    expect(worst, `worst is ${worst.toFixed(1)} on the ${where}`).toBeGreaterThan(15)
  })

  /** What a wash alone would be, so the reason for the ring stays on record. */
  it('cannot lean on the wash, on the scheme most boards are set to', () => {
    const classic = BOARD_THEMES.find(theme => theme.id === 'classic')!
    for (const square of [classic.light, classic.dark]) {
      const washed = compositeOver(square, LAST_MOVE_COLOR, LAST_MOVE_WASH_ALPHA)
      expect(contrastRatio(washed, square)).toBeLessThan(1.2)
      expect(distanceAsSeen(washed, square, 'tritan')).toBeLessThan(15)
    }
  })

  /** Light enough to read the piece through, which is the arrow's weakness. */
  it('fills in behind the ring without hiding what is on the square', () => {
    const style = lastMoveSquareStyle()
    expect(style.boxShadow).toContain(`inset 0 0 0 3px ${LAST_MOVE_COLOR}`)
    expect(style.backgroundColor).toBe(`${LAST_MOVE_COLOR}38`)
    // The hex alpha and the documented figure are the same number.
    expect(Number.parseInt('38', 16) / 255).toBeCloseTo(LAST_MOVE_WASH_ALPHA, 2)
    expect(LAST_MOVE_RING_ALPHA).toBe(1)
  })

  /** Amber is the board's word for this, and nothing else here may take it. */
  it('keeps amber to itself', () => {
    expect(Object.values(MARK_COLORS)).not.toContain(LAST_MOVE_COLOR)
  })
})
