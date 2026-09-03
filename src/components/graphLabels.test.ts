import { describe, expect, it } from 'vitest'
import { formatGraphAxisLabel, formatGraphPositionLabel, formatWdlReadout, formatWinrateReadout } from './graphLabels'

describe('graph label helpers', () => {
  it('uses graph point labels for black-to-move imported roots', () => {
    const blackMovePoint = { index: 1, label: '1... c5' }
    const whiteMovePoint = { index: 2, label: '2. Nf3' }

    expect(formatGraphPositionLabel(blackMovePoint, 1)).toBe('After 1... c5')
    expect(formatGraphPositionLabel(whiteMovePoint, 2)).toBe('After 2. Nf3')
    // The axis is a number line; "1..." there reads as a label that was cut off.
    expect(formatGraphAxisLabel(blackMovePoint)).toBe('1')
    expect(formatGraphAxisLabel(whiteMovePoint)).toBe('2')
  })

  it('keeps start positions and sparse graph positions readable', () => {
    expect(formatGraphPositionLabel({ index: 0, label: 'Start' }, 0)).toBe('Start position')
    expect(formatGraphAxisLabel({ index: 0, label: 'Start' })).toBe('Start')
    expect(formatGraphPositionLabel(undefined, 3)).toBe('After move 3')
  })

  it('leaves a label with no move number alone rather than emptying the tick', () => {
    expect(formatGraphAxisLabel({ index: 4, label: '...' })).toBe('...')
    expect(formatGraphAxisLabel({ index: 4, label: 'e4' })).toBe('e4')
  })
})

describe('the readout under the pointer', () => {
  it('names the position and its reading, short enough for a rail-width plot', () => {
    expect(formatWinrateReadout({ index: 23, label: '12. Nf3', whiteWinrate: 61.24 }, 23))
      .toBe('12. Nf3 · 61.2% White')
    expect(formatWdlReadout({ index: 23, label: '12. Nf3', white: 40.4, draw: 49.6, black: 10 }, 23))
      .toBe('12. Nf3 · W 40 · D 50 · B 10')
    expect(formatWinrateReadout({ index: 0, label: 'Start', whiteWinrate: 51.7 }, 0))
      .toBe('Start · 51.7% White')
  })

  it('still names the position over a ply the series skipped', () => {
    expect(formatWinrateReadout(undefined, 7)).toBe('Move 7 · no reading')
    expect(formatWdlReadout(undefined, 0)).toBe('Start · no reading')
  })
})
