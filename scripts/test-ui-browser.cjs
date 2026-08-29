/**
 * The first test in this repo that clicks anything.
 *
 * Everything else here is either a unit test over a pure module or a component
 * rendered to static markup — fast, cheap, and unable to press a button. That
 * left a gap exactly where the interesting failures live: the wiring between a
 * review, the engine, and the panel that reports it. Both siblings cover that
 * tier; web-katrain with a viewport script, web-xiangqi with a Playwright
 * harness.
 *
 * The portable idea is borrowed from web-xiangqi's `test-ui-layout.cjs`: inject
 * a fake engine before the app boots, so the UI can be driven in a real browser
 * without WASM, without a 7MB download, and without a search whose output
 * changes between runs. Here the seam is `new Worker`, which is how
 * `engine/stockfishWorker.ts` reaches Stockfish and the only place this app
 * constructs a worker at all.
 *
 * Usage: npm run test:ui:browser   (needs `npm run test:ui:install` once)
 */
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const PORT = Number(process.env.UI_TEST_PORT || 4319)
// A second server that sends no COOP/COEP, the way GitHub Pages does.
const BARE_PORT = PORT + 1
const BASE = `http://127.0.0.1:${PORT}/web-chess/`
const ROOT = path.resolve(__dirname, '..')

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'never responded'
  while (Date.now() < deadline) {
    try {
      const status = await new Promise((resolve, reject) => {
        const request = http.get(url, response => {
          response.resume()
          resolve(response.statusCode || 0)
        })
        request.on('error', reject)
        request.setTimeout(2000, () => request.destroy(new Error('timeout')))
      })
      if (status >= 200 && status < 500) return
      lastError = `status ${status}`
    } catch (error) {
      lastError = error.message
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  fail(`Timed out waiting for ${url} (${lastError})`)
}

/**
 * A Stockfish that answers instantly and always the same way.
 *
 * It speaks just enough UCI for the app: identify, accept options, and answer
 * every `go` with one info line and a bestmove. The evaluation is derived from
 * the position command so that different positions score differently — a
 * constant would make every move in a review look equally good and the
 * accuracy figure meaningless as an assertion.
 */
function fakeEngineScript(scenario = 'normal') {
  return `
const SCENARIO = ${JSON.stringify(scenario)};
(() => {
  const NativeWorker = window.Worker;
  window.__uciCommands = [];

  function scoreFor(fen) {
    // Deterministic pseudo-eval in [-120, 120], stable for a given position.
    let hash = 0;
    for (let i = 0; i < fen.length; i++) hash = (hash * 31 + fen.charCodeAt(i)) | 0;
    return ((hash % 241) - 120);
  }

  class FakeStockfish {
    constructor() {
      this.onmessage = null;
      this.onerror = null;
      this.listeners = [];
      this.fen = 'startpos';
      this.searching = false;
      this.finishTimer = null;
      this.send('Fake Stockfish ready');
    }
    addEventListener(type, listener) {
      if (type === 'message') this.listeners.push(listener);
    }
    removeEventListener(type, listener) {
      if (type !== 'message') return;
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    }
    /**
     * A real worker answers on a later task, never inside postMessage. Replying
     * synchronously let the app send "stop" before it had seen the reply, which
     * is exactly the ordering bug a fake is supposed not to invent.
     */
    send(data) {
      setTimeout(() => {
        const event = { data };
        if (typeof this.onmessage === 'function') this.onmessage(event);
        for (const listener of this.listeners.slice()) listener(event);
      }, 0);
    }
    emitInfo() {
      const cp = scoreFor(this.fen);
      this.send('info depth 16 seldepth 20 multipv 1 score cp ' + cp +
                ' nodes 120000 nps 900000 time 130 wdl 400 400 200 pv e2e4 e7e5');
      this.send('info depth 22 seldepth 26 multipv 1 score cp ' + cp +
                ' nodes 400000 nps 900000 time 420 wdl 400 400 200 pv e2e4 e7e5');
      if (SCENARIO === 'bounded-last') {
        // A fail-high re-search at the same depth, with more nodes behind it,
        // arriving after the exact line and before the search is stopped. This
        // is the shape that used to overwrite the evaluation with a bound.
        this.send('info depth 22 seldepth 30 multipv 1 score cp 900 lowerbound' +
                  ' nodes 900000 nps 900000 time 600 pv e2e4 e7e5');
      }
    }
    finishSearch() {
      if (!this.searching) return;
      this.searching = false;
      if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = null; }
      this.send('bestmove e2e4 ponder e7e5');
    }
    postMessage(command) {
      const text = String(command);
      window.__uciCommands.push(text);
      if (text === 'uci') {
        this.send('id name Fake Stockfish');
        this.send('option name Threads type spin default 1 min 1 max 8');
        this.send('option name Hash type spin default 16 min 1 max 512');
        this.send('option name MultiPV type spin default 1 min 1 max 8');
        this.send('option name UCI_ShowWDL type check default false');
        this.send('uciok');
        return;
      }
      if (text === 'isready') { this.send('readyok'); return; }
      if (text.startsWith('position')) { this.fen = text; return; }
      if (text.startsWith('go')) {
        this.searching = true;
        this.emitInfo();
        // A search ends on its own, or early when the app says stop. Both
        // finish with a bestmove, which is what the app waits for.
        this.finishTimer = setTimeout(() => this.finishSearch(), 15);
        return;
      }
      if (text === 'stop') { this.finishSearch(); return; }
    }
    terminate() {
      if (this.finishTimer) clearTimeout(this.finishTimer);
      this.listeners.length = 0;
    }
  }

  window.__workerUrls = [];
  window.Worker = function Worker(url, options) {
    const target = String(url);
    window.__workerUrls.push(target.slice(0, 60));
    // Only the engine is faked; anything else the app or Vite starts is real.
    if (target.startsWith('blob:') || target.includes('stockfish')) return new FakeStockfish();
    return new NativeWorker(url, options);
  };
  window.Worker.prototype = FakeStockfish.prototype;
})();
`
}


/**
 * The engine's last word before a stop is a bound, not a value.
 *
 * `score cp 900 lowerbound` means "at least 900", and it arrives from an
 * aspiration re-search with more nodes behind it than the exact line it
 * follows. The app used to compare the two on node count and keep the bound,
 * so a position evaluated at +3 was displayed at +9. This drives that exact
 * sequence through the real UI, which is the thing a unit test on the
 * comparison function cannot do.
 */
async function checkBoundedScoreIsIgnored(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript('bounded-last'))
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()

    await page.waitForFunction(() => (window.__uciCommands || []).some(c => c.startsWith('go')),
                               null, { timeout: 20000 })
    await page.waitForFunction(() => {
      const label = document.querySelector('.eval-bar-label')
      return Boolean(label && label.textContent && label.textContent.trim())
    }, null, { timeout: 20000 })

    const shown = await page.evaluate(() => document.querySelector('.eval-bar-label').textContent.trim())
    const value = Math.abs(Number.parseFloat(shown.replace(/[^0-9.+-]/g, '')))
    assert(Number.isFinite(value), `the eval bar read "${shown}", which is not a number`)
    assert(value < 8,
      `the eval bar read "${shown}": the engine's bounded "at least 900" was taken as an evaluation`)
    console.log(`  bounded score: eval bar reads ${shown}, not the bound`)
  } finally {
    await context.close()
  }
}


