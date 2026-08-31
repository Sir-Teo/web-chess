import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { describeGameEnd } from './gameEnd'

function played(moves: string[]): Chess {
  const game = new Chess()
  for (const move of moves) game.move(move)
  return game
}

describe('a game that is still going', () => {
  it('has no ending to describe', () => {
    expect(describeGameEnd(new Chess())).toBeNull()
    expect(describeGameEnd(played(['e4', 'e5', 'Nf3']))).toBeNull()
  })

  /** Being in check is not being finished, and the strip must not say it is. */
  it('is not finished merely because someone is in check', () => {
    const game = played(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'])
    expect(game.isCheck()).toBe(false)
    expect(describeGameEnd(game)).toBeNull()
  })
})

describe('someone won', () => {
  it('names the winner of a checkmate, not the side to move', () => {
    // Fool's mate: White is mated, so White is the side to move.
    const game = played(['f3', 'e5', 'g4', 'Qh4#'])
    expect(game.turn()).toBe('w')
    expect(describeGameEnd(game)).toEqual({ label: 'Checkmate · Black wins', result: '0-1' })
  })

  it('names White when Black is mated', () => {
    const game = played(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'])
    expect(describeGameEnd(game)).toEqual({ label: 'Checkmate · White wins', result: '1-0' })
  })
})

describe('the four ways a game is drawn, which used to read the same', () => {
  it('tells stalemate apart', () => {
    const game = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(game.isStalemate()).toBe(true)
    expect(describeGameEnd(game)).toEqual({ label: 'Stalemate · Draw', result: '1/2-1/2' })
  })

  it('tells a dead position apart', () => {
    const game = new Chess('8/8/4k3/8/8/4KB2/8/8 w - - 0 1')
    expect(describeGameEnd(game)?.label).toBe('Insufficient material · Draw')
  })

  it('tells threefold repetition apart', () => {
    // The starting position, reached for the third time.
    const game = played(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])
    expect(game.isThreefoldRepetition()).toBe(true)
    expect(describeGameEnd(game)?.label).toBe('Threefold repetition · Draw')
  })

  it('tells the fifty-move rule apart', () => {
    const game = new Chess('8/8/3k4/8/8/3KQ3/8/8 w - - 100 60')
    expect(game.isDrawByFiftyMoves()).toBe(true)
    expect(describeGameEnd(game)?.label).toBe('Fifty-move rule · Draw')
  })

  it('calls every one of them a draw in the PGN', () => {
    const drawn = [
      new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),
      new Chess('8/8/4k3/8/8/4KB2/8/8 w - - 0 1'),
      played(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']),
      new Chess('8/8/3k4/8/8/3KQ3/8/8 w - - 100 60'),
    ]
    expect(drawn.map(game => describeGameEnd(game)?.result)).toEqual(['1/2-1/2', '1/2-1/2', '1/2-1/2', '1/2-1/2'])
  })
})

describe('what the caller can rely on', () => {
  /**
   * The `Result` tag is the whole reason this returns a result alongside a
   * label: every ending must produce one another program will accept.
   */
  it('never returns a result outside the three PGN tags', () => {
    const endings = [
      played(['f3', 'e5', 'g4', 'Qh4#']),
      played(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']),
      new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),
      new Chess('8/8/4k3/8/8/4K3/8/8 w - - 0 1'),
    ]
    for (const game of endings) {
      expect(['1-0', '0-1', '1/2-1/2']).toContain(describeGameEnd(game)!.result)
    }
  })

  it('agrees with chess.js about whether the game is over at all', () => {
    const positions = [
      new Chess(),
      played(['e4', 'e5']),
      played(['f3', 'e5', 'g4', 'Qh4#']),
      new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),
      new Chess('8/8/4k3/8/8/4K3/8/8 w - - 0 1'),
    ]
    for (const game of positions) {
      expect(describeGameEnd(game) !== null).toBe(game.isGameOver())
    }
  })
})
