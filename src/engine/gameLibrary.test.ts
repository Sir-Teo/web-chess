import { describe, expect, it } from 'vitest'
import { matchesSearchTerms, toSearchTerms } from './searchTerms'
import {
  MAX_LIBRARY_GAMES,
  MAX_LIBRARY_NAME_LENGTH,
  backupMergeNote,
  countPgnMoves,
  createLibraryBackup,
  createLibraryGame,
  createLibraryPgn,
  extractLibraryMetadata,
  formatLibrarySize,
  getLibraryStats,
  getUniqueGameName,
  libraryGameMatchesQuery,
  mergeLibraryBackup,
  normalizeLibraryGames,
  parseLibraryBackup,
  parsePgnHeaders,
  sortLibraryGames,
  suggestGameName,
} from './gameLibrary'
import { pgnImportContentError, splitPgnGames } from './pgn'

const PGN = `[Event "Casual Game"]
[Site "Berlin GER"]
[Date "1852.??.??"]
[Round "?"]
[White "Adolf Anderssen"]
[Black "Jean Dufresne"]
[Result "1-0"]
[WhiteElo "2600"]
[ECO "C52"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 1-0`

describe('pgn header reading', () => {
  it('pulls the seven tag roster and the extras we show', () => {
    expect(extractLibraryMetadata(PGN)).toMatchObject({
      event: 'Casual Game',
      site: 'Berlin GER',
      date: '1852.??.??',
      white: 'Adolf Anderssen',
      black: 'Jean Dufresne',
      result: '1-0',
      whiteElo: 2600,
      eco: 'C52',
    })
  })

  it('treats the placeholder tag values as absent', () => {
    const metadata = extractLibraryMetadata('[Round "?"]\n[Site "-"]\n[White "  "]\n\n1. e4 *')
    expect(metadata.round).toBeUndefined()
    expect(metadata.site).toBeUndefined()
    expect(metadata.white).toBeUndefined()
  })

  it('unescapes quotes inside a tag value', () => {
    expect(parsePgnHeaders('[Event "The \\"Immortal\\" Game"]\n\n1. e4 *').Event)
      .toBe('The "Immortal" Game')
  })

  it('stops reading headers once the movetext starts', () => {
    const headers = parsePgnHeaders('[Event "Real"]\n\n1. e4 e5\n[Event "Not a header"]')
    expect(headers.Event).toBe('Real')
  })

  it('ignores a rating that is not a positive number', () => {
    expect(extractLibraryMetadata('[WhiteElo "?"]\n\n1. e4 *').whiteElo).toBeUndefined()
    expect(extractLibraryMetadata('[BlackElo "-10"]\n\n1. e4 *').blackElo).toBeUndefined()
  })
})

describe('counting moves', () => {
  it('counts plies rather than move numbers', () => {
    expect(countPgnMoves(PGN)).toBe(10)
  })

  it('does not count the result, move numbers, or NAGs', () => {
    expect(countPgnMoves('1. e4 e5 2. Nf3 1/2-1/2')).toBe(3)
    expect(countPgnMoves('1. e4 $1 $16 e5 *')).toBe(2)
  })

  it('ignores comments and side lines', () => {
    expect(countPgnMoves('1. e4 {a strong move} e5 2. Nf3 *')).toBe(3)
    expect(countPgnMoves('1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *')).toBe(3)
    expect(countPgnMoves('1. e4 e5 (1... c5 (1... e6 2. d4) 2. Nf3) 2. Nf3 *')).toBe(3)
    expect(countPgnMoves('1. e4 ; a trailing comment\ne5 *')).toBe(2)
  })

  it('counts castling, promotion, and decorated moves', () => {
    expect(countPgnMoves('1. O-O O-O-O 2. e8=Q+ Kb8 3. Qxd8# *')).toBe(5)
    expect(countPgnMoves('1. e4! e5?? 2. Nf3!? *')).toBe(3)
  })

  it('has nothing to count in an empty or header-only PGN', () => {
    expect(countPgnMoves('')).toBe(0)
    expect(countPgnMoves('[Event "Empty"]\n\n*')).toBe(0)
  })
})

