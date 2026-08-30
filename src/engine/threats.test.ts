import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { nullMoveProbe } from './threats'

const START = new Chess().fen()

function play(sans: string[]): string {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return chess.fen()
}

describe('asking what the opponent threatens', () => {
  it('hands back the same position with the other side to move', () => {
    const probe = nullMoveProbe(START)

    expect(probe.ok).toBe(true)
    if (!probe.ok) return
    expect(probe.fen.split(' ')[0], 'the pieces do not move').toBe(START.split(' ')[0])
    expect(probe.fen.split(' ')[1]).toBe('b')
    expect(probe.fen.split(' ')[2], 'castling rights are kept').toBe('KQkq')
  })

  /**
   * The en-passant square describes a capture the *other* side could make, so
   * it is nonsense once the side to move changes -- and chess.js does not
   * merely disagree, it refuses to load the FEN at all.
   */
  it('clears the en-passant square, which the flip makes meaningless', () => {
    // chess.js only writes an en-passant square when the capture is actually
    // available, so the fixture has to make one available: White's e5 pawn can
    // take f6 after 2... f5.
    const afterDoublePush = play(['e4', 'd5', 'e5', 'f5'])
    expect(afterDoublePush.split(' ')[3], 'the fixture really does set one').toBe('f6')

    const probe = nullMoveProbe(afterDoublePush)
    expect(probe.ok).toBe(true)
    if (!probe.ok) return
    expect(probe.fen.split(' ')[3]).toBe('-')
    expect(() => new Chess(probe.fen), 'the result must load').not.toThrow()
  })

  /**
   * chess.js accepts a flipped FEN that leaves the opponent in check, so
   * nothing downstream would catch this. The position is illegal and whatever
   * an engine said about it would be meaningless.
   */
  it('refuses a position that is in check, where flipping would be illegal', () => {
    const check = play(['e4', 'f5', 'Qh5+'])
    const position = new Chess(check)
    expect(position.isCheck(), 'the fixture really is check').toBe(true)
    expect(position.isCheckmate(), 'and not already over').toBe(false)

    const probe = nullMoveProbe(check)
    expect(probe.ok).toBe(false)
    if (probe.ok) return
    expect(probe.reason).toContain('check')
  })

  it('refuses a finished game', () => {
    const foolsMate = play(['f3', 'e5', 'g4', 'Qh4#'])
    const probe = nullMoveProbe(foolsMate)

    expect(probe.ok).toBe(false)
    if (probe.ok) return
    expect(probe.reason).toContain('over')
  })

  it('refuses a stalemate, which is also over', () => {
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'
    expect(new Chess(stalemate).isStalemate()).toBe(true)
    expect(nullMoveProbe(stalemate).ok).toBe(false)
  })

  it('refuses a FEN it cannot read rather than throwing', () => {
    expect(nullMoveProbe('not a fen')).toEqual({ ok: false, reason: 'This position cannot be read.' })
    expect(nullMoveProbe('')).toEqual({ ok: false, reason: 'This position cannot be read.' })
  })

  it('flips back to where it started', () => {
    const midgame = play(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
    const once = nullMoveProbe(midgame)
    expect(once.ok).toBe(true)
    if (!once.ok) return

    const twice = nullMoveProbe(once.fen)
    expect(twice.ok).toBe(true)
    if (!twice.ok) return
    // Only the en-passant field can differ, and this position has none.
    expect(twice.fen).toBe(midgame)
  })
})
