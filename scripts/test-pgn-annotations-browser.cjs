/** Real UI import/export round trips. Requires Vite on port 4324. */
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
      let pgn = '{ [%csl Ra1] } 1. e4 { [%cal Ge2e4] [%csl Ge4] [%vendor opaque] My plan } (1. d4 { [%cal Rd2d4] Alternative }) e5 *'
      for (let round = 0; round < 2; round++) {
        await page.getByRole('button', { name: 'Open PGN and FEN dialog', exact: true }).click()
        await page.getByRole('button', { name: 'Import', exact: true }).click()
        await page.locator('.pgn-dialog textarea').fill(pgn)
        await page.getByRole('button', { name: 'Import & Analyze', exact: true }).click()
        await page.locator('.pgn-dialog').waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: 'Open PGN and FEN dialog', exact: true }).click()
        await page.getByRole('button', { name: 'Export', exact: true }).click()
        const downloadPromise = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Download PGN', exact: true }).click()
        pgn = await readFile(await (await downloadPromise).path(), 'utf8')
        for (const tag of ['[%csl Ra1]', '[%cal Ge2e4]', '[%csl Ge4]', '[%vendor opaque]', '[%cal Rd2d4]']) {
          assert.equal(pgn.split(tag).length - 1, 1, `${tag} must survive exactly once`)
        }
        assert.ok(pgn.includes('My plan') && pgn.includes('Alternative'))
        await page.keyboard.press('Escape')
      }
      await context.close()
      console.log(`PASS: ${width}px study root, arrows, squares, unknown tags, and variation survive repeated UI round trips`)
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