describe('naming a saved game', () => {
  it('names it after the players and the date', () => {
    expect(suggestGameName(PGN)).toBe('Adolf Anderssen vs Jean Dufresne · 1852.??.??')
  })

  it('falls back to the event, then to a placeholder', () => {
    expect(suggestGameName('[Event "Club Night"]\n\n1. e4 *')).toBe('Club Night')
    expect(suggestGameName('1. e4 *')).toBe('Untitled game')
  })

  it('numbers a name that is already taken', () => {
    expect(getUniqueGameName('Game', [])).toBe('Game')
    expect(getUniqueGameName('Game', ['Game'])).toBe('Game (2)')
    expect(getUniqueGameName('Game', ['Game', 'Game (2)'])).toBe('Game (3)')
  })

  it('keeps a numbered name within the length limit', () => {
    const long = 'x'.repeat(MAX_LIBRARY_NAME_LENGTH)
    expect(getUniqueGameName(long, [long]).length).toBeLessThanOrEqual(MAX_LIBRARY_NAME_LENGTH)
  })
})

describe('creating records', () => {
  it('captures the counts and metadata the rows need', () => {
    const game = createLibraryGame('Evergreen', PGN, 123)
    expect(game).toMatchObject({
      name: 'Evergreen',
      createdAt: 123,
      updatedAt: 123,
      moveCount: 10,
      size: PGN.length,
      favorite: false,
    })
    expect(game.metadata.white).toBe('Adolf Anderssen')
    expect(game.id).toBeTruthy()
  })

  it('names an untitled save from the PGN itself', () => {
    expect(createLibraryGame('   ', PGN, 1).name).toBe('Adolf Anderssen vs Jean Dufresne · 1852.??.??')
  })

  it('gives two games saved at the same instant different ids', () => {
    expect(createLibraryGame('A', PGN, 5).id).not.toBe(createLibraryGame('B', PGN, 5).id)
  })
})

describe('normalizing what came back from storage', () => {
  it('keeps well-formed rows and recomputes what it can', () => {
    const games = normalizeLibraryGames([
      { id: 'a', name: 'Kept', pgn: PGN, createdAt: 1, updatedAt: 2, favorite: true },
    ])
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ id: 'a', name: 'Kept', favorite: true, moveCount: 10 })
  })

  it('drops rows that are not usable', () => {
    expect(normalizeLibraryGames(null)).toEqual([])
    expect(normalizeLibraryGames('nope')).toEqual([])
    expect(normalizeLibraryGames([null, 42, {}, { pgn: '' }])).toEqual([])
    expect(normalizeLibraryGames([{ pgn: 'x'.repeat(600_000) }])).toEqual([])
  })

  it('drops a duplicated id rather than rendering it twice', () => {
    const games = normalizeLibraryGames([
      { id: 'dup', pgn: PGN },
      { id: 'dup', pgn: PGN },
    ])
    expect(games).toHaveLength(1)
  })

  it('refuses to load more games than the cap allows', () => {
    const many = Array.from({ length: MAX_LIBRARY_GAMES + 25 }, (_, index) => ({ id: `g${index}`, pgn: PGN }))
    expect(normalizeLibraryGames(many)).toHaveLength(MAX_LIBRARY_GAMES)
  })

  it('repairs missing timestamps and names', () => {
    const [game] = normalizeLibraryGames([{ id: 'a', pgn: PGN }], 99)
    expect(game.createdAt).toBe(99)
    expect(game.updatedAt).toBe(99)
    expect(game.name).toBe('Adolf Anderssen vs Jean Dufresne · 1852.??.??')
  })
})

