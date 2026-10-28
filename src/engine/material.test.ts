import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { describeCaptures, materialAdvantageLabel, materialBalance } from './material'

const START = new Chess().fen()

function afterMoves(moves: string[]): string {
  const game = new Chess()
  for (const move of moves) game.move(move)
  return game.fen()
}

describe('who is ahead', () => {
  it('is nobody at the start', () => {
    const balance = materialBalance(START, START)
    expect(balance).toEqual({ delta: 0, capturedByWhite: [], capturedByBlack: [] })
  })

  it('is nobody after an even trade', () => {
    expect(materialBalance(START, afterMoves(['e4', 'd5', 'exd5', 'Qxd5'])).delta).toBe(0)
  })

  it('counts a won pawn', () => {
    expect(materialBalance(START, afterMoves(['e4', 'd5', 'exd5'])).delta).toBe(1)
  })

  it('counts a won piece for Black as a negative', () => {
    // 1. f3 e5 2. g4 Qh4 is mate, so take a knight instead.
    const fen = afterMoves(['Nf3', 'e5', 'Nxe5', 'd6', 'Nf3', 'Bg4', 'h3', 'Bxf3'])
    expect(materialBalance(START, fen).delta).toBeLessThan(0)
  })

  it('reads a position it was handed rather than a game it watched', () => {
    // Black is a rook down; no moves were played to get here.
    expect(materialBalance(START, '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1').delta).toBe(5)
  })
})

describe('what has been taken', () => {
  it('lists the piece that was captured, for the side that took it', () => {
    const balance = materialBalance(START, afterMoves(['e4', 'd5', 'exd5']))
    expect(balance.capturedByWhite).toEqual(['p'])
    expect(balance.capturedByBlack).toEqual([])
  })

  it('lists both sides after a trade', () => {
    const balance = materialBalance(START, afterMoves(['e4', 'd5', 'exd5', 'Qxd5']))
    expect(balance.capturedByWhite).toEqual(['p'])
    expect(balance.capturedByBlack).toEqual(['p'])
  })

  it('puts the heaviest first', () => {
    const balance = materialBalance(START, '4k3/8/8/8/8/8/8/4K3 w - - 0 1')
    expect(balance.capturedByWhite).toEqual(['q', 'r', 'r', 'b', 'b', 'n', 'n', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'])
  })

  /**
   * Counted from where the game began, not from the standard array, so a
   * position pasted in does not report fourteen phantom captures on move one.
   */
  it('counts from the position the game started from', () => {
    const root = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'
    const balance = materialBalance(root, '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1')
    expect(balance.capturedByBlack).toEqual(['r'])
    expect(balance.capturedByWhite).toEqual([])
  })
})

describe('positions this should not throw on', () => {
  it('reports nothing for a FEN it cannot read', () => {
    expect(materialBalance(START, '')).toEqual({ delta: 0, capturedByWhite: [], capturedByBlack: [] })
    expect(materialBalance(START, '   ')).toEqual({ delta: 0, capturedByWhite: [], capturedByBlack: [] })
  })

  it('still gives a delta when the root is unreadable', () => {
    const balance = materialBalance('', '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1')
    expect(balance.delta).toBe(5)
    expect(balance.capturedByWhite).toEqual([])
  })

  /** A promoted queen is real material even though no pawn was captured. */
  it('counts a promotion as the queen it is', () => {
    expect(materialBalance(START, 'Q3k3/8/8/8/8/8/8/4K3 w - - 0 1').delta).toBe(9)
  })
})

describe('captures from the actual line', () => {
  function afterLine(root: string, moves: string[]) {
    const game = new Chess(root)
    for (const move of moves) game.move(move)
    return materialBalance(root, game.fen(), game.history({ verbose: true }))
  }

  it('does not call a quietly promoted White pawn captured', () => {
    expect(afterLine('8/P6k/8/8/8/8/7K/8 w - - 0 1', ['a8=Q']))
      .toEqual({ delta: 9, capturedByWhite: [], capturedByBlack: [] })
  })

  it('does not call a quietly underpromoted Black pawn captured', () => {
    expect(afterLine('7k/8/8/8/8/8/p6K/8 b - - 0 1', ['a1=N']))
      .toEqual({ delta: -3, capturedByWhite: [], capturedByBlack: [] })
  })

  it('records a promotion capture and the later capture of the promoted piece', () => {
    const root = '1rk5/P7/8/8/8/8/7P/7K w - - 0 1'
    expect(afterLine(root, ['axb8=Q+']))
      .toEqual({ delta: 10, capturedByWhite: ['r'], capturedByBlack: [] })
    expect(afterLine(root, ['axb8=Q+', 'Kxb8']))
      .toEqual({ delta: 1, capturedByWhite: ['r'], capturedByBlack: ['q'] })
  })

  it('records en passant as an opposing pawn capture', () => {
    expect(afterLine('7k/8/8/3pP3/8/8/8/7K w - d6 0 1', ['exd6']))
      .toEqual({ delta: 1, capturedByWhite: ['p'], capturedByBlack: [] })
  })

  it('retains ordinary trades and starts a custom position with no captures', () => {
    expect(afterLine(START, ['e4', 'd5', 'exd5', 'Qxd5']))
      .toEqual({ delta: 0, capturedByWhite: ['p'], capturedByBlack: ['p'] })
    expect(afterLine('7k/8/8/8/8/8/7P/7K w - - 0 1', []))
      .toEqual({ delta: 1, capturedByWhite: [], capturedByBlack: [] })
  })
})

describe('the label the strip shows', () => {
  it('shows a plus for the side that is ahead and nothing for the other', () => {
    expect(materialAdvantageLabel(3, 'w')).toBe('+3')
    expect(materialAdvantageLabel(3, 'b')).toBeNull()
    expect(materialAdvantageLabel(-2, 'b')).toBe('+2')
    expect(materialAdvantageLabel(-2, 'w')).toBeNull()
  })

  it('shows nothing at all when the game is level', () => {
    expect(materialAdvantageLabel(0, 'w')).toBeNull()
    expect(materialAdvantageLabel(0, 'b')).toBeNull()
  })
})

describe('saying what was taken out loud', () => {
  it('says nothing when nothing has been taken', () => {
    expect(describeCaptures([])).toBe('')
  })

  it('uses "a" rather than "1"', () => {
    expect(describeCaptures(['r'])).toBe('a rook')
  })

  it('pluralises and counts in words', () => {
    expect(describeCaptures(['p', 'p'])).toBe('two pawns')
    expect(describeCaptures(['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'])).toBe('eight pawns')
  })

  it('joins several kinds heaviest first', () => {
    expect(describeCaptures(['p', 'r', 'p', 'n'])).toBe('a rook, a knight and two pawns')
  })
})
