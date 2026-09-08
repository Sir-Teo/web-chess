/**
 * Audit probes, not a passing regression gate. Reports the current behavior
 * of known study/library gaps in a fresh, isolated Chromium context.
 * Start Vite on port 4324, then run this file. No existing browser data is used.
 */
const { chromium } = require('playwright')
const { Chess } = require('chess.js')
const base = process.env.AUDIT_URL || 'http://127.0.0.1:4324/web-chess/'

async function main() {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext()
    const a = await context.newPage()
    const b = await context.newPage()
    await Promise.all([a.goto(base), b.goto(base)])
    const setup = async () => {
      window.auditStore = await import(new URL('src/engine/gameLibraryStorage.ts', location.href).href)
      window.auditLibrary = await import(new URL('src/engine/gameLibrary.ts', location.href).href)
      window.auditSnapshot = await window.auditStore.loadLibraryGames()
    }
    await Promise.all([a.evaluate(setup), b.evaluate(setup)])
    await a.evaluate(async () => window.auditStore.saveLibraryGames([
      ...window.auditSnapshot, window.auditLibrary.createLibraryGame('From A', '1. e4 *', 1, 'a'),
    ]))
    await b.evaluate(async () => window.auditStore.saveLibraryGames([
      ...window.auditSnapshot, window.auditLibrary.createLibraryGame('From B', '1. d4 *', 2, 'b'),
    ]))
    const crossTabNames = await a.evaluate(async () => (await window.auditStore.loadLibraryGames()).map(game => game.name))
    const formats = await a.evaluate(async () => {
      const lib = window.auditLibrary
      const pgn = await import(new URL('src/engine/pgn.ts', location.href).href)
      const game = '1. e4 { ' + 'a'.repeat(480000) + ' } *'
      const games = Array.from({ length: 17 }, (_, i) => lib.createLibraryGame('Game ' + i, game, 1, 'g' + i))
      const backup = lib.createLibraryBackup(games)
      const annotated = pgn.parsePgnMoveTree('1. e4 { [%cal Ge2e4] [%csl Ge4] My plan } *')
      return {
        backupChars: backup.length, originalGames: games.length,
        restoredGames: lib.parseLibraryBackup(backup).length,
        retainedComment: annotated.moves[0]?.comment,
      }
    })
    const repeated = new Chess()
    const different = new Chess()
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) repeated.move(move)
    for (const move of ['Nf3', 'Nf6', 'Nc3', 'Nc6', 'Ng1', 'Ng8', 'Nb1', 'Nb8']) different.move(move)
    console.log(JSON.stringify({
      ...formats, crossTabNames,
      repetition: { sameFen: repeated.fen() === different.fen(), first: repeated.isThreefoldRepetition(), second: different.isThreefoldRepetition() },
    }, null, 2))
  } finally { await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
