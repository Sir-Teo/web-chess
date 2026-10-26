/**
 * Real Stockfish must receive the search limits validated by Engine Lab.
 * Start a dev/preview server, then set SMOKE_URL and SMOKE_BROWSERS as needed.
 * A watchdog stops any search that unexpectedly loses its depth limit.
 */
const assert = require('node:assert/strict')
const { chromium, firefox, webkit } = require('playwright')

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4324/web-chess/'
const browsers = { chromium, firefox, webkit }
const cases = [
  ['go depth\u00a01', 'go depth 1'],
  ['go\u202fdepth\u20091', 'go depth 1'],
  ['go\tdepth\t1', 'go depth 1'],
  ['go depth\u00a01 searchmoves e2e4', 'go depth 1 searchmoves e2e4'],
]

async function check(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.addInitScript(() => {
      localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({
        workspaceMode: 'analysis', analysisExperience: 'pro', analysisTab: 'engine-lab',
        autoAnalyze: false, continuousAnalysis: false, engineProfile: 'lite-single-local', expertModeEnabled: false,
      }))
      window.__nativeConsoleCommands = []
      window.__nativeConsoleReplies = []
      window.__nativeConsoleWatchdog = []
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', event => {
            const line = String(event.data)
            window.__nativeConsoleReplies.push(line)
            if (line.startsWith('bestmove')) window.clearTimeout(this.searchWatchdog)
          })
        }
        postMessage(message, ...rest) {
          if (typeof message === 'string') {
            window.__nativeConsoleCommands.push(message)
            if (/^go\b/.test(message)) {
              window.clearTimeout(this.searchWatchdog)
              this.searchWatchdog = window.setTimeout(() => {
                window.__nativeConsoleWatchdog.push(message)
                NativeWorker.prototype.postMessage.call(this, 'stop')
              }, 2000)
            }
          }
          return super.postMessage(message, ...rest)
        }
        terminate() {
          window.clearTimeout(this.searchWatchdog)
          return super.terminate()
        }
      }
    })
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('.bottom .status')?.textContent === 'ready', null, { timeout: 90_000 })
    const command = page.getByRole('textbox', { name: 'UCI command', exact: true })
    const output = page.getByRole('region', { name: 'UCI console output', exact: true })
    const searches = []
    for (const [raw, expected] of cases) {
      const before = await page.evaluate(() => window.__nativeConsoleCommands.length)
      await command.fill(raw)
      await command.press('Enter')
      await page.waitForFunction(() => document.querySelector('[aria-label="UCI command"]')?.value === '', null, { timeout: 12_000 })
      const sent = await page.evaluate(before => window.__nativeConsoleCommands.slice(before).filter(text => /^go\b/.test(text)), before)
      const text = await output.textContent()
      const depths = [...text.matchAll(/\bdepth (\d+)/g)].map(match => Number(match[1]))
      assert.deepEqual(sent, [expected], 'the app dispatched different tokens from its validated limit')
      assert(text.includes('bestmove'), 'the native search did not complete')
      assert.equal(Math.max(...depths), 1, 'the native engine searched beyond the requested depth')
      assert.deepEqual(await page.evaluate(() => window.__nativeConsoleWatchdog), [], 'the probe had to stop an unbounded search')
      assert.equal(await page.getByRole('alert').count(), 0, 'bounded pasted search raised an app error')
      searches.push({ raw, dispatched: sent[0], maxDepth: Math.max(...depths) })
    }
    const engine = await page.evaluate(() => window.__nativeConsoleReplies.find(text => text.startsWith('id name ')))
    assert(engine?.includes('Stockfish 18'), 'the smoke test did not use real Stockfish 18')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ browser: name, engine, base: BASE, searches, watchdogStops: [] }, null, 2))
  } finally {
    await page.close()
  }
}

async function main() {
  for (const name of (process.env.SMOKE_BROWSERS || 'chromium').split(',')) {
    assert(browsers[name], `Unknown browser: ${name}`)
    const browser = await browsers[name].launch()
    try { await check(browser, name) } finally { await browser.close() }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
