import { describe, expect, it } from 'vitest'
import { ARROW_LOSS_SCALE_CP, clamp01, topArrowColor } from './arrowColors'
import { BOARD_THEMES, compositeOver, contrastRatio } from './boardThemes'
import { type ColorVision, distanceAsSeen } from './colorVision'

const VISIONS: ColorVision[] = ['normal', 'protan', 'deutan', 'tritan']

/** An `rgba(...)` arrow as it lands on a square, so the alpha counts. */
function paintedOver(square: string, color: string): string {
  const { r, g, b, a } = channels(color)
  const hex = `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  return compositeOver(square, hex, a)
}

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
    expect(channels(topArrowColor(ARROW_LOSS_SCALE_CP))).toMatchObject({ r: 96, g: 16, b: 16 })
  })

  /**
   * The two ends of this scale are the pair a red-green deficiency takes away,
   * and telling them apart is the only thing the scale is for. Measured over
   * both squares of all five board schemes: a bright red faded to 0.5 sat
   * **2.8** from the green for deutan vision on the forest board, because
   * fading it moved it toward the square rather than away from the green.
   */
  it('keeps its two ends apart however colour is seen', () => {
    let apart = Infinity
    let mono = Infinity
    let where = ''
    for (const theme of BOARD_THEMES) {
      for (const [tag, square] of [['light', theme.light], ['dark', theme.dark]] as const) {
        const best = paintedOver(square, topArrowColor(0))
        const worst = paintedOver(square, topArrowColor(ARROW_LOSS_SCALE_CP))
        mono = Math.min(mono, contrastRatio(best, worst))
        for (const vision of VISIONS) {
          const seen = distanceAsSeen(best, worst, vision)
          if (seen < apart) {
            apart = seen
            where = `${theme.id} ${tag} square, ${vision}`
          }
        }
      }
    }
    expect(apart, `only ${apart.toFixed(1)} apart on the ${where}`).toBeGreaterThan(15)
    // And apart in plain luminance too, for a reader with no colour vision.
    expect(mono, `only ${mono.toFixed(2)}:1 apart in luminance`).toBeGreaterThan(1.5)
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
