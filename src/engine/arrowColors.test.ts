import { describe, expect, it } from 'vitest'
import { ARROW_LOSS_SCALE_CP, clamp01, topArrowColor } from './arrowColors'

function channels(color: string): { r: number; g: number; b: number; a: number } {
  const [r, g, b, a] = color.replace(/[^0-9.,]/g, '').split(',').map(Number)
  return { r: r!, g: g!, b: b!, a: a! }
}

describe('clamp01', () => {
  it('holds the ends', () => {
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(9)).toBe(1)
  })
})

describe('topArrowColor', () => {
  it('draws the best move in the green everything else uses for "the engine likes this"', () => {
    expect(channels(topArrowColor(0))).toMatchObject({ r: 63, g: 185, b: 80 })
  })

  it('reaches full red at the scale, and stays there past it', () => {
    expect(topArrowColor(ARROW_LOSS_SCALE_CP)).toBe(topArrowColor(ARROW_LOSS_SCALE_CP * 4))
    expect(channels(topArrowColor(ARROW_LOSS_SCALE_CP))).toMatchObject({ r: 248, g: 81, b: 73 })
  })

  /**
   * The point of scaling by absolute loss rather than by rank: three moves
   * within a tenth of a pawn are three good moves, and the second must not be
   * painted as a blunder just for being second.
   */
  it('keeps a near-equal alternative near the good end', () => {
    const near = channels(topArrowColor(10))
    expect(near.g).toBeGreaterThan(near.r)
  })

  it('gets redder and fainter as the move gets worse', () => {
    const steps = [0, 40, 80, 120, 150].map(loss => channels(topArrowColor(loss)))
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!.r).toBeGreaterThan(steps[i - 1]!.r)
      expect(steps[i]!.g).toBeLessThan(steps[i - 1]!.g)
      expect(steps[i]!.a).toBeLessThan(steps[i - 1]!.a)
    }
  })

  it('treats a negative loss as no loss, since a move cannot beat the best one', () => {
    expect(topArrowColor(-50)).toBe(topArrowColor(0))
  })
})
