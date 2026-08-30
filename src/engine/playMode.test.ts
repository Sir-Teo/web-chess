import { describe, expect, it } from 'vitest'
import { defaultOrientationForGameMode, sideToMoveColor } from './playMode'

describe('play mode defaults', () => {
  it('orients human-vs-ai games from the player side', () => {
    expect(defaultOrientationForGameMode('human-vs-ai', 'white')).toBe('white')
    expect(defaultOrientationForGameMode('human-vs-ai', 'black')).toBe('black')
  })

  it('uses white orientation for shared-board and watch modes', () => {
    expect(defaultOrientationForGameMode('human-vs-human', 'black')).toBe('white')
    expect(defaultOrientationForGameMode('ai-vs-ai', 'black')).toBe('white')
  })
})

describe('handing a position to Play mode', () => {
  it('gives the move to whoever is on move', () => {
    expect(sideToMoveColor('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('white')
    expect(sideToMoveColor('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe('black')
  })

  it('reads the side field without needing the rest to be well formed', () => {
    expect(sideToMoveColor('8/8/8/8/8/8/8/8 b')).toBe('black')
    expect(sideToMoveColor('  8/8/8/8/8/8/8/8   w   KQkq  ')).toBe('white')
  })

  it('refuses anything that does not name a side', () => {
    expect(sideToMoveColor('')).toBeNull()
    expect(sideToMoveColor('8/8/8/8/8/8/8/8')).toBeNull()
    expect(sideToMoveColor('8/8/8/8/8/8/8/8 x KQkq - 0 1')).toBeNull()
    expect(sideToMoveColor('8/8/8/8/8/8/8/8 W KQkq - 0 1')).toBeNull()
  })
})
