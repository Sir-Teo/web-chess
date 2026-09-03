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
  window.__uciBestmoves = 0;

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
                ' nodes 120000 nps 900000 hashfull 45 tbhits 0 time 130 wdl 400 400 200 pv e2e4 e7e5');
      this.send('info depth 22 seldepth 26 multipv 1 score cp ' + cp +
                ' nodes 400000 nps 900000 hashfull 127 tbhits 3 time 420 wdl 400 400 200 pv e2e4 e7e5');
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
      window.__uciBestmoves += 1;
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
        if (SCENARIO !== 'hold-search') {
          this.finishTimer = setTimeout(() => this.finishSearch(), 15);
        }
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
 * An infinite analysis must not keep every configured Stockfish thread busy
 * after the page disappears. The newest request is held and restarted when
 * the page becomes visible again; a plain stop would save the CPU but leave a
 * reader returning to a mysteriously idle analysis board.
 *
 * Only an unbounded search, though. A finite one is left to finish: the game
 * review counts a position as reviewed the moment the engine goes ready, and
 * a review left running behind another tab used to come back with positions
 * graded at whatever depth the tab switch caught them. So the first half of
 * this check hides the page during the auto-analyze `go depth 16` and expects
 * *no* stop; the second switches to Infinite and expects one.
 */
async function checkHiddenAnalysisPausesAndResumes(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(() => {
      window.__testVisibilityState = 'visible'
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => window.__testVisibilityState,
      })
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => window.__testVisibilityState === 'hidden',
      })
      window.__setTestVisibility = state => {
        window.__testVisibilityState = state
        document.dispatchEvent(new Event('visibilitychange'))
      }
    })
    await page.addInitScript(fakeEngineScript('hold-search'))
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.waitForFunction(() => (window.__uciCommands || []).filter(c => c.startsWith('go')).length === 1,
                               null, { timeout: 20000 })

    // A finite search, hidden mid-way, is left to finish.
    await page.evaluate(() => window.__setTestVisibility('hidden'))
    await page.waitForTimeout(800)
    const stopsWhileFinite = await page.evaluate(() => (window.__uciCommands || []).filter(c => c === 'stop').length)
    const traceSoFar = await page.evaluate(() => (window.__uciCommands || []).slice())
    assert(stopsWhileFinite === 0,
      `hiding the page stopped a finite search: ${stopsWhileFinite} stop(s): ${traceSoFar.join(' | ')}`)
    await page.evaluate(() => window.__setTestVisibility('visible'))

    // An unbounded one is parked, and comes back.
    await page.getByRole('button', { name: 'Open settings' }).click()
    await page.getByRole('button', { name: 'Infinite', exact: true }).click()
    // Escape rather than the sheet's Done button: on a desktop viewport the
    // settings are a popover whose header is laid away, so Done measures 0x0
    // and a click on it waits for a visibility that never comes. Escape closes
    // every overlay in the app at every breakpoint.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Run analysis' }).click()
    // Replacing the held auto search costs one stop of its own; the infinite
    // search is the second go.
    await page.waitForFunction(() => (window.__uciCommands || []).filter(c => c.startsWith('go')).length === 2,
                               null, { timeout: 5000 })

    await page.evaluate(() => window.__setTestVisibility('hidden'))
    await page.waitForFunction(() => (window.__uciCommands || []).filter(c => c === 'stop').length === 2,
                               null, { timeout: 5000 })
    await page.evaluate(() => window.__setTestVisibility('visible'))
    await page.waitForFunction(() => (window.__uciCommands || []).filter(c => c.startsWith('go')).length === 3,
                               null, { timeout: 5000 })

    const commands = await page.evaluate(() => window.__uciCommands.slice())
    const goCommands = commands.filter(command => command.startsWith('go'))
    assert(goCommands[1] === 'go infinite' && goCommands[2] === 'go infinite',
      `the parked search did not come back as itself: ${goCommands.join(' | ')}`)
    assert(commands.filter(command => command === 'stop').length === 2,
      `visibility pause sent the wrong number of stops: ${commands.join(' | ')}`)
    console.log('  visibility: a finite search is left to finish; an infinite one stops once and resumes')
  } finally {
    await context.close()
  }
}


