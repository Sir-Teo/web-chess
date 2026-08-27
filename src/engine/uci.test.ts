import { describe, expect, it } from 'vitest'
import { buildAnalyzeCommand, buildNewGameCommands, normalizeUciMoves, parseBestMoveLine, parseUciMoveListInput } from './uci'

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

  it('builds a synchronized new-game reset sequence', () => {
    expect(buildNewGameCommands()).toEqual(['ucinewgame', 'isready'])
  })
})
