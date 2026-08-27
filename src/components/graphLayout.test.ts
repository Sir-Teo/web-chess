import { describe, expect, it } from 'vitest'
import { GRAPH_MIN_TICK_SPACING, graphTickStep } from './graphLayout'

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
