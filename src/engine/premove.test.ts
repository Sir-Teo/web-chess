import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  applyPremove,
  canPremove,
  isPremoveablePiece,
  premoveFromSquares,
  premoveStillFits,
  type PremoveContext,
} from './premove'

const START = new Chess().fen()

const waiting: PremoveContext = {
  workspaceMode: 'play',
  gameMode: 'human-vs-ai',
  turn: 'b',
  playerColor: 'w',
  gameOver: false,
  clockFlagged: false,
  paused: false,
}

describe('when a premove is offered', () => {
  it('is offered while the engine is to move', () => {
    expect(canPremove(waiting)).toBe(true)
  })

  it('is not offered on your own turn — that is just a move', () => {
    expect(canPremove({ ...waiting, turn: 'w' })).toBe(false)
  })

  it('is not offered in pass and play, where there is no waiting', () => {
    expect(canPremove({ ...waiting, gameMode: 'human-vs-human' })).toBe(false)
    expect(canPremove({ ...waiting, gameMode: 'ai-vs-ai' })).toBe(false)
  })

  it('is not offered in analysis, where a move out of turn is just a move', () => {
    expect(canPremove({ ...waiting, workspaceMode: 'analysis' })).toBe(false)
  })

  /** A queued move would fire the instant the reader came back to the board. */
  it('is not offered while paused, or after the game has ended either way', () => {
    expect(canPremove({ ...waiting, paused: true })).toBe(false)
    expect(canPremove({ ...waiting, gameOver: true })).toBe(false)
    expect(canPremove({ ...waiting, clockFlagged: true })).toBe(false)
  })

  it('reads the same for a player of the black pieces', () => {
    expect(canPremove({ ...waiting, playerColor: 'b', turn: 'w' })).toBe(true)
    expect(canPremove({ ...waiting, playerColor: 'b', turn: 'b' })).toBe(false)
  })
})

describe('making a premove', () => {
  it('takes any move of your own piece, legal or not in this position', () => {
    // Ra1-a5 is illegal right now; after the a-pawn moves it will not be.
    expect(premoveFromSquares(START, 'a1', 'a5', 'w')).toEqual({ from: 'a1', to: 'a5' })
  })

  it('refuses a square that is empty or holds the opponent', () => {
    expect(premoveFromSquares(START, 'e4', 'e5', 'w')).toBeNull()
    expect(premoveFromSquares(START, 'e7', 'e5', 'w')).toBeNull()
  })

  it('refuses a move onto itself', () => {
    expect(premoveFromSquares(START, 'e2', 'e2', 'w')).toBeNull()
  })

  /**
   * The dialog would have to appear during the opponent's turn, for a move that
   * may never be played. Every board with premoves promotes to a queen.
   */
  it('promotes to a queen without asking', () => {
    const fen = '8/P6k/8/8/8/8/7K/8 w - - 0 1'
    expect(premoveFromSquares(fen, 'a7', 'a8', 'w')).toEqual({ from: 'a7', to: 'a8', promotion: 'q' })
  })

  it('promotes on the first rank for Black', () => {
    const fen = '7k/8/8/8/8/8/p7/7K b - - 0 1'
    expect(premoveFromSquares(fen, 'a2', 'a1', 'b')).toEqual({ from: 'a2', to: 'a1', promotion: 'q' })
  })

  it('does not call a non-pawn reaching the last rank a promotion', () => {
    const fen = '8/R6k/8/8/8/8/7K/8 w - - 0 1'
    expect(premoveFromSquares(fen, 'a7', 'a8', 'w')).toEqual({ from: 'a7', to: 'a8' })
  })

  it('survives a FEN it cannot parse rather than throwing into a render', () => {
    expect(premoveFromSquares('nonsense', 'e2', 'e4', 'w')).toBeNull()
    expect(isPremoveablePiece('nonsense', 'e2', 'w')).toBe(false)
  })
})

describe('playing a premove into the position that arrived', () => {
  it('plays it when it fits', () => {
    const position = new Chess()
    position.move('e4')
    position.move('e5')
    const move = applyPremove(position, { from: 'g1', to: 'f3' })
    expect(move?.san).toBe('Nf3')
    expect(position.turn()).toBe('b')
  })

  it('reports a move the position will not take, and leaves the board alone', () => {
    const position = new Chess()
    const before = position.fen()
    expect(applyPremove(position, { from: 'e2', to: 'e5' })).toBeNull()
    expect(position.fen()).toBe(before)
  })

  /** The premove was queued against a guess; the opponent guessed differently. */
  it('drops a premove whose target square the opponent has just defended into', () => {
    const position = new Chess()
    position.move('e4')
    // Queued Bf1-c4 while Black was thinking; Black plays d5 and then takes.
    expect(premoveStillFits(position.fen(), { from: 'f1', to: 'c4' })).toBe(false)
    position.move('e5')
    expect(premoveStillFits(position.fen(), { from: 'f1', to: 'c4' })).toBe(true)
  })

  it('answers for a whole position without mutating it', () => {
    const fen = new Chess().fen()
    expect(premoveStillFits(fen, { from: 'e2', to: 'e4' })).toBe(true)
    expect(fen).toBe(new Chess().fen())
  })
})
