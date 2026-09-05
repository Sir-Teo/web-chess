import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { parseMoveEntry } from './moveEntry'

const start = new Chess().fen()
describe('typed move entry', () => {
  it.each(['e4', ' e2e4 ', 'E2E4'])('accepts %s', input => {
    expect(parseMoveEntry(start, input)).toMatchObject({ from: 'e2', to: 'e4', san: 'e4' })
  })
  it.each(['', 'e5', 'e4 e5', 'Nf', 'Nf3 garbage', 'a'.repeat(100)])('refuses invalid or multiple moves: %s', input => {
    expect(parseMoveEntry(start, input)).toBeNull()
  })
  it('requires disambiguation', () => {
    const fen = '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1'
    expect(parseMoveEntry(fen, 'Nd2')).toBeNull()
    expect(parseMoveEntry(fen, 'Nbd2')).toMatchObject({ from: 'b1', to: 'd2' })
  })
  it.each(['O-O', '0-0', 'e1g1'])('accepts legal castling: %s', input => {
    expect(parseMoveEntry('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', input)?.san).toBe('O-O')
  })
  it('supports underpromotion and refuses to guess the piece', () => {
    const fen = '7k/P7/8/8/8/8/8/7K w - - 0 1'
    expect(parseMoveEntry(fen, 'a7a8n')?.promotion).toBe('n')
    expect(parseMoveEntry(fen, 'a8=N')?.promotion).toBe('n')
    expect(parseMoveEntry(fen, 'a7a8')).toBeNull()
  })
  it('accepts en passant and refuses a move that leaves the king in check', () => {
    expect(parseMoveEntry('7k/8/8/3pP3/8/8/8/7K w - d6 0 1', 'exd6')?.flags).toContain('e')
    expect(parseMoveEntry('4r2k/8/8/8/8/8/P7/4K3 w - - 0 1', 'a3')).toBeNull()
  })
})
