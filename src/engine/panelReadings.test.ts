import { describe, expect, it } from 'vitest'
import {
  countLabel,
  engineTelemetryLabel,
  formatAccuracyValue,
  formatCentipawnLossValue,
  formatCloudNodes,
  formatCompactNumber,
  knownPgnHeader,
  percentage,
} from './panelReadings'

describe('percentage', () => {
  it('is a share, and zero rather than NaN with no total', () => {
    expect(percentage(1, 4)).toBe(25)
    expect(percentage(0, 0)).toBe(0)
    expect(percentage(5, 0)).toBe(0)
  })
})

describe('accuracy and loss readings', () => {
  it('marks an unscored reading rather than printing a zero', () => {
    expect(formatAccuracyValue(null)).toBe('--')
    expect(formatCentipawnLossValue(null)).toBe('--')
    // Zero is a real reading and has to look different from no reading.
    expect(formatAccuracyValue(0)).toBe('0.0')
    expect(formatCentipawnLossValue(0)).toBe('0')
  })

  it('keeps accuracy to a tenth and centipawn loss whole', () => {
    expect(formatAccuracyValue(98.44)).toBe('98.4')
    expect(formatCentipawnLossValue(7.6)).toBe('8')
  })
})

describe('formatCompactNumber', () => {
  it('changes unit at each thousand', () => {
    expect(formatCompactNumber(999)).toBe('999')
    expect(formatCompactNumber(1_500)).toBe('2k')
    expect(formatCompactNumber(2_400_000)).toBe('2.4M')
    expect(formatCompactNumber(3_100_000_000)).toBe('3.1B')
  })
})

describe('formatCloudNodes', () => {
  /** Lichess reports its cloud node counts in thousands. */
  it('reads its input as thousands', () => {
    expect(formatCloudNodes(999)).toBe('999k nodes')
    expect(formatCloudNodes(695_500)).toBe('695.5M nodes')
  })
})

describe('countLabel', () => {
  it('agrees with itself about the number', () => {
    expect(countLabel(1, 'point')).toBe('1 point')
    expect(countLabel(0, 'point')).toBe('0 points')
    expect(countLabel(2, 'ply', 'plies')).toBe('2 plies')
  })
})

describe('engineTelemetryLabel', () => {
  it('reports what the search has actually said', () => {
    expect(engineTelemetryLabel({ depth: 16, nodes: 2_400_000, nps: 3_500_000, time: 691 }))
      .toBe('D16 · 2.4M nodes · 3.5M nps · 691 ms')
  })

  /**
   * A zero is as good as absent: an engine that has not reported nodes yet has
   * not searched none of them.
   */
  it('leaves out fields that are missing or zero', () => {
    expect(engineTelemetryLabel({ depth: 12, nodes: 0, nps: 0, time: 0 })).toBe('D12')
    expect(engineTelemetryLabel({})).toBeNull()
    expect(engineTelemetryLabel(null)).toBeNull()
    expect(engineTelemetryLabel(undefined)).toBeNull()
  })
})

describe('knownPgnHeader', () => {
  /** The standard fills an unknown roster field with "?" and a result with "*". */
  it('treats the standard placeholders as nothing said', () => {
    expect(knownPgnHeader('?')).toBeNull()
    expect(knownPgnHeader('*')).toBeNull()
    expect(knownPgnHeader('  ')).toBeNull()
    expect(knownPgnHeader(undefined)).toBeNull()
  })

  it('keeps a real value, trimmed', () => {
    expect(knownPgnHeader('  Carlsen, M. ')).toBe('Carlsen, M.')
    expect(knownPgnHeader('1/2-1/2')).toBe('1/2-1/2')
  })
})
