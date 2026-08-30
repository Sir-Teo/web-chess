import { describe, expect, it } from 'vitest'
import { aiSearchHistory, defaultOrientationForGameMode, sideToMoveColor } from './playMode'

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

describe('the history handed to the play engine', () => {
  const ROOT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const AFTER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

  it('passes the moves that lead to the position being searched', () => {
    expect(aiSearchHistory(AFTER, AFTER, ROOT, ['e2e4'])).toEqual({ rootFen: ROOT, moves: ['e2e4'] })
  })

  /**
   * The check that makes this safe. A history from somewhere else would hand
   * the engine a different game's repetitions, which is worse than sending none.
   */
  it('sends nothing when the history does not lead to the position', () => {
    expect(aiSearchHistory(AFTER, ROOT, ROOT, ['e2e4'])).toBeUndefined()
  })

  it('sends nothing at the root, where there is no history to send', () => {
    expect(aiSearchHistory(ROOT, ROOT, ROOT, [])).toBeUndefined()
    expect(aiSearchHistory(ROOT, ROOT, ROOT, ['', ''])).toBeUndefined()
  })

  it('drops empty entries rather than passing them through', () => {
    expect(aiSearchHistory(AFTER, AFTER, ROOT, ['e2e4', ''])).toEqual({ rootFen: ROOT, moves: ['e2e4'] })
  })

  it('sends nothing without a root position to anchor the moves to', () => {
    expect(aiSearchHistory(AFTER, AFTER, '', ['e2e4'])).toBeUndefined()
  })
})
