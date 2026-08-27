import { describe, expect, it } from 'vitest'
import { GRAPH_BASE_WIDTH, GRAPH_MAX_WIDTH, graphTickStep, graphWidthForIndex } from './graphLayout'

describe('graph layout helpers', () => {
  it('keeps normal short games spacious', () => {
    expect(graphWidthForIndex(0)).toBe(GRAPH_BASE_WIDTH)
    expect(graphWidthForIndex(20)).toBe(392)
    expect(graphWidthForIndex(120)).toBe(1992)
  })

  it('caps very long graph widths before they become huge SVGs', () => {
    expect(graphWidthForIndex(1_000)).toBe(GRAPH_MAX_WIDTH)
    expect(graphWidthForIndex(100_000)).toBe(GRAPH_MAX_WIDTH)
  })

  it('normalizes malformed indexes safely', () => {
    expect(graphWidthForIndex(-10)).toBe(GRAPH_BASE_WIDTH)
    expect(graphWidthForIndex(Number.NaN)).toBe(GRAPH_BASE_WIDTH)
    expect(graphTickStep(Number.POSITIVE_INFINITY)).toBe(4)
  })
})
