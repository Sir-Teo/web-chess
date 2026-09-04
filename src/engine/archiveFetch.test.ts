import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_CHESSCOM_MONTHS, archiveUnreachableMessage, fetchArchiveGames } from './archiveFetch'
import { resetLichessFetchQueueForTests } from './lichessQueue'

const game = (tag: string, date = '2026.07.15', time = '17:03:21') =>
  `[Event "${tag}"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n\n1. e4 e5 *`

const tagsOf = (games: string[]) => games.map(g => g.match(/\[Event "([^"]+)"\]/)![1])

function ok(body: string) {
  return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) } as Response
}
function fail(status: number) {
  return { ok: false, status, text: async () => '', json: async () => ({}) } as Response
}

beforeEach(() => {
  resetLichessFetchQueueForTests()
})

describe('fetchArchiveGames · lichess', () => {
  it('asks for the games and splits the database it gets back', async () => {
    const seen: string[] = []
    const games = await fetchArchiveGames('lichess', 'penguingm1', 3, {
      requesters: {
        lichess: async url => {
          seen.push(url)
          return ok([game('a', '2026.07.10'), game('b', '2026.07.12')].join('\n\n'))
        },
      },
    })
    expect(tagsOf(games)).toEqual(['b', 'a'])
    expect(seen[0]).toContain('/api/games/user/penguingm1')
    expect(seen[0]).toContain('max=3')
  })

  it('turns a refusal into a sentence naming the player', async () => {
    await expect(fetchArchiveGames('lichess', 'nobody', 3, {
      requesters: { lichess: async () => fail(404) },
    })).rejects.toThrow('Lichess has no player called “nobody”.')
  })

  it('turns a dropped connection into a sentence rather than "Failed to fetch"', async () => {
    await expect(fetchArchiveGames('lichess', 'erik', 3, {
      requesters: { lichess: async () => { throw new TypeError('Failed to fetch') } },
    })).rejects.toThrow(archiveUnreachableMessage('lichess'))
  })

  it('lets an abort through untouched, because changing your mind is not an error', async () => {
    const controller = new AbortController()
    controller.abort()
    const abort = new DOMException('The user aborted a request.', 'AbortError')
    await expect(fetchArchiveGames('lichess', 'erik', 3, {
      signal: controller.signal,
      requesters: { lichess: async () => { throw abort } },
    })).rejects.toBe(abort)
  })
})

describe('fetchArchiveGames · chess.com', () => {
  const archives = (...months: string[]) =>
    JSON.stringify({ archives: months.map(m => `https://api.chess.com/pub/player/erik/games/${m}`) })

  it('walks months newest first and stops once it has enough', async () => {
    const seen: string[] = []
    const games = await fetchArchiveGames('chesscom', 'erik', 2, {
      requesters: {
        chesscom: async url => {
          seen.push(url)
          if (url.endsWith('/archives')) return ok(archives('2026/05', '2026/07', '2026/06'))
          if (url.includes('/2026/07/')) return ok([game('jul-1', '2026.07.20'), game('jul-2', '2026.07.21')].join('\n\n'))
          return ok(game('older', '2026.06.01'))
        },
      },
    })
    expect(tagsOf(games)).toEqual(['jul-2', 'jul-1'])
    // The list, then only the newest month: the older ones were never asked for.
    expect(seen).toHaveLength(2)
    expect(seen[1]).toContain('/games/2026/07/pgn')
  })

  it('keeps going back when the newest month is short', async () => {
    const games = await fetchArchiveGames('chesscom', 'erik', 3, {
      requesters: {
        chesscom: async url => {
          if (url.endsWith('/archives')) return ok(archives('2026/06', '2026/07'))
          if (url.includes('/2026/07/')) return ok(game('jul', '2026.07.20'))
          return ok([game('jun-1', '2026.06.01'), game('jun-2', '2026.06.02')].join('\n\n'))
        },
      },
    })
    expect(tagsOf(games)).toEqual(['jul', 'jun-2', 'jun-1'])
  })

  // A daily game that finished in July may have started in June, so a month is
  // not a date bucket and the collected games have to be sorted, not appended.
  it('sorts across months rather than trusting archive order', async () => {
    const games = await fetchArchiveGames('chesscom', 'erik', 2, {
      requesters: {
        chesscom: async url => {
          if (url.endsWith('/archives')) return ok(archives('2026/06', '2026/07'))
          if (url.includes('/2026/07/')) return ok(game('daily-started-in-june', '2026.06.02'))
          return ok([game('june-live', '2026.06.20'), game('older', '2026.06.01')].join('\n\n'))
        },
      },
    })
    expect(tagsOf(games)).toEqual(['june-live', 'daily-started-in-june'])
  })

  it('skips a month that will not load rather than failing the walk', async () => {
    const games = await fetchArchiveGames('chesscom', 'erik', 2, {
      requesters: {
        chesscom: async url => {
          if (url.endsWith('/archives')) return ok(archives('2026/06', '2026/07'))
          if (url.includes('/2026/07/')) return fail(500)
          return ok(game('june', '2026.06.20'))
        },
      },
    })
    expect(tagsOf(games)).toEqual(['june'])
  })

  it('never walks past its month ceiling', async () => {
    const asked: string[] = []
    const months = Array.from({ length: 24 }, (_u, i) => `20${25 + Math.floor(i / 12)}/${String((i % 12) + 1).padStart(2, '0')}`)
    await fetchArchiveGames('chesscom', 'erik', 50, {
      requesters: {
        chesscom: async url => {
          if (url.endsWith('/archives')) return ok(archives(...months))
          asked.push(url)
          return ok('')
        },
      },
    })
    expect(asked).toHaveLength(MAX_CHESSCOM_MONTHS)
  })

  it('names the player when there is no such account', async () => {
    await expect(fetchArchiveGames('chesscom', 'nobody', 3, {
      requesters: { chesscom: async () => fail(404) },
    })).rejects.toThrow('Chess.com has no player called “nobody”.')
  })
})
