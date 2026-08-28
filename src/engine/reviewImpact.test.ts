import { describe, expect, it } from 'vitest'
import { reviewImpactLabel } from './reviewImpact'
import { MAX_REPORTED_CENTIPAWN_LOSS } from './analysis'

describe('the per-move impact label', () => {
  it('says nothing is known until the move has been evaluated', () => {
    expect(reviewImpactLabel(undefined)).toBe('Queued')
    expect(reviewImpactLabel(Number.NaN)).toBe('Queued')
  })

  it('treats a small swing either way as no loss', () => {
    expect(reviewImpactLabel(0)).toBe('No loss')
    expect(reviewImpactLabel(9)).toBe('No loss')
    expect(reviewImpactLabel(-10)).toBe('No loss')
  })

  it('reports an ordinary loss in pawns', () => {
    expect(reviewImpactLabel(-120)).toBe('Lost 1.20')
    expect(reviewImpactLabel(-45)).toBe('Lost 0.45')
  })

  it('reports a gain', () => {
    expect(reviewImpactLabel(18)).toBe('Gain +0.18')
  })

  it('marks a loss that ran past the bound, rather than showing the bound alone', () => {
    // A mate sentinel produces a delta of tens of pawns; the figure shown is
    // bounded, and the "+" says the real one is off this scale.
    expect(reviewImpactLabel(-9500)).toBe(`Lost ${(MAX_REPORTED_CENTIPAWN_LOSS / 100).toFixed(2)}+`)
  })

  it('marks an off-scale gain the same way', () => {
    expect(reviewImpactLabel(9500)).toBe(`Gain +${(MAX_REPORTED_CENTIPAWN_LOSS / 100).toFixed(2)}+`)
  })

  it('does not mark a loss that sits exactly at the bound', () => {
    // Nothing was truncated here, so nothing should suggest it was.
    expect(reviewImpactLabel(-MAX_REPORTED_CENTIPAWN_LOSS)).toBe('Lost 10.00')
  })
})
