import { describe, expect, it } from 'vitest'
import { coachReadingSource, describeCoachDepth, isExactTablebaseCoachMove, selectCoachBestMove } from './coach'

describe('coach move selection', () => {
  it('prioritizes exact tablebase moves over heuristic engine sources', () => {
    expect(selectCoachBestMove({
      engine: 'e2e4',
      cloud: 'd2d4',
      last: 'g1f3',
      tablebase: 'a7a8q',
    })).toBe('a7a8q')
  })

  it('uses live engine and cloud moves when no tablebase move is available', () => {
    expect(selectCoachBestMove({
      engine: 'e2e4',
      cloud: 'd2d4',
      last: 'g1f3',
    })).toBe('e2e4')
    expect(selectCoachBestMove({
      cloud: 'd2d4',
    })).toBe('d2d4')
  })

  it('restores the best move saved with an earlier position evaluation', () => {
    expect(selectCoachBestMove({
      stored: 'c2c4',
      last: null,
    })).toBe('c2c4')
  })

  it('uses the exact tablebase move when no engine move is available', () => {
    expect(selectCoachBestMove({
      engine: null,
      cloud: null,
      last: null,
      tablebase: 'G6G1',
    })).toBe('g6g1')
  })

  it('ignores invalid move candidates', () => {
    expect(selectCoachBestMove({
      engine: '(none)',
      cloud: 'not-a-move',
      tablebase: 'g6g1',
    })).toBe('g6g1')
  })

  it('detects exact tablebase coach recommendations', () => {
    expect(isExactTablebaseCoachMove('G6G1', 'g6g1')).toBe(true)
    expect(isExactTablebaseCoachMove('e2e4', 'g6g1')).toBe(false)
    expect(isExactTablebaseCoachMove('(none)', 'g6g1')).toBe(false)
  })
})

describe('coachReadingSource', () => {
  const none = { hasEngineLine: false, hasCloudScore: false, hasStored: false, hasTablebase: false }

  it('prefers the engine running here over everything else', () => {
    expect(coachReadingSource({ ...none, hasEngineLine: true, hasCloudScore: true, hasTablebase: true }))
      .toBe('engine')
  })

  it('names the cloud when only Lichess has answered', () => {
    expect(coachReadingSource({ ...none, hasCloudScore: true })).toBe('cloud')
  })

  it('reads a stored snapshot back to whatever produced it', () => {
    expect(coachReadingSource({ ...none, hasStored: true, storedPurpose: 'cloud-eval' })).toBe('cloud')
    expect(coachReadingSource({ ...none, hasStored: true, storedPurpose: 'pgn-annotation' })).toBe('imported')
    expect(coachReadingSource({ ...none, hasStored: true, storedPurpose: 'auto' })).toBe('engine')
  })

  it('falls back to the tablebase, and to nothing at all', () => {
    expect(coachReadingSource({ ...none, hasTablebase: true })).toBe('tablebase')
    expect(coachReadingSource(none)).toBeNull()
  })
})

describe('describeCoachDepth', () => {
  it('marks a cloud depth as one this app did not reach', () => {
    // The case that prompted this: 75 plies, from Lichess's cache, shown as a
    // bare "D75" beside a Lines panel correctly saying nothing had run.
    const reading = describeCoachDepth('cloud', 75)
    expect(reading.label).toBe('D75 cloud')
    expect(reading.title).toContain('Lichess')
  })

  it('leaves a local search reading as a plain depth', () => {
    expect(describeCoachDepth('engine', 16).label).toBe('D16')
  })

  it('says a tablebase result is not a depth, whichever source asked', () => {
    expect(describeCoachDepth('engine', 16, true).label).toBe('TB exact')
    expect(describeCoachDepth('tablebase', undefined).label).toBe('TB exact')
  })

  it('has an answer before anything has evaluated the position', () => {
    expect(describeCoachDepth(null, undefined).label).toBe('...')
    expect(describeCoachDepth('engine', undefined).label).toBe('...')
  })

  it('calls a finished game final, even where a tablebase has the position', () => {
    // A mated king with seven men on the board is in the tablebase, and the
    // engine says `mate 0` about it. Neither is what happened.
    expect(describeCoachDepth('result', undefined, true).label).toBe('Final')
    expect(describeCoachDepth('result', 16).title).toContain('ended')
  })
})

describe('a finished game as a Coach source', () => {
  it('outranks every reading, because the result is the reading', () => {
    expect(coachReadingSource({
      gameOver: true,
      hasEngineLine: true,
      hasCloudScore: true,
      hasStored: true,
      storedPurpose: 'batch-review',
      hasTablebase: true,
    })).toBe('result')
  })

  it('changes nothing while the game is on', () => {
    const live = { gameOver: false, hasEngineLine: false, hasCloudScore: false, hasStored: false, hasTablebase: false }
    expect(coachReadingSource(live)).toBeNull()
    expect(coachReadingSource({ ...live, hasEngineLine: true })).toBe('engine')
  })
})
