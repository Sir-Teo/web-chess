import { describe, expect, it } from 'vitest'
import { hasMultiplePgnGames, parsePgnMoveTree, pgnImportContentError } from './pgn'
import {
  countPgnMoves,
  extractLibraryMetadata,
  normalizeLibraryGames,
  parseLibraryBackup,
} from './gameLibrary'

/**
 * The import path takes whatever someone pastes or picks, up to 5MB. None of
 * this should throw, and none of it should take long enough to freeze the tab.
 */
const HOSTILE: Array<[name: string, input: string]> = [
  ['empty', ''],
  ['whitespace only', '   \n\t  '],
  ['a lone bracket', '['],
  ['unclosed comment', '1. e4 {never closed'],
  ['unclosed variation', '1. e4 (1... c5'],
  ['deeply nested variations', `1. e4 ${'('.repeat(5000)}e5${')'.repeat(5000)}`],
  ['nested braces', `${'{'.repeat(500)}x${'}'.repeat(500)}`],
  ['malformed headers', '[[[["""]]]]\n\n1. e4 *'],
  ['CRLF line endings', '[Event "x"]\r\n\r\n1. e4 e5 *\r\n'],
  ['several results', '1. e4 1-0 0-1 1/2-1/2 *'],
  ['one enormous token', `1. ${'e'.repeat(200_000)}`],
  ['forty thousand moves', Array.from({ length: 40_000 }, () => 'e4').join(' ')],
  ['alternating punctuation', '(){}'.repeat(20_000)],
]

describe('surviving whatever gets pasted in', () => {
  for (const [name, input] of HOSTILE) {
    it(`reads ${name} without throwing`, () => {
      expect(() => {
        pgnImportContentError(input)
        hasMultiplePgnGames(input)
        countPgnMoves(input)
        extractLibraryMetadata(input)
        parseLibraryBackup(input)
        normalizeLibraryGames(input)
        // Invalid PGN is expected to be rejected; it must not do anything else.
        try { parsePgnMoveTree(input) } catch { /* rejected, as intended */ }
      }).not.toThrow()
    })
  }
})

describe('a file full of braces that is not really a PGN', () => {
  // A minified script or a JSON dump pasted by mistake. Stripping comments with
  // a regex backtracked from every unclosed brace, which is quadratic: 80k
  // braces took about two seconds, and the 5MB the importer accepts would have
  // hung the tab outright.
  const braces = (n: number) => '{'.repeat(n)

  it('scans a megabyte of them in well under a second', () => {
    const t0 = performance.now()
    pgnImportContentError(braces(1_000_000))
    countPgnMoves(braces(1_000_000))
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  it('grows about linearly rather than quadratically', () => {
    const measure = (n: number) => {
      const text = braces(n)
      const t0 = performance.now()
      pgnImportContentError(text)
      countPgnMoves(text)
      return performance.now() - t0
    }
    measure(50_000) // warm up, so the first run does not carry the JIT cost
    const small = Math.max(measure(50_000), 0.5)
    const large = measure(400_000)
    // Eight times the input. Linear would be ~8x; quadratic would be ~64x.
    expect(large / small).toBeLessThan(24)
  })

  it('still finds the comments it is supposed to strip', () => {
    expect(countPgnMoves('1. e4 {a comment} e5 2. Nf3 *')).toBe(3)
    expect(countPgnMoves('1. e4 {one} {two} e5 *')).toBe(2)
    // An unterminated comment is left in place and the moves after it still
    // count — which is what the regex did too. Preserved deliberately: this
    // was a change of algorithm, not of meaning.
    expect(countPgnMoves('1. e4 e5 {unterminated Nf3 Nc6')).toBe(4)
  })
})
