import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { SOUND_SHAPES, moveSoundFor, type MoveSound } from './moveSound'

/** Play the moves and ask what the last one should sound like. */
function soundOf(sans: string[], startFen?: string): MoveSound {
  const chess = startFen ? new Chess(startFen) : new Chess()
  let last = chess.move(sans[0])
  for (const san of sans.slice(1)) last = chess.move(san)
  return moveSoundFor({ flags: last.flags, san: last.san, isGameOver: chess.isGameOver() })
}

describe('moveSoundFor', () => {
  it('is a plain move for a quiet move', () => {
    expect(soundOf(['e4'])).toBe('move')
  })

  it('is a capture for an ordinary capture', () => {
    expect(soundOf(['e4', 'd5', 'exd5'])).toBe('capture')
  })

  it('is a capture for en passant, which the flags spell differently', () => {
    const sound = soundOf(['e4', 'a6', 'e5', 'd5', 'exd6'])
    expect(sound).toBe('capture')
  })

  it('is a castle for both sides of both colours', () => {
    expect(soundOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O'])).toBe('castle')
    expect(soundOf(['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7', 'O-O-O'])).toBe('castle')
  })

  it('is a promotion when a pawn promotes', () => {
    expect(soundOf(['a8=Q'], '8/P6k/8/8/8/8/7K/8 w - - 0 1')).toBe('promote')
  })

  /**
   * The order is the behaviour. A move can be several of these at once, and the
   * more urgent fact has to win or a mating capture sounds like a capture.
   */
  it('prefers check over the capture it also is', () => {
    expect(soundOf(['Rxd7+'], '3k4/3p4/8/8/8/8/8/3RK3 w - - 0 1')).toBe('check')
  })

  it('prefers the end of the game over everything else it also is', () => {
    // Scholar's mate: a capture, a check, and the end.
    expect(soundOf(['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7'])).toBe('game-end')
  })

  it('calls a stalemate the end of the game, not a quiet move', () => {
    expect(soundOf(['Qb6'], 'k7/8/2K5/2Q5/8/8/8/8 w - - 0 1')).toBe('game-end')
  })

  it('reads check from the SAN it is given', () => {
    expect(moveSoundFor({ flags: 'n', san: 'Qe7+', isGameOver: false })).toBe('check')
    expect(moveSoundFor({ flags: 'c', san: 'Rxd7+', isGameOver: false })).toBe('check')
  })
})

describe('SOUND_SHAPES', () => {
  it('describes every sound the rule can return', () => {
    const sounds: MoveSound[] = ['move', 'capture', 'castle', 'check', 'promote', 'game-end']
    for (const sound of sounds) expect(SOUND_SHAPES[sound]).toBeDefined()
  })

  it('keeps every sound short enough not to overlap ordinary play', () => {
    for (const [name, shape] of Object.entries(SOUND_SHAPES)) {
      const total = shape.duration + (shape.echoDelay ?? 0)
      expect(total, `${name} runs ${total}s`).toBeLessThanOrEqual(0.5)
      expect(shape.gain).toBeGreaterThan(0)
      expect(shape.gain).toBeLessThanOrEqual(1)
      expect(shape.frequency).toBeGreaterThan(0)
    }
  })

  it('makes a capture heavier and louder than a plain move, which is how they are told apart', () => {
    expect(SOUND_SHAPES.capture.frequency).toBeLessThan(SOUND_SHAPES.move.frequency)
    expect(SOUND_SHAPES.capture.gain).toBeGreaterThan(SOUND_SHAPES.move.gain)
  })
})
