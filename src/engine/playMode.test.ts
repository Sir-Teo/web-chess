import { describe, expect, it } from 'vitest'
import { aiSearchHistory, defaultOrientationForGameMode, sideToMoveColor, takebackPlyCount, takebackDisabledReason, hintDisabledReason, describePlayEngine } from './playMode'

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

describe('taking a move back', () => {
  const vsAi = { gameMode: 'human-vs-ai' as const, playerColor: 'white' as const }

  it('undoes both plies when the engine has already replied', () => {
    expect(takebackPlyCount({ ...vsAi, pliesPlayed: 4, turn: 'white' })).toBe(2)
  })

  /** You moved and the engine has not answered: only your move is yours to undo. */
  it('undoes one ply when your move is the last on the board', () => {
    expect(takebackPlyCount({ ...vsAi, pliesPlayed: 3, turn: 'black' })).toBe(1)
  })

  it('never asks for more plies than have been played', () => {
    expect(takebackPlyCount({ ...vsAi, pliesPlayed: 1, turn: 'white' })).toBe(1)
    expect(takebackPlyCount({ ...vsAi, pliesPlayed: 0, turn: 'white' })).toBe(0)
  })

  it('reads the same way for a player of the black pieces', () => {
    const asBlack = { gameMode: 'human-vs-ai' as const, playerColor: 'black' as const }
    expect(takebackPlyCount({ ...asBlack, pliesPlayed: 5, turn: 'black' })).toBe(2)
    expect(takebackPlyCount({ ...asBlack, pliesPlayed: 4, turn: 'white' })).toBe(1)
  })

  it('is one ply in pass and play, where every move is a human move', () => {
    expect(takebackPlyCount({ gameMode: 'human-vs-human', playerColor: 'white', pliesPlayed: 3, turn: 'black' })).toBe(1)
    expect(takebackPlyCount({ gameMode: 'human-vs-human', playerColor: 'white', pliesPlayed: 0, turn: 'white' })).toBe(0)
  })

  it('is nothing at all in AI vs AI, where nobody played the moves', () => {
    expect(takebackPlyCount({ gameMode: 'ai-vs-ai', playerColor: 'white', pliesPlayed: 20, turn: 'white' })).toBe(0)
  })

  it('says why, rather than greying out silently', () => {
    expect(takebackDisabledReason({ gameMode: 'human-vs-ai', pliesPlayed: 4, plies: 2 })).toBeNull()
    expect(takebackDisabledReason({ gameMode: 'human-vs-ai', pliesPlayed: 0, plies: 0 }))
      .toBe('No moves have been played yet.')
    expect(takebackDisabledReason({ gameMode: 'ai-vs-ai', pliesPlayed: 8, plies: 0 }))
      .toContain('both sides are the engine')
  })
})

describe('asking for a hint', () => {
  const ready = {
    workspaceMode: 'play' as const,
    gameMode: 'human-vs-ai' as const,
    turn: 'white' as const,
    playerColor: 'white' as const,
    gameOver: false,
    engineReady: true,
    busy: false,
  }

  it('is available on your own turn against the engine', () => {
    expect(hintDisabledReason(ready)).toBeNull()
  })

  /** Play mode turns the analysis engine off; the other two modes never start one. */
  /**
   * Analysis turns the play engine off deliberately, so reporting it as
   * "still starting up" describes something that is not happening — and the
   * panel on the right is already answering the same question.
   */
  it('points at the analysis panel rather than blaming the engine, in Analysis', () => {
    expect(hintDisabledReason({ ...ready, workspaceMode: 'analysis' }))
      .toBe("The analysis panel already shows the engine's move.")
    expect(hintDisabledReason({ ...ready, workspaceMode: 'analysis', engineReady: false }))
      .toBe("The analysis panel already shows the engine's move.")
  })

  it('needs an engine, which only one mode has', () => {
    expect(hintDisabledReason({ ...ready, gameMode: 'human-vs-human' })).toMatch(/against the computer/)
    expect(hintDisabledReason({ ...ready, gameMode: 'ai-vs-ai' })).toMatch(/nobody to hint to/)
  })

  it('says which of the other reasons applies, rather than greying out', () => {
    expect(hintDisabledReason({ ...ready, gameOver: true })).toBe('This game is already over.')
    expect(hintDisabledReason({ ...ready, turn: 'black' })).toBe('Wait for your turn.')
    expect(hintDisabledReason({ ...ready, engineReady: false })).toMatch(/starting up/)
    expect(hintDisabledReason({ ...ready, busy: true })).toBe('Already looking.')
  })

  it('reports the game being over before it reports whose turn it is', () => {
    expect(hintDisabledReason({ ...ready, gameOver: true, turn: 'black' })).toBe('This game is already over.')
  })

  it('reads the same for a player of the black pieces', () => {
    expect(hintDisabledReason({ ...ready, playerColor: 'black', turn: 'black' })).toBeNull()
    expect(hintDisabledReason({ ...ready, playerColor: 'black', turn: 'white' })).toBe('Wait for your turn.')
  })
})

describe('describePlayEngine', () => {
  const base = { profileName: 'Lite Multi (Local)', difficultyLabel: 'Intermediate' }

  it('reads as a sentence for every status, not only the two it was written for', () => {
    for (const status of ['loading', 'ready', 'thinking', 'stopping', 'error', 'disabled'] as const) {
      const { message } = describePlayEngine({ ...base, status })
      expect(message).not.toContain(`is ${status} at`)
      expect(message.endsWith('.')).toBe(true)
    }
  })

  /**
   * The case that prompted this. A play engine whose worker fails to boot has
   * no fallback, so the opponent simply never moves -- and the whole of what
   * the app said about it was "is error at Intermediate difficulty".
   */
  it('says there is nobody to play against, and what still works', () => {
    const report = describePlayEngine({ ...base, status: 'error' })
    expect(report.failed).toBe(true)
    expect(report.message).toContain('nobody to play against')
    expect(report.message).toContain('Human vs Human')
  })

  it('is not a failure while the engine is merely busy or starting', () => {
    for (const status of ['loading', 'ready', 'thinking', 'stopping'] as const) {
      expect(describePlayEngine({ ...base, status }).failed).toBe(false)
    }
  })

  it('names the difficulty where the difficulty is what is being described', () => {
    expect(describePlayEngine({ ...base, status: 'ready' }).message).toContain('Intermediate')
    // Not while it is stopping: it is finishing a search, and its strength
    // setting is not what the reader is waiting on.
    expect(describePlayEngine({ ...base, status: 'stopping' }).message).not.toContain('Intermediate')
  })
})

describe('describePlayEngine thread reporting', () => {
  const base = { profileName: 'Lite Multi (Local)', difficultyLabel: 'Maximum' }

  it('says what Maximum is costing when it costs more than one core', () => {
    expect(describePlayEngine({ ...base, status: 'ready', threadCount: 8 }).message)
      .toContain('Maximum strength on 8 threads')
  })

  it('says nothing about threads at one, which is the unremarkable case', () => {
    expect(describePlayEngine({ ...base, status: 'ready', threadCount: 1 }).message)
      .not.toContain('thread')
    expect(describePlayEngine({ ...base, status: 'ready' }).message).not.toContain('thread')
  })
})
