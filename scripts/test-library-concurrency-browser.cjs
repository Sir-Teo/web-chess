/** Real IndexedDB regression checks. Run against Vite (default port 4324). */
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const base = process.env.AUDIT_URL || 'http://127.0.0.1:4324/web-chess/'

async function main() {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    context.setDefaultTimeout(15000)
    const a = await context.newPage()
    const b = await context.newPage()
    await Promise.all([a.goto(base), b.goto(base)])
    const setup = async () => {
      window.store = await import(new URL('src/engine/gameLibraryStorage.ts', location.href).href)
      window.library = await import(new URL('src/engine/gameLibrary.ts', location.href).href)
      window.snapshot = await window.store.loadLibraryGames()
    }
    await Promise.all([a.evaluate(setup), b.evaluate(setup)])
    await Promise.all([a, b].map((page, i) => page.evaluate(async i => {
      await window.store.saveLibraryChanges(window.snapshot, [
        window.library.createLibraryGame(i ? 'From B' : 'From A', '1. e4 *', i + 1, i ? 'b' : 'a'),
      ])
    }, i)))
    const read = page => page.evaluate(() => window.store.loadLibraryGames())
    assert.deepEqual((await read(a)).map(g => g.id).sort(), ['a', 'b'])
    await Promise.all([a.evaluate(setup), b.evaluate(setup)])
    await a.evaluate(async () => window.store.saveLibraryChanges(window.snapshot,
      window.snapshot.map(g => g.id === 'a' ? { ...g, name: 'Renamed' } : g)))
    await b.evaluate(async () => window.store.saveLibraryChanges(window.snapshot,
      window.snapshot.map(g => g.id === 'a' ? { ...g, favorite: true } : g)))
    assert.equal((await read(a)).find(g => g.id === 'a').name, 'Renamed')
    assert.equal((await read(a)).find(g => g.id === 'a').favorite, true)
    await a.evaluate(async () => window.store.saveLibraryChanges(window.snapshot,
      window.snapshot.filter(g => g.id !== 'a')))
    await b.evaluate(async () => window.store.saveLibraryChanges(window.snapshot,
      window.snapshot.map(g => ({ ...g, name: 'Stale edit' }))))
    assert.deepEqual((await read(a)).map(g => g.id), ['b'])

    // Exercise the real hook: one tab deletes while a stale tab stars that row.
    await Promise.all([a.reload(), b.reload()])
    await Promise.all([a, b].map(page => page.getByRole('button', { name: 'Open saved games library', exact: true }).click()))
    await a.getByRole('button', { name: 'Delete Stale edit', exact: true }).click()
    await a.getByRole('button', { name: 'Confirm deleting Stale edit', exact: true }).click()
    await a.waitForFunction(() => document.querySelectorAll('.library-row').length === 0)
    // Wait for persistence, not just the optimistic row removal.
    await a.evaluate(setup)
    for (let i = 0; (await read(a)).length && i < 50; i++) await a.waitForTimeout(20)
    assert.equal((await read(a)).length, 0)
    await b.getByRole('button', { name: 'Star Stale edit', exact: true }).click()
    await b.waitForFunction(() => document.querySelectorAll('.library-row').length === 0)
    await b.evaluate(setup)
    assert.equal((await read(b)).length, 0)
    console.log('PASS: concurrent additions, field merges, deletion precedence, and stale-tab UI writes')
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
