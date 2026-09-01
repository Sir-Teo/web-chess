import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { isBoardInputLocked, isPromotionMove } from './boardInput'

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

describe('isPromotionMove', () => {
  const board = (fen: string) => new Chess(fen)

  it('is true only for a pawn move that actually promotes', () => {
    const chess = board('8/4P3/8/8/8/8/8/4K2k w - - 0 1')
    expect(isPromotionMove(chess, 'e7', 'e8')).toBe(true)
  })

  it('is false for the same pawn a rank earlier', () => {
    const chess = board('8/8/4P3/8/8/8/8/4K2k w - - 0 1')
    expect(isPromotionMove(chess, 'e6', 'e7')).toBe(false)
  })

  it('is false for an empty square and for a piece that is not a pawn', () => {
    const chess = board('8/4P3/8/8/8/8/8/4K2k w - - 0 1')
    expect(isPromotionMove(chess, 'a1', 'a2')).toBe(false)
    expect(isPromotionMove(chess, 'e1', 'e2')).toBe(false)
  })

  /**
   * Read from the legal moves rather than from the rank: a pawn on the seventh
   * has promoting moves and, where it is pinned or the square is blocked, none
   * at all.
   */
  it('is false where the promoting move is not legal', () => {
    const blocked = board('4r3/4P3/8/8/8/8/8/4K2k w - - 0 1')
    expect(isPromotionMove(blocked, 'e7', 'e8')).toBe(false)
    // The capture on the same rank still promotes.
    const capture = board('3r4/4P3/8/8/8/8/8/4K2k w - - 0 1')
    expect(isPromotionMove(capture, 'e7', 'd8')).toBe(true)
  })

  it('promotes for Black on the first rank too', () => {
    const chess = board('4K3/8/8/8/8/8/4p3/7k b - - 0 1')
    expect(isPromotionMove(chess, 'e2', 'e1')).toBe(true)
  })
})
