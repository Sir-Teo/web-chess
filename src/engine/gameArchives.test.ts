import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ARCHIVE_GAMES,
  MAX_ARCHIVE_GAMES,
  archiveErrorMessage,
  archiveGameTimestamp,
  chessComArchivesUrl,
  chessComMonthPgnUrl,
  clampArchiveGameCount,
  latestGamesFromPgn,
  lichessArchiveUrl,
  normalizeArchiveUsername,
  parseChessComArchiveMonths,
} from './gameArchives'

describe('normalizeArchiveUsername', () => {
  it('takes a plain name', () => {
    expect(normalizeArchiveUsername('  DrNykterstein ')).toBe('DrNykterstein')
  })

  it('takes the name out of a pasted profile link', () => {
    expect(normalizeArchiveUsername('https://lichess.org/@/penguingm1')).toBe('penguingm1')
    expect(normalizeArchiveUsername('lichess.org/@/penguingm1')).toBe('penguingm1')
    expect(normalizeArchiveUsername('https://www.chess.com/member/Hikaru')).toBe('Hikaru')
    expect(normalizeArchiveUsername('https://www.chess.com/members/Hikaru')).toBe('Hikaru')
    expect(normalizeArchiveUsername('@erik')).toBe('erik')
  })

  // The name is interpolated into a URL path, so the character set is the
  // boundary that keeps a request pointed at the endpoint it names.
  it.each([
    ['empty', '   '],
    ['a slash', 'foo/bar/../../admin'],
    ['a query', 'foo?max=9999'],
    ['a fragment', 'foo#frag'],
    ['a space', 'two names'],
    ['one character', 'a'],
    ['over thirty characters', 'a'.repeat(31)],
    ['a leading dash', '-foo'],
    ['a colon', 'http://evil'],
  ])('refuses %s', (_label, input) => {
    expect(normalizeArchiveUsername(input)).toBeNull()
  })
})

describe('clampArchiveGameCount', () => {
  it('keeps the count inside what one fetch will bring back', () => {
    expect(clampArchiveGameCount(0)).toBe(1)
    expect(clampArchiveGameCount(-5)).toBe(1)
    expect(clampArchiveGameCount(10)).toBe(10)
    expect(clampArchiveGameCount(9999)).toBe(MAX_ARCHIVE_GAMES)
    expect(clampArchiveGameCount(Number.NaN)).toBe(DEFAULT_ARCHIVE_GAMES)
  })
})

describe('urls', () => {
  it('asks Lichess for the newest games, with clocks', () => {
    const url = new URL(lichessArchiveUrl('penguingm1', 7))
    expect(url.origin + url.pathname).toBe('https://lichess.org/api/games/user/penguingm1')
    expect(url.searchParams.get('max')).toBe('7')
    expect(url.searchParams.get('sort')).toBe('dateDesc')
    expect(url.searchParams.get('clocks')).toBe('true')
    expect(url.searchParams.get('evals')).toBe('false')
  })

  it('clamps the count it asks Lichess for', () => {
    expect(new URL(lichessArchiveUrl('erik', 9999)).searchParams.get('max')).toBe(String(MAX_ARCHIVE_GAMES))
  })

  it('addresses the chess.com endpoints', () => {
    expect(chessComArchivesUrl('Hikaru')).toBe('https://api.chess.com/pub/player/Hikaru/games/archives')
    expect(chessComMonthPgnUrl('Hikaru', { year: 2026, month: 8 }))
      .toBe('https://api.chess.com/pub/player/Hikaru/games/2026/08/pgn')
  })
})

