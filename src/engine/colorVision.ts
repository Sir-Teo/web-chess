/**
 * Colour-vision simulation, so a palette's separation can be measured rather
 * than assumed.
 *
 * `boardThemes` already computes its coordinate contrast in the tests instead
 * of asserting it in a comment. This is the same idea for hue: the review
 * classifications are told apart by colour in the move list, and roughly one
 * man in twelve sees those colours differently. A palette change that makes
 * "Best" and "Blunder" the same colour for them should fail a test, not ship.
 *
 * The simulation is the Viénot–Brettel–Mollon projection: convert to LMS, flatten
 * the missing cone's axis, convert back. Distance is CIE76 in Lab, which is
 * crude for fine judgements and perfectly adequate for "are these two the same
 * colour".
 */

export type ColorVision = 'normal' | 'protan' | 'deutan' | 'tritan'

type Triple = [number, number, number]

const RGB_TO_LMS: Triple[] = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
]

const LMS_TO_RGB: Triple[] = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
]

/** Each flattens the axis of the cone that is missing. */
const PROJECTIONS: Record<Exclude<ColorVision, 'normal'>, Triple[]> = {
  protan: [[0, 1.05118294, -0.05116099], [0, 1, 0], [0, 0, 1]],
  deutan: [[1, 0, 0], [0.9513092, 0, 0.04866992], [0, 0, 1]],
  tritan: [[1, 0, 0], [0, 1, 0], [-0.86744736, 1.86727089, 0]],
}

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

const apply = (matrix: Triple[], vector: Triple): Triple =>
  matrix.map(row => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]) as Triple

/** `#rrggbb` to three 0-1 channels. Throws on anything else, so a typo is loud. */
export function parseHexColor(hex: string): Triple {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`Not a six-digit hex colour: ${hex}`)
  const value = match[1]
  return [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255) as Triple
}

/** The colour as someone with that kind of vision sees it. */
export function simulateColorVision(hex: string, vision: ColorVision): Triple {
  const rgb = parseHexColor(hex)
  if (vision === 'normal') return rgb

  const lms = apply(RGB_TO_LMS, rgb.map(toLinear) as Triple)
  const projected = apply(PROJECTIONS[vision], lms)
  return apply(LMS_TO_RGB, projected)
    .map(channel => Math.min(1, Math.max(0, fromLinear(channel)))) as Triple
}

function toLab(rgb: Triple): Triple {
  const [r, g, b] = rgb.map(toLinear)
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

/** CIE76 distance. Around 2 is "only side by side"; around 10 is "clearly different". */
export function colorDistance(a: Triple, b: Triple): number {
  const first = toLab(a)
  const second = toLab(b)
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}

/** How far apart two colours look to someone with that kind of vision. */
export function distanceAsSeen(hexA: string, hexB: string, vision: ColorVision): number {
  return colorDistance(simulateColorVision(hexA, vision), simulateColorVision(hexB, vision))
}
