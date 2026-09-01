import { describe, expect, it } from 'vitest'
import { REVIEW_LABELS, reviewConfidenceLabel } from './reviewLabels'
import type { ReviewLabel } from './analysis'

describe('review labels', () => {
  it('has a word for every classification a row can carry', () => {
    // The list is `ReviewLabel`'s members; the type checker holds the table to
    // it, and this holds the table to having something to say for each.
    const labels: ReviewLabel[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'pending']
    for (const label of labels) {
      expect(REVIEW_LABELS[label]).toBeTruthy()
    }
    expect(Object.keys(REVIEW_LABELS).sort()).toEqual([...labels].sort())
  })
})

describe('reviewConfidenceLabel', () => {
  it('names the depth behind a grade', () => {
    expect(reviewConfidenceLabel('standard', 16)).toBe('D16')
    expect(reviewConfidenceLabel('shallow', 6)).toBe('Shallow d6')
    expect(reviewConfidenceLabel('deep', 24)).toBe('Deep d24')
  })

  /** Not a shallow reading -- no reading, which is a different thing to say. */
  it('says a pending row has nothing behind it yet', () => {
    expect(reviewConfidenceLabel('pending', 16)).toBe('Needs eval')
    expect(reviewConfidenceLabel('pending', undefined)).toBe('Needs eval')
  })

  it('still says something when the depth is missing', () => {
    expect(reviewConfidenceLabel('standard', undefined)).toBe('Evaluated')
    expect(reviewConfidenceLabel('shallow', undefined)).toBe('Shallow')
    expect(reviewConfidenceLabel('deep', undefined)).toBe('Deep')
  })
})