/**
 * Revisiting a position should restore the exact finite automatic result the
 * engine just completed. History scrubbing is common in analysis, and doing a
 * fresh depth search on every Back/Forward click wastes the worker's dominant
 * CPU cost while briefly blanking information the reader already had.
 */
async function checkAutomaticAnalysisIsReused(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.waitForFunction(() => window.__uciBestmoves >= 1, null, { timeout: 20000 })

    await page.click('#chessboard-square-e2')
    await page.click('#chessboard-square-e4')
    await page.waitForFunction(() => window.__uciBestmoves >= 2, null, { timeout: 20000 })

    // Navigation deliberately deepens both positions from the normal 16-ply
    // auto pass to a 20-ply ponder pass. Complete one such round trip first;
    // reusing the shallower entry would be fast but wrong.
    await page.getByRole('button', { name: 'Go to first position' }).click()
    await page.waitForFunction(() => window.__uciBestmoves >= 3, null, { timeout: 20000 })
    await page.getByRole('button', { name: 'Go to last position' }).click()
    await page.waitForFunction(() => window.__uciBestmoves >= 4, null, { timeout: 20000 })

    const goCountBeforeReturn = await page.evaluate(() =>
      window.__uciCommands.filter(command => command.startsWith('go')).length)
    assert(goCountBeforeReturn === 4,
      `two positions at two depths launched ${goCountBeforeReturn} searches before the cache check`)

    await page.getByRole('button', { name: 'Go to first position' }).click()
    await page.waitForTimeout(800)

    const restored = await page.evaluate(() => ({
      goCount: window.__uciCommands.filter(command => command.startsWith('go')).length,
      searchCommands: window.__uciCommands.filter(command =>
        command.startsWith('position') || command.startsWith('go') || command.startsWith('setoption')),
      hasEvaluation: Boolean(document.querySelector('.pv-list article')),
    }))
    assert(restored.goCount === goCountBeforeReturn,
      `returning to the first position launched search ${restored.goCount} instead of reusing search ${goCountBeforeReturn}: ${restored.searchCommands.join(' | ')}`)
    assert(restored.hasEvaluation, 'the cached position returned without its analysis UI')
    console.log('  analysis cache: returning to a position reuses its completed search')
  } finally {
    await context.close()
  }
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
 * A move played in a game is the game, even when a move was taken back to play
 * it.
 *
 * `addMove` appends a new child last and the main line is the first-child
 * chain, so a move played from a position that already has a continuation
 * becomes a variation. That is right in analysis and was wrong in a game: take
 * a blunder back, play something else, and the *blunder* stayed the main line —
 * which is what the PGN export, the auto-save, the library, Review Game and
 * both graphs all read.
 *
 * It lives here rather than in a unit test because the rule is wiring: which
 * mode the board is in decides it, and no unit test in this repo can drive
 * that. It needs no engine at all — pass and play — so it costs a couple of
 * seconds.
 */
