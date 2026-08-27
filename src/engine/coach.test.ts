import { describe, expect, it } from 'vitest'
import { isExactTablebaseCoachMove, selectCoachBestMove } from './coach'

describe('coach move selection', () => {
  it('prioritizes exact tablebase moves over heuristic engine sources', () => {
    expect(selectCoachBestMove({
      engine: 'e2e4',
      cloud: 'd2d4',
      last: 'g1f3',
      tablebase: 'a7a8q',
    })).toBe('a7a8q')
  })

  it('uses live engine and cloud moves when no tablebase move is available', () => {
    expect(selectCoachBestMove({
      engine: 'e2e4',
      cloud: 'd2d4',
      last: 'g1f3',
    })).toBe('e2e4')
    expect(selectCoachBestMove({
      cloud: 'd2d4',
    })).toBe('d2d4')
  })

  it('uses the exact tablebase move when no engine move is available', () => {
    expect(selectCoachBestMove({
      engine: null,
      cloud: null,
      last: null,
      tablebase: 'G6G1',
    })).toBe('g6g1')
  })

  it('ignores invalid move candidates', () => {
    expect(selectCoachBestMove({
      engine: '(none)',
      cloud: 'not-a-move',
      tablebase: 'g6g1',
    })).toBe('g6g1')
  })

  it('detects exact tablebase coach recommendations', () => {
    expect(isExactTablebaseCoachMove('G6G1', 'g6g1')).toBe(true)
    expect(isExactTablebaseCoachMove('e2e4', 'g6g1')).toBe(false)
    expect(isExactTablebaseCoachMove('(none)', 'g6g1')).toBe(false)
  })
})
