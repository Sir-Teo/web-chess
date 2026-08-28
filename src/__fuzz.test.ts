import { expect, it } from 'vitest'
import { parsePgnMoveTree, pgnImportContentError, hasMultiplePgnGames } from './engine/pgn'
import { countPgnMoves, extractLibraryMetadata, parseLibraryBackup, normalizeLibraryGames } from './engine/gameLibrary'

const NASTY: Array<[string, string]> = [
  ['empty', ''],
  ['unclosed comment', '1. e4 {never closed'],
  ['unclosed variation', '1. e4 (1... c5'],
  ['deep nesting', '1. e4 ' + '('.repeat(5000) + 'e5' + ')'.repeat(5000)],
  ['many braces', '{'.repeat(20000)],
  ['long token', '1. ' + 'e'.repeat(200000)],
  ['huge movetext', Array.from({ length: 40000 }, () => 'e4').join(' ')],
  ['bad headers', '[[[["""]]]]\n\n1. e4 *'],
  ['lone bracket', '['],
  ['nested braces', '{'.repeat(500) + 'x' + '}'.repeat(500)],
  ['alternating', '(){}'.repeat(20000)],
]

for (const [name, input] of NASTY) {
  it(`survives: ${name}`, () => {
    const t0 = performance.now()
    pgnImportContentError(input)
    hasMultiplePgnGames(input)
    countPgnMoves(input)
    extractLibraryMetadata(input)
    parseLibraryBackup(input)
    normalizeLibraryGames(input)
    try { parsePgnMoveTree(input) } catch { /* invalid PGN is expected to throw */ }
    const ms = performance.now() - t0
    // Fails loudly with the timing if anything is pathological.
    expect(ms, `${name} took ${ms.toFixed(0)}ms`).toBeLessThan(1000)
  })
}
