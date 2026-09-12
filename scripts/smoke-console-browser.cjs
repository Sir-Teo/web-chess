/** Real Stockfish console ownership and shortcuts. Build and start preview first. */
const { chromium, firefox, webkit } = require('playwright')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const base = process.env.SMOKE_URL || 'http://127.0.0.1:4324/web-chess/'
const output = process.env.SMOKE_OUTPUT || '/tmp/web-chess-console-smoke'
const browsers = { chromium, firefox, webkit }

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const report = {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    base, results: [],
  }
  try {
    for (const name of (process.env.SMOKE_BROWSERS || 'chromium,firefox,webkit').split(',')) {
      assert(browsers[name], `Unknown browser: ${name}`)
      const browser = await browsers[name].launch()
      try {
        for (const width of (process.env.SMOKE_WIDTHS || '1280,375').split(',').map(Number)) {
          assert(Number.isInteger(width) && width >= 320, 'Invalid viewport width')
          const page = await browser.newPage({ viewport: { width, height: 812 }, reducedMotion: 'reduce' })
          const result = { browser: name, width, stage: 'boot', errors: [] }
          report.results.push(result)
          page.on('pageerror', error => result.errors.push(error.message))
          try {
            await page.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//, route => route.fulfill({ status: 404, body: '{}' }))
            await page.addInitScript(() => {
              window.__consoleVisibility = 'visible'
              Object.defineProperty(document, 'visibilityState', { get: () => window.__consoleVisibility })
              Object.defineProperty(document, 'hidden', { get: () => window.__consoleVisibility === 'hidden' })
              window.__setConsoleVisibility = value => { window.__consoleVisibility = value; document.dispatchEvent(new Event('visibilitychange')) }
              localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({
                workspaceMode: 'analysis', analysisExperience: 'pro', analysisTab: 'engine-lab', autoAnalyze: false,
                engineProfile: 'lite-single-local', analyzeMode: 'deep', searchDepth: 12, expertModeEnabled: false,
              }))
              window.__consoleEvents = []
              const NativeWorker = Worker
              window.Worker = class extends NativeWorker {
                constructor(...args) {
                  super(...args)
                  this.addEventListener('message', event => {
                    if (typeof event.data === 'string') window.__consoleEvents.push({ kind: 'received', line: event.data })
                  })
                }
                postMessage(data, ...args) {
                  if (typeof data === 'string') window.__consoleEvents.push({ kind: 'sent', line: data })
                  return super.postMessage(data, ...args)
                }
              }
            })
            await page.goto(base, { waitUntil: 'domcontentloaded' })
            await page.waitForFunction(() => document.querySelector('.bottom .status')?.textContent === 'ready')
            const command = page.getByRole('textbox', { name: 'UCI command', exact: true })
            result.stage = 'console to board handoff'
            await command.fill('position\tfen rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
            await command.press('Enter')
            await page.waitForFunction(() => document.querySelector('[aria-label="UCI command"]')?.value === '')
            await command.fill('go\tmovetime\t5000')
            await command.press('Enter')
            await page.waitForFunction(() => window.__consoleEvents.some(event => event.kind === 'received' && event.line.startsWith('info depth ')))
            assert.equal(await page.locator('.bottom .status').textContent(), 'analyzing')
            await page.getByRole('button', { name: 'Analyze', exact: true }).click()
            assert.equal(await page.locator('.pv-list article').count(), 0, 'console scores entered board analysis')
            await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
            await page.waitForFunction(() => document.querySelector('.bottom .status')?.textContent === 'ready'
              && document.querySelector('.pv-list article')?.textContent.includes('D12'))
            const events = await page.evaluate(() => window.__consoleEvents)
            const rawGo = events.findIndex(event => event.kind === 'sent' && event.line === 'go\tmovetime\t5000')
            const stop = events.findIndex((event, i) => i > rawGo && event.kind === 'sent' && event.line === 'stop')
            const oldBestmove = events.findIndex((event, i) => i > rawGo && event.kind === 'received' && event.line.startsWith('bestmove '))
            const nextPosition = events.findIndex((event, i) => i > rawGo && event.kind === 'sent' && event.line.startsWith('position '))
            assert(rawGo >= 0 && stop > rawGo && oldBestmove > stop && nextPosition > oldBestmove, 'new position was sent before stop acknowledgement')
            assert.match(events[nextPosition].line, /rnbqkbnr/)
            assert(events.slice(nextPosition).some(event => event.kind === 'sent' && event.line === 'go depth 12'))
            // Off-screen PV cards use content-visibility:auto. innerText can
            // omit them depending on scroll position even when the DOM agrees.
            result.boardLines = await page.locator('.pv-list').textContent()
            await page.screenshot({ path: path.join(output, `${name}-${width}-handoff.png`) })
            result.stage = 'real perft shortcut'
            await page.getByRole('button', { name: 'Engine Lab', exact: true }).click()
            await command.fill('position startpos')
            await command.press('Enter')
            await page.waitForFunction(() => document.querySelector('[aria-label="UCI command"]')?.value === '')
            await page.getByRole('checkbox', { name: 'Enable expert engine commands', exact: true }).check()
            await page.getByRole('button', { name: 'perft 3', exact: true }).click()
            await page.getByLabel('UCI console output', { exact: true }).filter({ hasText: 'Nodes searched: 8902' }).waitFor()
            await page.waitForFunction(() => document.querySelector('.bottom .status')?.textContent === 'ready')
            result.perftOutput = await page.getByLabel('UCI console output', { exact: true }).innerText()
            result.stage = 'five-second search completion'
            await page.getByRole('button', { name: '5s search', exact: true }).click()
            await page.getByLabel('UCI console output', { exact: true }).filter({ hasText: 'bestmove ' }).waitFor()
            await page.waitForFunction(() => document.querySelector('.bottom .status')?.textContent === 'ready')
            await page.getByRole('button', { name: 'Analyze', exact: true }).click()
            assert.equal(await page.locator('.pv-list').textContent(), result.boardLines, 'console completion changed retained board lines')
            result.stage = 'unbounded console visibility'
            await page.getByRole('button', { name: 'Engine Lab', exact: true }).click()
            const unbounded = 'go infinite searchmoves e2e4'
            await command.fill(unbounded)
            await command.press('Enter')
            await page.waitForFunction(() => document.querySelector('[aria-label="UCI console output"]')?.textContent.includes('info depth '))
            await page.evaluate(() => window.__setConsoleVisibility('hidden'))
            await page.waitForFunction(() => document.querySelector('.bottom .status')?.textContent === 'paused')
            assert.equal(await command.inputValue(), unbounded, 'parking completed the command')
            await page.screenshot({ path: path.join(output, `${name}-${width}-paused.png`) })
            await page.evaluate(() => window.__setConsoleVisibility('visible'))
            await page.waitForFunction(command => window.__consoleEvents.filter(e => e.kind === 'sent' && e.line === command).length === 2, unbounded)
            await page.getByRole('button', { name: 'Stop engine search', exact: true }).click()
            await page.waitForFunction(() => document.querySelector('.bottom .status')?.textContent === 'ready')
            await page.evaluate(() => { window.__setConsoleVisibility('hidden'); window.__setConsoleVisibility('visible') })
            assert.equal(await page.evaluate(command => window.__consoleEvents.filter(e => e.kind === 'sent' && e.line === command).length, unbounded), 2, 'stopped console search restarted')
            await page.getByRole('button', { name: 'Analyze', exact: true }).click()
            assert.equal(await page.locator('.pv-list').textContent(), result.boardLines, 'resumed console search changed board readings')
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
            assert.deepEqual(result.errors, [])
            result.stage = 'passed'
            console.log(`${name} ${width}px: real console stop/ack handoff, D12 board search, perft 8902, five-second search, unbounded visibility pause/resume/Stop and retained board lines passed`)
          } finally {
            result.events = await page.evaluate(() => window.__consoleEvents).catch(() => [])
            await page.close()
          }
        }
      } finally { await browser.close() }
    }
  } finally { fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)) }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
