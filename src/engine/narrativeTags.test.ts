import { describe, expect, it } from 'vitest'
import { narrativeTagToneClass, narrativeTags, parseGameResult } from './narrativeTags'
import type { WinratePoint } from './analysis'

const ids = (tags: { id: string }[]) => tags.map(tag => tag.id)

/** A White-winrate series, in move order. */
function series(values: number[]): WinratePoint[] {
  return values.map((whiteWinrate, index) => ({ index, label: `${index}`, whiteWinrate }))
}

describe('reading a PGN result', () => {
  it('reads the three decisive spellings', () => {
    expect(parseGameResult('1-0')).toBe('white')
    expect(parseGameResult('0-1')).toBe('black')
    expect(parseGameResult('1/2-1/2')).toBe('draw')
    expect(parseGameResult('½-½')).toBe('draw')
  })

  it('has no opinion about an unfinished or missing result', () => {
    expect(parseGameResult('*')).toBeNull()
    expect(parseGameResult('')).toBeNull()
    expect(parseGameResult(undefined)).toBeNull()
    expect(parseGameResult('win')).toBeNull()
  })

  it('ignores surrounding whitespace', () => {
    expect(parseGameResult('  1-0 ')).toBe('white')
  })
})

describe('describing the arc of a game', () => {
  it('says nothing about a game too short to have one', () => {
    expect(narrativeTags(series([50, 60, 70]), '1-0')).toEqual([])
    expect(narrativeTags([], '1-0')).toEqual([])
  })

  it('labels a quiet draw and stops there', () => {
    expect(ids(narrativeTags(series([50, 50, 52, 48, 50, 50]), '1/2-1/2'))).toEqual(['draw'])
  })

  it('says when a draw was a win someone let go', () => {
    // White reaches 92 and the game still ends level.
    expect(ids(narrativeTags(series([50, 60, 80, 92, 70, 50]), '1/2-1/2'))).toEqual(['draw', 'missedWin'])
    // And the same for Black.
    expect(ids(narrativeTags(series([50, 40, 20, 8, 30, 50]), '1/2-1/2'))).toEqual(['draw', 'missedWin'])
  })

  it('names the side that let the win go', () => {
    const white = narrativeTags(series([50, 60, 80, 92, 70, 50]), '1/2-1/2')
    expect(white.find(t => t.id === 'missedWin')?.title).toContain('White')
    const black = narrativeTags(series([50, 40, 20, 8, 30, 50]), '1/2-1/2')
    expect(black.find(t => t.id === 'missedWin')?.title).toContain('Black')
  })

  it('calls a recovery from a lost position a comeback', () => {
    const tags = narrativeTags(series([50, 45, 30, 12, 25, 60, 88]), '1-0')
    expect(ids(tags)).toContain('comeback')
    expect(ids(tags)).not.toContain('wire')
  })

  it('calls an unbroken lead wire-to-wire', () => {
    const tags = narrativeTags(series([55, 60, 65, 70, 75, 82]), '1-0')
    expect(ids(tags)).toContain('wire')
    expect(ids(tags)).not.toContain('comeback')
  })

  it('flags a winning position that was let slip', () => {
    // White reaches 92 and still loses.
    const tags = narrativeTags(series([50, 60, 80, 92, 70, 30, 8]), '0-1')
    expect(ids(tags)).toContain('missedWin')
  })

  it('trusts the declared result over the final winrate', () => {
    // The series ends favouring White, but Black is recorded as the winner.
    const tags = narrativeTags(series([50, 60, 70, 80, 88, 90]), '0-1')
    expect(ids(tags)).toContain('missedWin')
  })

  it('falls back to the final winrate when the game is unfinished', () => {
    expect(ids(narrativeTags(series([50, 55, 62, 70, 78, 86]), '*'))).toContain('wire')
    expect(ids(narrativeTags(series([50, 50, 50, 50, 50, 50]), '*'))).toEqual(['draw'])
  })

  it('discounts a noisy opening when judging the arc', () => {
    // The dip to 20 is inside the opening fifth and should not read as a comeback.
    const tags = narrativeTags(series([20, 55, 60, 65, 70, 75, 80, 85, 90, 92]), '1-0')
    expect(ids(tags)).not.toContain('comeback')
    expect(ids(tags)).toContain('wire')
  })

  it('calls a decisive game that never opened up a nail-biter', () => {
    const tags = narrativeTags(series([50, 52, 48, 55, 45, 47, 53, 49]), '0-1')
    expect(ids(tags)).toEqual(['tight'])
  })

  it('prefers a more specific label over the nail-biter', () => {
    // A comeback is a better description than "stayed close".
    expect(ids(narrativeTags(series([50, 45, 30, 12, 25, 60, 88]), '1-0'))).not.toContain('tight')
    expect(ids(narrativeTags(series([55, 60, 65, 70, 75, 82]), '1-0'))).not.toContain('tight')
  })

  it('does not call a one-sided game a nail-biter', () => {
    expect(ids(narrativeTags(series([50, 60, 75, 80, 78, 82]), '1-0'))).not.toContain('tight')
  })

  it('reads points in move order however they arrive', () => {
    const ordered = series([50, 45, 30, 12, 25, 60, 88])
    expect(ids(narrativeTags([...ordered].reverse(), '1-0'))).toEqual(ids(narrativeTags(ordered, '1-0')))
  })

  it('never repeats a tag', () => {
    const tags = narrativeTags(series([50, 60, 80, 92, 70, 30, 8]), '0-1')
    expect(new Set(ids(tags)).size).toBe(tags.length)
  })
})

describe('tone classes', () => {
  it('gives each tone a distinct class', () => {
    const classes = (['good', 'bad', 'neutral'] as const).map(narrativeTagToneClass)
    expect(new Set(classes).size).toBe(3)
    for (const value of classes) expect(value).toContain('chip-narrative')
  })
})