describe('searching and sorting', () => {
  const games = [
    createLibraryGame('Alpha', PGN, 300),
    createLibraryGame('Beta', '[White "Magnus Carlsen"]\n[Black "Hikaru Nakamura"]\n\n1. d4 *', 100),
    createLibraryGame('Gamma', '[Event "Rapid"]\n\n1. c4 e5 2. g3 *', 200),
  ]

  it('matches on any metadata field, and on every term given', () => {
    expect(libraryGameMatchesQuery(games[1], 'carlsen')).toBe(true)
    expect(libraryGameMatchesQuery(games[1], 'CARLSEN nakamura')).toBe(true)
    expect(libraryGameMatchesQuery(games[1], 'carlsen anderssen')).toBe(false)
    expect(libraryGameMatchesQuery(games[0], 'c52')).toBe(true)
    expect(libraryGameMatchesQuery(games[0], '   ')).toBe(true)
  })

  it('orders by the column asked for', () => {
    expect(sortLibraryGames(games, 'recent').map(g => g.name)).toEqual(['Alpha', 'Gamma', 'Beta'])
    expect(sortLibraryGames(games, 'oldest').map(g => g.name)).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(sortLibraryGames(games, 'name').map(g => g.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(sortLibraryGames(games, 'moves')[0].name).toBe('Alpha')
  })

  it('does not reorder the array it was given', () => {
    const original = games.map(g => g.name)
    sortLibraryGames(games, 'name')
    expect(games.map(g => g.name)).toEqual(original)
  })

  it('totals the shelf', () => {
    expect(getLibraryStats(games)).toEqual({
      count: 3,
      moves: games.reduce((sum, g) => sum + g.moveCount, 0),
      size: games.reduce((sum, g) => sum + g.size, 0),
    })
    expect(getLibraryStats([])).toEqual({ count: 0, moves: 0, size: 0 })
  })

  it('shows a size a person can read', () => {
    expect(formatLibrarySize(0)).toBe('0 KB')
    expect(formatLibrarySize(512)).toBe('512 B')
    expect(formatLibrarySize(2048)).toBe('2.0 KB')
    expect(formatLibrarySize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('backup round trip', () => {
  it('restores the games it wrote', () => {
    const games = [createLibraryGame('Evergreen', PGN, 7)]
    const restored = parseLibraryBackup(createLibraryBackup(games))
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ id: games[0].id, name: 'Evergreen', pgn: PGN, moveCount: 10 })
  })

  it('refuses anything that is not one of our backups', () => {
    expect(parseLibraryBackup('not json')).toEqual([])
    expect(parseLibraryBackup(JSON.stringify({ games: [{ pgn: PGN }] }))).toEqual([])
    expect(parseLibraryBackup(JSON.stringify({ format: 'something-else', games: [] }))).toEqual([])
  })
})

describe('bounded library search', () => {
    /**
     * The slip this guards against is a paste into the filter rather than the
     * importer. Every term has to match, so an unbounded query is terms x
     * haystack x games of work — 900ms against one haystack when measured in
     * web-xiangqi, and a frozen tab across a 500-game library.
     */
    it('truncates a pasted game instead of scanning every term of it', () => {
        const pastedPgn = Array.from({ length: 20_000 }, (_, i) => `${i}. e4 e5`).join(' ')
        const game = createLibraryGame('Aronian vs Carlsen', '[White "Aronian"]\n[Black "Carlsen"]\n\n1. d4 *', 1)

        const started = performance.now()
        const matched = libraryGameMatchesQuery(game, pastedPgn)
        const elapsed = performance.now() - started

        expect(matched).toBe(false)
        expect(elapsed, `took ${elapsed.toFixed(0)}ms`).toBeLessThan(50)
    })

    it('leaves a real query working across fields', () => {
        const game = createLibraryGame(
            'Aronian vs Carlsen',
            '[White "Aronian"]\n[Black "Carlsen"]\n[Date "2024.01.02"]\n\n1. d4 *',
            1,
        )
        expect(libraryGameMatchesQuery(game, 'carlsen 2024')).toBe(true)
        expect(libraryGameMatchesQuery(game, 'carlsen 1999')).toBe(false)
    })
})

describe('case insensitivity', () => {
    /**
     * The haystack is lowercased here rather than by the caller. web-xiangqi's
     * copy of this module always did; this one assumed a pre-lowercased string,
     * which its only caller happened to satisfy. Two functions with one name and
     * different preconditions is a trap for the next caller.
     */
    it('matches regardless of the case on either side', () => {
        expect(matchesSearchTerms('Aronian vs Carlsen', toSearchTerms('CARLSEN'))).toBe(true)
        expect(matchesSearchTerms('ARONIAN VS CARLSEN', toSearchTerms('carlsen'))).toBe(true)
        expect(matchesSearchTerms('Aronian vs Carlsen', toSearchTerms('nakamura'))).toBe(false)
    })

    it('matches everything when no terms were given', () => {
        expect(matchesSearchTerms('anything', [])).toBe(true)
    })
})

describe('the result a library row shows', () => {
  const withResult = (result: string) =>
    extractLibraryMetadata(`[White "A"]\n[Black "B"]\n[Result "${result}"]\n\n1. e4 e5 ${result}`).result

  it('keeps a real result', () => {
    expect(withResult('1-0')).toBe('1-0')
    expect(withResult('0-1')).toBe('0-1')
    expect(withResult('1/2-1/2')).toBe('1/2-1/2')
  })

  /**
   * `*` means "no result", and a row that prints it shows a person a token
   * from a file format rather than a fact about their game.
   */
  it('drops the placeholder an unfinished game carries', () => {
    expect(withResult('*')).toBeUndefined()
  })

  it('drops a missing result the same way', () => {
    expect(extractLibraryMetadata('[White "A"]\n\n1. e4 *').result).toBeUndefined()
  })
})

describe('merging a backup into a library that already has games', () => {
  const make = (prefix: string, count: number, at: number) =>
    Array.from({ length: count }, (_, i) => createLibraryGame(`${prefix} ${i}`, '1. e4 *', at, `${prefix}-${i}`))

  it('keeps both sides when there is room', () => {
    const merged = mergeLibraryBackup(make('old', 3, 1), make('new', 2, 2))
    expect(merged.added).toBe(2)
    expect(merged.omitted).toBe(0)
    expect(merged.games).toHaveLength(5)
    expect(merged.games.map(game => game.name)).toEqual(
      expect.arrayContaining(['old 0', 'old 1', 'old 2', 'new 0', 'new 1']),
    )
  })

  it('does not add a game the library already holds', () => {
    const existing = make('same', 3, 1)
    const merged = mergeLibraryBackup(existing, make('same', 3, 2))
    expect(merged.duplicates).toBe(3)
    expect(merged.added).toBe(0)
    expect(merged.games).toBe(existing)
  })

  it('renames a collision rather than overwriting one', () => {
    const merged = mergeLibraryBackup(
      [createLibraryGame('Sicilian', '1. e4 c5 *', 1, 'a')],
      [createLibraryGame('Sicilian', '1. e4 c5 *', 2, 'b')],
    )
    expect(merged.added).toBe(1)
    expect(merged.games.map(game => game.name).sort()).toEqual(['Sicilian', 'Sicilian (2)'])
  })
})

describe('the data loss this merge exists to stop', () => {
  const make = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => createLibraryGame(`${prefix} ${i}`, '1. e4 *', 1, `${prefix}-${i}`))

  /**
   * What the import used to do: hand everything to `normalizeLibraryGames`,
   * which stops at the cap. With the additions first, the games it dropped
   * were the reader's own.
   */
  it('is real: normalizing additions-first silently drops the existing games', () => {
    const existing = make('old', 400)
    const restored = make('new', 300)
    const naive = normalizeLibraryGames([...restored, ...existing])
    expect(naive).toHaveLength(MAX_LIBRARY_GAMES)
    expect(naive.filter(game => game.name.startsWith('old'))).toHaveLength(200)
  })

  it('keeps every existing game and reports what would not fit', () => {
    const existing = make('old', 400)
    const merged = mergeLibraryBackup(existing, make('new', 300))
    expect(merged.games.filter(game => game.name.startsWith('old'))).toHaveLength(400)
    expect(merged.added).toBe(100)
    expect(merged.omitted).toBe(200)
    expect(merged.games).toHaveLength(MAX_LIBRARY_GAMES)
  })

  it('adds nothing at all to a full library, and says so', () => {
    const merged = mergeLibraryBackup(make('old', MAX_LIBRARY_GAMES), make('new', 5))
    expect(merged.added).toBe(0)
    expect(merged.omitted).toBe(5)
    expect(merged.games).toHaveLength(MAX_LIBRARY_GAMES)
  })

  it('survives normalizing afterwards without losing anything', () => {
    const merged = mergeLibraryBackup(make('old', 400), make('new', 300))
    expect(normalizeLibraryGames(merged.games)).toHaveLength(MAX_LIBRARY_GAMES)
  })
})

describe('what the reader is told about a merge', () => {
  const merge = (added: number, duplicates: number, omitted: number) =>
    backupMergeNote({ games: [], added, duplicates, omitted })

  it('says nothing when the whole backup went in', () => {
    expect(merge(5, 0, 0)).toBeNull()
  })

  it('says what was already there', () => {
    expect(merge(3, 2, 0)).toBe('Added 3 games; 2 games already in the library.')
  })

  it('says what would not fit, and why', () => {
    expect(merge(100, 0, 200)).toBe(
      `Added 100 games; 200 games left out — the library holds ${MAX_LIBRARY_GAMES}.`,
    )
  })

  it('says both when both happened', () => {
    expect(merge(1, 1, 1)).toBe(
      `Added 1 game; 1 game already in the library, 1 game left out — the library holds ${MAX_LIBRARY_GAMES}.`,
    )
  })

  it('counts one game as a game', () => {
    expect(merge(1, 1, 0)).toContain('1 game already')
    expect(merge(2, 2, 0)).toContain('2 games already')
  })
})

describe('exporting the library as a PGN database', () => {
  const withHeaders = (event: string, result: string) =>
    `[Event "${event}"]\n[Site "?"]\n[Date "2026.01.01"]\n[Round "1"]\n[White "A"]\n[Black "B"]\n[Result "${result}"]\n\n1. e4 e5 ${result}`

  it('writes nothing for an empty library', () => {
    expect(createLibraryPgn([])).toBe('')
  })

  it('writes one game as itself', () => {
    const pgn = withHeaders('Solo', '1-0')
    expect(createLibraryPgn([createLibraryGame('a', pgn, 1, 'a')])).toBe(`${pgn}\n`)
  })

  it('separates games with a blank line', () => {
    const games = [
      createLibraryGame('one', withHeaders('First', '1-0'), 1, 'a'),
      createLibraryGame('two', withHeaders('Second', '0-1'), 1, 'b'),
    ]
    expect(createLibraryPgn(games)).toContain('1-0\n\n[Event "Second"]')
  })

  it('skips an entry with no move text at all rather than writing a gap', () => {
    const games = [
      createLibraryGame('real', withHeaders('First', '1-0'), 1, 'a'),
      { ...createLibraryGame('blank', withHeaders('Second', '*'), 1, 'b'), pgn: '   ' },
    ]
    expect(createLibraryPgn(games)).toBe(`${withHeaders('First', '1-0')}\n`)
  })

  /** The point of the format: it has to come back in through the front door. */
  it('round-trips through the database splitter', () => {
    const games = ['First', 'Second', 'Third'].map((event, i) =>
      createLibraryGame(event, withHeaders(event, '1-0'), 1, `id-${i}`))
    const parts = splitPgnGames(createLibraryPgn(games))
    expect(parts).toHaveLength(3)
    expect(parts.map(part => (part.match(/\[Event "([^"]*)"\]/) ?? [])[1])).toEqual(['First', 'Second', 'Third'])
  })

  it('produces a file every game of which the importer accepts', () => {
    const games = ['First', 'Second'].map((event, i) =>
      createLibraryGame(event, withHeaders(event, '1-0'), 1, `id-${i}`))
    for (const part of splitPgnGames(createLibraryPgn(games))) {
      expect(pgnImportContentError(part), part).toBeNull()
    }
  })
})
