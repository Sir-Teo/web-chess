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

  /**
   * Checkmate and stalemate lock the board by themselves — no legal move exists
   * — but a flag leaves an ordinary position behind, so this is the one ending
   * that has to be enforced here.
   */
  it('locks the board once a side has flagged, in every play mode', () => {
    for (const gameMode of ['human-vs-human', 'human-vs-ai', 'ai-vs-ai'] as const) {
      expect(isBoardInputLocked({
        workspaceMode: 'play',
        gameMode,
        isAiThinking: false,
        paused: false,
        turn: 'w',
        playerColor: 'w',
        endedOffBoard: true,
      }), gameMode).toBe(true)
    }
  })

  it('leaves analysis alone when a flag is reported, since no clock runs there', () => {
    expect(isBoardInputLocked({
      workspaceMode: 'analysis',
      gameMode: 'human-vs-human',
      isAiThinking: false,
      paused: false,
      turn: 'w',
      playerColor: 'w',
      endedOffBoard: true,
    })).toBe(false)
  })

  it('is unlocked by default, so an untimed game is unaffected', () => {
    expect(isBoardInputLocked({
      workspaceMode: 'play',
      gameMode: 'human-vs-human',
      isAiThinking: false,
      paused: false,
      turn: 'w',
      playerColor: 'w',
    })).toBe(false)
  })
})
