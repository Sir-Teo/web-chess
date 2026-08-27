import { describe, expect, it } from 'vitest'
import { isBoardInputLocked } from './boardInput'

describe('board input locking', () => {
  it('keeps analysis positions editable regardless of play game mode', () => {
    expect(isBoardInputLocked({
      workspaceMode: 'analysis',
      gameMode: 'human-vs-ai',
      isAiThinking: true,
      paused: false,
      turn: 'b',
      playerColor: 'w',
    })).toBe(false)
    expect(isBoardInputLocked({
      workspaceMode: 'analysis',
      gameMode: 'ai-vs-ai',
      isAiThinking: false,
      paused: false,
      turn: 'w',
      playerColor: 'w',
    })).toBe(false)
  })

  it('locks play-mode AI turns and watch mode', () => {
    expect(isBoardInputLocked({
      workspaceMode: 'play',
      gameMode: 'human-vs-ai',
      isAiThinking: false,
      paused: false,
      turn: 'b',
      playerColor: 'w',
    })).toBe(true)
    expect(isBoardInputLocked({
      workspaceMode: 'play',
      gameMode: 'human-vs-ai',
      isAiThinking: true,
      paused: true,
      turn: 'w',
      playerColor: 'w',
    })).toBe(true)
    expect(isBoardInputLocked({
      workspaceMode: 'play',
      gameMode: 'ai-vs-ai',
      isAiThinking: false,
      paused: true,
      turn: 'w',
      playerColor: 'w',
    })).toBe(true)
  })

  it('allows the human side and paused review positions in play mode', () => {
    expect(isBoardInputLocked({
      workspaceMode: 'play',
      gameMode: 'human-vs-ai',
      isAiThinking: false,
      paused: false,
      turn: 'w',
      playerColor: 'w',
    })).toBe(false)
    expect(isBoardInputLocked({
      workspaceMode: 'play',
      gameMode: 'human-vs-ai',
      isAiThinking: false,
      paused: true,
      turn: 'b',
      playerColor: 'w',
    })).toBe(false)
  })
})
