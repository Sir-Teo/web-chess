import { expect, it } from 'vitest'
import { parsePgnMoveTree, pgnImportContentError, hasMultiplePgnGames } from './engine/pgn'
import { countPgnMoves, extractLibraryMetadata, parseLibraryBackup, normalizeLibraryGames } from './engine/gameLibrary'
import { hasLegalKingPlacement, validateFenForAnalysis } from './engine/fen'
import { buildFenShareUrl, normalizeFenForShare, parseFenShareHash } from './engine/shareLink'
import { parsePositionSetupFen } from './engine/positionSetup'
import { parseGameShareHash } from './engine/shareGame'
import { normalizeCloudEvalFen, parseCloudEvalResponse } from './engine/cloudEval'
import { normalizeTablebaseFen, parseTablebaseResponse } from './engine/tablebase'
import { normalizeOpeningExplorerFenKey } from './engine/openingExplorer'

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

/**
 * A whole game in a link, and three answers from a server.
 *
 * The sweep above covers the readers a *position* arrives through. It did not
 * cover the one a *game* arrives through, which is the more expensive of the
 * two by its own account: `shareGame.ts` says it "base64-decodes and then
 * replays every move on a real board", where the FEN reader "rejects on the
 * rank count before doing any real work". The reader doing more work was the
 * one with no net under it.
 *
 * The response parsers are here for a different reason. They read JSON from
 * Lichess, so the input is remote rather than pasted — untrusted in the same
 * way, and unreviewable in a way a paste is not. Defensive code that has never
 * been given anything to defend against is a guess.
 *
 * Two of the three are reachable: `parseCloudEvalResponse` and
 * `parseTablebaseResponse` are exported. The opening explorer's is not — it is
 * private to `fetchOpeningExplorer` and stays covered by that module's own
 * tests — so what this sweep reaches there is its FEN key normalizer. Said
 * plainly because the explorer has the lowest branch coverage in `engine/` at
 * 54%, and this does not fix that.
 */
const NASTY_JSON: Array<[string, unknown]> = [
  ['null', null],
  ['a string', 'not an object'],
  ['an array', [1, 2, 3]],
  ['empty object', {}],
  ['nested to 200 deep', (() => {
    let node: Record<string, unknown> = {}
    for (let i = 0; i < 200; i++) node = { moves: [node], white: node }
    return node
  })()],
  ['moves that are not moves', { white: 1, draws: 1, black: 1, moves: [null, 3, 'e4', {}, { uci: 5 }], topGames: [], recentGames: [] }],
  ['forty thousand moves', { white: 1, draws: 1, black: 1, topGames: [], recentGames: [],
    moves: Array.from({ length: 40000 }, (_unused, i) => ({ uci: 'e2e4', san: 'e4', white: i, draws: i, black: i })) }],
  ['numbers where strings go', { white: '1', draws: {}, black: [], moves: 7, checkmate: 'yes', category: 9 }],
  ['hostile strings', { white: 1, draws: 1, black: 1, topGames: [], recentGames: [],
    moves: [{ uci: 'e'.repeat(100000), san: '\u0000'.repeat(100000) }] }],
]

for (const [name, input] of NASTY_JSON) {
  it(`survives a server answer that is: ${name}`, () => {
    const t0 = performance.now()
    parseCloudEvalResponse(input)
    parseTablebaseResponse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', input)
    const ms = performance.now() - t0
    expect(ms, `${name} took ${ms.toFixed(0)}ms`).toBeLessThan(1000)
  })
}

for (const [name, input] of NASTY_FEN) {
  it(`survives a shared game from: ${name}`, () => {
    const t0 = performance.now()
    parseGameShareHash(input)
    parseGameShareHash('#game=' + encodeURIComponent(input))
    // Base64url is what the reader actually receives, so give it some. Built
    // the way the app builds it rather than with a Node Buffer, so this test
    // does not quietly depend on an environment the app never runs in.
    parseGameShareHash('#game=' + btoa(unescape(encodeURIComponent(input.slice(0, 20000))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    normalizeCloudEvalFen(input)
    normalizeTablebaseFen(input)
    normalizeOpeningExplorerFenKey(input)
    const ms = performance.now() - t0
    expect(ms, `${name} took ${ms.toFixed(0)}ms`).toBeLessThan(1000)
  })
}
