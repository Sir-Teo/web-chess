import { describe, expect, it } from 'vitest'
import { tablebaseMoveAriaLabel, tablebaseMoveSummary, tablebaseSummary } from './tablebaseLabels'

describe('tablebase labels', () => {
  it('includes DTC for op1-style tablebase results', () => {
    expect(tablebaseSummary({
      fen: 'r3k3/7p/6p1/8/6P1/8/7P/R3K3 w - - 0 1',
      category: 'win',
      checkmate: false,
      stalemate: false,
      insufficientMaterial: false,
      dtc: 12,
      moves: [],
      fetchedAt: 1,
    })).toBe('Win · DTC 12')
  })

  it('keeps DTM and DTZ labels for classic Syzygy positions', () => {
    expect(tablebaseSummary({
      fen: '8/8/8/8/8/8/4K3/7k w - - 0 1',
      category: 'win',
      checkmate: false,
      stalemate: false,
      insufficientMaterial: false,
      dtm: 17,
      preciseDtz: 1,
      dtz: 1,
      moves: [],
      fetchedAt: 1,
    })).toBe('Win · DTM 17 · DTZ 1')
  })

  it('labels move results from the mover perspective with DTC when present', () => {
    const move = {
      uci: 'a1a8',
      san: 'Rxa8+',
      category: 'loss',
      dtc: -1,
    } as const

    expect(tablebaseMoveSummary(move)).toBe('Win · DTC 1')
    expect(tablebaseMoveAriaLabel(move)).toBe('Rxa8+: Win · DTC 1. UCI a1a8')
  })
})
