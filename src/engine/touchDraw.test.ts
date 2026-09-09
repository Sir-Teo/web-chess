import { describe, expect, it } from 'vitest'
import { MARK_COLORS } from './boardMarks'
import { resolveTouchDraw, squareAtPoint, toggleDrawnArrow } from './touchDraw'

/** A 400px board at the origin, so a square is 50px and the sums are readable. */
const RECT = { left: 0, top: 0, width: 400, height: 400 }
/** One that is neither square-aligned nor at the origin, which a real one is not. */
const OFFSET_RECT = { left: 17.5, top: 133.25, width: 349, height: 349 }

const centreOf = (column: number, row: number, rect = RECT) => ({
  x: rect.left + (column + 0.5) * (rect.width / 8),
  y: rect.top + (row + 0.5) * (rect.height / 8),
})

describe('squareAtPoint', () => {
  it('reads the four corners with White at the bottom', () => {
    expect(squareAtPoint(centreOf(0, 0), RECT, 'white')).toBe('a8')
    expect(squareAtPoint(centreOf(7, 0), RECT, 'white')).toBe('h8')
    expect(squareAtPoint(centreOf(0, 7), RECT, 'white')).toBe('a1')
    expect(squareAtPoint(centreOf(7, 7), RECT, 'white')).toBe('h1')
  })

  /** Flipping the board turns the grid, not the squares. */
  it('reads the same four corners the other way round with Black at the bottom', () => {
    expect(squareAtPoint(centreOf(0, 0), RECT, 'black')).toBe('h1')
    expect(squareAtPoint(centreOf(7, 0), RECT, 'black')).toBe('a1')
    expect(squareAtPoint(centreOf(0, 7), RECT, 'black')).toBe('h8')
    expect(squareAtPoint(centreOf(7, 7), RECT, 'black')).toBe('a8')
  })

  it('agrees with itself on a board that is not at the origin', () => {
    expect(squareAtPoint(centreOf(4, 6, OFFSET_RECT), OFFSET_RECT, 'white')).toBe('e2')
    expect(squareAtPoint(centreOf(4, 6, OFFSET_RECT), OFFSET_RECT, 'black')).toBe('d7')
  })

  /** Every square, both ways, is reachable and distinct. */
  it('covers all sixty-four squares exactly once', () => {
    for (const orientation of ['white', 'black'] as const) {
      const seen = new Set<string>()
      for (let column = 0; column < 8; column++) {
        for (let row = 0; row < 8; row++) {
          const square = squareAtPoint(centreOf(column, row), RECT, orientation)
          expect(square, `${orientation} ${column},${row}`).not.toBeNull()
          seen.add(square!)
        }
      }
      expect(seen.size, orientation).toBe(64)
    }
  })

  it('has nothing to report off the board or for a board with no size', () => {
    expect(squareAtPoint({ x: -1, y: 200 }, RECT, 'white')).toBeNull()
    expect(squareAtPoint({ x: 200, y: -1 }, RECT, 'white')).toBeNull()
    expect(squareAtPoint({ x: 400, y: 200 }, RECT, 'white')).toBeNull()
    expect(squareAtPoint({ x: 200, y: 400 }, RECT, 'white')).toBeNull()
    expect(squareAtPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, 'white')).toBeNull()
  })

  /** The very first pixel of the board is still on it. */
  it('includes the top-left pixel and excludes the one past the bottom-right', () => {
    expect(squareAtPoint({ x: 0, y: 0 }, RECT, 'white')).toBe('a8')
    expect(squareAtPoint({ x: 399.9, y: 399.9 }, RECT, 'white')).toBe('h1')
  })
})

describe('resolveTouchDraw', () => {
  it('calls a press and release on one square a mark', () => {
    expect(resolveTouchDraw('e4', 'e4')).toEqual({ kind: 'mark', square: 'e4' })
  })

  it('calls a press and release on two an arrow', () => {
    expect(resolveTouchDraw('e2', 'e4')).toEqual({ kind: 'arrow', from: 'e2', to: 'e4' })
  })

  it('lets a release off the board abandon the gesture', () => {
    expect(resolveTouchDraw('e2', null)).toBeNull()
    expect(resolveTouchDraw(null, 'e4')).toBeNull()
    expect(resolveTouchDraw(null, null)).toBeNull()
  })
})

describe('toggleDrawnArrow', () => {
  const blue = MARK_COLORS.primary
  const pink = MARK_COLORS.alternate

  it('adds an arrow that is not there', () => {
    expect(toggleDrawnArrow([], 'e2', 'e4', blue))
      .toEqual([{ startSquare: 'e2', endSquare: 'e4', color: blue }])
  })

  it('takes away the same arrow in the same colour', () => {
    const drawn = toggleDrawnArrow([], 'e2', 'e4', blue)
    expect(toggleDrawnArrow(drawn, 'e2', 'e4', blue)).toEqual([])
  })

  it('recolours rather than clearing, so changing your mind takes one gesture', () => {
    const drawn = toggleDrawnArrow([], 'e2', 'e4', blue)
    expect(toggleDrawnArrow(drawn, 'e2', 'e4', pink))
      .toEqual([{ startSquare: 'e2', endSquare: 'e4', color: pink }])
  })

  /** The other direction is a different arrow, and both may be drawn at once. */
  it('keeps an arrow drawn the other way round', () => {
    const drawn = toggleDrawnArrow(toggleDrawnArrow([], 'e2', 'e4', blue), 'e4', 'e2', blue)
    expect(drawn).toHaveLength(2)
    expect(toggleDrawnArrow(drawn, 'e2', 'e4', blue))
      .toEqual([{ startSquare: 'e4', endSquare: 'e2', color: blue }])
  })

  it('leaves the arrows it was given alone', () => {
    const before: never[] = []
    Object.freeze(before)
    expect(() => toggleDrawnArrow(before, 'a1', 'h8', blue)).not.toThrow()
    expect(before).toEqual([])
  })
})
