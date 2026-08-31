import { expect, it } from 'vitest'
import { parsePgnMoveTree, pgnImportContentError, hasMultiplePgnGames } from './engine/pgn'
import { countPgnMoves, extractLibraryMetadata, parseLibraryBackup, normalizeLibraryGames } from './engine/gameLibrary'
import { hasLegalKingPlacement, validateFenForAnalysis } from './engine/fen'
import { buildFenShareUrl, normalizeFenForShare, parseFenShareHash } from './engine/shareLink'
import { parsePositionSetupFen } from './engine/positionSetup'

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

/**
 * The other way in.
 *
 * The PGN and library readers above were the only entry points swept, but a
 * position reaches this app through a FEN as well — typed into the dialog,
 * pasted into the editor, or arriving in a URL hash from a link somebody sent.
 * `docs/architecture.md` measured the share hash and found nothing quadratic;
 * this is the net that keeps it that way, and it covers the two readers beside
 * it that were never measured at all.
 */
const NASTY_FEN: Array<[string, string]> = [
  ...NASTY,
  ['fen-shaped but endless', '8/'.repeat(100000) + '8 w - - 0 1'],
  ['one enormous rank', 'p'.repeat(200000) + '/8/8/8/8/8/8/8 w - - 0 1'],
  ['all whitespace', ' \t\n'.repeat(100000)],
  ['huge counters', '8/8/8/8/8/8/8/8 w - - ' + '9'.repeat(50000) + ' 1'],
  ['many slashes', '/'.repeat(100000)],
  ['nul and control bytes', '8/8/8/8/8/8/8/8 w - - 0 1\u0000\u0007'.repeat(1000)],
]

for (const [name, input] of NASTY_FEN) {
  it(`survives a position from: ${name}`, () => {
    const t0 = performance.now()
    validateFenForAnalysis(input)
    hasLegalKingPlacement(input)
    normalizeFenForShare(input)
    buildFenShareUrl(input, 'https://example.test/app/')
    parseFenShareHash(input)
    parseFenShareHash('#fen=' + encodeURIComponent(input))
    parsePositionSetupFen(input)
    const ms = performance.now() - t0
    expect(ms, `${name} took ${ms.toFixed(0)}ms`).toBeLessThan(1000)
  })
}
