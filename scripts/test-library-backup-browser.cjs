/** Backup download/import round trip through the UI. Requires Vite on 4324. */
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const { readFile } = require('node:fs/promises')
const base = process.env.AUDIT_URL || 'http://127.0.0.1:4324/web-chess/'
async function main() {
  const browser = await chromium.launch()
  try {
    for (const width of [1280, 375]) {
      const context = await browser.newContext({ viewport: { width, height: 812 } })
      context.setDefaultTimeout(15000)
      const page = await context.newPage()
      await page.goto(base)
      await page.evaluate(async () => {
        const store = await import(new URL('src/engine/gameLibraryStorage.ts', location.href).href)
        const lib = await import(new URL('src/engine/gameLibrary.ts', location.href).href)
        const pgn = '1. e4 { ' + 'a'.repeat(480000) + ' } *'
        await store.saveLibraryGames(Array.from({ length: 17 }, (_, i) => lib.createLibraryGame(`Game ${i}`, pgn, 1, `g${i}`)))
      })
      await page.reload()
      await page.getByRole('button', { name: 'Open saved games library', exact: true }).click()
      await page.getByRole('button', { name: 'Export backup', exact: true }).click()
      assert.match(await page.locator('.library-status').innerText(), /needs 2 backup files/)
      const files = []
      for (let i = 1; i <= 2; i++) {
        const button = page.getByRole('button', { name: `Download part ${i} of 2`, exact: true })
        await button.scrollIntoViewIfNeeded()
        assert.ok((await button.boundingBox()).height >= 44)
        const downloadPromise = page.waitForEvent('download')
        await button.click()
        const download = await downloadPromise
        assert.match(download.suggestedFilename(), new RegExp(`part-${i}-of-2.json$`))
        const buffer = await readFile(await download.path())
        assert.ok(buffer.toString('utf8').length <= 8000000)
        files.push({ name: download.suggestedFilename(), mimeType: 'application/json', buffer })
      }
      assert.match(await page.locator('.library-backup-parts').innerText(), /2 of 2 downloads started/)
      await page.locator('.library-backup-parts .library-hint').scrollIntoViewIfNeeded()
      await page.screenshot({ path: `/tmp/web-chess-backup-${width}.png` })
      const restoreContext = await browser.newContext({ viewport: { width, height: 812 } })
      const restore = await restoreContext.newPage()
      await restore.goto(base)
      await restore.getByRole('button', { name: 'Open saved games library', exact: true }).click()
      for (const file of files.reverse()) {
        await restore.locator('.library-dialog input[type=file]').setInputFiles(file)
        await restore.getByText('Backup imported.', { exact: true }).waitFor()
        const expected = files.indexOf(file) === 0 ? 1 : 17
        await restore.waitForFunction(count => document.querySelectorAll('.library-row').length === count, expected)
      }
      await restore.reload()
      await restore.getByRole('button', { name: 'Open saved games library', exact: true }).click()
      await restore.waitForFunction(() => document.querySelectorAll('.library-row').length === 17)
      await restoreContext.close()
      await context.close()
      console.log(`PASS: ${width}px multipart downloads, reverse-order import, and persistence after reload`)
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
