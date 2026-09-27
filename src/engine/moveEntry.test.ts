import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { moveEntryExplanation, normalizeMoveEntry, parseMoveEntry } from './moveEntry'

const start = new Chess().fen()
describe('typed move entry', () => {
  /**
   * The forms people type, which the strict parser refuses as typed -- and
   * then told them to use `Nf3`, which is what they thought they had done.
   */
  it.each([
    ['nf3', 'Nf3'],
    ['0-0', 'O-O'],
    ['o-o-o', 'O-O-O'],
    ['e8q', 'e8=Q'],
    ['e8=q+', 'e8=Q+'],
    ['kf1', 'Kf1'],
    ['exd8q', 'exd8=Q'],
  ])('straightens %s into %s', (input, expected) => {
    expect(normalizeMoveEntry(input)).toBe(expected)
  })

  it('leaves a lowercase b alone, because bxc3 is a pawn move', () => {
    expect(normalizeMoveEntry('bxc3')).toBe('bxc3')
    expect(normalizeMoveEntry('Bxc3')).toBe('Bxc3')
  })

  it('plays the loose forms', () => {
    expect(parseMoveEntry(start, 'nf3')).toMatchObject({ from: 'g1', to: 'f3', san: 'Nf3' })
    expect(parseMoveEntry(start, 'e2-e4')).toMatchObject({ san: 'e4' })
    const promoting = '7k/P7/8/8/8/8/8/7K w - - 0 1'
    expect(parseMoveEntry(promoting, 'a8q')?.promotion).toBe('q')
    expect(parseMoveEntry(promoting, 'a7-a8=n')?.promotion).toBe('n')
    const castling = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
    expect(parseMoveEntry(castling, '0-0-0')?.san).toBe('O-O-O')
  })

  it.each(['e4', ' e2e4 ', 'E2E4'])('accepts %s', input => {
    expect(parseMoveEntry(start, input)).toMatchObject({ from: 'e2', to: 'e4', san: 'e4' })
  })
  it.each(['', 'e5', 'e4 e5', 'Nf', 'Nf3 garbage', 'a'.repeat(100)])('refuses invalid or multiple moves: %s', input => {
    expect(parseMoveEntry(start, input)).toBeNull()
  })
  it('requires disambiguation', () => {
    const fen = '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1'
    expect(parseMoveEntry(fen, 'Nd2')).toBeNull()
    expect(parseMoveEntry(fen, 'Nbd2')).toMatchObject({ from: 'b1', to: 'd2' })
  })
  it.each(['O-O', '0-0', 'e1g1'])('accepts legal castling: %s', input => {
    expect(parseMoveEntry('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', input)?.san).toBe('O-O')
  })
  it('supports underpromotion and refuses to guess the piece', () => {
    const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1'
    expect(parseMoveEntry(fen, 'a7a8n')?.promotion).toBe('n')
    expect(parseMoveEntry(fen, 'a8=N')?.promotion).toBe('n')
    expect(parseMoveEntry(fen, 'a7a8')).toBeNull()
  })
  it('accepts en passant and refuses a move that leaves the king in check', () => {
    expect(parseMoveEntry('7k/8/8/3pP3/8/8/8/7K w - d6 0 1', 'exd6')?.flags).toContain('e')
    expect(parseMoveEntry('4r2k/8/8/8/8/8/P7/4K3 w - - 0 1', 'a3')).toBeNull()
  })
})

describe('an ambiguous move', () => {
  // Knights on b1 and f3, d2 empty: both can go there.
  const twoKnights = 'rnbqkbnr/ppp1pppp/8/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 2'

  it('is refused rather than guessed, and says which moves are meant', () => {
    expect(parseMoveEntry(twoKnights, 'Nd2')).toBeNull()
    expect(moveEntryExplanation(twoKnights, 'Nd2')).toBe('More than one knight can go to d2. Say which: Nbd2 or Nfd2.')
    expect(moveEntryExplanation(twoKnights, 'nd2')).toMatch(/Nbd2 or Nfd2/)
    expect(parseMoveEntry(twoKnights, 'Nbd2')?.san).toBe('Nbd2')
  })

  it('says plainly when no such piece can make the move', () => {
    expect(moveEntryExplanation(twoKnights, 'Nd4')).toBe('No knight can go to d4 here.')
    expect(moveEntryExplanation(twoKnights, 'Ke3')).toBe('No king can go to e3 here.')
  })

  it('has nothing to add for a move that is clear or not a piece move', () => {
    expect(moveEntryExplanation(twoKnights, 'Nc3')).toBeNull()
    expect(moveEntryExplanation(twoKnights, 'e4')).toBeNull()
    expect(moveEntryExplanation(twoKnights, 'xyz')).toBeNull()
  })
})

describe('a pawn move that cannot be played as typed', () => {
  it('says no pawn can go there, or take there', () => {
    const start = new Chess().fen()
    expect(moveEntryExplanation(start, 'e5')).toBe('No pawn can go to e5 here.')
    expect(moveEntryExplanation(start, 'exd3')).toBe('No pawn on the e-file can take on d3 here.')
    expect(moveEntryExplanation(start, 'e4')).toBeNull()
  })

  it('asks what a promoting pawn becomes', () => {
    const promotion = '8/4P2k/8/8/8/8/7K/8 w - - 0 1'
    expect(parseMoveEntry(promotion, 'e8')).toBeNull()
    expect(moveEntryExplanation(promotion, 'e8')).toBe('Say what the pawn becomes: e8=Q, e8=R, e8=B or e8=N.')
    expect(parseMoveEntry(promotion, 'e8=N')?.san).toBe('e8=N')
  })
})
