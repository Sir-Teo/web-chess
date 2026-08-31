import { describe, expect, it } from 'vitest'
import {
  resignDisabledReason,
  resignPgnResult,
  resignResultLabel,
  resigningSide,
  type ResignedBy,
} from './resignation'

describe('who is giving up', () => {
  it('is the person, not the side to move, when the opponent is the engine', () => {
    expect(resigningSide({ gameMode: 'human-vs-ai', playerColor: 'white', turn: 'w' })).toBe('w')
    // The point of this one: resigning in the engine's thinking time still
    // resigns for you, not for it.
    expect(resigningSide({ gameMode: 'human-vs-ai', playerColor: 'white', turn: 'b' })).toBe('w')
    expect(resigningSide({ gameMode: 'human-vs-ai', playerColor: 'black', turn: 'w' })).toBe('b')
  })

  it('is the side to move on a shared board', () => {
    expect(resigningSide({ gameMode: 'human-vs-human', playerColor: 'white', turn: 'b' })).toBe('b')
    expect(resigningSide({ gameMode: 'human-vs-human', playerColor: 'black', turn: 'w' })).toBe('w')
  })

  it('is nobody when both sides are the engine', () => {
    expect(resigningSide({ gameMode: 'ai-vs-ai', playerColor: 'white', turn: 'w' })).toBeNull()
  })
})

describe('when it cannot be done', () => {
  const base = {
    workspaceMode: 'play' as const,
    gameMode: 'human-vs-ai' as const,
    pliesPlayed: 4,
    gameAlreadyOver: false,
  }

  it('is available in a game that is under way', () => {
    expect(resignDisabledReason(base)).toBeNull()
  })

  it('blames the mode rather than the position when the board is being analysed', () => {
    const reason = resignDisabledReason({ ...base, workspaceMode: 'analysis', pliesPlayed: 0 })
    expect(reason).toBe('Resigning is a Play mode action.')
  })

  it('refuses a game neither side is playing', () => {
    expect(resignDisabledReason({ ...base, gameMode: 'ai-vs-ai' })).toBe('Neither side is yours to resign.')
  })

  it('refuses a game that has not started', () => {
    expect(resignDisabledReason({ ...base, pliesPlayed: 0 })).toBe('No moves have been played yet.')
  })

  it('refuses a game that is already decided', () => {
    expect(resignDisabledReason({ ...base, gameAlreadyOver: true })).toBe('The game is already over.')
  })
})

describe('what a resignation is recorded as', () => {
  it('gives the win to the other side', () => {
    expect(resignResultLabel('w')).toBe('White resigned · Black wins')
    expect(resignResultLabel('b')).toBe('Black resigned · White wins')
  })

  it('writes the PGN result the other side earned', () => {
    expect(resignPgnResult('w')).toBe('0-1')
    expect(resignPgnResult('b')).toBe('1-0')
  })

  /** The label and the tag must never disagree about who won. */
  it('agrees with itself', () => {
    for (const side of ['w', 'b'] as ResignedBy[]) {
      const winner = resignPgnResult(side) === '1-0' ? 'White' : 'Black'
      expect(resignResultLabel(side)).toContain(`${winner} wins`)
      expect(resignResultLabel(side).startsWith(winner)).toBe(false)
    }
  })
})
