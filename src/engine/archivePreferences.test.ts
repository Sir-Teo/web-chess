import { describe, expect, it } from 'vitest'
import { archivePreferencesAfterFetch, readArchivePreferences, type ArchivePreferences } from './archivePreferences'
import { DEFAULT_ARCHIVE_GAMES, MAX_ARCHIVE_GAMES } from './gameArchives'

const defaults: ArchivePreferences = { source: 'lichess', usernames: {}, count: DEFAULT_ARCHIVE_GAMES }
const stored = (raw: string | null) => ({ getItem: () => raw, setItem: () => {}, removeItem: () => {} })
const read = (value: unknown) => readArchivePreferences(stored(JSON.stringify(value)))

describe('remembered archive fetch choices', () => {
  it('starts empty when storage is absent or blocked', () => {
    expect(readArchivePreferences(null)).toEqual(defaults)
    expect(readArchivePreferences(stored(null))).toEqual(defaults)
    expect(readArchivePreferences({ ...stored(null), getItem: () => { throw new Error('Storage denied') } })).toEqual(defaults)
  })

  it('restores the provider, effective count and independently normalized handles', () => {
    expect(read({ source: 'chesscom', count: 7, usernames: { lichess: '@Lichess_One', chesscom: 'https://www.chess.com/member/Chess_Two' } }))
      .toEqual({ source: 'chesscom', count: 7, usernames: { lichess: 'Lichess_One', chesscom: 'Chess_Two' } })
  })

  it('rejects malformed, non-object and oversized preference data', () => {
    for (const raw of ['{', '[]', 'null', 'true', '"a string"', ' '.repeat(1025)]) {
      expect(readArchivePreferences(stored(raw))).toEqual(defaults)
    }
  })

  it('does not restore unknown providers, path fragments or non-string handles', () => {
    expect(read({ source: 'unknown', count: 999, usernames: { lichess: 'a/b/../../admin', chesscom: 42, email: 'reader' } })).toEqual(defaults)
  })

  it('retains usable fields when a sibling field is invalid', () => {
    expect(read({ source: 'chesscom', count: 12, usernames: { lichess: 'Lichess_One', chesscom: { name: 'wrong shape' }, other: 'ignored' } }))
      .toEqual({ source: 'chesscom', count: 12, usernames: { lichess: 'Lichess_One' } })
  })

  it('accepts count boundaries without coercing corrupt counts', () => {
    for (const count of [1, MAX_ARCHIVE_GAMES]) expect(read({ count }).count).toBe(count)
    for (const count of [0, -1, 1.5, MAX_ARCHIVE_GAMES + 1, '7', null]) {
      expect(read({ count, usernames: { lichess: 'Reader' } })).toEqual({ ...defaults, usernames: { lichess: 'Reader' } })
    }
  })

  it('remembers a new fetch while preserving the other provider and previous snapshot', () => {
    const previous: ArchivePreferences = { source: 'lichess', count: 3, usernames: { lichess: 'Lichess_One' } }
    expect(archivePreferencesAfterFetch(previous, 'chesscom', '@Chess_Two', 7))
      .toEqual({ source: 'chesscom', count: 7, usernames: { lichess: 'Lichess_One', chesscom: 'Chess_Two' } })
    expect(previous).toEqual({ source: 'lichess', count: 3, usernames: { lichess: 'Lichess_One' } })
  })

  it('records the effective fetch count and leaves unusable handles unchanged', () => {
    expect(archivePreferencesAfterFetch(defaults, 'lichess', 'Reader', 999).count).toBe(MAX_ARCHIVE_GAMES)
    expect(archivePreferencesAfterFetch(defaults, 'lichess', 'Reader', Number.NaN).count).toBe(DEFAULT_ARCHIVE_GAMES)
    expect(archivePreferencesAfterFetch(defaults, 'lichess', '../admin', 5)).toBe(defaults)
  })
})
