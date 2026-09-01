import { describe, expect, it } from 'vitest'
import {
  GRAPH_MIN_TICK_SPACING,
  GRAPH_PAD_LEFT,
  GRAPH_PAD_RIGHT,
  clampGraphIndex,
  graphKeyboardTarget,
  graphTickStep,
  graphWidthForIndex,
} from './graphLayout'

describe('graph layout helpers', () => {
  it('keeps short games on a steady four-ply tick', () => {
    expect(graphTickStep(0)).toBe(4)
    expect(graphTickStep(20)).toBe(4)
    expect(graphTickStep(60)).toBe(6)
  })

  it('spreads ticks far enough apart to keep their labels off each other', () => {
    const innerWidth = 232
    const maxIndex = 116

    const step = graphTickStep(maxIndex, innerWidth)
    const spacing = (step / maxIndex) * innerWidth

    expect(spacing).toBeGreaterThanOrEqual(GRAPH_MIN_TICK_SPACING)
    // Without the width it would have chosen 12, drawing labels 24px apart.
    expect(graphTickStep(maxIndex)).toBe(12)
  })

  it('normalizes malformed indexes safely', () => {
    expect(graphTickStep(-10)).toBe(4)
    expect(graphTickStep(Number.NaN)).toBe(4)
    expect(graphTickStep(Number.POSITIVE_INFINITY)).toBe(4)
    expect(graphTickStep(100, 0)).toBe(10)
  })
})

describe('graph width', () => {
  it('fills the space it is given', () => {
    expect(graphWidthForIndex(20, 600)).toBe(600)
  })

  it('scrolls only once the plies would be squeezed below the floor', () => {
    // 300 plies cannot fit two pixels each into a 260px rail.
    expect(graphWidthForIndex(300, 260)).toBe(GRAPH_PAD_LEFT + GRAPH_PAD_RIGHT + 600)
  })
})

describe('graph keyboard navigation', () => {
  it('steps, pages and jumps within the range', () => {
    expect(graphKeyboardTarget('ArrowRight', 5, 20)).toBe(6)
    expect(graphKeyboardTarget('ArrowLeft', 5, 20)).toBe(4)
    expect(graphKeyboardTarget('PageUp', 5, 20)).toBe(15)
    expect(graphKeyboardTarget('PageDown', 5, 20)).toBe(0)
    expect(graphKeyboardTarget('Home', 5, 20)).toBe(0)
    expect(graphKeyboardTarget('End', 5, 20)).toBe(20)
  })

  it('never leaves the range, whichever end it is pushed at', () => {
    expect(graphKeyboardTarget('ArrowLeft', 0, 20)).toBe(0)
    expect(graphKeyboardTarget('ArrowRight', 20, 20)).toBe(20)
    expect(clampGraphIndex(-4, 20)).toBe(0)
    expect(clampGraphIndex(99, 20)).toBe(20)
  })

  /** Anything the graph does not claim has to reach the rest of the page. */
  it('leaves other keys alone', () => {
    expect(graphKeyboardTarget('Tab', 5, 20)).toBeNull()
    expect(graphKeyboardTarget('f', 5, 20)).toBeNull()
    expect(graphKeyboardTarget(' ', 5, 20)).toBeNull()
  })
})
