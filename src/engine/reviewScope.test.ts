import { describe, expect, it } from 'vitest'
import { describeReviewScope } from './analysis'

describe('naming what the review is showing', () => {
  it('calls the unfiltered review the whole line', () => {
    expect(describeReviewScope('both', 'all')).toBe('this reviewed line')
  })

  it('names a side on its own', () => {
    expect(describeReviewScope('white', 'all')).toBe("White's moves")
    expect(describeReviewScope('black', 'all')).toBe("Black's moves")
  })

  it('names a phase on its own', () => {
    expect(describeReviewScope('both', 'opening')).toBe('the opening')
    expect(describeReviewScope('both', 'middleGame')).toBe('the middlegame')
    expect(describeReviewScope('both', 'endgame')).toBe('the endgame')
  })

  it('joins the two so the sentence still reads', () => {
    expect(describeReviewScope('white', 'endgame')).toBe("White's moves in the endgame")
  })

  it('reads correctly in the sentence it was written for', () => {
    // The whole point: this claim must not widen when a filter narrows the view.
    expect(`No major swings found in ${describeReviewScope('black', 'opening')}.`)
      .toBe("No major swings found in Black's moves in the opening.")
    expect(`No major swings found in ${describeReviewScope('both', 'all')}.`)
      .toBe('No major swings found in this reviewed line.')
  })
})
