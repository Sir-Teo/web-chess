import { describe, expect, it } from 'vitest'
import {
    MAX_WEIGHT,
    MAX_WINDOW,
    MIN_WEIGHT,
    MIN_WINDOW,
    HARMONIC_ACCURACY_FLOOR,
    aggregateAccuracy,
    harmonicMean,
    standardDeviation,
    volatilityWeights,
    weightedMean,
} from './accuracyAggregate'

describe('accuracy aggregation', () => {
    it('has no opinion about an empty game', () => {
        expect(aggregateAccuracy([], [])).toBeNull()
        expect(volatilityWeights([])).toEqual([])
        expect(volatilityWeights([50])).toEqual([])
    })

    it('returns one weight per move, not per position', () => {
        const series = Array.from({ length: 41 }, (_, i) => 50 + Math.sin(i) * 10)
        expect(volatilityWeights(series)).toHaveLength(40)
    })

    it('keeps every weight inside the clamp', () => {
        const wild = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0 : 100))
        const flat = Array.from({ length: 60 }, () => 50)
        for (const weight of volatilityWeights(wild)) {
            expect(weight).toBeLessThanOrEqual(MAX_WEIGHT)
            expect(weight).toBeGreaterThanOrEqual(MIN_WEIGHT)
        }
        expect(volatilityWeights(flat).every(weight => weight === MIN_WEIGHT)).toBe(true)
    })

    it('weighs a move played during a swing above one played in a dead position', () => {
        // Quiet for thirty moves, then the game turns over.
        const series = [...Array.from({ length: 30 }, () => 50), ...Array.from({ length: 30 }, (_, i) => 50 + i * 1.6)]
        const weights = volatilityWeights(series)
        const quiet = weights[5] as number
        const swinging = weights[45] as number
        expect(swinging).toBeGreaterThan(quiet)
    })

    it('scores a mistake made in a sharp position above one made in a dead one', () => {
        // The same two accuracies, once in a game that was swinging when they
        // were played and once in a game that was already decided. Weighting is
        // the whole point: the sharp game's moves carry more of the score.
        const accuracies = [95, 55]
        const flat = [MIN_WEIGHT, MIN_WEIGHT]
        const sharpOnTheSecondMove = [MIN_WEIGHT, 8]

        const evenly = aggregateAccuracy(accuracies, flat) as number
        const weighted = aggregateAccuracy(accuracies, sharpOnTheSecondMove) as number

        // The weighted half of an even weighting is the plain mean, 75; the
        // harmonic half of the same pair is 69.7, and the score is their mean.
        expect(weightedMean(accuracies, flat)).toBeCloseTo(75, 5)
        expect(evenly).toBeCloseTo(72.33, 2)
        expect(weighted).toBeLessThan(evenly)
    })

    it('floors each accuracy at a point before taking its reciprocal', () => {
        // Lichess's floor, from `Maths.harmonicMean` in lichess-org/scalalib:
        // `1 / Math.max(1, v)`. Without it a single move scoring zero makes the
        // whole game zero however well the rest was played, which is why this
        // half of the published method was left out here for a while.
        expect(HARMONIC_ACCURACY_FLOOR).toBe(1)
        expect(harmonicMean([90, 90, 0])).toBeCloseTo(harmonicMean([90, 90, 1]) as number, 10)
        expect(harmonicMean([90, 90, 0]) as number).toBeGreaterThan(0)
    })

    it('lets one catastrophe carry weight a plain mean would average away', () => {
        // The reason the harmonic half exists. Both games have the same total
        // loss spread differently: one bad move, or four mediocre ones.
        const oneDisaster = [95, 95, 95, 95, 95, 95, 95, 95, 95, 9.5]
        const spreadAround = Array.from({ length: 10 }, () => 86.45)
        const flat = Array.from({ length: 10 }, () => 1)

        expect(weightedMean(oneDisaster, flat)).toBeCloseTo(weightedMean(spreadAround, flat) as number, 1)
        expect(aggregateAccuracy(oneDisaster, flat) as number)
            .toBeLessThan(aggregateAccuracy(spreadAround, flat) as number)
    })

    it('scores a long game with one blunder in it like a long game, not a short one', () => {
        // A short fixture reads harshly under this method -- three moves of
        // 90/90/0 come out near 31 -- and that is true of Lichess too. What
        // matters is that a game of ordinary length does not.
        const realistic = [...Array.from({ length: 39 }, () => 95), 9.5]
        const flat = Array.from({ length: 40 }, () => 1)
        expect(aggregateAccuracy(realistic, flat) as number).toBeGreaterThan(80)
        expect(aggregateAccuracy(realistic, flat) as number).toBeLessThan(90)
    })

it('clamps the window at both ends, so short and long games both behave', () => {
        // Window is floor(positions / 10), clamped to [MIN_WINDOW, MAX_WINDOW].
        // A five-move game would ask for 0 and a 300-move game for 30; neither
        // is a window, and an unclamped 0 would make every weight the floor.
        const short = Array.from({ length: 6 }, (_, i) => 50 + i)
        const long = Array.from({ length: 301 }, (_, i) => 50 + (i % 17))

        expect(volatilityWeights(short)).toHaveLength(short.length - 1)
        expect(volatilityWeights(long)).toHaveLength(long.length - 1)

        // A window shorter than MIN_WINDOW cannot have a spread, so a short
        // game would score every move identically if it were not clamped up.
        const shortWeights = volatilityWeights(short)
        expect(new Set(shortWeights).size).toBeGreaterThan(0)
        expect(shortWeights.every(weight => weight >= MIN_WEIGHT && weight <= MAX_WEIGHT)).toBe(true)
        expect(MIN_WINDOW).toBeLessThan(MAX_WINDOW)
    })

    it('never leaves the percentage range', () => {
        expect(aggregateAccuracy([100, 100, 100], [1, 1, 1])).toBeLessThanOrEqual(100)
        expect(aggregateAccuracy([0, 0, 0], [1, 1, 1])).toBeGreaterThanOrEqual(0)
    })

    it('ignores non-finite values rather than poisoning the result', () => {
        expect(weightedMean([90, Number.NaN, 70], [1, 1, 1])).toBeCloseTo(80, 5)
        expect(harmonicMean([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull()
        expect(standardDeviation([])).toBe(0)
        expect(standardDeviation([5, 5, 5])).toBe(0)
    })

    it('falls back to an even weight when a weight is missing', () => {
        expect(weightedMean([50, 100], [])).toBeCloseTo(75, 5)
    })
})