async function checkPlayedMoveBecomesTheGame(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Play', exact: true }).first().click()
    await page.getByRole('button', { name: 'Human vs Human', exact: true }).first().click()

    // Click-to-move, two taps a square, which is the same path a touch device
    // takes and the one that needs no drag emulation.
    const play = async (from, to) => {
      await page.click(`#chessboard-square-${from}`)
      await page.click(`#chessboard-square-${to}`)
      await page.waitForTimeout(150)
    }
    await play('e2', 'e4')
    await play('e7', 'e5')
    await play('g1', 'f3')
    await page.waitForFunction(() => /Nf3/.test(document.body.innerText), null, { timeout: 10000 })

    // Take the last move back and play a different one.
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(250)
    await play('d2', 'd4')
    await page.waitForFunction(() => /d4/.test(document.body.innerText), null, { timeout: 10000 })

    const movetext = await page.evaluate(async () => {
      const open = [...document.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label') === 'Open PGN and FEN dialog')
      open.click()
      await new Promise(resolve => setTimeout(resolve, 800))
      const exportTab = [...document.querySelectorAll('.dialog-panel button')]
        .find(b => /^Export$/.test(b.textContent.trim()))
      if (exportTab) exportTab.click()
      await new Promise(resolve => setTimeout(resolve, 600))
      const text = [...document.querySelectorAll('textarea')]
        .map(area => area.value)
        .find(value => /^\[Event/m.test(value)) || ''
      return (text.split('\n\n')[1] || '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim()
    })

    assert(/2\.\s*d4/.test(movetext),
      `the move played after a takeback is not in the game: ${movetext}`)
    const played = movetext.search(/2\.\s*d4/)
    const abandoned = movetext.search(/\(\s*2\.\s*Nf3/)
    assert(abandoned > played,
      `the move taken back is still the main line: ${movetext}`)
    console.log(`  takeback: the game follows the move played, not the one undone`)
  } finally {
    await context.close()
  }
}


/**
 * Cross-origin isolation on a host that does not send the headers.
 *
 * Multi-threaded Stockfish needs `SharedArrayBuffer`, which browsers only
 * expose to a cross-origin-isolated page. GitHub Pages cannot set COOP/COEP,
 * so this app ships `public/sw.js`: it adds the headers to its own responses
 * and reloads once, and that is the only reason the threaded engine profiles
 * are reachable on the deployed site. The same worker serves the app offline,
 * which is checked below.
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
      const contentType = types[path.extname(resolved)] || 'application/octet-stream'

      // Range is honoured so a real 206 reaches the service worker. Without it
      // the range check below passes against a 200 and proves nothing, which is
      // worse than not having it.
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '')
      if (range) {
        const start = Number(range[1])
        const end = range[2] ? Number(range[2]) : body.length - 1
        if (start < body.length && end >= start) {
          const slice = body.subarray(start, Math.min(end, body.length - 1) + 1)
          response.writeHead(206, {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${start + slice.length - 1}/${body.length}`,
            'Content-Length': String(slice.length),
          })
          response.end(slice)
          return
        }
      }

      response.writeHead(200, { 'Content-Type': contentType })
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

    // A Range request must be served correctly through the worker, and no
    // partial may land in the cache.
    //
    // Be clear about what this does and does not catch. It does not fail if the
    // `status === 200` guard in sw.js is removed: `cache.put` rejects on a 206
    // either way, the rejection is swallowed inside `waitUntil`, and the page
    // sees the same response. Checked by removing both guards and watching this
    // pass. The guard is still right — `.ok` is true for 206, a rejected
    // promise inside `waitUntil` is allowed to fail the event, and browsers
    // that are lenient today need not stay so — but it is defensive rather than
    // test-enforced, and this asserts the outcome a reader can actually see.
    const ranged = await page.evaluate(async () => {
      const url = new URL('engine/stockfish-18-lite.js', location.href).toString()
      const response = await fetch(url, { headers: { Range: 'bytes=0-63' } })
      const cache = await caches.open('web-chess-v1:runtime')
      const cached = await cache.match(url)
      return {
        status: response.status,
        cachedStatus: cached ? cached.status : null,
      }
    })
    assert(ranged.status === 206,
      `the Range request returned ${ranged.status}; the test server did not serve a partial, so this proves nothing`)
    assert(ranged.cachedStatus === null || ranged.cachedStatus === 200,
      `a partial response reached the cache with status ${ranged.cachedStatus}`)
    console.log(`  range request: served ${ranged.status}, cache holds ${ranged.cachedStatus ?? 'nothing'}`)

    // Offline, on the same worker. This is the half that made the merge worth
    // doing, and the half that is easy to get wrong: a response served from
    // the cache has to carry the isolation headers too, or the first offline
    // load quietly drops to one engine thread.
    await context.setOffline(true)
    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      const offline = await page.evaluate(() => ({
        rendered: Boolean(document.querySelector('.board-area')),
        isolated: self.crossOriginIsolated === true,
        sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        title: document.title,
      }))

      assert(offline.rendered, 'the app did not render from the cache with the network down')
      assert(offline.title.length > 0, 'the offline document has no title, so the shell is not the app')
      assert(offline.isolated,
        'the offline page is not cross-origin isolated: a cached response lost the headers')
      assert(offline.sharedArrayBuffer, 'SharedArrayBuffer is missing on the offline load')
      console.log('  offline: app rendered from cache, still isolated')
    } finally {
      await context.setOffline(false)
    }
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

  // detached so the whole group can be signalled below. `npm run preview`
  // spawns vite as a grandchild, and killing npm alone leaves vite running,
  // still holding the stdout/stderr pipes it inherited -- so this process never
  // sees EOF on them and never exits. On a runner that showed up as the suite
  // printing "Browser UI checks passed." and then sitting there until the job
  // hit its 20-minute timeout and was cancelled.
  const preview = spawn(
    'npm',
    ['run', 'preview', '--', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
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

      // And so does every square, before anything has been clicked.
      //
      // The board is a third party's DOM and the labels are written onto it
      // afterwards, which used to be three fixed attempts racing the board's
      // mount. When they lost, a screen reader found sixty-four anonymous divs
      // and the only thing that would fix it was the interaction the labels
      // exist to make possible. Asserted here rather than after the review,
      // because "after a click" is exactly when it used to work.
      //
      // Honest about what it covers: a real browser wins that race, so this
      // passes against the old three-attempt version too. It pins the property
      // -- every square named, before anything is touched -- not the retry that
      // makes the property hold on a slow or throttled paint.
      const boardLabels = await page.evaluate(() => {
        const squares = [...document.querySelectorAll('div[id^="chessboard-square-"]')]
        return {
          total: squares.length,
          labelled: squares.filter(el => el.getAttribute('aria-label')).length,
          sample: squares[0]?.getAttribute('aria-label') ?? null,
        }
      })
      assert(boardLabels.total === 64, `${viewport.name}: the board rendered ${boardLabels.total} squares`)
      assert(boardLabels.labelled === 64,
        `${viewport.name}: only ${boardLabels.labelled} of 64 squares are labelled before any interaction`)
      assert(/^[a-h][1-8], /.test(boardLabels.sample || ''),
        `${viewport.name}: a square label reads "${boardLabels.sample}"`)

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
        //
        // This is the one step that needs a third party: the sample games are
        // fetched from lichess.org. When that is rate-limiting, the app queues
        // the request behind its backoff and loads perfectly well half a minute
        // later -- so the bare "waitForFunction: Timeout" this used to fail
        // with pointed at nothing and cost twenty minutes to diagnose. Say what
        // it depends on instead.
        await page.waitForFunction(
          () => /Carlsen/.test(document.body.innerText) && /\bMove\s+\d\d/.test(document.body.innerText),
          null, { timeout: 25000 })
          .catch(() => fail(
            'the sample game did not load within 25s. This step fetches it from lichess.org: '
            + 'if that is rate-limiting this IP or unreachable, the app queues behind its own '
            + 'backoff and this wait expires first. Re-run in a few minutes before reading it '
            + 'as a regression.',
          ))

        await page.getByRole('button', { name: 'Review', exact: true }).first().click()
        // Pro, because ACPL is a Pro reading. Coach is the default experience
        // and shows the three accuracy percentages without it -- so a harness
        // that never switches reads an absent tile as NaN, which is how this
        // step first failed. Switching here also keeps the assertion honest:
        // it is checking the number the Pro panel promises.
        await page.getByRole('button', { name: 'Pro', exact: true }).first().click()
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
          // Every word the review can put on a move. Book and Excellent
          // arrived together; a list that forgets one reads "11 of 116".
          const labelTotal = ['Book', 'Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder']
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

        // Coach turns a critical moment into a board exercise rather than
        // playing the answer for the reader. The answer must disappear before
        // the exercise begins, the prompt has to reach the board, and Exit has
        // to return the ordinary analysis surface without a reload.
        await page.getByRole('button', { name: 'Coach', exact: true }).click()
        const practiceButtons = page.getByRole('button', { name: /^Practice the position before / })
        assert(await practiceButtons.count() > 0,
          'review produced no critical position that Coach could practice')
        assert(await page.locator('.critical-moment-best').count() === 0,
          'Coach revealed the critical-moment answer before practice')
        await practiceButtons.first().click()
        const practicePrompt = page.locator('[data-review-practice]')
        await practicePrompt.waitFor({ timeout: 5000 })
        const practiceLabel = await practicePrompt.getByRole('status').getAttribute('aria-label')
        assert(/Find a better move/.test(practiceLabel || ''),
          `practice prompt read "${practiceLabel}"`)
        assert(await page.locator('.best-move').count() === 0,
          'Coach practice leaked the answer through the bottom engine status')
        await practicePrompt.getByRole('button', { name: 'Exit' }).click()
        await practicePrompt.waitFor({ state: 'detached', timeout: 5000 })
        console.log('  practice: Coach hides the answer and opens a playable retry position')
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

      // At 1280px the five action labels used to push Settings onto a second
      // header row. Every control was technically reachable, so the earlier
      // bounding-box checks all passed while the toolbar took nearly twice the
      // vertical space and shrank the playfield. Desktop gets one compact row;
      // mobile intentionally uses multiple rows to keep 44px touch targets.
      if (viewport.name === 'desktop') {
        const headerHeight = await page.evaluate(() => {
          const header = document.querySelector('.top')
          return header ? Math.round(header.getBoundingClientRect().height) : null
        })
        assert(headerHeight !== null, 'desktop: top bar is missing')
        assert(headerHeight <= 72,
          `desktop: top bar wrapped to ${headerHeight}px instead of staying on one row`)

        await page.getByRole('button', { name: 'Pro', exact: true }).click()
        const telemetry = await page.locator('.engine-telemetry-inline').textContent()
        assert(/SD26/.test(telemetry || ''),
          `desktop: Pro telemetry omitted selective depth: ${telemetry}`)
        assert(/Hash 12\.7%/.test(telemetry || ''),
          `desktop: Pro telemetry omitted hash occupancy: ${telemetry}`)
        assert(/3 TB hits/.test(telemetry || ''),
          `desktop: Pro telemetry omitted tablebase hits: ${telemetry}`)
        await page.getByRole('button', { name: 'Coach', exact: true }).click()
      }

      // Every aria-controls has to lead somewhere. The one accepted exception
      // is a collapsed disclosure -- aria-expanded="false" -- whose content is
      // rendered on demand and legitimately absent until opened. Anything else
      // pointing at a missing id promises a screen-reader user a destination
      // that does not exist, which is worse than saying nothing.
      //
      // Written after web-katrain shipped exactly that: a tab whose
      // aria-controls named a panel React had not mounted. Same check now lives
      // in all three harnesses.
      const findDanglingControls = () => page.evaluate(() => Array.from(document.querySelectorAll('[aria-controls]'))
        .filter((el) => el.getAttribute('aria-expanded') !== 'false')
        .filter((el) => !document.getElementById(el.getAttribute('aria-controls')))
        .map((el) => `${el.getAttribute('aria-label') || el.tagName}->#${el.getAttribute('aria-controls')}`))
      const assertNoDanglingControls = async (state) => {
        const dangling = await findDanglingControls()
        assert(dangling.length === 0,
          `${viewport.name} (${state}): aria-controls pointing at nothing: ${dangling.join(', ')}`)
      }
      // Checked closed and again with the palette open. The closed sweep alone
      // never sees the palette's own combobox->listbox reference, because the
      // dialog is not mounted -- the very shape of the bug this check exists
      // for would have gone unexamined.
      await assertNoDanglingControls('at rest')

      // The palette has a button as well as a chord, and the button is the
      // only route a phone has -- there is no Cmd key on a touch keyboard, so
      // until it existed every command here was unreachable on mobile. Check
      // it at each viewport, and check the tap target at the two narrow ones:
      // the label collapses to an icon there, which is where a control most
      // easily ends up too small to hit.
      const paletteButton = page.locator('[data-testid="command-palette-btn"]')
      assert(await paletteButton.count() === 1,
        `${viewport.name}: no command palette button`)
      const paletteButtonBox = await paletteButton.boundingBox()
      assert(paletteButtonBox && paletteButtonBox.width > 0 && paletteButtonBox.height > 0,
        `${viewport.name}: the palette button is not visible`)
      if (viewport.name !== 'desktop') {
        assert(paletteButtonBox.width >= 44 && paletteButtonBox.height >= 44,
          `${viewport.name}: the palette button is ${Math.round(paletteButtonBox.width)}x${Math.round(paletteButtonBox.height)}, under the 44px touch minimum`)
      }
      const paletteKeyshortcuts = await paletteButton.getAttribute('aria-keyshortcuts')
      assert(paletteKeyshortcuts === 'Meta+K Control+K',
        `${viewport.name}: the palette button advertises "${paletteKeyshortcuts}" as its shortcut`)
      await paletteButton.click()
      assert(await page.locator('[data-command-palette]').count() === 1,
        `${viewport.name}: the palette button did not open the palette`)
      await assertNoDanglingControls('palette open')
      await page.keyboard.press('Escape')
      await page.locator('[data-command-palette]').waitFor({ state: 'detached', timeout: 5000 })

      // The command palette: the one chord this app claims, and the only way
      // to reach most of these actions from the keyboard.
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
      const paletteOpen = await page.locator('[data-command-palette]').count()
      assert(paletteOpen === 1, `${viewport.name}: Ctrl/Cmd+K did not open the command palette`)

      await page.locator('[data-command-input]').fill('libr')
      const filtered = await page.locator('[data-command-id]').allTextContents()
      assert(filtered.length === 1 && /Library/.test(filtered[0]),
        `${viewport.name}: typing "libr" left ${filtered.length} commands: ${filtered.join(', ')}`)

      // The count is the only feedback a screen-reader user gets when the list
      // narrows or empties; katrain's palette announces it and these did not.
      const countText = await page.locator('[data-command-count]').textContent()
      assert(/^1 command$/.test((countText ?? '').trim()),
        `${viewport.name}: the result count read "${countText}" for one match`)

      await page.keyboard.press('Enter')
      await page.locator('.library-dialog').waitFor({ timeout: 5000 })
      assert(await page.locator('[data-command-palette]').count() === 0,
        `${viewport.name}: the palette stayed open after running a command`)
      await page.keyboard.press('Escape')
      await page.locator('.library-dialog').waitFor({ state: 'detached', timeout: 5000 })

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
    await checkPlayedMoveBecomesTheGame(browser)
    await checkHiddenAnalysisPausesAndResumes(browser)
    await checkAutomaticAnalysisIsReused(browser)
    await checkCrossOriginIsolationIsRestored(browser)

    console.log('Browser UI checks passed.')
  } finally {
    if (browser) await browser.close().catch(() => {})
    // Signal the group, not just npm, so vite goes too.
    try {
      process.kill(-preview.pid, 'SIGTERM')
    } catch {
      preview.kill('SIGTERM')
    }
  }
}

// Exit explicitly rather than waiting for the event loop to drain. Everything
// above is finished by the time this runs, and a single stray handle must not
// be able to turn a passing suite into a cancelled job.
main().then(
  () => process.exit(0),
  error => {
    console.error(error.message)
    process.exit(1)
  },
)