describe('parseChessComArchiveMonths', () => {
  it('reads the months and puts the newest first', () => {
    const months = parseChessComArchiveMonths({
      archives: [
        'https://api.chess.com/pub/player/erik/games/2025/12',
        'https://api.chess.com/pub/player/erik/games/2026/07',
        'https://api.chess.com/pub/player/erik/games/2026/02',
      ],
    })
    expect(months).toEqual([{ year: 2026, month: 7 }, { year: 2026, month: 2 }, { year: 2025, month: 12 }])
  })

  it('ignores anything that is not a month', () => {
    expect(parseChessComArchiveMonths({ archives: ['nonsense', 42, null, '.../games/2026/13'] })).toEqual([])
    expect(parseChessComArchiveMonths({})).toEqual([])
    expect(parseChessComArchiveMonths(null)).toEqual([])
  })
})

describe('archiveGameTimestamp', () => {
  it('prefers the UTC tags, which is the pair that agrees between sites', () => {
    const pgn = '[Date "2026.07.14"]\n[UTCDate "2026.07.15"]\n[UTCTime "17:03:21"]\n\n1. e4 *'
    expect(archiveGameTimestamp(pgn)).toBe('2026.07.15 17:03:21')
  })

  it('falls back to Date, and to midnight when there is no time', () => {
    expect(archiveGameTimestamp('[Date "2026.01.02"]\n\n1. e4 *')).toBe('2026.01.02 00:00:00')
  })

  it('is null for a game with no readable date', () => {
    expect(archiveGameTimestamp('[Date "????.??.??"]\n\n1. e4 *')).toBeNull()
    expect(archiveGameTimestamp('1. e4 *')).toBeNull()
  })
})

describe('latestGamesFromPgn', () => {
  const game = (date: string, time: string, tag: string) =>
    `[Event "${tag}"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n\n1. e4 *`
  const tagsOf = (games: string[]) => games.map(g => g.match(/\[Event "([^"]+)"\]/)![1])

  // A chess.com month is not in date order: daily games that finished that
  // month but started in the one before are appended after the live games and
  // out of order among themselves.
  it('takes the newest games, not the last ones in the file', () => {
    const games = [
      game('2026.07.15', '17:03:21', 'live-1'),
      game('2026.07.23', '12:16:10', 'live-2'),
      game('2026.06.04', '12:13:08', 'daily-old'),
      game('2026.06.27', '21:48:08', 'daily-new'),
    ]
    expect(tagsOf(latestGamesFromPgn(games, 2))).toEqual(['live-2', 'live-1'])
  })

  it('keeps undated games behind the dated ones rather than dropping them', () => {
    const games = ['[Event "undated"]\n\n1. e4 *', game('2026.07.15', '17:03:21', 'dated')]
    expect(tagsOf(latestGamesFromPgn(games, 5))).toEqual(['dated', 'undated'])
  })

  it('keeps file order between games played at the same moment', () => {
    const games = [game('2026.07.15', '17:03:21', 'a'), game('2026.07.15', '17:03:21', 'b')]
    expect(tagsOf(latestGamesFromPgn(games, 5))).toEqual(['a', 'b'])
  })

  it('never returns more than asked for', () => {
    const games = Array.from({ length: 80 }, (_unused, i) => game('2026.07.15', '17:03:21', `g${i}`))
    expect(latestGamesFromPgn(games, 5)).toHaveLength(5)
    expect(latestGamesFromPgn(games, 9999)).toHaveLength(MAX_ARCHIVE_GAMES)
  })

  it('is empty for an empty database', () => {
    expect(latestGamesFromPgn([], 10)).toEqual([])
  })
})

describe('archiveErrorMessage', () => {
  it('names the site and the player for an unknown name', () => {
    expect(archiveErrorMessage('lichess', 404, 'nobody')).toBe('Lichess has no player called “nobody”.')
    expect(archiveErrorMessage('chesscom', 404, 'nobody')).toBe('Chess.com has no player called “nobody”.')
  })

  it('distinguishes a throttle from a fault from a refusal', () => {
    expect(archiveErrorMessage('lichess', 429, 'x')).toContain('rate limiting')
    expect(archiveErrorMessage('chesscom', 503, 'x')).toContain('having trouble')
    expect(archiveErrorMessage('lichess', 403, 'x')).toContain('(403)')
  })
})
