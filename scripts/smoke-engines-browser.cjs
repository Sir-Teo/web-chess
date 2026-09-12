/** Real Stockfish + board/modal smoke tests. Start Vite first; no UCI fixtures. */
const { chromium, firefox, webkit } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const base = process.env.SMOKE_URL || 'http://127.0.0.1:4324/web-chess/'
const output = process.env.SMOKE_OUTPUT || '/tmp/web-chess-engine-smoke'
const browsers = { chromium, firefox, webkit }

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const results = []
  for (const name of (process.env.SMOKE_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    let browser
    try {
      assert(browsers[name], `Unknown browser: ${name}`)
      browser = await browsers[name].launch()
      for (const width of [1280, 375]) {
        const context = await browser.newContext({ viewport: { width, height: 812 },
          hasTouch: width < 500, isMobile: name !== 'firefox' && width < 500,
          ...(width < 500 ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } : {}),
        })
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        let stage = 'boot'
        try {
          await page.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//, route => route.fulfill({ status: 404, body: '{}' }))
          await page.addInitScript(() => {
            localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({
              workspaceMode: 'analysis', analysisExperience: 'pro', autoAnalyze: false,
              showAdvancedAnalyze: true, analyzeMode: 'deep', searchDepth: 12,
            }))
            window.__smokeBestmoves = 0
            const NativeWorker = Worker
            window.Worker = class extends NativeWorker {
              constructor(...args) {
                super(...args)
                this.addEventListener('message', event => {
                  if (typeof event.data === 'string' && event.data.startsWith('bestmove ')) window.__smokeBestmoves += 1
                })
              }
            }
          })
          await page.goto(base, { waitUntil: 'domcontentloaded' })
          await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
          await page.waitForFunction(() => window.__smokeBestmoves >= 1)
          const position = page.locator('.coach-grid > div').first().locator('strong')
          const before = await position.innerText()
          assert.match(before, /^[+-]?\d/)
          const source = await page.getByTestId('position-engine-source').innerText()
          assert.match(source, /Stockfish 18.*build 18\.0\.7/)

          stage = 'restricted search'
          await page.getByRole('button', { name: 'Open settings', exact: true }).click()
          await page.locator('.advanced-settings > summary').filter({ hasText: 'Advanced engine options' }).click()
          await page.getByLabel('Candidate moves', { exact: true }).fill('f3')
          await page.keyboard.press('Escape')
          await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
          await page.waitForFunction(() => window.__smokeBestmoves >= 2)
          assert.equal(await position.innerText(), before)
          assert.equal(await page.getByTestId('candidate-search-notice').isVisible(), true)
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
          await page.locator('.coach-card').screenshot({ path: path.join(output, `${name}-${width}-coach.png`) })

          stage = 'modal focus and board input'
          await page.getByRole('button', { name: 'Open the Commands palette', exact: true }).click()
          const search = page.getByRole('dialog').getByRole('combobox', { name: 'Search commands' })
          await search.waitFor()
          await page.keyboard.press('f')
          assert.equal(await search.inputValue(), 'f')
          await page.keyboard.press('Escape')
          await page.locator('#chessboard-square-e2').click()
          await page.locator('#chessboard-square-e4').click()
          await page.waitForFunction(() => document.querySelector('#chessboard-square-e4')?.getAttribute('aria-label')?.includes('White pawn'))
          assert.equal(await page.locator('[id^="chessboard-square-"]').count(), 64)

          stage = 'game review and export'
          await page.getByRole('button', { name: 'Review', exact: true }).click()
          await page.getByRole('button', { name: 'Review Game', exact: true }).click()
          await page.getByRole('button', { name: 'Review Game', exact: true }).waitFor()
          assert.match(await page.getByTestId('review-run-summary').innerText(), /Completed review/)
          await page.getByRole('button', { name: 'Fresh review', exact: true }).click()
          await page.getByRole('button', { name: 'Review Game', exact: true }).waitFor()
          assert.match(await page.getByTestId('review-run-summary').innerText(), /Completed review.*0 positions reused/)
          const download = page.waitForEvent('download')
          await page.getByRole('button', { name: 'Export review', exact: true }).click()
          const pgn = fs.readFileSync(await (await download).path(), 'utf8')
          assert.equal([...pgn.matchAll(/\[%eval /g)].length, 2)
          assert.ok(pgn.includes('[WebChessReviewStatus "complete"]'))
          assert.ok(pgn.includes('[WebChessReviewDepth "12"]'))
          assert.deepEqual(errors, [])
          results.push({ browser: name, width, status: 'passed', source, positionScore: before,
            isolated: await page.evaluate(() => crossOriginIsolated), checks: ['real UCI search', 'restricted score isolation', 'producer identity', 'responsive layout', 'modal editing', 'e2-e4', 'game review', 'fresh review', 'review PGN download'] })
        } catch (error) {
          results.push({ browser: name, width, status: 'failed', stage, error: String(error), pageErrors: errors })
          await page.screenshot({ path: path.join(output, `${name}-${width}-failure.png`) }).catch(() => {})
          process.exitCode = 1
        } finally { await context.close() }
        console.log(JSON.stringify(results.at(-1)))
      }
    } catch (error) {
      results.push({ browser: name, status: 'failed', stage: 'launch', error: String(error) })
      console.log(JSON.stringify(results.at(-1)))
      process.exitCode = 1
    } finally { await browser?.close() }
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ base, results }, null, 2) + '\n')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