/**
 * Cross-origin isolation on a host that does not send the headers.
 *
 * Multi-threaded Stockfish needs `SharedArrayBuffer`, which browsers only
 * expose to a cross-origin-isolated page. GitHub Pages cannot set COOP/COEP,
 * so this app ships `coi-serviceworker`: it registers a worker that adds the
 * headers to its own responses and reloads once, and that is the only reason
 * the threaded engine profiles are reachable on the deployed site.
 *
 * Nothing covered it. `vite preview` sets the headers itself, so every other
 * check here runs isolated whatever the service worker does -- which is
 * precisely why breaking it would be silent: the engine would quietly fall
 * back to single-threaded with no error anywhere.
 *
 * This serves the build with no COOP/COEP at all, the way Pages does, and
 * asserts the page ends up isolated anyway. It is the guard that makes the
 * offline-caching work in docs/cross-app-second-pass.md safe to attempt: that
 * merge has to fold caching into this worker's fetch handler, and a second
 * worker registered at the same scope replaces the first.
 */
async function checkCrossOriginIsolationIsRestored(browser) {
  const dist = path.join(ROOT, 'dist')
  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.txt': 'text/plain',
  }
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${BARE_PORT}`)
    let filePath = decodeURIComponent(url.pathname).replace(/^\/web-chess\/?/, '') || 'index.html'
    if (filePath.endsWith('/')) filePath += 'index.html'
    const resolved = path.join(dist, filePath)
    // Deliberately no Cross-Origin-Opener-Policy or -Embedder-Policy here.
    fs.readFile(resolved, (error, body) => {
      if (error) {
        response.writeHead(404).end('not found')
        return
      }
      response.writeHead(200, { 'Content-Type': types[path.extname(resolved)] || 'application/octet-stream' })
      response.end(body)
    })
  })
  await new Promise(resolve => server.listen(BARE_PORT, '127.0.0.1', resolve))

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    const bare = `http://127.0.0.1:${BARE_PORT}/web-chess/`
    await page.goto(bare, { waitUntil: 'domcontentloaded' })

    // The worker registers and reloads the page once; give it that round trip.
    await page.waitForFunction(() => self.crossOriginIsolated === true, null, { timeout: 30000 })
      .catch(() => {})

    const state = await page.evaluate(() => ({
      isolated: self.crossOriginIsolated === true,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      controlled: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
    }))

    assert(state.controlled, 'the COI service worker never took control on a host without the headers')
    assert(state.isolated,
      'the page is not cross-origin isolated: multi-threaded Stockfish is unreachable on GitHub Pages')
    assert(state.sharedArrayBuffer, 'SharedArrayBuffer is missing even though the page reports isolation')
    console.log('  headerless host: service worker restored cross-origin isolation')
  } finally {
    await context.close()
    await new Promise(resolve => server.close(resolve))
  }
}

