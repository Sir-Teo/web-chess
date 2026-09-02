import { describe, expect, it } from 'vitest'
import { isReviewPracticeAnswer } from './reviewPractice'

describe('review practice answers', () => {
  it('accepts the exact engine move regardless of casing', () => {
    expect(isReviewPracticeAnswer('E2E4', { from: 'e2', to: 'e4' })).toBe(true)
  })

  it('rejects a different legal-looking move', () => {
    expect(isReviewPracticeAnswer('e2e4', { from: 'd2', to: 'd4' })).toBe(false)
  })

  it('requires the expected promotion piece', () => {
    expect(isReviewPracticeAnswer('e7e8q', { from: 'e7', to: 'e8', promotion: 'q' })).toBe(true)
    expect(isReviewPracticeAnswer('e7e8q', { from: 'e7', to: 'e8', promotion: 'n' })).toBe(false)
    expect(isReviewPracticeAnswer('e7e8q', { from: 'e7', to: 'e8' })).toBe(false)
  })
})
