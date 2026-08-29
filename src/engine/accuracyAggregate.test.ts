import { describe, expect, it } from 'vitest'
import {
    MAX_WEIGHT,
    MIN_WEIGHT,
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

        expect(evenly).toBeCloseTo(75, 5)
        expect(weighted).toBeLessThan(evenly)
    })

    it('leaves the harmonic mean available but out of the score', () => {
        // The published method averages the weighted mean with the harmonic
        // mean; that half is not shipped, because one near-zero move drags it
        // to zero and the upstream floor is unknown. This pins the decision so
        // it is not reintroduced by accident.
        const withZero = [90, 90, 0]
        expect(harmonicMean(withZero) as number).toBeLessThan(1)
        expect(aggregateAccuracy(withZero, [1, 1, 1]) as number).toBeCloseTo(60, 0)
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