async function main() {
  const { chromium } = require('playwright')

  // `preview` serves whatever is in dist/, so this always builds first.
  //
  // It used to build only when dist/ was missing, which is a worse bug than it
  // sounds: with a build already present the test silently exercised the
  // previous commit. That cost a real debugging detour -- a fix was in the
  // source, the browser kept showing the defect, and the code looked wrong when
  // it was the artifact that was old. A test that can report on code other than
  // the code in front of you is not a test. The build is half a second.
  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
  if (build.status !== 0) fail('build failed')

  const preview = spawn(
    'npm',
    ['run', 'preview', '--', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const previewLog = []
  preview.stdout.on('data', chunk => previewLog.push(String(chunk)))
  preview.stderr.on('data', chunk => previewLog.push(String(chunk)))

  let browser
  try {
    await waitForHttp(BASE, 30000)
    browser = await chromium.launch()

    const scenario = 'normal'
    // Landscape phone is included because it is the size layouts break at and
    // the one nobody looks at: the board has to stay square while three columns
    // share 390px of height. It was checked by hand across all three sibling
    // apps once; this is that check kept.
    const viewports = [
      { width: 1280, height: 800, name: 'desktop' },
      { width: 375, height: 812, name: 'mobile' },
      { width: 844, height: 390, name: 'mobile landscape' },
    ]
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
      const page = await context.newPage()

      const pageErrors = []
      page.on('pageerror', error => pageErrors.push(String(error)))
      page.on('console', message => {
        if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`)
      })

      await page.addInitScript(fakeEngineScript(scenario))
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })

      // A previous run's auto-save would otherwise open a dialog over everything.
      const startFresh = page.getByRole('button', { name: /start fresh/i })
      if (await startFresh.count()) await startFresh.first().click()

      // The app opens in Play mode with the engine on standby, so nothing
      // constructs a worker until Analysis is chosen. Clicking it is the point:
      // this is the first test here that drives the app the way a reader does.
      await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()

      // Then wait for the handshake rather than for any particular pixel.
      await page.waitForFunction(() => (window.__uciCommands || []).includes('uciok') ||
                                       (window.__uciCommands || []).includes('uci'),
                                 null, { timeout: 20000 }).catch(() => {})

      const commands = await page.evaluate(() => window.__uciCommands || [])
      if (!commands.includes('uci')) {
        const debug = await page.evaluate(() => ({
          workers: window.__workerUrls || [],
          isolated: self.crossOriginIsolated,
          sw: navigator.serviceWorker ? navigator.serviceWorker.controller ? 'controlled' : 'registered-or-none' : 'unsupported',
          status: document.body.innerText.split('\n').filter(l => /engine|ready|loading|error/i.test(l)).slice(0, 5),
        }))
        console.error('  debug:', JSON.stringify(debug))
      }
      assert(commands.includes('uci'), `${viewport.name}: the app never sent "uci" to the engine`)
      assert(commands.includes('isready'), `${viewport.name}: the app never sent "isready"`)

      assert(pageErrors.length === 0, `${viewport.name}: page errors: ${pageErrors.join(' | ')}`)

      // Nothing may stick out sideways at either size.
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      assert(!overflows, `${viewport.name}: the page scrolls horizontally`)

      // Every visible control has a name a screen reader can read.
      const unnamed = await page.evaluate(() => [...document.querySelectorAll('button')]
        .filter(el => el.offsetParent !== null && el.getBoundingClientRect().width > 0)
        .filter(el => !(el.getAttribute('aria-label') || el.textContent.trim() || el.title))
        .map(el => el.className)
        .slice(0, 5))
      assert(unnamed.length === 0, `${viewport.name}: buttons with no accessible name: ${unnamed.join(', ')}`)

      // The whole point of the tier: a review, driven through the UI, against
      // an engine that answers the same way every time. Desktop only -- the
      // mobile layout reaches the same code through a different set of taps,
      // and one path proving the chain is what this is for.
      if (viewport.name === 'desktop') {
        // Named "Load <white> vs <black>, <event>", so match the prefix.
        const load = page.getByRole('button', { name: /^Load / }).first()
        await load.waitFor({ timeout: 10000 })
        await load.click()

        // Wait for the game to actually be loaded before switching tabs;
        // clicking Review first leaves nothing for Review Game to act on. The
        // header carries the players once the PGN is in the tree.
        await page.waitForFunction(
          () => /Carlsen/.test(document.body.innerText) && /\bMove\s+\d\d/.test(document.body.innerText),
          null, { timeout: 15000 })

        await page.getByRole('button', { name: 'Review', exact: true }).first().click()
        const reviewGame = page.getByRole('button', { name: /^review game$/i }).first()
        await reviewGame.waitFor({ timeout: 10000 })
        await reviewGame.click()

        // Every move evaluated, not merely some.
        try {
          await page.waitForFunction(() => {
            const match = document.body.innerText.match(/EVALUATED\s+(\d+)\s*\/\s*(\d+)/i)
            return Boolean(match) && match[1] === match[2] && Number(match[2]) > 0
          }, null, { timeout: 120000 })
        } catch (error) {
          const debug = await page.evaluate(() => ({
            evaluated: (document.body.innerText.match(/EVALUATED[^\n]*/i) || [''])[0],
            commands: (window.__uciCommands || []).length,
            lastCommands: (window.__uciCommands || []).slice(-6),
            status: document.body.innerText.split('\n').filter(l => /review|engine|deeper/i.test(l)).slice(0, 4),
          }))
          console.error('  review debug:', JSON.stringify(debug))
          throw error
        }

        // Read the summary out of its own container rather than by regexing
        // the whole page: "White" and "Black" are also filter buttons, and a
        // page-wide match picked up their counts instead of the accuracies.
        const report = await page.evaluate(() => {
          const panel = document.querySelector('.accuracy-summary')
          if (!panel) return null
          const stats = {}
          for (const row of panel.children) {
            const label = row.querySelector('span')?.textContent?.trim().toLowerCase()
            const value = row.querySelector('strong')?.textContent?.trim()
            if (label) stats[label] = value
          }
          const text = document.body.innerText
          const labelTotal = ['Best', 'Good', 'Inaccuracy', 'Mistake', 'Blunder']
            .map(label => {
              const match = text.match(new RegExp(label + '\\s+(\\d+)'))
              return match ? Number(match[1]) : 0
            })
            .reduce((sum, count) => sum + count, 0)
          return { stats, labelTotal }
        })

        assert(report, 'the review panel never rendered an accuracy summary')
        const evaluated = String(report.stats.evaluated || '')
        const [done, total] = evaluated.split('/').map(Number)
        const accuracy = name => Number.parseFloat(String(report.stats[name] || ''))
        const summary = {
          moves: total,
          done,
          overall: accuracy('overall'),
          white: accuracy('white'),
          black: accuracy('black'),
          acpl: Number.parseFloat(String(report.stats.acpl || '')),
          labels: report.labelTotal,
        }

        assert(summary.moves > 20, `review covered only ${summary.moves} moves`)
        assert(summary.done === summary.moves, `only ${summary.done} of ${summary.moves} moves were evaluated`)
        for (const name of ['overall', 'white', 'black']) {
          const value = summary[name]
          assert(Number.isFinite(value), `${name} accuracy is not a number: ${report.stats[name]}`)
          assert(value >= 0 && value <= 100, `${name} accuracy ${value} is outside 0-100`)
        }
        // Both sides played the same fake engine's evaluations, so neither can
        // be far from the other; a large gap would mean the sides were mixed up.
        assert(Math.abs(summary.white - summary.black) < 40,
          `white ${summary.white} and black ${summary.black} are implausibly far apart`)
        assert(Number.isFinite(summary.acpl) && summary.acpl >= 0, `ACPL ${summary.acpl} is not a sane average`)
        assert(summary.labels === summary.moves,
          `move labels total ${summary.labels} but ${summary.moves} moves were evaluated`)

        console.log(`  review: ${summary.moves} moves, overall ${summary.overall}, ` +
                    `white ${summary.white}, black ${summary.black}, ACPL ${summary.acpl}`)
      }

      // A chessboard that is not square is the most obvious possible bug and
      // the easiest to miss in a screenshot at this size.
      const board = await page.evaluate(() => {
        const area = document.querySelector('.board-area')
        if (!area) return null
        const rect = area.getBoundingClientRect()
        return { width: Math.round(rect.width), height: Math.round(rect.height) }
      })
      assert(board, `${viewport.name}: no board on the page`)
      assert(Math.abs(board.width - board.height) <= 1,
        `${viewport.name}: the board is ${board.width}x${board.height}, which is not square`)
      assert(board.width > 100, `${viewport.name}: the board collapsed to ${board.width}px`)

      // Command+F must reach the browser. It used to flip the board and call
      // preventDefault(), so Find could not be opened on this page at all.
      const chords = await page.evaluate(() => {
        const fire = (init) => {
          const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
          document.body.dispatchEvent(event)
          return event.defaultPrevented
        }
        return {
          metaF: fire({ key: 'f', metaKey: true }),
          ctrlF: fire({ key: 'f', ctrlKey: true }),
          altLeft: fire({ key: 'ArrowLeft', altKey: true }),
          plainLeft: fire({ key: 'ArrowLeft' }),
        }
      })
      assert(!chords.metaF, `${viewport.name}: Command+F was swallowed by the app`)
      assert(!chords.ctrlF, `${viewport.name}: Control+F was swallowed by the app`)
      assert(!chords.altLeft, `${viewport.name}: Alt+Left was swallowed instead of going back`)
      assert(chords.plainLeft, `${viewport.name}: the plain Left shortcut stopped working`)

      await context.close()
      console.log(`  ${viewport.name}: boot, engine handshake, layout, control names, ` +
                  `board ${board.width}x${board.height} OK`)
    }

    await checkBoundedScoreIsIgnored(browser)
    await checkCrossOriginIsolationIsRestored(browser)

    console.log('Browser UI checks passed.')
  } finally {
    if (browser) await browser.close().catch(() => {})
    preview.kill('SIGTERM')
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
