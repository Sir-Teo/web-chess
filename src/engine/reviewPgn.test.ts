import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { GameNode } from '../hooks/useGameTree'
import { parsePgnMoveTree } from './pgn'
import { exportReviewPgn } from './reviewPgn'
import { createReviewSession, recordReviewResult, snapshotReviewSession } from './reviewSession'

describe('exporting the report being read', () => {
  const board = new Chess()
  const root: GameNode = { id: 'root', fen: board.fen(), move: null, san: '', uci: '', parent: null, children: ['e4', 'd4'] }
  const move = board.move('d4')
  const d4: GameNode = { id: 'd4', fen: board.fen(), move, san: 'd4', uci: 'd2d4', parent: 'root', children: [], comment: 'My variation', clockMs: 31000 }
  const line = [root, d4]
  const settings = { engine: { profile: 'full-single-cdn', version: '18.0.7', name: 'Stockfish 18' }, depth: 16, hashMb: 64, showWdl: true }

  it('exports a reviewed variation as a complete playable line with its own scores and metadata', () => {
    const session = createReviewSession(line, root.fen, settings, new Map(), null)
    for (const node of line) recordReviewResult(session, node.fen, { cp: 0, depth: 16, engine: settings.engine })
    const report = snapshotReviewSession(session)
    const pgn = exportReviewPgn(line, report, { Event: 'Study', Result: '*' }, ['excellent'])!
    const loaded = parsePgnMoveTree(pgn)
    expect(loaded.moves).toHaveLength(1)
    expect(loaded.moves[0]).toMatchObject({ move: { san: 'd4' }, comment: 'My variation', clockMs: 31000 })
    expect(loaded.evaluations.size).toBe(2)
    expect([...loaded.evaluations.values()].every(reading => reading.engine?.profile === 'full-single-cdn' && reading.cp === 0)).toBe(true)
    expect(loaded.headers).toMatchObject({ Event: 'Study', WebChessReviewDepth: '16', WebChessReviewHash: '64', WebChessReviewStatus: 'complete', WebChessReviewReused: '0' })
    expect(pgn).not.toContain(' e4')
    expect(pgn).toContain('Excellent')
  })

  it('labels a partial report and leaves unevaluated positions unannotated', () => {
    const session = createReviewSession(line, root.fen, settings, new Map(), null)
    recordReviewResult(session, root.fen, { cp: 10, depth: 16, engine: settings.engine })
    const report = snapshotReviewSession(session)
    const loaded = parsePgnMoveTree(exportReviewPgn(line, report, {}, ['pending'])!)
    expect(loaded.headers.WebChessReviewStatus).toBe('partial')
    expect(loaded.evaluations.size).toBe(1)
    expect(loaded.evaluations.has(d4.fen)).toBe(false)
    expect(exportReviewPgn(line, { ...report, lineEndId: 'different' }, {}, [])).toBeNull()
  })
})
