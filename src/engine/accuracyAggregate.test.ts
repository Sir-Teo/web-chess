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

    it('is dragged down by one catastrophe where the mean is not', () => {
        const steady = Array.from({ length: 20 }, () => 80)
        const oneDisaster = [...Array.from({ length: 19 }, () => 84), 4]
        const flatWeights = Array.from({ length: 20 }, () => MIN_WEIGHT)

        const plainMeanOfBoth = [steady, oneDisaster].map(
            values => values.reduce((sum, value) => sum + value, 0) / values.length,
        )
        // The two look alike to a plain mean: 80.0 against 80.0.
        expect(plainMeanOfBoth[0]).toBeCloseTo(plainMeanOfBoth[1] as number, 0)

        const steadyScore = aggregateAccuracy(steady, flatWeights) as number
        const disasterScore = aggregateAccuracy(oneDisaster, flatWeights) as number
        expect(disasterScore).toBeLessThan(steadyScore - 10)
    })

    it('never leaves the percentage range', () => {
        expect(aggregateAccuracy([100, 100, 100], [1, 1, 1])).toBeLessThanOrEqual(100)
        expect(aggregateAccuracy([0, 0, 0], [1, 1, 1])).toBeGreaterThanOrEqual(0)
    })

    it('survives a zero without collapsing the whole game to zero', () => {
        const score = aggregateAccuracy([90, 90, 0], [1, 1, 1])
        expect(score).not.toBeNull()
        expect(score as number).toBeGreaterThan(0)
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
