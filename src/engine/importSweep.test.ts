import { describe, expect, it } from 'vitest'
import { buildImportSweepTargets, countImportSweepCandidates, type ImportSweepEntry } from './importSweep'

function entry(index: number): ImportSweepEntry {
  return {
    move: { from: 'e2', to: 'e4' },
    fen: `fen-${index}`,
  }
}

describe('import sweep target selection', () => {
  it('builds root and non-final import sweep targets', () => {
    const targets = buildImportSweepTargets([entry(1), entry(2), entry(3)], 'root-fen')

    expect(targets.map(target => target.fen)).toEqual(['root-fen', 'fen-1', 'fen-2'])
    expect(countImportSweepCandidates([entry(1), entry(2), entry(3)])).toBe(3)
  })

  it('samples long imports evenly and caps the background engine queue', () => {
    const targets = buildImportSweepTargets(
      Array.from({ length: 201 }, (_, index) => entry(index + 1)),
      'root-fen',
      5,
    )

    expect(targets.map(target => target.fen)).toEqual(['root-fen', 'fen-50', 'fen-100', 'fen-150', 'fen-200'])
  })

  it('uses FEN-only targets to avoid huge repeated position histories', () => {
    const targets = buildImportSweepTargets(Array.from({ length: 10 }, (_, index) => entry(index + 1)), 'root-fen', 4)

    expect(targets).toHaveLength(4)
    expect(targets.every(target => target.historyMoves.length === 0)).toBe(true)
  })
})
