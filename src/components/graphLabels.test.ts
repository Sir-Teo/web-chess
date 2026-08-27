import { describe, expect, it } from 'vitest'
import { formatGraphAxisLabel, formatGraphPositionLabel } from './graphLabels'

describe('graph label helpers', () => {
  it('uses graph point labels for black-to-move imported roots', () => {
    const blackMovePoint = { index: 1, label: '1... c5' }
    const whiteMovePoint = { index: 2, label: '2. Nf3' }

    expect(formatGraphPositionLabel(blackMovePoint, 1)).toBe('After 1... c5')
    expect(formatGraphPositionLabel(whiteMovePoint, 2)).toBe('After 2. Nf3')
    expect(formatGraphAxisLabel(blackMovePoint)).toBe('1...')
    expect(formatGraphAxisLabel(whiteMovePoint)).toBe('2.')
  })

  it('keeps start positions and sparse graph positions readable', () => {
    expect(formatGraphPositionLabel({ index: 0, label: 'Start' }, 0)).toBe('Start position')
    expect(formatGraphAxisLabel({ index: 0, label: 'Start' })).toBe('Start')
    expect(formatGraphPositionLabel(undefined, 3)).toBe('After move 3')
  })
})
