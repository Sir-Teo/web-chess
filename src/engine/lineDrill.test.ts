import { describe, expect, it } from 'vitest'
import {
  DRILL_MISSES_BEFORE_ANSWER,
  type DrillLine,
  drillPlySide,
  drillProgress,
  drillUnavailableReason,
  expectedDrillMove,
  isDrillComplete,
  isDrillTurn,
  judgeDrillMove,
  opponentMovesFrom,
} from './lineDrill'

// 1.e4 e5 2.Nf3 Nc6 3.Bb5
const RUY: string[] = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']
const asWhite: DrillLine = { moves: RUY, side: 'white', rootTurn: 'w' }
const asBlack: DrillLine = { moves: RUY, side: 'black', rootTurn: 'w' }
const move = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined })

describe('drillPlySide', () => {
  it('alternates from whoever is to move at the root', () => {
    expect(drillPlySide('w', 0)).toBe('white')
    expect(drillPlySide('w', 1)).toBe('black')
    expect(drillPlySide('b', 0)).toBe('black')
    expect(drillPlySide('b', 1)).toBe('white')
  })
})

describe('drilling White', () => {
  it('asks for White’s moves and nobody else’s', () => {
    expect(isDrillTurn(asWhite, 0)).toBe(true)
    expect(expectedDrillMove(asWhite, 0)).toBe('e2e4')
    expect(isDrillTurn(asWhite, 1)).toBe(false)
    expect(expectedDrillMove(asWhite, 1)).toBeNull()
  })

  // The reader plays one move and the line answers, so a correct attempt moves
  // two plies. Otherwise they would be asked for their opponent's reply.
  it('plays the opponent’s reply and stops at the next question', () => {
    const judged = judgeDrillMove(asWhite, 0, 0, move('e2e4'))
    expect(judged).toMatchObject({ correct: true, ply: 2, misses: 0, finished: false })
    expect(expectedDrillMove(asWhite, judged.ply)).toBe('g1f3')
  })

  it('leaves the line where it was when the move is wrong', () => {
    const judged = judgeDrillMove(asWhite, 0, 0, move('d2d4'))
    expect(judged).toMatchObject({ correct: false, ply: 0, misses: 1, revealed: false })
    // The ply not moving is what lets the caller snap the piece back rather
    // than record a move the reader was trying not to play.
    expect(expectedDrillMove(asWhite, judged.ply)).toBe('e2e4')
  })

  it('offers the answer after two misses', () => {
    const once = judgeDrillMove(asWhite, 0, 0, move('d2d4'))
    expect(once.revealed).toBe(false)
    const twice = judgeDrillMove(asWhite, 0, once.misses, move('c2c4'))
    expect(twice.misses).toBe(DRILL_MISSES_BEFORE_ANSWER)
    expect(twice.revealed).toBe(true)
  })

  it('forgets the misses once the move is found', () => {
    const missed = judgeDrillMove(asWhite, 0, 0, move('d2d4'))
    expect(judgeDrillMove(asWhite, 0, missed.misses, move('e2e4')).misses).toBe(0)
  })

  it('finishes on the last of the reader’s moves', () => {
    const judged = judgeDrillMove(asWhite, 4, 0, move('f1b5'))
    expect(judged).toMatchObject({ correct: true, finished: true })
    expect(isDrillComplete(asWhite, judged.ply)).toBe(true)
  })

  it('counts only the moves the reader owns', () => {
    expect(drillProgress(asWhite, 0)).toEqual({ done: 0, total: 3 })
    expect(drillProgress(asWhite, 2)).toEqual({ done: 1, total: 3 })
    expect(drillProgress(asWhite, 5)).toEqual({ done: 3, total: 3 })
  })
})

describe('drilling Black', () => {
  // The opening move is White's, so the drill has to play it before asking.
  it('plays the moves before the reader’s first', () => {
    expect(isDrillTurn(asBlack, 0)).toBe(false)
    expect(opponentMovesFrom(asBlack, 0)).toEqual(['e2e4'])
    expect(expectedDrillMove(asBlack, 1)).toBe('e7e5')
  })

  it('runs out the opponent’s moves at the end of the line', () => {
    const judged = judgeDrillMove(asBlack, 3, 0, move('b8c6'))
    // 3...Nc6 is Black's last; White's Bb5 still has to be played to finish.
    expect(judged.ply).toBe(5)
    expect(judged.finished).toBe(true)
  })

  it('counts its own moves', () => {
    expect(drillProgress(asBlack, 0)).toEqual({ done: 0, total: 2 })
  })
})

describe('promotions and casing', () => {
  const promo: DrillLine = { moves: ['e7e8q'], side: 'white', rootTurn: 'w' }
  it('treats a promotion piece as part of the answer', () => {
    expect(judgeDrillMove(promo, 0, 0, move('e7e8q')).correct).toBe(true)
    expect(judgeDrillMove(promo, 0, 0, move('e7e8')).correct).toBe(false)
    expect(judgeDrillMove(promo, 0, 0, move('e7e8n')).correct).toBe(false)
  })

  it('does not care how the line was written', () => {
    const shouty: DrillLine = { moves: ['E2E4'], side: 'white', rootTurn: 'w' }
    expect(judgeDrillMove(shouty, 0, 0, move('e2e4')).correct).toBe(true)
  })
})

describe('a line that starts from a position', () => {
  const fromBlackToMove: DrillLine = { moves: ['e7e5', 'g1f3'], side: 'black', rootTurn: 'b' }
  it('counts sides from whoever is to move at the root', () => {
    expect(isDrillTurn(fromBlackToMove, 0)).toBe(true)
    expect(expectedDrillMove(fromBlackToMove, 0)).toBe('e7e5')
  })
})

describe('drillUnavailableReason', () => {
  it('refuses a line with none of the reader’s moves in it', () => {
    // Would otherwise open, play itself to the end and congratulate them.
    const whiteOnly: DrillLine = { moves: ['e2e4'], side: 'black', rootTurn: 'w' }
    expect(drillUnavailableReason(whiteOnly)).toContain('no moves for Black')
  })

  it('refuses an empty line', () => {
    expect(drillUnavailableReason({ moves: [], side: 'white', rootTurn: 'w' }))
      .toBe('There are no moves in this line to drill.')
  })

  it('allows a line the reader has moves in', () => {
    expect(drillUnavailableReason(asWhite)).toBeNull()
    expect(drillUnavailableReason(asBlack)).toBeNull()
  })
})
