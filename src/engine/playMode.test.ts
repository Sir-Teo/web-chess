import { describe, expect, it } from 'vitest'
import { defaultOrientationForGameMode } from './playMode'

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
