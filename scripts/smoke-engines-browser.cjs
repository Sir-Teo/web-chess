/** Real Stockfish + board/modal smoke tests. Start Vite first; no UCI fixtures. */
const { chromium, firefox, webkit } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const base = process.env.SMOKE_URL || 'http://127.0.0.1:4324/web-chess/'
const output = process.env.SMOKE_OUTPUT || '/tmp/web-chess-engine-smoke'
const browsers = { chromium, firefox, webkit }
const widths = (process.env.SMOKE_WIDTHS || '1280,375').split(',').map(Number)

async function main() {
  assert(widths.length > 0 && widths.every(width => Number.isInteger(width) && width >= 320), 'SMOKE_WIDTHS must contain viewport widths of at least 320px')
  fs.mkdirSync(output, { recursive: true })
  const results = []
  for (const name of (process.env.SMOKE_BROWSERS || 'chromium,firefox,webkit').split(',')) {
    let browser
    try {
      assert(browsers[name], `Unknown browser: ${name}`)
      browser = await browsers[name].launch()
      for (const width of widths) {
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
            window.__smokeCommands = []
            const NativeWorker = Worker
            window.Worker = class extends NativeWorker {
              postMessage(data, ...rest) {
                if (typeof data === 'string') window.__smokeCommands.push(data)
                return super.postMessage(data, ...rest)
              }
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
          // The Worker event precedes React's committed position snapshot.
          // Capture the completed depth, not a still-painted shallower score.
          await page.locator('.coach-grid > div').filter({ hasText: 'Position depth' }).getByText('D12', { exact: true }).waitFor()
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

          stage = 'shared engine options'
          await page.getByRole('button', { name: 'Engine Lab', exact: true }).click()
          const command = page.getByRole('textbox', { name: 'UCI command', exact: true })
          for (const value of ['96', '64']) {
            const sentBefore = await page.evaluate(() => window.__smokeCommands.length)
            await command.fill(`setoption name Hash value ${value}`)
            await command.press('Enter')
            await page.waitForFunction(({ value, sentBefore }) => {
              const field = document.querySelector('input[aria-label="Hash"]')
              return field?.value === value && window.__smokeCommands.slice(sentBefore).includes(`setoption name Hash value ${value}`)
                && JSON.parse(localStorage.getItem('webchess:analysis-settings:v1')).hashMb === Number(value)
            }, { value, sentBefore })
          }

          stage = 'game review and export'
          await page.getByRole('button', { name: 'Review', exact: true }).click()
          await page.getByRole('button', { name: 'Review Game', exact: true }).click()
          await page.getByRole('button', { name: 'Review Game', exact: true }).waitFor()
          assert.match(await page.getByTestId('review-run-summary').innerText(), /Completed review/)
          await page.getByRole('button', { name: 'Open settings', exact: true }).click()
          const depth = page.getByRole('slider', { name: 'Search depth', exact: true })
          await depth.focus()
          await depth.press('Home')
          assert.equal(await depth.inputValue(), '6')
          await page.keyboard.press('Escape')
          await page.getByRole('button', { name: 'Fresh review', exact: true }).click()
          await page.getByRole('button', { name: 'Review Game', exact: true }).waitFor()
          assert.match(await page.getByTestId('review-run-summary').innerText(), /Completed review.*Target depth 6.*0 positions reused/)
          const download = page.waitForEvent('download')
          await page.getByRole('button', { name: 'Export review', exact: true }).click()
          const pgn = fs.readFileSync(await (await download).path(), 'utf8')
          assert.equal([...pgn.matchAll(/\[%eval /g)].length, 2)
          assert.ok(pgn.includes('[WebChessReviewStatus "complete"]'))
          assert.ok(pgn.includes('[WebChessReviewDepth "6"]'))
          await page.getByTestId('review-depth-guidance').waitFor()
          stage = 'saved review and comparison'
          const reviewSource = await page.getByTestId('review-engine-source').innerText()
          await page.getByRole('button', { name: 'Save review', exact: true }).click()
          await page.getByText('Review saved on this device.', { exact: false }).waitFor()
          await page.getByRole('button', { name: 'Use saved review', exact: true }).click()
          await page.getByText('Saved review opened.', { exact: false }).waitFor()
          assert.equal(await page.getByTestId('review-engine-source').innerText(), reviewSource)
          await page.getByRole('button', { name: 'Compare with open review', exact: true }).click()
          await page.getByTestId('review-comparison-summary').waitFor()
          assert.match(await page.getByTestId('review-comparison-summary').innerText(), /2\/2 positions.*0 score changes/s)
          await page.getByRole('button', { name: 'Close comparison', exact: true }).click()
          stage = 'full saved-review backup'
          const backupDownload = page.waitForEvent('download')
          await page.getByRole('button', { name: 'Export review backup', exact: true }).click()
          const backup = JSON.parse(fs.readFileSync(await (await backupDownload).path(), 'utf8'))
          assert.equal(backup.format, 'web-chess-review-backup')
          assert.equal(backup.reviews.length, 1)
          assert.equal(backup.reviews[0].evaluations.length, 2)
          assert.equal(backup.reviews[0].settings.depth, 6)
          assert.ok(backup.reviews[0].finishedAt >= backup.reviews[0].startedAt)
          await page.getByRole('button', { name: 'Delete saved review', exact: true }).click()
          await page.waitForFunction(() => document.querySelectorAll('#saved-review-choice option').length === 0)
          await page.getByLabel('Review backup file', { exact: true }).setInputFiles({ name: 'review-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
          await page.getByText('Imported 1 review; 0 identical reviews skipped.', { exact: true }).waitFor()
          await page.getByRole('button', { name: 'Use saved review', exact: true }).click()
          await page.getByText('Saved review opened.', { exact: false }).waitFor()
          assert.equal(await page.getByTestId('review-engine-source').innerText(), reviewSource)
          const restoredDownload = page.waitForEvent('download')
          await page.getByRole('button', { name: 'Export review backup', exact: true }).click()
          const restoredBackup = JSON.parse(fs.readFileSync(await (await restoredDownload).path(), 'utf8'))
          assert.deepEqual(restoredBackup.reviews, backup.reviews)
          stage = 'deepen a shallow report'
          await page.getByRole('button', { name: 'Deepen review', exact: true }).click()
          await page.getByRole('button', { name: 'Review Game', exact: true }).waitFor()
          assert.match(await page.getByTestId('review-run-summary').innerText(), /Completed review.*Target depth 10/)
          assert.equal(await page.getByTestId('review-depth-guidance').count(), 0)
          stage = 'graph explanation'
          const guide = page.locator('.graph-estimate-guide')
          await guide.locator('summary').focus()
          await page.keyboard.press('Enter')
          assert.notEqual(await guide.getAttribute('open'), null)
          assert.match(await guide.innerText(), /human games/)
          assert.match(await guide.innerText(), /strong engines/)
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
          await page.keyboard.press('Enter')
          assert.equal(await guide.getAttribute('open'), null)
          stage = 'enlarged text and reading space'
          await page.evaluate(() => {
            document.documentElement.style.fontSize = '32px'
            document.querySelector('.main-container').scrollTop = 0
            document.querySelector('.right .panel-inner').scrollTop = 0
          })
          await page.waitForTimeout(400)
          const boardFits = await page.evaluate(() => {
            const board = document.querySelector('.board-surface').getBoundingClientRect()
            const main = document.querySelector('.main-container').getBoundingClientRect()
            const stage = document.querySelector('.board-stage')
            const stageRect = stage.getBoundingClientRect()
            return (board.bottom <= main.bottom + 1 || (getComputedStyle(stage).overflowY === 'auto' && stage.scrollHeight > stage.clientHeight))
              && board.left >= stageRect.left && board.right <= stageRect.right + 1
              && document.documentElement.scrollWidth <= innerWidth
          })
          assert.equal(boardFits, true, 'text-only enlargement clips the board without a way to reach it')
          // Opening labels can make the minimum-size board taller than its
          // stage even with compact toolbars. Keyboard focus must reveal both
          // ends completely, including a piece that was already partly visible.
          for (const square of ['a8', 'h1']) {
            const target = page.locator(`[data-square="${square}"] [role="button"]`)
            await target.focus()
            const visible = await target.evaluate(el => {
              const r = el.getBoundingClientRect(), main = document.querySelector('.main-container').getBoundingClientRect()
              return { top: r.top, bottom: r.bottom, mainTop: main.top, mainBottom: main.bottom,
                hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }
            })
            assert(visible.top >= visible.mainTop && visible.bottom <= visible.mainBottom + 1 && visible.hit,
              `enlarged board square ${square} cannot be reached: ${JSON.stringify(visible)}`)
          }
          await page.getByRole('button', { name: 'Review Game', exact: true }).focus()
          const focusFits = await page.getByRole('button', { name: 'Review Game', exact: true }).evaluate(el => {
            const rect = el.getBoundingClientRect(), main = document.querySelector('.main-container').getBoundingClientRect()
            const header = document.querySelector('.analysis-header')
            return rect.top >= main.top && rect.bottom <= main.bottom + 1 && getComputedStyle(header).position !== 'sticky'
          })
          assert.equal(focusFits, true, 'enlarged header obscures the focused review control')
          await page.screenshot({ path: path.join(output, `${name}-${width}-large-text.png`) })
          stage = 'repetition review with real Stockfish'
          await page.evaluate(() => { document.documentElement.style.fontSize = '' })
          await page.getByRole('button', { name: 'Open PGN and FEN dialog', exact: true }).click()
          await page.locator('.dialog-section textarea').first().fill('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2')
          await page.getByRole('button', { name: 'Import & Analyze', exact: true }).click()
          await page.getByRole('button', { name: 'Review', exact: true }).click()
          const depthTenSearches = () => page.evaluate(() => window.__smokeCommands.filter(command => command === 'go depth 10').length)
          const repetitionBefore = await depthTenSearches()
          await page.getByRole('button', { name: 'Fresh review', exact: true }).click()
          await page.getByTestId('review-run-summary').filter({ hasText: 'Completed review' }).waitFor()
          assert.equal(await depthTenSearches() - repetitionBefore, 8, 'known repetition consumed an engine search')
          assert.equal(await page.locator('.eval-bar-label').innerText(), '½-½')
          await page.getByRole('button', { name: 'Save review', exact: true }).click()
          await page.getByText('Review saved on this device.', { exact: false }).waitFor()
          const repetitionId = await page.getByLabel('Choose a saved review').inputValue()
          await page.getByRole('button', { name: 'Use saved review', exact: true }).click()
          await page.getByText('Saved review opened.', { exact: false }).waitFor()
          assert.match(await page.locator('.saved-review-description').innerText(), /8\/8 positions/)
          const repetitionDownload = page.waitForEvent('download')
          await page.getByRole('button', { name: 'Export review backup', exact: true }).click()
          const repetitionBackup = JSON.parse(fs.readFileSync(await (await repetitionDownload).path(), 'utf8'))
          const repetitionRun = repetitionBackup.reviews.find(run => run.id === repetitionId)
          assert.equal(repetitionRun.total, 8)
          assert.equal(repetitionRun.evaluations.length, 8)
          assert.equal(repetitionRun.settings.depth, 10)
          const rerunBefore = await depthTenSearches()
          await page.getByRole('button', { name: 'Review Game', exact: true }).click()
          await page.getByTestId('review-run-summary').filter({ hasText: '8 positions reused' }).waitFor()
          assert.equal(await depthTenSearches(), rerunBefore, 'reopening lost reusable real-engine readings')
          assert.deepEqual(errors, [])
          results.push({ browser: name, width, status: 'passed', source, positionScore: before,
            isolated: await page.evaluate(() => crossOriginIsolated), checks: ['real UCI search', 'restricted score isolation', 'producer identity', 'responsive layout', 'modal editing', 'e2-e4', 'shared console options', 'game review', 'fresh depth-6 review', 'shallow review PGN download', 'deepen review', 'save and reopen review', 'same-report comparison', 'full saved-review backup and restore', 'keyboard chart explanation', '200% text without window resize', 'enlarged panel keyboard focus', 'repetition review: eight depth-10 searches, save, reopen, backup and reuse'] })
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
