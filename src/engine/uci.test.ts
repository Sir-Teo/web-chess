import { describe, expect, it } from 'vitest'
import { buildAnalyzeCommand, buildNewGameCommands, changedSetOptions, engineOptionValueToString, normalizeUciMoves, optionKey, parseBestMoveLine, parseSetOptionCommand, parseUciMoveListInput } from './uci'

describe('UCI helpers', () => {
  it('normalizes UCI moves and keeps promotions', () => {
    expect(normalizeUciMoves([' E2E4 ', 'bad', 'a7a8Q', 'h2h9'])).toEqual(['e2e4', 'a7a8q'])
  })

  it('parses searchmoves text into valid UCI moves and invalid tokens', () => {
    expect(parseUciMoveListInput(' E2E4, Nf3 a7a8Q h2h9  c7c5 ')).toEqual({
      validMoves: ['e2e4', 'a7a8q', 'c7c5'],
      invalidTokens: ['Nf3', 'h2h9'],
    })
    expect(parseUciMoveListInput('')).toEqual({ validMoves: [], invalidTokens: [] })
  })

  it('builds position, options, and go commands from an analyze request', () => {
    const built = buildAnalyzeCommand({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      rootFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      historyMoves: ['e2e4', 'not-a-move'],
      mode: 'custom',
      limits: { depth: 16, movetime: -1 },
      hashMb: 64,
      multiPv: 3,
      showWdl: true,
      searchMoves: ['c7c5', 'bad'],
    })

    expect(built.setOptions).toEqual([
      { name: 'Hash', value: 64 },
      { name: 'MultiPV', value: 3 },
      { name: 'UCI_ShowWDL', value: true },
    ])
    expect(built.position).toBe(
      'position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 moves e2e4',
    )
    expect(built.go).toBe('go depth 16 searchmoves c7c5')
  })

  it('sanitizes hash and multipv setoptions before sending them to Stockfish', () => {
    const built = buildAnalyzeCommand({
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      hashMb: Number.NaN,
      multiPv: Number.POSITIVE_INFINITY,
      showWdl: false,
      limits: { depth: 4 },
    })

    expect(built.setOptions).toEqual([{ name: 'UCI_ShowWDL', value: false }])

    expect(buildAnalyzeCommand({
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      hashMb: 16.9,
      multiPv: 2.8,
    }).setOptions).toEqual([
      { name: 'Hash', value: 16 },
      { name: 'MultiPV', value: 2 },
    ])
  })

  it('does not append move history to the current FEN without a root FEN', () => {
    const built = buildAnalyzeCommand({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      historyMoves: ['e2e4'],
      mode: 'custom',
      limits: { depth: 8 },
    })

    expect(built.position).toBe(
      'position fen rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    )
  })

  it('parses bestmove lines with optional ponder moves', () => {
    expect(parseBestMoveLine('bestmove e2e4 ponder e7e5')).toEqual({
      bestMove: 'e2e4',
      ponderMove: 'e7e5',
    })
    expect(parseBestMoveLine('bestmove E2E4 ponder E7E5')).toEqual({
      bestMove: 'e2e4',
      ponderMove: 'e7e5',
    })
    expect(parseBestMoveLine('bestmove (none)')).toEqual({
      bestMove: null,
      ponderMove: null,
    })
    expect(parseBestMoveLine('bestmove 0000 ponder not-a-move')).toEqual({
      bestMove: null,
      ponderMove: null,
    })
  })

  it('sends only the options whose value the engine does not already hold', () => {
    const desired = buildAnalyzeCommand({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      hashMb: 64,
      multiPv: 1,
      showWdl: true,
      mode: 'review',
    }).setOptions

    // A fresh engine has been told nothing, so everything goes.
    expect(changedSetOptions(desired, new Map())).toEqual(desired)

    // The batch review searches sixty positions at one hash size. Re-sending it
    // resizes -- and so clears -- the transposition table between every one.
    const applied = new Map([['Hash', '64'], ['MultiPV', '1'], ['UCI_ShowWDL', 'true']])
    expect(changedSetOptions(desired, applied)).toEqual([])

    // A real change still goes through, and only it.
    expect(changedSetOptions(desired, new Map([...applied, ['MultiPV', '3']])))
      .toEqual([{ name: 'MultiPV', value: 1 }])
  })

  it('keeps valueless button options, which have no current value to match', () => {
    expect(changedSetOptions([{ name: 'Clear Hash' }], new Map([['Clear Hash', '']])))
      .toEqual([{ name: 'Clear Hash' }])
  })

  it('compares against the wire form, not the JavaScript value', () => {
    expect(engineOptionValueToString(true)).toBe('true')
    expect(engineOptionValueToString(false)).toBe('false')
    expect(engineOptionValueToString(64)).toBe('64')
    expect(changedSetOptions([{ name: 'UCI_ShowWDL', value: true }], new Map([['UCI_ShowWDL', 'true']])))
      .toEqual([])
  })

  it('matches option names the way Stockfish does, without regard to case', () => {
    // The Engine Lab console is free text, and `hash` reaches the same table
    // as `Hash`. A record keyed on the spelling files the two apart, and the
    // next search finds its own value "already applied" while the engine
    // holds the other one.
    const desired = [{ name: 'Hash', value: 64 }]
    expect(changedSetOptions(desired, new Map([['hash', '64']]))).toEqual([])
    expect(changedSetOptions(desired, new Map([['HASH', '128']]))).toEqual(desired)
    expect(optionKey(' Skill Level ')).toBe('skill level')
  })

  it('reads a setoption command back into a name and value', () => {
    expect(parseSetOptionCommand('setoption name Hash value 128')).toEqual({ name: 'Hash', value: '128' })
    // Names carry spaces; the value keyword is what ends them.
    expect(parseSetOptionCommand('setoption name Skill Level value 20')).toEqual({ name: 'Skill Level', value: '20' })
    expect(parseSetOptionCommand('  setoption   name   Move Overhead   value   30  '))
      .toEqual({ name: 'Move Overhead', value: '30' })
    // A string value keeps its inner spaces.
    expect(parseSetOptionCommand('setoption name SyzygyPath value C:\\tb\\syzygy 6 man'))
      .toEqual({ name: 'SyzygyPath', value: 'C:\\tb\\syzygy 6 man' })
    // A button has no value and comes back without one, not with an empty one:
    // pressing Clear Hash changes no setting.
    expect(parseSetOptionCommand('setoption name Clear Hash')).toEqual({ name: 'Clear Hash' })
    // `value` with nothing after it is an empty string, which is what the
    // engine receives as well.
    expect(parseSetOptionCommand('setoption name SyzygyPath value')).toEqual({ name: 'SyzygyPath', value: '' })
    expect(parseSetOptionCommand('setoption name')).toBeNull()
    expect(parseSetOptionCommand('setoption value 3')).toBeNull()
    expect(parseSetOptionCommand('go depth 10')).toBeNull()
  })

  it('builds a synchronized new-game reset sequence', () => {
    expect(buildNewGameCommands()).toEqual(['ucinewgame', 'isready'])
  })
})
