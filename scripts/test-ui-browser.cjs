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
const SAMPLE_PGN = fs.readFileSync(path.join(__dirname, 'fixtures/review-game.pgn'), 'utf8')

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
  // Deterministic engine checks must not depend on Lichess uptime or let a
  // live cloud score override the scripted evaluation being tested.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input), location.href);
    if (url.hostname === 'lichess.org' && url.pathname.startsWith('/game/export/')) {
      return Promise.resolve(new Response(${JSON.stringify(SAMPLE_PGN)}, { headers: { 'Content-Type': 'application/x-chess-pgn' } }));
    }
    if (SCENARIO === 'cloud-score' && url.pathname === '/api/cloud-eval') {
      return Promise.resolve(new Response(JSON.stringify({ fen: url.searchParams.get('fen'), depth: 40, knodes: 1000,
        pvs: [{ cp: 600, moves: 'e2e4 e7e5' }] }), { headers: { 'Content-Type': 'application/json' } }));
    }
    if (url.hostname === 'lichess.org' || url.hostname.endsWith('.lichess.ovh')) {
      return Promise.resolve(new Response('{"error":"No fixture"}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
    }
    return nativeFetch(input, init);
  };
  const NativeWorker = window.Worker;
  window.__uciCommands = [];
  window.__uciBestmoves = 0;
  // How many engines the app constructed. A game review runs several at once
  // where the device can afford them, and this is how the suite can say which
  // path it actually exercised rather than assuming.
  window.__engineCount = 0;
  window.__terminatedEngines = 0;
  if (SCENARIO.startsWith('silent-')) {
    const nativeTimeout = window.setTimeout;
    window.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay === 30000 ? 300 : delay, ...args);
  }
  // How many times each position has been searched, across every worker.
  window.__fenSearches = {};

  function scoreFor(fen) {
    // Deterministic pseudo-eval in [-120, 120], stable for a given position.
    let hash = 0;
    for (let i = 0; i < fen.length; i++) hash = (hash * 31 + fen.charCodeAt(i)) | 0;
    return ((hash % 241) - 120);
  }

  class FakeStockfish {
    constructor() {
      window.__engineCount += 1;
      this.ordinal = window.__engineCount;
      this.onmessage = null;
      this.onerror = null;
      this.listeners = [];
      this.fen = 'startpos';
      this.searching = false;
      this.finishTimer = null;
      this.searches = 0;
      this.send('Fake Stockfish ready');
    }
    /**
     * What this search says and plays. The 'blunder-nudge' scenario is the
     * opponent in a game: its first search reads +0.30 and answers 1...e5,
     * its second reads +3.30 and answers ...Nc6 -- a 300cp swing between two
     * consecutive searches, which is the one input the Play-mode nudge needs.
     */
    scriptedLine() {
      if (SCENARIO === 'blunder-nudge') {
        return this.searches >= 2 ? { cp: 330, move: 'b8c6' } : { cp: 30, move: 'e7e5' };
      }
      /**
       * The second look at a position disagrees violently with the first.
       *
       * That is what browsing after a review really does -- it re-searches one
       * half of a graded pair far deeper -- and it is the input that used to
       * rewrite a finished report. Counted per position and shared across every
       * engine, because the review pool and the panel's engine are different
       * workers looking at the same board.
       */
      if (SCENARIO === 'review-drift') {
        const seen = window.__fenSearches[this.fen] || 0;
        // Deeper as well as different. shouldReplaceEvaluationSnapshot only
        // lets a new reading replace a stored one when it searched further,
        // which is the real shape of this: the review runs at a fixed depth and
        // browsing ponders past it. Same depth would be quietly discarded, and
        // a scenario that cannot change the map cannot test a freeze.
        return seen > 0
          ? { cp: -900, move: 'e2e4', depths: [28, 34] }
          : { cp: scoreFor(this.fen), move: 'e2e4', depths: [16, 22] };
      }
      return { cp: scoreFor(this.fen), move: 'e2e4' };
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
      const { cp, move, depths } = this.scriptedLine();
      const [shallow, deep] = depths || [16, 22];
      // Counted here rather than in scriptedLine, which finishSearch also
      // calls: incrementing there made one search look like two.
      if (SCENARIO === 'review-drift') {
        window.__fenSearches[this.fen] = (window.__fenSearches[this.fen] || 0) + 1;
      }
      this.send('info depth ' + shallow + ' seldepth ' + (shallow + 4) + ' multipv 1 score cp ' + cp +
                ' nodes 120000 nps 900000 hashfull 45 tbhits 0 time 130 wdl 400 400 200 pv ' + move + ' e7e5');
      this.send('info depth ' + deep + ' seldepth ' + (deep + 4) + ' multipv 1 score cp ' + cp +
                ' nodes 400000 nps 900000 hashfull 127 tbhits 3 time 420 wdl 400 400 200 pv ' + move + ' e7e5');
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
      this.send('bestmove ' + this.scriptedLine().move + ' ponder e7e5');
    }
    postMessage(command) {
      const text = String(command);
      window.__uciCommands.push(text);
      if (SCENARIO === 'silent-all' || (SCENARIO === 'silent-first' && this.ordinal === 1)) return;
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
        this.searches += 1;
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
      window.__terminatedEngines += 1;
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
 * The opening table stays out of the boot path.
 *
 * `eco.json` is the largest thing the app ships after the engine, so both hooks
 * that read it are gated and share one lazily-loaded copy. That sharing is the
 * trap: whichever gate opens first pulls the table for the other, so a gate
 * that is wrong makes the careful one next to it decorative. The review's Book
 * label used to be enabled on `engineEnabled` alone, which is true at boot for
 * anyone whose last session was in analysis mode -- so the table landed in the
 * boot path of the app's most common user, to grade a board with no moves on
 * it.
 *
 * Seeding `workspaceMode: 'analysis'` is what makes this a returning user; a
 * fresh profile boots into Play, where the engine is off and the bug hides.
 * The second half matters as much as the first: the cheapest way to pass the
 * first assertion is to never load the table at all.
 */
async function checkOpeningTableStaysOutOfBoot(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const ecoRequests = () =>
    page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => /\/eco[-.]/.test(entry.name)).length)

  try {
    await page.addInitScript(() => {
      localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({ workspaceMode: 'analysis' }))
    })
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.waitForSelector('#chessboard-square-e2')
    await page.waitForFunction(() => (window.__uciCommands || []).length > 0, null, { timeout: 20000 })

    assert(await ecoRequests() === 0,
           'the opening table was fetched at boot, with no move on the board to name')

    await page.click('#chessboard-square-e2')
    await page.click('#chessboard-square-e4')
    await page.waitForFunction(() => performance.getEntriesByType('resource')
      .some(entry => /\/eco[-.]/.test(entry.name)), null, { timeout: 20000 })

    // The name it loaded for, so this cannot pass on a request that 404s.
    const eco = page.locator('text=/\\bB0\\d\\b/').first()
    await eco.waitFor({ timeout: 20000 })

    console.log('  opening table: not fetched at boot, fetched once a move needs naming')
  } finally {
    await context.close()
  }
}

async function checkTypedMoveEntry(browser) {
  for (const [width, theme] of [[1280, 'Dark'], [375, 'Dark'], [1280, 'Light'], [375, 'Light']]) {
    const context = await browser.newContext({ viewport: { width, height: 812 } })
    const page = await context.newPage()
    try {
      await page.addInitScript(fakeEngineScript())
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      await openSettings(page)
      await chooseTheme(page, theme)
      await closeSettings(page)
      await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
      await page.locator('.analysis-guide summary').click()
      assert(await page.locator('.analysis-guide').getAttribute('open') !== null, 'analysis guide did not open')
      assert((await page.locator('.analysis-guide').innerText()).includes('Neither predicts your personal chance'), 'analysis guide omits the meaning of percentages')
      assert(await page.locator('.analysis-guide summary').evaluate(el => el.getBoundingClientRect().height >= 44), 'analysis guide has a small touch target')
      await assertContrast(page, `${theme} / analysis guide / ${width}px`, 15)
      await page.locator('.analysis-guide summary').click()
      await page.locator('.move-entry summary').click()
      const input = page.locator('.move-entry input')
      await input.fill('e4')
      await input.press('Enter')
      await page.waitForFunction(() => document.querySelector('#chessboard-square-e4')?.getAttribute('aria-label')?.includes('White pawn'))
      assert(await input.evaluate(el => document.activeElement === el), 'typing a move lost input focus')
      assert(await input.inputValue() === '', 'the previous move remained in the input')
      await input.fill('e7e5')
      await input.press('Enter')
      await page.waitForFunction(() => document.querySelector('#chessboard-square-e5')?.getAttribute('aria-label')?.includes('Black pawn'))
      await input.fill('e5')
      await input.press('Enter')
      assert(await page.locator('.move-entry [role="alert"]').count() === 1, 'illegal input was not explained')
      assert((await page.locator('#chessboard-square-e4').getAttribute('aria-label')).includes('White pawn'), 'illegal input changed the board')
      await input.fill('Nf3')
      await input.press('Enter')
      await page.waitForFunction(() => document.querySelector('#chessboard-square-f3')?.getAttribute('aria-label')?.includes('White knight'))
      // Navigating to a position clears the draft without submitting it there.
      await input.fill('Nc6')
      await page.getByRole('button', { name: 'Go to first position', exact: true }).click()
      assert(await input.inputValue() === '', 'navigation left a draft for a different position')
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'expanded move input overflows')
      assert(await input.evaluate(el => el.getBoundingClientRect().height >= 44), 'move input is shorter than its touch target')
      await assertContrast(page, `${theme} / expanded move entry / ${width}px`, 15)
      console.log(`  typed moves (${width}px, ${theme}): SAN, UCI, invalid input, focus and navigation OK`)
    } finally { await context.close() }
  }
}

async function checkEngineStartupTimeout(browser) {
  for (const mode of ['analysis', 'play']) {
    for (const scenario of ['silent-first', 'silent-all']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      const page = await context.newPage()
      try {
        await page.addInitScript(fakeEngineScript(scenario))
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
          Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
          localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({ engineProfile: 'lite-multi-local' }))
        })
        await page.goto(BASE, { waitUntil: 'domcontentloaded' })
        if (mode === 'analysis') {
          await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
        } else {
          await page.getByRole('button', { name: 'Human vs AI', exact: true }).click()
        }
        if (scenario === 'silent-first') {
          await page.waitForFunction(() => window.__engineCount >= 2 && window.__uciCommands.includes('isready'))
          await page.waitForFunction(() => document.querySelector('.bottom-status-row .status.ready, .bottom-status-row .status.analyzing'))
          // The fallback's own watchdog must be cleared once it answers.
          await page.waitForTimeout(400)
          assert(await page.locator('.bottom-status-row .status.ready, .bottom-status-row .status.analyzing').count() === 1, 'ready fallback was later killed by its startup timer')
          assert(await page.evaluate(() => window.__terminatedEngines >= 1), 'timed-out worker was not terminated')
          assert(!await page.locator('.engine-error-copy').count(), 'successful fallback left an engine error')
        } else {
          const error = mode === 'analysis' ? page.locator('.engine-error-copy') : page.locator('#analysis-panel [role="alert"]')
          await error.waitFor()
          assert((await error.innerText()).length > 20, 'startup failure has no explanation')
        }
        console.log(`  startup (${mode}, ${scenario}): ${scenario === 'silent-first' ? 'fallback answered' : 'failure is visible'}`)
      } finally { await context.close() }
    }
  }
}

async function checkAutosaveFailure(browser) {
  for (const [width, theme] of [[1280, 'Dark'], [375, 'Dark'], [1280, 'Light'], [375, 'Light']]) {
    const context = await browser.newContext({ viewport: { width, height: 812 } })
    const page = await context.newPage()
    try {
      await page.addInitScript(fakeEngineScript())
      await page.addInitScript(() => {
        const nativeSet = Storage.prototype.setItem
        window.__denyAutosave = true
        Storage.prototype.setItem = function (key, value) {
          if (window.__denyAutosave && key === 'webchess:auto-saved-game:v1') {
            throw new DOMException('Quota exceeded', 'QuotaExceededError')
          }
          return nativeSet.call(this, key, value)
        }
      })
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      await openSettings(page)
      await chooseTheme(page, theme)
      await closeSettings(page)
      await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
      await page.locator('.move-entry summary').click()
      const input = page.locator('.move-entry input')
      await input.fill('e4')
      await input.press('Enter')
      await page.locator('.autosave-warning').waitFor()
      assert((await page.locator('.autosave-warning').innerText()).includes('Latest changes are not saved'), 'autosave failure is silent')
      const downloadEvent = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download recovery PGN' }).click()
      const download = await downloadEvent
      const pgn = fs.readFileSync(await download.path(), 'utf8')
      assert(pgn.includes('1. e4'), 'recovery download omitted the move that could not be saved')
      assert(await page.locator('.autosave-warning').isVisible(), 'download falsely cleared the storage warning')
      await assertContrast(page, `${theme} / recovery warning / ${width}px`, 15)
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'recovery warning overflows')
      await page.evaluate(() => { window.__denyAutosave = false })
      await page.getByRole('button', { name: 'Retry autosave' }).click()
      await page.locator('.autosave-warning').waitFor({ state: 'detached' })
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem('webchess:auto-saved-game:v1')).pgn.includes('1. e4')), 'retry did not persist the game')
      console.log(`  autosave (${width}px, ${theme}): denied storage is visible, PGN downloads, retry recovers`)
    } finally { await context.close() }
  }
}

async function checkLabSettingsStayInSync(browser) {
  for (const width of [1280, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 812 } })
    const page = await context.newPage()
    try {
      await page.addInitScript(fakeEngineScript())
      await page.addInitScript(() => {
        const key = 'webchess:analysis-settings:v1'
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
          workspaceMode: 'analysis', analysisExperience: 'pro', analysisTab: 'engine-lab', autoAnalyze: false,
          hashMb: 64, multiPv: 2, showWdl: true,
        }))
      })
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      const hash = page.getByRole('spinbutton', { name: 'Hash', exact: true })
      await hash.waitFor()
      assert(await hash.inputValue() === '64', 'Lab did not show saved Hash before analysis')
      await hash.fill('72')
      await hash.press('Tab')
      const pv = page.getByRole('spinbutton', { name: 'MultiPV', exact: true })
      await pv.fill('3')
      await pv.press('Tab')
      await page.getByRole('checkbox', { name: 'UCI_ShowWDL', exact: true }).uncheck()
      await page.waitForFunction(() => {
        const settings = JSON.parse(localStorage.getItem('webchess:analysis-settings:v1'))
        return settings.hashMb === 72 && settings.multiPv === 3 && settings.showWdl === false
      })
      await page.getByRole('button', { name: 'Analyze', exact: true }).first().click()
      await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
      await page.waitForFunction(() => window.__uciCommands.some(command => command.startsWith('go ')))
      const commands = await page.evaluate(() => window.__uciCommands)
      for (const [name, value] of [['Hash', '72'], ['MultiPV', '3'], ['UCI_ShowWDL', 'false']]) {
        assert(commands.filter(command => command.startsWith(`setoption name ${name} value `)).at(-1) === `setoption name ${name} value ${value}`,
          `analysis overwrote Lab setting ${name}`)
      }
      await page.getByRole('button', { name: 'Engine Lab', exact: true }).click()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await hash.waitFor()
      assert(await hash.inputValue() === '72' && await pv.inputValue() === '3', 'Lab values did not persist across reload')
      assert(!await page.getByRole('checkbox', { name: 'UCI_ShowWDL', exact: true }).isChecked(), 'WDL did not persist')
      const input = page.getByPlaceholder('go depth 16', { exact: true })
      await input.fill('setoption name Hash value 96')
      await input.press('Enter')
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('webchess:analysis-settings:v1')).hashMb === 96)
      assert(await hash.inputValue() === '96', 'console bypassed shared setting state')
      await assertContrast(page, `Engine Lab shared settings / ${width}px`, 15)
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Engine Lab overflows the viewport')
      console.log(`  Engine Lab (${width}px): shared settings, next search, reload, and console updates agree`)
    } finally { await context.close() }
  }
}

async function checkSingleThreadReviewPool(browser) {
  for (const [hashMb, maxWorkers, expectedWorkers] of [[64, 4, 4], [32, 4, 2], [64, 1, 0]]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.addInitScript(({ hashMb, maxWorkers }) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
      localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({ engineProfile: 'lite-single-local', hashMb, reviewMaxWorkers: maxWorkers }))
    }, { hashMb, maxWorkers })
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.getByRole('button', { name: /^Load / }).first().click()
    await page.waitForFunction(() => /Browser QA, White/.test(document.body.innerText))
    await page.getByRole('button', { name: 'Review', exact: true }).first().click()
    await page.getByRole('button', { name: /^review game$/i }).first().click()
    await page.waitForFunction(() => /Pending 0/.test(document.querySelector('.review-chips')?.textContent || ''))
    const result = await page.evaluate(() => ({ workers: window.__engineCount, commands: window.__uciCommands }))
    assert(result.workers === expectedWorkers + 1, `review used ${result.workers - 1} workers for ${hashMb} MB / limit ${maxWorkers}; expected ${expectedWorkers}`)
    assert(!result.commands.some(c => /^setoption name Threads value [2-9]/.test(c)), 'a single-thread engine was given multiple threads')
    await openSettings(page)
    await page.locator('.advanced-settings > summary').filter({ hasText: 'Advanced engine options' }).click()
    await page.getByLabel('Maximum review engines').selectOption('2')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('webchess:analysis-settings:v1')).reviewMaxWorkers === 2)
    assert((await page.locator('.review-resource-plan').innerText()).includes('2 engines'), 'review resource summary disagrees with the worker limit')
    console.log(`  single-thread profile: ${hashMb} MB / limit ${maxWorkers}, ${result.workers - 1} pool workers; resource control persists`)
  } finally { await context.close() }
  }
}

async function checkCoachUsesPositionScore(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript('cloud-score'))
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.waitForFunction(() => /D40 cloud/.test(document.querySelector('.coach-grid')?.textContent || ''))
    await page.waitForFunction(() => /D22/.test(document.querySelector('.coach-line-source')?.textContent || ''))
    const score = await page.locator('.coach-grid > div').first().locator('strong').innerText()
    const bar = await page.locator('.eval-bar-label').innerText()
    assert(Number.parseFloat(score) === 6 && Number.parseFloat(bar) === 6,
      `Coach (${score}) and the bar (${bar}) disagree about the position`)
    assert((await page.locator('.coach-grid').innerText()).includes('cloud'), 'cached position source is not labeled')
    assert((await page.locator('.coach-line-source').innerText()).includes('local engine D22'),
      'the local candidate was mislabeled with the cloud depth')
    console.log('  Coach: cloud position score agrees with the bar; local candidate depth is labeled separately')
  } finally { await context.close() }
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
 * A takeback hands the turn back, and the clock has to follow it.
 *
 * A move presses the clock for the opponent; taking that move back put the
 * turn back with the reader and left the opponent's clock counting. Measured
 * in a 3+2 pass-and-play game: "White to move" in the strip, Black's face
 * marked running and losing seconds. Against the engine the two-ply takeback
 * hid it -- undoing both moves lands on the same side the clock was already
 * running for -- so pass and play is where it shows, and where it is checked.
 */
async function checkTakebackHandsTheClockBack(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    await page.getByRole('button', { name: 'Start new game' }).click()
    await page.locator('.new-game-dialog').waitFor({ timeout: 10000 })
    await page.locator('.mode-card', { hasText: 'Human vs Human' }).click()
    await page.locator('.time-control-card', { hasText: '3 + 2' }).click()
    await page.locator('.btn-start').click()
    await page.locator('.chess-clock').waitFor({ timeout: 10000 })

    await page.click('#chessboard-square-e2')
    await page.click('#chessboard-square-e4')
    await page.waitForFunction(() => /Black to move/.test(document.body.innerText), null, { timeout: 10000 })

    const runningFaces = async () => page.evaluate(() =>
      [...document.querySelectorAll('.clock-face.running')].map(face => face.classList.contains('clock-white') ? 'w' : 'b'))
    assert((await runningFaces()).join() === 'b',
      `after 1. e4 the running clock should be Black's, got [${await runningFaces()}]`)

    await page.getByRole('button', { name: /^Take back/ }).click()
    await page.waitForFunction(() => /White to move/.test(document.body.innerText), null, { timeout: 10000 })
    await page.waitForTimeout(300)

    const after = await runningFaces()
    assert(after.join() === 'w',
      `after taking 1. e4 back it is White to move, but the running clock is [${after}]`)
    console.log(`  takeback: the clock follows the turn back`)
  } finally {
    await context.close()
  }
}

/**
 * The Pro view's "keep searching" switch turns the automatic analysis into an
 * unbounded search. Off, a move lands and the engine is asked for `go depth
 * 16`; on, it is asked for `go infinite` and left there until the board moves.
 * The switch is a persisted setting read at boot, so both halves are checked
 * by loading with it stored each way and reading the `go` the fake engine
 * received after one move.
 */
async function checkKeepSearchingIsUnbounded(browser) {
  const goAfterMove = async (continuousAnalysis) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    try {
      await page.addInitScript(fakeEngineScript())
      await page.addInitScript((stored) => {
        window.localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify(stored))
      }, { workspaceMode: 'analysis', analysisExperience: 'pro', continuousAnalysis })
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      const startFresh = page.getByRole('button', { name: /start fresh/i })
      if (await startFresh.count()) await startFresh.first().click()
      await page.waitForFunction(() => window.__uciCommands.some(c => c.startsWith('go ')), null, { timeout: 15000 })

      const before = await page.evaluate(() => window.__uciCommands.filter(c => c.startsWith('go ')).length)
      await page.click('#chessboard-square-e2')
      await page.click('#chessboard-square-e4')
      await page.waitForFunction(
        (count) => window.__uciCommands.filter(c => c.startsWith('go ')).length > count,
        before,
        { timeout: 15000 },
      )
      // The debounce can add one more; the last `go` is the settled one.
      await page.waitForTimeout(400)
      return await page.evaluate(() => window.__uciCommands.filter(c => c.startsWith('go ')).pop())
    } finally {
      await context.close()
    }
  }

  const bounded = await goAfterMove(false)
  assert(/^go depth \d+$/.test(bounded), `with the switch off the move was searched as "${bounded}"`)
  const unbounded = await goAfterMove(true)
  assert(unbounded === 'go infinite', `with the switch on the move was searched as "${unbounded}"`)
  console.log(`  keep searching: off asks for "${bounded}", on asks for "${unbounded}"`)
}

/**
 * Autoplay is the Next button on a timer, offered wherever no engine is on
 * move. Two moves are played pass-and-play, the board goes to Analysis and
 * back to the start, and autoplay is expected to walk to the end of the line
 * on its own and then switch itself off.
 */
async function checkAutoplayWalksTheLine(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Play', exact: true }).first().click()
    await page.getByRole('button', { name: 'Human vs Human', exact: true }).first().click()

    const play = async (from, to) => {
      await page.click(`#chessboard-square-${from}`)
      await page.click(`#chessboard-square-${to}`)
      await page.waitForTimeout(150)
    }
    await play('e2', 'e4')
    await play('e7', 'e5')
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.keyboard.press('Home')
    await page.waitForFunction(() => /Move 1/.test(document.querySelector('.board-meta-move')?.textContent || ''), null, { timeout: 5000 })

    await page.getByRole('button', { name: 'Autoplay the moves' }).click()
    // The speed row appears once something is moving at it.
    await page.getByRole('button', { name: 'Set autoplay speed to Fast' }).click()
    await page.waitForFunction(() => /e5/.test(document.querySelector('.mtree-chip-active')?.textContent || ''), null, { timeout: 10000 })
    // At the end of the line it turns itself off.
    await page.getByRole('button', { name: 'Autoplay the moves' }).waitFor({ timeout: 5000 })
    assert(await page.getByRole('button', { name: 'Stop autoplay' }).count() === 0,
      'autoplay stayed on after reaching the end of the line')
    console.log('  autoplay: walked to the end of the line and stopped')
  } finally {
    await context.close()
  }
}

/**
 * A move typed by name lands through the same path a drag takes, and lands
 * in the forms people type: a lowercase piece letter, a from-to pair. An
 * illegal one is refused beside the field with the text kept for correction.
 */
async function checkTypedMoveLands(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.addInitScript(() => {
      window.localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({ workspaceMode: 'analysis' }))
    })
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    await page.locator('.move-entry summary').click()
    const field = page.locator('.move-entry input')
    await field.fill('nf3')
    await field.press('Enter')
    await page.waitForFunction(() => /Nf3/.test(document.querySelector('.mtree-chip-active')?.textContent || ''), null, { timeout: 5000 })

    await field.fill('e7e5')
    await field.press('Enter')
    await page.waitForFunction(() => /e5/.test(document.querySelector('.mtree-chip-active')?.textContent || ''), null, { timeout: 5000 })

    await field.fill('Nf3')
    await field.press('Enter')
    await page.locator('.move-entry [role="alert"]').waitFor({ timeout: 5000 })
    assert(await field.inputValue() === 'Nf3', 'the refused text was cleared instead of kept for correction')
    console.log('  typed move: nf3 and e7e5 landed, a repeated Nf3 was refused and kept')
  } finally {
    await context.close()
  }
}

/**
 * A PGN with clock readings draws a move-times graph: one bar per timed move,
 * White's above the midline and Black's below, and the longest think named.
 * 5. O-O here took 47 seconds -- 2:15 to 1:30 with a two-second increment.
 */
async function checkMoveTimesAreGraphed(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
    const textarea = page.locator('.dialog-panel textarea').first()
    await textarea.waitFor({ timeout: 10000 })
    await textarea.fill([
      '[Event "Clock test"]',
      '[TimeControl "180+2"]',
      '',
      '1. e4 {[%clk 0:02:58]} e5 {[%clk 0:02:55]} 2. Nf3 {[%clk 0:02:50]} Nc6 {[%clk 0:02:40]}',
      '3. Bb5 {[%clk 0:02:20]} a6 {[%clk 0:02:38]} 4. Ba4 {[%clk 0:02:15]} Nf6 {[%clk 0:02:30]}',
      '5. O-O {[%clk 0:01:30]} Be7 {[%clk 0:02:28]} *',
    ].join('\n'))
    await page.getByRole('button', { name: /Import & Analyze/ }).click()
    await page.locator('.graph-bar').first().waitFor({ timeout: 10000 })

    const bars = await page.evaluate(() => ({
      total: document.querySelectorAll('.graph-bar').length,
      white: document.querySelectorAll('.graph-bar-white').length,
      heading: [...document.querySelectorAll('.section-heading')].map(h => h.textContent).find(t => /Move Times/.test(t || '')) || '',
    }))
    assert(bars.total === 10 && bars.white === 5, `expected 10 bars, 5 of them White's; drew ${bars.total} and ${bars.white}`)
    assert(/47s/.test(bars.heading), `the longest think should read 47s, the heading read "${bars.heading}"`)
    console.log('  move times: ten timed moves drawn, longest think 47s')

    // The imported game is offered a review from the tab it landed on.
    await page.getByTestId('review-offer').click()
    await page.waitForFunction(() => /Evaluated10\/10/.test((document.querySelector('.accuracy-summary')?.textContent || '').replace(/\s+/g, '')), null, { timeout: 15000 })
    assert(await page.locator('.analysis-tab-btn.active', { hasText: 'Review' }).count() === 1,
      'the review offer did not land on the Review tab')
    console.log('  review offer: one press from Analyze reviewed all ten moves')
  } finally {
    await context.close()
  }
}

/**
 * A resignation ends the game, and Take back has to know. It did not: the
 * button stayed live, undid the move, and left a locked board under a strip
 * still reading "Black resigned". Measured by hand before the fix.
 */
async function checkResignationEndsTakeback(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Play', exact: true }).first().click()
    await page.getByRole('button', { name: 'Human vs Human', exact: true }).first().click()
    await page.click('#chessboard-square-e2')
    await page.click('#chessboard-square-e4')
    await page.waitForFunction(() => /Black to move/.test(document.body.innerText), null, { timeout: 5000 })

    await page.getByRole('button', { name: 'Resign the game' }).click()
    await page.getByRole('button', { name: 'Confirm resignation' }).click()
    await page.waitForFunction(() => /resigned/.test(document.querySelector('.turn-pill')?.textContent || ''), null, { timeout: 5000 })

    const takeback = page.getByRole('button', { name: /^Take back/ })
    assert(await takeback.isDisabled(), 'Take back stayed enabled after a resignation')
    const label = await takeback.getAttribute('aria-label')
    assert(/game is over/i.test(label || ''), `Take back's reason read "${label}"`)

    // And the result card offers another game on the same terms.
    await page.getByTestId('play-again').click()
    await page.waitForFunction(() => /White to move/.test(document.querySelector('.turn-pill')?.textContent || '')
      && document.querySelectorAll('.mtree-chip').length === 0, null, { timeout: 5000 })
    assert(await page.locator('.gc-pill-active', { hasText: 'Human vs Human' }).count() === 1,
      'Play again changed the game mode')
    console.log('  resignation: take back is off, with the reason; Play again starts afresh')
  } finally {
    await context.close()
  }
}

/**
 * The first screen offers a game on the settings used last time, with no
 * dialog. Stored as Master, Black, 3+2, a fresh load should say so on the
 * button and one press should start a game against the engine with those
 * settings -- the engine to move first, since the reader is Black.
 */
async function checkQuickStartRemembersTheLastGame(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.addInitScript(() => {
      window.localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({
        workspaceMode: 'play', lastDifficulty: 7, lastSideChoice: 'black', timeControlId: '3+2',
      }))
    })
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    const quick = page.getByTestId('quick-start')
    const label = await quick.getAttribute('aria-label')
    assert(/Master · as Black · 3 \+ 2/.test(label || ''), `the quick start read "${label}"`)
    await quick.click()

    await page.locator('.chess-clock').waitFor({ timeout: 10000 })
    await page.waitForFunction(() => window.__uciCommands.some(c => /^go .*movetime/.test(c)), null, { timeout: 15000 })
    const state = await page.evaluate(() => ({
      pills: [...document.querySelectorAll('.gc-pill-active')].map(p => p.textContent.trim()),
      elo: window.__uciCommands.find(c => /UCI_Elo/.test(c)),
      card: Boolean(document.querySelector('[data-testid=start-card]')),
    }))
    assert(state.pills.includes('Human vs AI'), `the quick start left the mode at ${state.pills.join(', ')}`)
    assert(state.elo === 'setoption name UCI_Elo value 2600', `the opponent was set to "${state.elo}", not Master`)
    assert(!state.card, 'the start card stayed up after the game began')
    console.log('  quick start: a Master, Black, 3+2 game from one press')
  } finally {
    await context.close()
  }
}

/**
 * The nudge in Play mode. The opponent's search after the human's second
 * move scores 300cp higher than after the first, and the Play Focus card
 * should say which move did it and what it cost, with the take-back one
 * click away. The judgement is unit-tested; whether the move loop feeds it
 * the two readings, and clears it on a takeback, only a browser can show.
 */
async function checkBlunderIsPointedOut(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript('blunder-nudge'))
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Play', exact: true }).first().click()
    await page.click('.top-mode-pills button:has-text("Human vs AI")')
    await page.waitForFunction(() => /ready to play/.test(document.body.innerText), null, { timeout: 20000 })

    const play = async (from, to) => {
      await page.click(`#chessboard-square-${from}`)
      await page.click(`#chessboard-square-${to}`)
    }
    await play('e2', 'e4')
    await page.waitForFunction(() => /e5/.test(document.querySelector('.mtree-scroll')?.textContent || ''),
                               null, { timeout: 10000 })
    await play('d1', 'h5')
    await page.waitForFunction(() => /Nc6/.test(document.querySelector('.mtree-scroll')?.textContent || ''),
                               null, { timeout: 10000 })

    const nudge = await page.locator('.blunder-nudge').textContent({ timeout: 5000 })
    assert(/Qh5 looks like a blunder/.test(nudge), `the nudge did not name the blunder: ${nudge}`)
    assert(/3\.0 pawns/.test(nudge), `the nudge did not say what it cost: ${nudge}`)

    await page.getByRole('button', { name: /take back Qh5/i }).click()
    await page.waitForFunction(() => !document.querySelector('.blunder-nudge'), null, { timeout: 5000 })
    const strip = await page.locator('.board-meta-strip').textContent()
    assert(/White to move/.test(strip) && /Move 2/.test(strip),
      `the take-back did not hand the turn back: ${strip}`)
    console.log('  nudge: a blunder is pointed out where it happens, and the take-back clears it')
  } finally {
    await context.close()
  }
}


/**
 * A finished review is a report, and a report does not move while you read it.
 *
 * It did. Stepping back through one real game's faults turned nought blunders
 * into two and took 1.9 points off the accuracy, with no move played. The cause
 * is not that the second look is worse: a grade is the difference between two
 * evaluations, and browsing re-takes one half of that pair far deeper than the
 * half beside it, so the difference becomes the gap in depth rather than
 * anything the move did.
 *
 * The `review-drift` engine makes that condition certain instead of likely --
 * every *second* search of a position answers -9.00 -- so navigating after the
 * review would re-grade every move it lands on. Only the browser tier can cover
 * this: the freeze lives in App state, between the review runner and the rows.
 */
async function checkReviewReportHoldsStill(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript('review-drift'))
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.waitForFunction(() => window.__uciBestmoves >= 1, null, { timeout: 20000 })

    // Deliberately off book. A line the opening table knows is graded "Book"
    // whatever the engine says, so 1.e4 e5 2.Nf3 Nc6 produced a report of four
    // Book moves and nothing an evaluation could move -- a test that passed
    // without exercising anything.
    for (const [from, to] of [['a2', 'a3'], ['h7', 'h6'], ['a3', 'a4'], ['h6', 'h5'], ['a1', 'a3'], ['h8', 'h6']]) {
      await page.click('#chessboard-square-' + from)
      await page.click('#chessboard-square-' + to)
      await page.waitForTimeout(250)
    }

    await page.getByRole('button', { name: 'Review', exact: true }).first().click()
    await page.getByRole('button', { name: /review game/i }).first().click()
    // The report is settled when nothing is left pending.
    await page.waitForFunction(
      () => /Pending 0/.test(document.querySelector('.review-chips')?.textContent || ''),
      null, { timeout: 30000 })
    const reported = await page.evaluate(() =>
      document.querySelector('.review-chips').textContent.replace(/\s+/g, ' ').trim())
    // Counted from here, not from boot: positions are searched while the moves
    // are played and again by the review, and neither of those is the thing
    // this check is about.
    await page.evaluate(() => { window.__searchesAtReport = { ...window.__fenSearches } })

    // Walk the line. Every position landed on is searched a second time, and
    // every second search answers -9.00.
    for (const name of ['Go to first position', 'Go to next move', 'Go to next move', 'Go to last position']) {
      await page.getByRole('button', { name }).click()
      await page.waitForTimeout(700)
    }
    const researched = await page.evaluate(() => Object.keys(window.__fenSearches)
      .filter(fen => window.__fenSearches[fen] > (window.__searchesAtReport[fen] || 0)).length)
    assert(researched > 0,
      'no position was searched again after the report, so this check never exercised the drift it exists for')

    const afterBrowsing = await page.evaluate(() =>
      document.querySelector('.review-chips').textContent.replace(/\s+/g, ' ').trim())
    assert(afterBrowsing === reported,
      `the report changed while it was read: "${reported}" became "${afterBrowsing}"`)
    console.log(`  review report: holds still after ${researched} positions were re-searched and disagreed`)
  } finally {
    await context.close()
  }
}

/**
 * A drill leaves the line exactly as it found it.
 *
 * This is the property that makes drilling safe to do on a saved game: a wrong
 * move is judged and undone before anything is recorded, and a correct one
 * re-walks a move the tree already has, because `addMove` de-dupes by UCI. Get
 * either half wrong and a practice session quietly rewrites the repertoire it
 * was practising — filling it with the moves you were trying *not* to play.
 *
 * Compared through the exported PGN rather than the tree, because that is what
 * the library stores and what leaves the app.
 */
/**
 * A dialog's actions stay on the screen at the narrowest width.
 *
 * The row is right-aligned, so when it does not fit it runs off the *left*
 * edge rather than the right — measured on the PGN dialog's Export tab at
 * 320x568, where four buttons wanted 343px of a 320px screen: Close sat at
 * x=-39 with its own centre off the screen, so a press aimed at the middle of
 * the button landed on nothing.
 *
 * All three tabs, because they carry different numbers of actions and only the
 * one with four ever overflowed.
 */
async function checkDialogActionsStayOnScreen(browser) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.locator('[aria-label="Open PGN and FEN dialog"]').first().click()
    await page.locator('.dialog-actions').first().waitFor({ timeout: 10000 })

    const offScreen = tab => page.evaluate(() => {
      const cut = []
      for (const row of document.querySelectorAll('.dialog-actions')) {
        if (row.getBoundingClientRect().height < 2) continue
        for (const button of row.children) {
          const box = button.getBoundingClientRect()
          if (box.width < 2) continue
          if (box.left < -0.5 || box.right > window.innerWidth + 0.5) {
            cut.push(`"${(button.textContent || '').trim().slice(0, 20)}" [${Math.round(box.left)}..${Math.round(box.right)}]`)
          }
        }
      }
      return cut
    })

    for (const tab of [null, 'FEN', 'Export']) {
      if (tab) {
        await page.getByRole('button', { name: tab, exact: true }).first().click()
        await page.waitForTimeout(300)
      }
      const cut = await offScreen(tab)
      assert(cut.length === 0,
        `320x568, ${tab ?? 'Import'} tab: dialog actions past the screen edge: ${cut.join(', ')}`)
    }
    console.log('  dialog actions: every button on screen at 320px, on all three tabs')
  } finally { await context.close() }
}

/**
 * The board still has squares in Windows high contrast.
 *
 * `forced-colors: active` replaces every background and border with the
 * reader's palette and drops box-shadows. Almost all of this app is better for
 * it -- its meaning lives in text and in SVG strokes, which the mode leaves
 * alone. The board is the exception: **measured** before the fix, all 64
 * squares came back `rgb(255, 255, 255)`, light, dark and the two the last move
 * was played between, leaving a piece diagram on a blank field with no light or
 * dark complex and no memory of the last move. The evaluation bar lost its fill
 * the same way and kept only its number.
 *
 * Asserted as "are these two different", not against particular colours: the
 * point is that the checkerboard survives, and the schemes are free to change.
 */
async function checkHighContrastKeepsTheBoard(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, forcedColors: 'active',
  })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.locator('.board-surface').waitFor({ timeout: 10000 })

    const board = await page.evaluate(() => {
      const at = name => getComputedStyle(document.querySelector(`[data-square="${name}"]`)).backgroundColor
      // a1 is dark and a2 light in every scheme, whichever way the board faces.
      return { forced: matchMedia('(forced-colors: active)').matches, dark: at('a1'), light: at('a2') }
    })
    assert(board.forced, 'the high-contrast context did not take, so this check proves nothing')
    assert(board.dark !== board.light,
      `high contrast flattened the board: a1 and a2 are both ${board.dark}`)

    // And the bar that answers "who is better" keeps its two halves.
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.locator('.eval-column .wdl-bar').waitFor({ timeout: 20000 })
    const bar = await page.evaluate(() => {
      const el = document.querySelector('.eval-column .wdl-bar')
      const white = document.querySelector('.eval-column .wdl-white')
      const s = getComputedStyle(el)
      return { adjust: s.forcedColorAdjust, height: Math.round(el.getBoundingClientRect().height),
               whiteShare: white ? Math.round(white.getBoundingClientRect().height) : 0 }
    })
    assert(bar.adjust === 'none',
      `the evaluation bar is drawn in the forced palette (forced-color-adjust: ${bar.adjust})`)
    assert(bar.whiteShare > 0 && bar.whiteShare < bar.height,
      `the evaluation bar shows ${bar.whiteShare}px of ${bar.height}px for White, which is not a reading`)
    console.log('  high contrast: the board keeps its squares and the evaluation bar its halves')
  } finally { await context.close() }
}

/**
 * Every square answers a finger, at the narrowest width the app supports.
 *
 * 320px is what `body { min-width: 320px }` claims, and it was the one size
 * where the board did not fit the room the two bars left it. Measured before
 * the fix at 320x568: the board opened at 294px in a 235px container, so ranks
 * 1, 2 and 3 sat below the fold of the scroller -- both ranks of the reader's
 * own pieces among them. A tap on e2 landed on `div.panel-content`, and the
 * first move of a game could not be made until the reader thought to scroll a
 * board that looked complete.
 *
 * Asked as "what does the page hand a press at this point", because that is the
 * question a finger asks; a rectangle inside the viewport is not the same thing
 * when something else is painted over it. 360x640 goes with it as the size that
 * lost only rank 1, which a check on the narrowest size alone would have let
 * back in.
 */
async function checkEverySquareAnswersAFinger(browser) {
  for (const [width, height] of [[320, 568], [360, 640], [375, 812]]) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: true, hasTouch: true,
    })
    const page = await context.newPage()
    try {
      await page.addInitScript(fakeEngineScript())
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      const startFresh = page.getByRole('button', { name: /start fresh/i })
      if (await startFresh.count()) await startFresh.first().click()
      await page.locator('.board-surface').waitFor({ timeout: 10000 })
      await page.waitForTimeout(600)

      const unreachable = await page.evaluate(() => {
        const surface = document.querySelector('.board-surface')
        const missed = []
        for (const square of document.querySelectorAll('[data-square]')) {
          const box = square.getBoundingClientRect()
          const x = box.left + box.width / 2
          const y = box.top + box.height / 2
          if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) {
            missed.push(`${square.getAttribute('data-square')} off-screen`)
            continue
          }
          const hit = document.elementFromPoint(x, y)
          if (!hit || !surface.contains(hit)) {
            missed.push(`${square.getAttribute('data-square')} -> ${hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).trim().split(/\s+/)[0] : 'nothing'}`)
          }
        }
        const board = surface.getBoundingClientRect()
        return { missed: missed.slice(0, 6), count: missed.length, board: Math.round(board.width) }
      })
      assert(unreachable.count === 0,
        `${width}x${height}: ${unreachable.count} squares a finger cannot reach: ${unreachable.missed.join(', ')}`)
      // Squares a finger can actually hit, which is the other half of fitting.
      assert(unreachable.board / 8 >= 24,
        `${width}x${height}: the board fits at ${unreachable.board}px, but its squares are ${(unreachable.board / 8).toFixed(1)}px`)
      console.log(`  reach (${width}x${height}): all 64 squares answer a press, at ${Math.round(unreachable.board / 8)}px a square`)
    } finally { await context.close() }
  }
}

/**
 * A tap survives the finger that makes it.
 *
 * `dragActivationDistance` decides how far a pointer may wander before
 * react-chessboard calls it a drag rather than a tap, and its default is
 * **1px**. No finger is that still. Measured at 390x844 before the fix:
 * tapping the e2 pawn with 1px of drift lit no legal targets at all, where a
 * perfectly motionless tap lit two -- and 2, 3, 5, 8 and 12px did the same
 * nothing. What the reader got instead was a drag that picked the pawn up and
 * put it back on its own square, which lands in `onPieceDrop`, clears the
 * selection, and swallows the click that would have made one. Tap to select,
 * which is how this board is documented to work, was reachable only with a
 * mouse.
 *
 * Both ends are asserted, because either alone is passable and wrong: a tap
 * that drifts a few pixels has to select, and a drag has to still be a drag.
 * The gap between them is 8px, which is where Android draws the same line.
 *
 * Real touch events rather than `click()`: a synthetic click carries no
 * pointer movement at all, so it lands in the one case that always worked and
 * proves nothing.
 */
async function checkATapSurvivesTheFingerThatMakesIt(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    const passAndPlay = page.locator('button', { hasText: /Pass and play/ })
    if (await passAndPlay.count()) await passAndPlay.first().click()
    await page.locator('.board-surface').waitFor({ timeout: 10000 })
    await page.waitForTimeout(600)

    const client = await context.newCDPSession(page)
    const centre = square => page.evaluate(name => {
      const box = document.querySelector('#chessboard-square-' + name).getBoundingClientRect()
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
    }, square)
    const litTargets = () => page.evaluate(() => [...document.querySelectorAll('[id^="chessboard-square-"]')]
      .filter(el => /legal move target/i.test(el.getAttribute('aria-label') || '')).length)
    const plies = () => page.evaluate(() => document.querySelectorAll('.mtree-chip').length)

    async function press(from, to, steps) {
      const a = await centre(from)
      const b = to ? await centre(to) : null
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }] })
      await page.waitForTimeout(40)
      for (let i = 1; i <= steps.length; i++) {
        const drift = steps[i - 1]
        const x = b ? Math.round(a.x + (b.x - a.x) * i / steps.length) : a.x + drift
        const y = b ? Math.round(a.y + (b.y - a.y) * i / steps.length) : a.y + drift
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] })
        await page.waitForTimeout(16)
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(450)
    }

    // A tap with an ordinary finger's drift still selects.
    await press('e2', null, [1, 2, 3])
    const lit = await litTargets()
    assert(lit > 0, `a tap that drifted 3px lit ${lit} legal targets; the pawn was never selected`)
    const before = await plies()
    await press('e4', null, [1, 2, 3])
    assert(await plies() > before, 'the second tap did not play the move the first one set up')

    // And a drag is still a drag.
    const beforeDrag = await plies()
    await press('e7', 'e5', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    assert(await plies() > beforeDrag, 'dragging a piece across the board no longer plays a move')

    console.log(`  tap: a finger drifting 3px still selects (${lit} targets lit), and a drag still drags`)
  } finally { await context.close() }
}

/**
 * The board is not a dead zone for the thumb.
 *
 * `touch-action: none` over the whole board is what the drag sensor asks for,
 * and on a phone it costs the reader most of the page. Measured at 390x844 with
 * a game on: `.main-container` holds 1061px of content in 558px, and of
 * thirteen sample heights down it only three scrolled -- one strip above the
 * board and two below. Only a square with a piece on it can start a drag, so
 * the rest is handed back to the browser.
 *
 * What is pinned here is the rule rather than the gesture. `touch-action` is
 * intersected from the touched element up through its ancestors, so three
 * values decide the whole behaviour: the board pannable, a square with a piece
 * on it not, and an empty square left alone. A scroll driven through
 * `Input.synthesizeScrollGesture` was the first version of this check and had
 * to go: it needs the compositor, and in a suite that has opened and closed a
 * context for every check before this one the gesture reports success and
 * scrolls nothing. That failure looks exactly like the defect, which is worse
 * than not testing it here. The gesture itself was measured against this build
 * outside the suite -- eight of eight empty squares scrolling, none of six
 * squares holding a piece.
 *
 * The drag *is* driven, with real touch events, because it is the thing the
 * three values exist to protect and `dispatchTouchEvent` needs no compositor.
 */
async function checkTheBoardIsNotADeadZone(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    const passAndPlay = page.locator('button', { hasText: /Pass and play/ })
    if (await passAndPlay.count()) await passAndPlay.first().click()
    await page.locator('.board-surface').waitFor({ timeout: 10000 })
    await page.waitForTimeout(600)

    const rule = await page.evaluate(() => {
      const touchAction = selector => {
        const el = document.querySelector(selector)
        return el ? getComputedStyle(el).touchAction : null
      }
      const main = document.querySelector('.main-container')
      return {
        hasSelector: CSS.supports('selector(:has(*))'),
        withPiece: document.querySelectorAll('.board-wrap [data-square]:has([data-piece], svg, img)').length,
        squares: document.querySelectorAll('.board-wrap [data-square]').length,
        wrap: touchAction('.board-wrap'),
        occupied: touchAction('#chessboard-square-e2'),
        empty: touchAction('#chessboard-square-e4'),
        emptyLabel: document.querySelector('#chessboard-square-e4')?.getAttribute('aria-label') || '',
        scrollable: main ? main.scrollHeight - main.clientHeight : 0,
      }
    })

    assert(rule.hasSelector, 'this Chromium has no :has(), so the rule under test cannot apply')
    // The probe before the assertions: a selector matching every square or none
    // would let all three pass while saying nothing.
    assert(rule.squares === 64, `expected 64 squares, found ${rule.squares}`)
    assert(rule.withPiece === 32,
      `at the start position 32 squares hold a piece; the selector matched ${rule.withPiece}`)
    assert(/empty/i.test(rule.emptyLabel), `e4 was meant to be empty and reads "${rule.emptyLabel}"`)
    assert(rule.scrollable > 100,
      `this check is about a page taller than its window; .main-container has ${rule.scrollable}px to scroll`)

    assert(rule.wrap === 'pan-y', `the board should be pannable and computes touch-action: ${rule.wrap}`)
    assert(rule.occupied === 'none',
      `a square holding a piece must keep the gesture for the drag; e2 computes ${rule.occupied}`)
    assert(rule.empty !== 'none',
      `an empty square cannot start a drag and should not block a scroll; e4 computes ${rule.empty}`)

    // And the two things those three values exist to protect.
    const client = await context.newCDPSession(page)
    const squareAt = square => page.evaluate(name => {
      const box = document.querySelector('#chessboard-square-' + name).getBoundingClientRect()
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
    }, square)
    const plies = () => page.evaluate(() => document.querySelectorAll('.mtree-chip').length)

    async function touch(steps) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: steps[0].x, y: steps[0].y, id: 1 }] })
      await page.waitForTimeout(50)
      for (const point of steps.slice(1)) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y, id: 1 }] })
        await page.waitForTimeout(16)
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(500)
    }

    const from = await squareAt('e2')
    const to = await squareAt('e4')

    // A drag, which is why a square holding a piece keeps the gesture.
    const beforeDrag = await plies()
    await touch([from, ...Array.from({ length: 12 }, (_, i) => ({
      x: Math.round(from.x + (to.x - from.x) * (i + 1) / 12),
      y: Math.round(from.y + (to.y - from.y) * (i + 1) / 12),
    }))])
    assert(await plies() > beforeDrag, 'dragging a piece stopped playing a move once empty squares could scroll')

    // And the second tap of a two-tap move, which lands on an empty square --
    // the one this rule hands to the browser. 8px of drift is where a drag
    // would take hold, so it is where a pan would too if one were going to.
    await page.reload({ waitUntil: 'domcontentloaded' })
    const again = page.getByRole('button', { name: /start fresh/i })
    if (await again.count()) await again.first().click()
    const replay = page.locator('button', { hasText: /Pass and play/ })
    if (await replay.count()) await replay.first().click()
    await page.locator('.board-surface').waitFor({ timeout: 10000 })
    await page.waitForTimeout(600)

    const pick = await squareAt('e2')
    await touch([pick, { x: pick.x + 1, y: pick.y + 1 }, { x: pick.x + 2, y: pick.y + 2 }, { x: pick.x + 3, y: pick.y + 3 }])
    const lit = await page.evaluate(() => [...document.querySelectorAll('[id^="chessboard-square-"]')]
      .filter(el => /legal move target/i.test(el.getAttribute('aria-label') || '')).length)
    assert(lit > 0, `tapping the pawn lit ${lit} legal targets`)
    const beforeTap = await plies()
    const target = await squareAt('e4')
    await touch([target, { x: target.x, y: target.y + 3 }, { x: target.x, y: target.y + 6 }, { x: target.x, y: target.y + 8 }])
    assert(await plies() > beforeTap,
      'a tap on the destination square drifted 8px and the move did not land; the browser took it for a pan')

    console.log('  thumb: the board pans, a piece keeps the drag, and both the drag and the second tap still play')
  } finally { await context.close() }
}

/**
 * Every control a finger has to hit is a finger wide.
 *
 * The fourth pass put `min-height: 44px` on fourteen selectors and **every one
 * of them is in App.css**, so anything styled elsewhere was never in that
 * sweep, and two things styled *inside* App.css were missed for having their
 * own selector. Measured at 375x667 before this: the command palette's search
 * field 343x**21** carrying the user agent's own padding, its 33 rows at 42px,
 * the library's search 343x**32**, its four sort buttons at 32, its rename
 * field and Save at 36, its per-row actions at 30, the bottom bar's four
 * navigation buttons and Autoplay at **40**, and the Draw switch at 36 -- that
 * last one from a rule inside `@media (pointer: coarse)`, which is to say a
 * rule whose entire audience is fingers, asking for 2.25rem.
 *
 * So the check is a sweep rather than a list of selectors: a list is what let
 * this happen. Two things are filtered rather than ignored, because both look
 * exactly like a defect and neither is one -- a tick box of 20.8px inside a
 * 335x44 label is a 335x44 target, and a piece inside its square is not a
 * target at all, the square is, and the board has a floor of its own at 24px.
 * Both filters are counted and printed so a future reader can see them working.
 */
async function checkEveryControlIsFingerSized(browser) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    const passAndPlay = page.locator('button', { hasText: /Pass and play/ })
    if (await passAndPlay.count()) await passAndPlay.first().click()
    await page.locator('.board-surface').waitFor({ timeout: 10000 })
    await page.waitForTimeout(600)
    for (const [from, to] of [['e2', 'e4'], ['e7', 'e5']]) {
      await page.click(`#chessboard-square-${from}`)
      await page.click(`#chessboard-square-${to}`)
      await page.waitForTimeout(250)
    }

    const sweep = () => page.evaluate(() => {
      const found = []
      let checked = 0
      let labelled = 0
      let inline = 0
      let onTheBoard = 0
      for (const el of document.querySelectorAll('button, [role="button"], summary, input, select, textarea, a[href]')) {
        const box = el.getBoundingClientRect()
        if (box.width < 2 || box.height < 2) continue
        if (box.bottom < 0 || box.top > window.innerHeight) continue
        // A piece is not a target; its square is, and the board's floor is 24px.
        if (el.closest('.board-surface') || /^[a-h][1-8],/.test(el.getAttribute('aria-label') || '')) {
          onTheBoard++
          continue
        }
        checked++
        if (Math.min(box.width, box.height) >= 44) continue
        const label = el.closest('label')
        if (label) {
          const outer = label.getBoundingClientRect()
          // The box is the picture of the control; the label is the control.
          if (Math.min(outer.width, outer.height) >= 44) { labelled++; continue }
        }
        // WCAG 2.5.8 exempts a target inline in a sentence, and the two export
        // links are exactly that -- "Open in Lichess" and "Open in chess.com"
        // sit in a paragraph either side of a separator. Giving them 44px would
        // break the sentence to satisfy a rule that does not ask for it.
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p')) {
          inline++
          continue
        }
        found.push(`${Math.round(box.width)}x${Math.round(box.height)} ` +
          `${el.tagName.toLowerCase()}.${String(el.className || '').split(/\s+/)[0]} ` +
          `"${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`)
      }
      return { found: [...new Set(found)], checked, labelled, inline, onTheBoard }
    })

    const surfaces = [
      ['the board', null, null],
      ['the library', '[aria-label^="Open saved games library"]', null],
      ['the command palette', '[aria-label^="Open command palette"]', null],
      ['New Game', '[aria-label^="Start new game"]', null],
      ['the settings sheet', 'summary[aria-label*="settings" i]', null],
      ['the import dialog', '[aria-label^="Open PGN and FEN dialog"]', null],
      // The tabs of that dialog are separate surfaces: the position setup's
      // palette is only laid out on one of them, and it is where the width was
      // wrong while the height beside it was right.
      ['its FEN tab', null, 'FEN'],
      ['its Export tab', null, 'Export'],
    ]
    let swept = 0
    let decoys = 0
    let inlineLinks = 0
    let openDialog = false
    for (const [name, trigger, tab] of surfaces) {
      if (trigger) {
        await page.locator(trigger).first().click()
        await page.waitForTimeout(900)
        openDialog = true
      }
      if (tab) {
        await page.locator('.dialog-panel button', { hasText: new RegExp(`^${tab}$`) }).first().click()
        await page.waitForTimeout(700)
      }
      const result = await sweep()
      assert(result.checked >= 10,
        `${name}: only ${result.checked} controls were on screen, so this swept nothing`)
      assert(result.found.length === 0,
        `${name}: ${result.found.length} controls a finger cannot comfortably hit:\n      ${result.found.join('\n      ')}`)
      swept += result.checked
      decoys += result.labelled
      inlineLinks += result.inline
      const last = surfaces[surfaces.indexOf(surfaces.find(entry => entry[0] === name)) + 1]
      if (openDialog && (!last || last[2] === null)) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(600)
        openDialog = false
      }
    }
    // The filters have to be doing something, or they are hiding the sweep.
    assert(decoys > 0, 'no tick box was filtered by its label; the decoy filter may have stopped matching')
    assert(inlineLinks > 0, 'no inline link was filtered; the 2.5.8 exemption may have stopped matching')

    console.log(`  targets: ${swept} controls across ${surfaces.length} surfaces all clear 44px ` +
      `(${decoys} cleared by their label, ${inlineLinks} inline links exempt under 2.5.8)`)
  } finally { await context.close() }
}

/**
 * The winrate card reads the position on the board.
 *
 * Its two numbers took `winratePoints[length - 1]` -- the last ply of the line,
 * whatever was being looked at. Measured on a 58-move game at five plies before
 * the fix: the coach beside it read 42%, 22%, 45%, 30% and 46% for those
 * positions and the card read **42.1% every time**, which is the last one. The
 * graph between them was already right, taking `currentIndex` and lighting the
 * point it belongs to -- so the highlighted dot and the number under it were
 * two different plies of the same game.
 *
 * What is asserted is the pair agreeing at several plies, not the card's value,
 * because a card that agreed with the coach only at the end -- which is exactly
 * the defect -- would pass a check on any single position. The two are rounded
 * differently, the coach to a whole number and the card to a tenth, so they are
 * compared within one point.
 */
async function checkTheWinrateCardFollowsTheBoard(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
    const textarea = page.locator('.dialog-panel textarea').first()
    await textarea.waitFor({ timeout: 10000 })
    await textarea.fill(SAMPLE_PGN)
    await page.getByRole('button', { name: /Import & Analyze/ }).click()
    await page.locator('.graph-legend').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)

    const readPair = () => page.evaluate(() => {
      const legend = [...document.querySelectorAll('.graph-legend')]
        .find(el => /White win chance/i.test(el.textContent || ''))
      const card = legend ? Number((legend.textContent || '').match(/([\d.]+)%/)?.[1]) : null
      const coach = Number((document.body.innerText.replace(/\s+/g, ' ')
        .match(/(\d+)% for White/) || [])[1])
      return { card, coach }
    })

    // Import lands on the last position, where "Go to last position" is
    // disabled, so the walk is backwards from there rather than reset each time.
    const seen = []
    let at = 0
    for (const back of [0, 6, 12, 24]) {
      for (let step = at; step < back; step++) {
        await page.keyboard.press('ArrowLeft')
        await page.waitForTimeout(60)
      }
      at = back
      await page.waitForTimeout(700)
      const pair = await readPair()
      assert(Number.isFinite(pair.card) && Number.isFinite(pair.coach),
        `${back} plies back: could not read both numbers (card ${pair.card}, coach ${pair.coach})`)
      assert(Math.abs(pair.card - pair.coach) <= 1,
        `${back} plies back: the card says ${pair.card}% and the coach says ${pair.coach}% for the same position`)
      seen.push(pair.card)
    }
    // A card frozen on the last ply agrees with the coach there and nowhere
    // else, so the check is only worth anything if the value actually moved.
    assert(new Set(seen).size > 1,
      `the card read ${seen[0]}% at every ply, so this proves nothing about it following the board`)

    console.log(`  winrate: the card follows the board (${seen.map(v => v + '%').join(', ')}) and agrees with the coach at each`)
  } finally { await context.close() }
}

/**
 * The review card does not call an inaccuracy a mistake.
 *
 * The row that steps through the flagged moves counts inaccuracies, mistakes
 * *and* blunders, and it sits directly under a chip reading "Mistake N".
 * Measured on the sample game before the fix: the chips read "Inaccuracy 6"
 * and "Mistake 2" and the row one line below read **"8 mistakes"** -- two
 * numbers, one word, in the same card. Stepping into it then said "Mistake 3
 * of 8" over a move the same card had graded an inaccuracy.
 *
 * What is asserted is the relationship rather than the wording: whatever the
 * row calls the set, its count has to be the three grades added up, and it
 * must not use the name of one of them. A check on the literal string would
 * pass the day someone changed "mistakes" to "mistake s".
 */
async function checkTheReviewCardNamesItsSet(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
    const textarea = page.locator('.dialog-panel textarea').first()
    await textarea.waitFor({ timeout: 10000 })
    await textarea.fill(SAMPLE_PGN)
    await page.getByRole('button', { name: /Import & Analyze/ }).click()
    await page.getByTestId('review-offer').click()
    // The row only exists once the review has found something to step to, so
    // waiting for it waits for the whole review. 116 positions takes a while
    // even against a fake engine.
    await page.locator('.review-jump-count').waitFor({ timeout: 60000 })
    await page.waitForTimeout(700)

    const card = await page.evaluate(() => {
      const body = document.body.innerText.replace(/\s+/g, ' ')
      const number = name => {
        const found = body.match(new RegExp(`${name}\\s+(\\d+)\\b`))
        return found ? Number(found[1]) : null
      }
      return {
        inaccuracy: number('Inaccuracy'),
        mistake: number('Mistake'),
        blunder: number('Blunder'),
        jump: (document.querySelector('.review-jump-count')?.textContent || '').trim(),
      }
    })

    // The probe before the assertions: without grades there is nothing to add up.
    assert(Number.isFinite(card.inaccuracy) && Number.isFinite(card.mistake) && Number.isFinite(card.blunder),
      `could not read the grade chips (${JSON.stringify(card)})`)
    assert(card.inaccuracy + card.mistake > 0,
      'the sample game produced no inaccuracies or mistakes, so this proves nothing')

    const counted = Number((card.jump.match(/(\d+)/) || [])[1])
    assert(counted === card.inaccuracy + card.mistake + card.blunder,
      `the row says "${card.jump}" but the chips add to ${card.inaccuracy + card.mistake + card.blunder}`)
    assert(!/\bmistakes?\b/i.test(card.jump),
      `the row says "${card.jump}", which is the name of one of the three grades it is adding up`)

    console.log(`  review: the row reads "${card.jump}" for ${card.inaccuracy} inaccuracies, ${card.mistake} mistakes and ${card.blunder} blunders`)
  } finally { await context.close() }
}

/**
 * A database is read until the library is full, and no further.
 *
 * "Open PGN File" invites a database, and Lichess and chess.com hand them over
 * by the thousand. Every game in the file used to have its whole move tree
 * built before the loop asked whether there was anywhere to put it, so a
 * 14,276-game export cost 64.7s of frozen screen at 4x CPU to keep the 500
 * games the library holds; 2,000 games cost 9.2s. Stopping at the cap made all
 * three sizes flat at ~3.1s -- the price of parsing 500 games, not the file.
 *
 * Asserted by counting rather than by clock. The file here is 520 playable
 * games followed by 40 with illegal movetext: reading the whole thing reaches
 * the broken ones and reports them as unreadable, and stopping at the cap
 * never sees them and reports the tail as left out. So the note naming games
 * that "could not be read" is proof the file was read past the point of any
 * use, at any speed and on any machine.
 */
async function checkAFullLibraryStopsReadingTheFile(browser) {
  const OPERA = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 ' +
    '8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 ' +
    '15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0'
  const playable = i => `[Event "Good ${i}"]\n[Site "Paris"]\n[Date "2026.01.01"]\n` +
    `[White "W${i}"]\n[Black "B${i}"]\n[Result "1-0"]\n\n${OPERA}\n`
  const broken = i => `[Event "Broken ${i}"]\n[Site "Nowhere"]\n[Date "2026.01.01"]\n` +
    `[White "W${i}"]\n[Black "B${i}"]\n[Result "*"]\n\n1. e4 e5 2. Qz9 Kx7 *\n`
  const parts = []
  for (let i = 1; i <= 520; i++) parts.push(playable(i))
  for (let i = 1; i <= 40; i++) parts.push(broken(i))
  const database = parts.join('\n')

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
    const textarea = page.locator('.dialog-panel textarea').first()
    await textarea.waitFor({ timeout: 10000 })
    await textarea.fill(database)

    const offer = page.locator('.dialog-database-offer button')
    await offer.waitFor({ timeout: 15000 })
    const offered = (await offer.textContent()).trim()
    assert(/560/.test(offered), `the offer reads "${offered}", so the file did not split into 560 games`)

    // Every frame the browser actually gets to draw, and the label it drew. The
    // work is 3.1s on the thread that paints, so unless the press yields a frame
    // first, nothing is drawn between the press and the answer.
    await page.evaluate(() => {
      window.__frames = []
      const tick = () => {
        const b = document.querySelector('.dialog-database-offer button')
        if (b) window.__frames.push(b.textContent.trim())
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.waitForTimeout(200)
    await page.evaluate(() => { window.__frames.length = 0 })

    const started = Date.now()
    await offer.click()
    const status = page.locator('.library-status')
    await status.waitFor({ timeout: 180000 })
    await page.waitForFunction(() => /Added/.test(document.querySelector('.library-status')?.textContent || ''),
      null, { timeout: 180000 })
    const took = Date.now() - started
    const note = (await status.textContent()).trim()

    assert(/Added 500 games/.test(note), `it said "${note}" rather than filling the library`)
    assert(!/could not be read/i.test(note),
      `it said "${note}" -- it only knows those games are broken because it parsed them, ` +
      'and it had no room left for any of them')
    assert(/60 games left out/.test(note),
      `it said "${note}" rather than counting the 60 games past the cap as left out`)

    const drawn = await page.evaluate(() => [...new Set(window.__frames)])
    assert(drawn.some(label => /Adding/.test(label)),
      `the button read ${JSON.stringify(drawn)} across every frame drawn between the press and the answer -- ` +
      'the reader waited seconds at a button that still looked unpressed')

    console.log(`  database: 560 games, 500 kept, the other 60 never parsed (${took}ms, ` +
      'and the button said "Adding…" first)')
  } finally { await context.close() }
}

/**
 * A database is described, not poured into the paste box.
 *
 * A textarea lays out every character it holds, visible or not. Measured at 4x
 * CPU: 220 KB costs 73ms of layout, 900 KB costs 299ms and 4.9 MB costs 1639ms
 * -- spent on the twelve lines of a 15,000-game export that fit on screen, in a
 * box whose contents nobody can read, edit or scroll to any purpose. Opening
 * that file took 2404ms end to end before the reader could do anything;
 * describing it instead takes 720ms.
 *
 * The small file is checked as well as the big one. A rule that hid the text
 * whatever its size would pass every assertion about the big one and take the
 * paste box away from the case it exists for.
 */
async function checkABigFileIsDescribedNotShown(browser) {
  const OPERA = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 ' +
    '8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 ' +
    '15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0'
  const game = i => `[Event "Game ${i}"]\n[Site "Paris"]\n[Date "2026.01.01"]\n` +
    `[White "W${i}"]\n[Black "B${i}"]\n[Result "1-0"]\n\n${OPERA}\n`
  const database = n => Array.from({ length: n }, (_u, i) => game(i + 1)).join('\n')
  // 512,000 characters is the ceiling -- the largest single game the library
  // takes -- so one file has to sit either side of it by a clear margin.
  const big = database(2200)
  const small = database(40)

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
    await page.locator('.dialog-panel textarea').first().waitFor({ timeout: 10000 })

    const open = async (text, name) => {
      await page.locator('input[type=file].dialog-file-input')
        .setInputFiles({ name, mimeType: 'application/x-chess-pgn', buffer: Buffer.from(text, 'utf8') })
      await page.waitForFunction(() => Boolean(document.querySelector('.dialog-file-name')),
        null, { timeout: 30000 })
      await page.waitForTimeout(300)
      return page.evaluate(() => ({
        boxChars: document.querySelector('textarea.input-textarea')?.value.length ?? -1,
        summary: document.querySelector('.dialog-file-summary p')?.textContent?.trim() || null,
        chip: document.querySelector('.dialog-file-name')?.textContent?.trim() || null,
        offer: document.querySelector('.dialog-database-offer button')?.textContent?.trim() || null,
      }))
    }

    assert(big.length > 512_000 && small.length < 512_000,
      `the two files are ${big.length} and ${small.length} characters, which do not straddle the ceiling`)

    const shown = await open(small, 'a-few-games.pgn')
    assert(shown.boxChars === small.length,
      `a ${Math.round(small.length / 1024)} KB file left ${shown.boxChars} characters in the box ` +
      'rather than its own text -- the box has stopped doing the job it exists for')
    assert(shown.summary === null, `a small file was described as "${shown.summary}" instead of shown`)

    // Emptied through the box itself, the way a reader would, so the next file
    // lands on the same state a fresh dialog would have.
    await page.evaluate(() => {
      const ta = document.querySelector('textarea.input-textarea')
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(ta, '')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    const described = await open(big, 'a-whole-database.pgn')
    assert(described.boxChars === -1,
      `a ${Math.round(big.length / 1024)} KB file put ${described.boxChars} characters into a textarea, ` +
      'every one of which the browser lays out to show twelve lines of')
    assert(described.summary && /2,200 games/.test(described.summary),
      `it stands in for the box with "${described.summary}", which does not say what the file holds`)
    assert(described.chip === 'a-whole-database.pgn',
      `the file name reads "${described.chip}"`)
    assert(described.offer && /2,200 games/.test(described.offer),
      `the offer reads "${described.offer}" -- the way to keep the file has to survive not showing it`)

    await page.locator('.dialog-file-summary button').click()
    await page.waitForTimeout(300)
    const cleared = await page.evaluate(() => ({
      boxChars: document.querySelector('textarea.input-textarea')?.value.length ?? -1,
      chip: document.querySelector('.dialog-file-name')?.textContent?.trim() || null,
    }))
    assert(cleared.boxChars === 0 && cleared.chip === null,
      `Clear left the box at ${cleared.boxChars} characters and the chip at "${cleared.chip}"`)

    console.log(`  import box: ${Math.round(small.length / 1024)} KB shown, ` +
      `${Math.round(big.length / 1024)} KB described ("${described.summary}"), Clear gives the box back`)
  } finally { await context.close() }
}

/**
 * A PGN dragged onto the window is taken, not followed.
 *
 * The app had no drag handling at all. Measured before the fix, dragging a
 * `.pgn` over the board: `dragenter` and two `dragover` events arrive,
 * cancelable and uncancelled, and then **no `drop` event is delivered** --
 * an uncancelled `dragover` is how a page refuses a drop, and what a browser
 * does with a file no page wanted is open it in place of the page. A reader
 * who tried the obvious thing next to an "Open PGN File" button lost the
 * screen they were on.
 *
 * The assertion is the drop event itself. It cannot be delivered unless
 * something cancelled the `dragover` before it, so a run where the file lands
 * in the dialog is a run where the browser was not going to navigate.
 */
async function checkADroppedPgnIsTaken(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.locator('#chessboard-square-e2').waitFor({ timeout: 20000 })

    await page.evaluate(() => {
      window.__drops = 0
      window.addEventListener('drop', () => { window.__drops++ }, true)
    })

    const client = await context.newCDPSession(page)
    const file = path.join(__dirname, 'fixtures', 'opera-game.pgn')
    const box = await page.locator('.board-wrap').boundingBox()
    const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
    const data = { items: [], files: [file], dragOperationsMask: 1 }
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await client.send('Input.dispatchDragEvent', { type, ...at, data })
    }

    await page.locator('.dialog-file-name').waitFor({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => ({
      drops: window.__drops,
      chip: document.querySelector('.dialog-file-name')?.textContent?.trim() || null,
      chars: document.querySelector('textarea.input-textarea')?.value.length ?? -1,
      onImportTab: [...document.querySelectorAll('.mode-card')]
        .some(b => b.getAttribute('aria-pressed') === 'true' && /Import/.test(b.textContent || '')),
      url: location.href,
      stillTheApp: Boolean(document.querySelector('#chessboard-square-e2')),
    }))

    assert(after.drops === 1,
      `${after.drops} drop events reached the page -- an uncancelled dragover refuses the drop, ` +
      'and the browser then opens the file in place of the app')
    assert(after.chip === 'opera-game.pgn',
      `the dialog names the dropped file as "${after.chip}"`)
    assert(after.chars > 200, `the box holds ${after.chars} characters of the dropped game`)
    assert(after.onImportTab, 'the dialog opened somewhere other than the tab that takes a game')
    assert(after.stillTheApp && /web-chess/.test(after.url),
      `the page is now ${after.url}`)

    console.log(`  drop: a .pgn on the board opens the import dialog holding it (${after.chars} characters), app still there`)
  } finally { await context.close() }
}

/**
 * Back closes the sheet, not the app.
 *
 * On a phone these dialogs fill the screen and read as pages, so Back is the
 * gesture that gets tried on them. The app touched history nowhere at all, so
 * it did what an app that ignores history does: measured at 390x844, Back with
 * the PGN dialog, the library or the command palette open landed on the
 * previous page with the game off the screen, and coming Forward again met the
 * auto-save recovery prompt rather than the board.
 *
 * Both halves are asserted. Closing the sheet is the fix; still being able to
 * leave is the thing a fix like this takes away if it is written carelessly,
 * and a history trap is worse than the defect.
 */
async function checkBackClosesTheSheet(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    // Somewhere to go back to, the way a reader arrives from a link.
    await page.goto('about:blank')
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.locator('#chessboard-square-e2').waitFor({ timeout: 20000 })

    // A move worth not losing, read off the board rather than off the page:
    // the move list is not on screen at this width.
    await page.locator('#chessboard-square-e2').click()
    await page.waitForTimeout(150)
    await page.locator('#chessboard-square-e4').click()
    await page.waitForTimeout(700)
    const squares = () => page.evaluate(() => ({
      e2: document.querySelector('#chessboard-square-e2')?.innerHTML.length ?? -1,
      e4: document.querySelector('#chessboard-square-e4')?.innerHTML.length ?? -1,
    }))
    const played = await squares()
    assert(played.e4 > played.e2, `the move did not land: e2 ${played.e2}, e4 ${played.e4}`)

    for (const [label, selector] of [
      ['the PGN dialog', '[aria-label="Open PGN and FEN dialog"]'],
      ['the library', 'button[aria-label*="ibrar" i]'],
      ['the command palette', 'button[aria-label*="ommand" i]'],
    ]) {
      await page.locator(selector).first().click({ timeout: 10000 })
      await page.waitForTimeout(500)
      const opened = await page.evaluate(() =>
        Boolean(document.querySelector('.dialog-panel, .command-palette, .settings-panel')))
      assert(opened, `${label} did not open`)

      await page.goBack({ timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(700)
      const after = await page.evaluate(() => ({
        overlay: Boolean(document.querySelector('.dialog-panel, .command-palette, .settings-panel')),
        app: Boolean(document.querySelector('#chessboard-square-e2')),
      }))
      assert(after.app, `Back with ${label} open left the app`)
      assert(!after.overlay, `Back with ${label} open did not close it`)
      const board = await squares()
      assert(board.e2 === played.e2 && board.e4 === played.e4,
        `Back with ${label} open moved the board: e2 ${board.e2} was ${played.e2}, e4 ${board.e4} was ${played.e4}`)
    }

    // Closed the ordinary way, the pushed entry has to be spent too, or Back
    // stops working for a reader who wants to leave.
    await page.locator('[aria-label="Open PGN and FEN dialog"]').first().click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await page.goBack({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    const left = await page.evaluate(() => Boolean(document.querySelector('#chessboard-square-e2')))
    assert(!left, 'after opening and closing a sheet, Back no longer leaves the app -- that is a trap')

    console.log('  back: closes the sheet and keeps the board; one more Back still leaves')
  } finally { await context.close() }
}

/**
 * The promotion chooser can be hit, and can be seen.
 *
 * Nothing had ever checked it: it exists only between a pawn reaching the last
 * rank and the piece being chosen, so the suite's sweep of every control never
 * met it. **Measured** on a white pawn on b7, promoting at five sizes: the
 * Cancel button was 34px tall everywhere -- the one target in the app under
 * the 44px floor the rest is swept against -- and sideways on a phone the four
 * piece buttons were **31px wide at 844x390 and 27px at 667x375**, because the
 * chooser is sized by the board and the board is 203px wide there.
 *
 * Widening it to the window in landscape then put it *behind* the analysis
 * column, which `elementFromPoint` cheerfully denied: the press still landed,
 * because hit-testing put the chooser on top, while the screenshot showed a
 * sliver with a "Q" in it. `.board-stage` is `position: relative; z-index: 1`
 * and `.panel` is `z-index: 4`, so nothing inside the stage can paint above a
 * panel at any z-index of its own. The stage is lifted while the chooser is up.
 *
 * The visibility half is asserted as the rule that decides paint order:
 * wherever the chooser overlaps a panel, the stage it lives in has to sit
 * above that panel. Comparing pixels was tried first and is worthless here --
 * the panels re-render when the position changes, so the rectangle differs
 * between "chooser up" and "chooser gone" whether or not anything of the
 * chooser was ever drawn in it. It passed with the fix backed out.
 */
async function checkThePromotionChooserCanBeHit(browser) {
  // A white pawn one square from promoting, kings far apart.
  const FEN = '8/1P6/8/k7/8/8/8/7K w - - 0 1'
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.locator('#chessboard-square-e2').waitFor({ timeout: 20000 })
    const client = await context.newCDPSession(page)

    const openChooser = async () => {
      await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
      await page.locator('.dialog-panel').waitFor({ timeout: 15000 })
      await page.getByRole('button', { name: /^FEN$/ }).click()
      await page.waitForTimeout(300)
      await page.locator('.dialog-section textarea').first().fill(FEN)
      await page.waitForTimeout(250)
      await page.getByRole('button', { name: /Load & Analyze/i }).first().click()
      await page.waitForTimeout(1200)
      await page.locator('#chessboard-square-b7').click()
      await page.waitForTimeout(200)
      await page.locator('#chessboard-square-b8').click()
      await page.locator('.promotion-chooser').waitFor({ timeout: 15000 })
      await page.waitForTimeout(500)
    }

    for (const [w, h] of [[1440, 900], [390, 844], [320, 568], [844, 390], [667, 375]]) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(300)
      await openChooser()

      const buttons = await page.evaluate(() =>
        [...document.querySelectorAll('.promotion-chooser button')].map(b => {
          const r = b.getBoundingClientRect()
          return {
            label: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 20),
            w: Math.round(r.width), h: Math.round(r.height),
            x: Math.round(r.left), y: Math.round(r.top),
          }
        }))
      assert(buttons.length === 5, `the chooser has ${buttons.length} buttons, not four pieces and a cancel`)
      for (const b of buttons) {
        assert(b.w >= 44 && b.h >= 44,
          `at ${w}x${h} "${b.label}" is ${b.w}x${b.h} -- under the 44px this app holds every other control to, ` +
          'on the press that decides what a pawn becomes')
      }

      // Where the chooser overlaps a panel, the stage has to paint above it.
      // Only where it overlaps: inside the board, which is everywhere but
      // landscape, the stage sitting under the panels is correct and asserting
      // otherwise would fail on a layout that is fine.
      const clashes = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell')
        const stage = document.querySelector('.board-stage')
        const zOf = el => Number(getComputedStyle(el).zIndex) || 0
        // The stage and the panels are not siblings -- .panel.bottom hangs off
        // the shell while .panel.left hangs off .main-container -- so a flat
        // comparison of their z-indexes is only meaningful while nothing
        // between them and the shell starts a stacking context of its own.
        const starts = el => {
          const s = getComputedStyle(el)
          return (s.position !== 'static' && s.zIndex !== 'auto') || s.transform !== 'none' ||
            s.filter !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none') ||
            s.isolation === 'isolate' || Number(s.opacity) < 1 || s.mixBlendMode !== 'normal' ||
            (s.willChange && /transform|opacity|filter/.test(s.willChange)) ||
            (s.contain && /paint|layout|strict|content/.test(s.contain))
        }
        const between = []
        for (let el = stage.parentElement; el && el !== shell; el = el.parentElement) {
          if (starts(el)) between.push(String(el.className).slice(0, 24))
        }
        const chooser = document.querySelector('.promotion-chooser').getBoundingClientRect()
        const out = { flatComparison: between.length === 0, between, clashes: [] }
        for (const panel of document.querySelectorAll('.panel')) {
          const r = panel.getBoundingClientRect()
          const overlaps = chooser.left < r.right && chooser.right > r.left &&
            chooser.top < r.bottom && chooser.bottom > r.top
          if (overlaps && zOf(panel) >= zOf(stage)) {
            out.clashes.push({ panel: String(panel.className).slice(0, 24), panelZ: zOf(panel), stageZ: zOf(stage) })
          }
        }
        return out
      })
      assert(clashes.flatComparison,
        `${JSON.stringify(clashes.between)} now starts a stacking context between the board stage and the ` +
        'shell, so comparing the stage and the panels by z-index alone proves nothing')
      assert(clashes.clashes.length === 0,
        `at ${w}x${h} the chooser reaches over ${JSON.stringify(clashes.clashes)} -- everything inside the ` +
        'stage paints under a panel with a higher z-index, whatever the chooser asks for itself')

      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }

    console.log('  promotion: every choice clears 44px at five sizes, and is painted where it is pressed')
  } finally { await context.close() }
}

/**
 * A notice fits the screen, and is in front of the bar it lands on.
 *
 * The notices are sentences. "That shared link could not be read — showing the
 * starting position." draws 428px wide, and the region holding it was a point
 * in the middle of the window that its contents grew out of in both
 * directions, with `white-space: nowrap` and no width. **Measured** at 320x568:
 * 54px off the left edge and 54px off the right, first word and last, and
 * nothing on the page able to scroll them back.
 *
 * Behind that was a worse one. The region is `z-index: 40` and `.panel.bottom`
 * is `z-index: 200` on a phone, and they overlap: at 320x568 and 390x844 a
 * screenshot of that corner had no notice in it at all. Every message the app
 * raises reached a screen reader through `aria-live` and no sighted phone
 * reader whatsoever.
 *
 * Two probes had to be thrown away before this one. `elementFromPoint` names
 * whatever is underneath whether the notice is in front or not, because the
 * region is `pointer-events: none` and hit-testing steps straight past it.
 * Comparing the pixels of that rectangle with the notice up and again once it
 * has gone is no better: the bar is glass, so a notice hidden behind it still
 * changes what bleeds through, and the comparison passes with the fix backed
 * out while a screenshot of the same rectangle shows nothing but the bar.
 *
 * So the rule is worked out properly. Paint order between two elements is
 * decided where their branches part, by the z-index each carries into that
 * shared stacking context -- its own, unless an ancestor below the branch
 * point starts a context, in which case that ancestor's is what counts.
 */
async function checkANoticeIsSeenAndFits(browser) {
  for (const [w, h] of [[320, 568], [360, 640], [390, 844], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await context.newPage()
    try {
      await page.addInitScript(fakeEngineScript())
      // A share link carrying something unreadable: the longest thing the app
      // says, raised without any interaction to time.
      await page.goto(`${BASE}#game=~~~~notreal~~~~`, { waitUntil: 'domcontentloaded' })
      const startFresh = page.getByRole('button', { name: /start fresh/i })
      if (await startFresh.count()) await startFresh.first().click()
      await page.locator('.app-notice').waitFor({ timeout: 20000 })
      await page.waitForTimeout(300)

      const seen = await page.evaluate(() => {
        const zOf = el => Number(getComputedStyle(el).zIndex) || 0
        const startsContext = el => {
          const c = getComputedStyle(el)
          return (c.position !== 'static' && c.zIndex !== 'auto') || c.transform !== 'none' ||
            c.filter !== 'none' || (c.backdropFilter && c.backdropFilter !== 'none') ||
            c.isolation === 'isolate' || Number(c.opacity) < 1 || c.mixBlendMode !== 'normal' ||
            (c.contain && /paint|layout|strict|content/.test(c.contain))
        }
        const chainOf = el => { const out = []; for (let n = el; n; n = n.parentElement) out.push(n); return out }
        // What this element carries into the stacking context it shares with
        // the other: its own z-index, unless something below the branch point
        // starts a context, in which case the outermost such ancestor decides.
        const carriedInto = (el, common) => {
          let z = zOf(el)
          for (let n = el.parentElement; n && n !== common; n = n.parentElement) {
            if (startsContext(n)) z = zOf(n)
          }
          return z
        }
        const region = document.querySelector('.app-notice-region')
        const note = document.querySelector('.app-notice')
        const r = note.getBoundingClientRect()
        const regionChain = chainOf(region)
        const behind = []
        for (const panel of document.querySelectorAll('.panel')) {
          const q = panel.getBoundingClientRect()
          const overlaps = r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top
          if (!overlaps) continue
          const common = chainOf(panel).find(n => regionChain.includes(n))
          const mine = carriedInto(region, common)
          const theirs = carriedInto(panel, common)
          if (theirs >= mine) {
            behind.push({ panel: String(panel.className).slice(0, 20), theirs, mine, common: String(common.className).slice(0, 16) })
          }
        }
        return {
          text: note.textContent.trim(),
          left: Math.round(r.left), right: Math.round(r.right),
          width: Math.round(r.width), win: window.innerWidth,
          behind,
        }
      })

      assert(/could not be read/.test(seen.text), `the notice reads "${seen.text}"`)
      assert(seen.left >= 0 && seen.right <= seen.win,
        `at ${w}x${h} the notice runs from ${seen.left} to ${seen.right} in a ${seen.win}px window -- ` +
        `${Math.max(0, -seen.left)}px off the left and ${Math.max(0, seen.right - seen.win)}px off the right, ` +
        'with nothing able to scroll it back')
      assert(seen.behind.length === 0,
        `at ${w}x${h} the notice lands on ${JSON.stringify(seen.behind)} and is drawn behind it`)
    } finally { await context.close() }
  }
  console.log('  notice: the longest message fits 320px and is drawn in front of the bar it lands on')
}

/**
 * Draw mode ends where the board's purpose changes.
 *
 * The mode eats presses by design -- a tap is an arrow, not a move -- which is
 * right while the reader is annotating and a trap the moment the app hands the
 * board back to be moved in. Measured at 375x812 before the fix: with Draw on
 * in Analysis, switching to Play left it on and e2-e4 did nothing; a new game
 * left it on; and a drill started with it on sat asking for a move that no tap
 * could make.
 *
 * Needs its own context: the control is `pointer: coarse` only, so it does not
 * exist in the suite's ordinary viewports, and the trap it guards is a phone's.
 * What is asserted is the outcome rather than the flag -- the move has to land,
 * because a toggle reading "Draw" over a board that still eats presses would
 * pass a check on the flag alone.
 */
async function checkDrawModeEndsWithItsPurpose(browser) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.waitForFunction(() => window.__uciBestmoves >= 1, null, { timeout: 20000 })

    const toggle = page.locator('.board-draw-toggle')
    assert(await toggle.count() === 1, 'the phone has no Draw control, so this check has nothing to exercise')
    await toggle.click()
    await page.waitForFunction(() => document.querySelector('.board-draw-toggle')?.getAttribute('aria-pressed') === 'true',
      null, { timeout: 5000 })

    // Into Play, which is a board to move in.
    await page.getByRole('button', { name: 'Play', exact: true }).first().click()
    await page.waitForTimeout(600)
    const pressed = await toggle.getAttribute('aria-pressed')
    assert(pressed !== 'true', 'Draw mode survived the move into Play')
    await page.click('#chessboard-square-e2')
    await page.click('#chessboard-square-e4')
    await page.waitForTimeout(400)
    const moved = await page.evaluate(() => !!document.querySelector('[data-square="e4"] [data-piece]'))
    assert(moved, 'the first move of a new game was eaten by a drawing mode')

    // And a deliberate press inside Play is left alone: this ends the mode on a
    // change of purpose, not on every render.
    await toggle.click()
    await page.waitForTimeout(400)
    assert(await toggle.getAttribute('aria-pressed') === 'true',
      'Draw could not be turned on inside Play, so the mode is unusable where it was asked for')
    console.log('  draw mode: ends at the move into Play, and can still be turned on there')
  } finally { await context.close() }
}

async function checkDrillLeavesTheLineAlone(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await page.addInitScript(fakeEngineScript())
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()
    await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
    await page.waitForFunction(() => window.__uciBestmoves >= 1, null, { timeout: 20000 })

    for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]) {
      await page.click('#chessboard-square-' + from)
      await page.click('#chessboard-square-' + to)
      await page.waitForTimeout(200)
    }
    const pgnNow = () => page.evaluate(() => {
      const tree = document.querySelector('.mtree-scroll')
      return tree ? tree.textContent.replace(/\s+/g, '') : ''
    })
    const before = await pgnNow()
    assert(before.includes('e4') && before.includes('Nf3'),
      `the line was not built, so this check has nothing to protect: "${before}"`)

    /*
     * Started while a replay is running, because that is where it broke: the
     * drill opened correctly and then watched autoplay walk the board off its
     * own line. Measured at 1440x900 before the fix -- "Playing White · move 1
     * of 4" became "Paused ... the board has moved off the line" 2.5s later,
     * with nothing the reader did having moved the board.
     *
     * From the root, since autoplay stops itself at the end of a line and would
     * otherwise prove nothing here.
     */
    await page.keyboard.press('Home')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /autoplay/i }).first().click()
    await page.waitForFunction(() => !!document.querySelector('[aria-label*="Stop autoplay" i]'),
      null, { timeout: 5000 })

    await page.click('.drill-row button[aria-label="Drill this line as White"]')
    await page.waitForTimeout(600)
    assert(await page.locator('[aria-label*="Stop autoplay" i]').count() === 0,
      'the replay kept running into a drill that had just started')
    // Long enough for a replay to have stepped, if one were still going.
    await page.waitForTimeout(1800)
    const heldOnTheLine = await page.evaluate(() => document.querySelector('.drill-card')?.innerText.replace(/\s+/g, ' ') || '')
    assert(/move 1 of/.test(heldOnTheLine) && !/Paused/.test(heldOnTheLine),
      `a drill started during a replay did not hold its position: "${heldOnTheLine}"`)

    // The wrong moves are the whole point, and the line is checked straight
    // after them: a drill that records what you got wrong is caught here rather
    // than three moves later when the board has drifted too far to tell.
    for (const [from, to] of [['d2', 'd4'], ['b1', 'c3']]) {
      await page.click('#chessboard-square-' + from)
      await page.click('#chessboard-square-' + to)
      await page.waitForTimeout(250)
    }
    const afterMisses = await pgnNow()
    assert(afterMisses === before,
      `a wrong move was recorded: "${before}" became "${afterMisses}"`)
    const missed = await page.evaluate(() => document.querySelector('.drill-card')?.innerText.replace(/\s+/g, ' ') || '')
    assert(/Not the line/.test(missed),
      `the wrong moves were not judged, so nothing was exercised: "${missed}"`)

    await page.click('#chessboard-square-e2')
    await page.click('#chessboard-square-e4')
    await page.waitForTimeout(300)
    const drillState = await page.evaluate(() => document.querySelector('.drill-card')?.innerText.replace(/\s+/g, ' ') || '')
    assert(/move 2 of 2/.test(drillState),
      `the drill did not advance on the right move: "${drillState}"`)

    const after = await pgnNow()
    assert(after === before,
      `drilling changed the line: "${before}" became "${after}"`)
    console.log('  drill: two wrong moves and a right one leave the line byte for byte')
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
    // Seed origin-wide caches before this app's worker can activate.
    await page.route('**/cache-seed', route => route.fulfill({ contentType: 'text/html', body: '<title>Cache seed</title>' }))
    await page.goto(`http://127.0.0.1:${BARE_PORT}/cache-seed`)
    await page.evaluate(async () => {
      for (const name of ['web-katrain-v1:runtime', 'unrelated-app', 'web-chess-v0:runtime', 'web-chess-v10:runtime']) {
        const cache = await caches.open(name)
        await cache.put('/sentinel', new Response('keep me'))
      }
    })
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
    const cacheNames = await page.evaluate(() => caches.keys())
    assert(cacheNames.includes('web-katrain-v1:runtime') && cacheNames.includes('unrelated-app'),
      'activating Web Chess deleted another app’s offline cache')
    assert(!cacheNames.includes('web-chess-v0:runtime') && !cacheNames.includes('web-chess-v10:runtime'),
      'obsolete Web Chess caches survived activation')
    console.log('  cache ownership: sibling apps preserved; obsolete chess caches removed')
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

/**
 * Every text node on screen, measured against what is actually painted behind
 * it.
 *
 * Written after a hand pass found six of these in one sitting -- the light
 * theme's accent as ink, three review chips, the small metadata text, and two
 * selected states -- each of them a value that was correct in one theme, one
 * state or one file and not the others. Unit tests over the tokens catch the
 * palette; only the running page catches a token used somewhere its contrast
 * was never checked.
 *
 * Three things the obvious version of this gets wrong, all of them learned by
 * getting them wrong:
 *
 *   - Compositing has to collect the translucent layers out to the first
 *     opaque one and then paint them back to front. Compositing as you climb
 *     forces alpha to 1 after the first step and stops two layers up, which
 *     reads a teal pill on a black panel as near-white and invents failures.
 *   - Transitions have to be finished first. The theme is applied in an
 *     effect, so switching it is an animation, and a computed colour read
 *     mid-transition is the *old* colour.
 *   - A gradient has to be measured against its own colour stops, not stepped
 *     past. Skipping every element under one is not an option -- this app
 *     paints most of its panels that way, and that version measured 16
 *     elements out of hundreds, a green tick over nothing. Stepping past one
 *     is not an option either: it is harmless for a shallow glass fill over an
 *     opaque panel, and completely wrong for a gradient-*filled* button, where
 *     the colour beneath is the panel rather than the fill the text sits on.
 *     That read "Copy PGN" -- dark ink on a bright teal button -- as 1.01:1.
 *     So the stops are parsed and the worst of them is the reading, which is
 *     the same thing a reader's eye does with the least legible part of it.
 */
function contrastProbe() {
  function parse(value) {
    const match = value.match(/rgba?\(([^)]+)\)/)
    if (!match) return null
    const parts = match[1].split(',').map(part => Number.parseFloat(part))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  function over(fg, bg) {
    return {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    }
  }
  function luminance(colour) {
    const channel = value => {
      const v = value / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b)
  }
  function ratio(a, b) {
    const first = luminance(a)
    const second = luminance(b)
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
  }
  /** Every colour a gradient names, or null when it names none. */
  function gradientStops(image) {
    if (!image || image === 'none') return null
    const found = [...image.matchAll(/rgba?\([^)]+\)/g)].map(match => parse(match[0])).filter(Boolean)
    return found.length ? found : null
  }

  function themeGround() {
    return document.documentElement.dataset.theme === 'light'
      ? { r: 255, g: 255, b: 255, a: 1 }
      : { r: 8, g: 9, b: 11, a: 1 }
  }

  /** Flatten a stack of translucent layers, outermost last, onto a ground. */
  function flatten(layers, ground) {
    let base = ground
    for (let index = layers.length - 1; index >= 0; index -= 1) base = over(layers[index], base)
    return base
  }

  /**
   * The opaque colour under `node`, counting its own background-color. Used as
   * the ground a translucent gradient stop is painted onto -- most of this
   * app's gradients are translucent, so compositing a stop onto anything else
   * (grey, say) invents a colour nothing on screen has.
   */
  function solidGroundFrom(node) {
    const layers = []
    let current = node
    while (current && current.nodeType === 1) {
      const background = parse(getComputedStyle(current).backgroundColor)
      if (background && background.a > 0) {
        layers.push(background)
        if (background.a >= 0.999) break
      }
      current = current.parentElement
    }
    const ground = layers.length && layers[layers.length - 1].a >= 0.999 ? layers.pop() : themeGround()
    return flatten(layers, ground)
  }

  /**
   * Every ground the text could be sitting on. One entry for a flat colour,
   * one per stop for a gradient -- the caller takes the worst.
   */
  function backgroundsOf(element) {
    const above = []
    let node = element
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node)
      const stops = gradientStops(style.backgroundImage)
      if (stops) {
        const ground = solidGroundFrom(node)
        return { bases: stops.map(stop => flatten(above, over(stop, ground))), onGradient: true }
      }
      const background = parse(style.backgroundColor)
      if (background && background.a > 0) {
        above.push(background)
        if (background.a >= 0.999) break
      }
      node = node.parentElement
    }
    const ground = above.length && above[above.length - 1].a >= 0.999 ? above.pop() : themeGround()
    return { bases: [flatten(above, ground)], onGradient: false }
  }

  const failures = []
  let unverified = 0
  let checked = 0
  for (const element of document.querySelectorAll('body *')) {
    const text = (element.textContent || '').trim()
    if (!text || element.children.length > 0) continue
    const box = element.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) continue
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.opacity === '0' || style.display === 'none') continue
    if (element.closest('[inert],[aria-hidden="true"]')) continue
    const ink = parse(style.color)
    if (!ink) continue
    const { bases, onGradient } = backgroundsOf(element)
    if (onGradient) unverified += 1
    checked += 1
    const size = Number.parseFloat(style.fontSize)
    const bold = Number.parseInt(style.fontWeight, 10) >= 700
    const floor = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5
    // The worst ground it could be sitting on, which is the one a reader
    // struggles with.
    const measured = Math.min(...bases.map(base => ratio(over(ink, base), base)))
    if (measured >= floor) continue
    failures.push({
      text: text.slice(0, 30),
      selector: element.tagName.toLowerCase() + (element.className ? '.' + String(element.className).trim().split(/\s+/).join('.') : ''),
      contrast: Number(measured.toFixed(2)),
      floor,
      px: Number(size.toFixed(1)),
      ink: style.color,
    })
  }
  return { failures, unverified, checked }
}

/**
 * `minimum` is how many elements this surface should yield before a pass means
 * anything. It is per-surface because a dialog legitimately holds far less
 * text than a panel -- New Game measures 22 -- and a single global floor is
 * either too low to catch a probe that measured nothing or too high to let a
 * dialog through. The first version of this sweep passed cleanly over 16
 * elements, which is the failure this number exists to make impossible.
 */
async function assertContrast(page, label, minimum = 40) {
  // Nothing is measurable until the transitions have finished; see contrastProbe.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try { animation.finish() } catch { /* a running infinite animation cannot finish */ }
    }
  })
  await page.waitForTimeout(250)
  const result = await page.evaluate(contrastProbe)
  assert(result.checked >= minimum,
    `${label}: the contrast probe only measured ${result.checked} elements (expected at least ${minimum}), so a pass proves nothing`)
  const described = result.failures
    .map(row => `${row.selector} "${row.text}" ${row.contrast}:1 < ${row.floor} at ${row.px}px (${row.ink})`)
    .join('; ')
  assert(result.failures.length === 0, `${label}: text under its contrast floor: ${described}`)
  console.log(`  contrast (${label}): ${result.checked} measured, 0 under the floor`
    + ` (${result.unverified} on a gradient, measured against its worst stop)`)
}

async function openSettings(page) {
  await page.getByRole('button', { name: /open settings/i }).click()
  await page.locator('.settings-body').waitFor({ timeout: 5000 })
}

// Escape rather than the Done button: the dialog's own focus hook closes on
// it, and it needs nothing to be hittable.
async function closeSettings(page) {
  await page.keyboard.press('Escape')
  await page.locator('.settings-body').waitFor({ state: 'detached', timeout: 5000 })
}

/**
 * Scoped to the theme group, because "Light" and "Dark" are ordinary enough
 * words to collide, and asserted afterwards -- a sweep labelled "light" that
 * ran against the dark theme would pass and prove nothing.
 */
async function chooseTheme(page, name) {
  await page.locator('[aria-labelledby="app-theme-label"] button', { hasText: new RegExp(`^${name}$`) }).click()
  await page.waitForFunction(
    expected => document.documentElement.dataset.theme === expected,
    name.toLowerCase(), { timeout: 5000 },
  )
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
    const focusedChecks = {
      startup: checkEngineStartupTimeout,
      autosave: checkAutosaveFailure,
      resources: checkSingleThreadReviewPool,
      lab: checkLabSettingsStayInSync,
      continuous: checkKeepSearchingIsUnbounded,
    }
    if (process.env.UI_TEST_ONLY) {
      const check = focusedChecks[process.env.UI_TEST_ONLY]
      if (!check) throw new Error(`Unknown UI_TEST_ONLY: ${process.env.UI_TEST_ONLY}`)
      await check(browser)
      console.log('Focused browser UI checks passed.')
      return
    }

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

      /**
       * And every piece's box is its square, which is not the same question as
       * whether the art looks right.
       *
       * The board library leaves each piece's SVG `display: inline` inside the
       * draggable wrapper it gives it, so the wrapper's box is a line box: the
       * art plus the strut's descender under it. The art is square and
       * top-aligned, so nothing looks wrong -- but the box is what the browser
       * focuses and scrolls to, and it stood 7px past the bottom of its square
       * at every board size, the leading coming from the font rather than the
       * board.
       *
       * Two consequences, which is why this is measured on the running page
       * rather than asserted over a stylesheet: the focus ring on a near-rank
       * piece was clipped by the board's own edge, and tabbing to one scrolled
       * the board's `overflow: hidden` grid down 7px to reveal a box that did
       * not fit -- the whole board shifting under the reader, with the far rank
       * sliced off the top.
       *
       * Asserted at every viewport because a board that agrees at one size can
       * disagree at another: the overhang is a constant, so it is a larger share
       * of a small square, and the landscape phone has the smallest squares the
       * app draws.
       */
      const pieceBoxes = await page.evaluate(() => {
        const off = []
        for (const piece of document.querySelectorAll('[data-square] [data-piece]')) {
          const square = piece.closest('[data-square]')
          const sr = square.getBoundingClientRect()
          const pr = piece.getBoundingClientRect()
          const overhang = Math.max(Math.abs(pr.bottom - sr.bottom), Math.abs(pr.top - sr.top))
          if (overhang > 0.5) off.push(`${square.getAttribute('data-square')} by ${overhang.toFixed(1)}px`)
        }
        const grid = document.querySelector('.board-surface')?.firstElementChild
        return {
          off: off.slice(0, 4),
          counted: document.querySelectorAll('[data-square] [data-piece]').length,
          spill: grid ? grid.scrollHeight - grid.clientHeight : null,
        }
      })
      assert(pieceBoxes.counted === 32,
        `${viewport.name}: ${pieceBoxes.counted} pieces on the board, not 32`)
      assert(pieceBoxes.off.length === 0,
        `${viewport.name}: pieces standing outside their square: ${pieceBoxes.off.join(', ')}`)
      assert(pieceBoxes.spill === 0,
        `${viewport.name}: the board clips ${pieceBoxes.spill}px of its own content`)

      // Which the board proves by holding still while a near-rank piece takes
      // focus -- the symptom a reader would actually have seen.
      const shiftOnFocus = await page.evaluate(async () => {
        const grid = document.querySelector('.board-surface').firstElementChild
        const before = grid.scrollTop
        document.querySelector('[data-square="a1"] [role="button"]')?.focus()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const after = grid.scrollTop
        document.activeElement?.blur()
        return after - before
      })
      assert(shiftOnFocus === 0,
        `${viewport.name}: focusing a near-rank piece scrolled the board ${shiftOnFocus}px`)

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
        // The real import path, with a local PGN fixture supplied by the fake
        // engine harness. Remote availability is checked separately.
        await page.waitForFunction(
          () => /Browser QA, White/.test(document.body.innerText) && /\bMove\s+\d\d/.test(document.body.innerText),
          null, { timeout: 25000 })
          .catch(() => fail(
            'the local sample PGN fixture did not load within 25s.',
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

        // Which path the review took. A pooled review boots engines of its own,
        // so more than one construction means the pool ran; one means this
        // runner sized itself down to the shared engine. Both are correct and
        // both must produce the numbers asserted above -- the point of saying
        // it is that a suite which silently only ever exercised one of them
        // would look exactly like this one.
        const engines = await page.evaluate(() => window.__engineCount || 0)
        assert(engines >= 1, 'desktop: the review ran without constructing an engine')
        console.log(`  review engines: ${engines} (${engines > 1 ? 'pooled' : 'single'})`)

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

      // The mode strip scrolls sideways at this size, and the pill saying which
      // mode you are in has to be inside it. Landscape only: it is the one
      // viewport here where the strip is `nowrap` and narrower than its
      // contents, so it is the only one that can park the active pill
      // off-screen. Play mode, because that is where both groups render.
      //
      // Written after finding the effect that does this reading a ref nothing
      // was attached to: choosing AI vs AI left its pill 62px past the right
      // edge, and no assertion in this file could see it.
      if (viewport.name === 'mobile landscape') {
        await page.getByRole('button', { name: 'Play', exact: true }).first().click()
        await page.getByRole('button', { name: 'AI vs AI', exact: true }).first().click()
        const strip = await page.evaluate(async () => {
          await new Promise(resolve => setTimeout(resolve, 600))
          const scroller = document.querySelector('.mobile-modes-wrapper')
          if (!scroller) return null
          const active = scroller.querySelector('[aria-label="Game mode"] .gc-pill-active')
          if (!active) return { scrolls: false }
          const box = active.getBoundingClientRect()
          const frame = scroller.getBoundingClientRect()
          return {
            scrolls: scroller.scrollWidth > scroller.clientWidth,
            label: active.textContent.trim(),
            clippedLeft: Math.round(Math.max(0, frame.left - box.left)),
            clippedRight: Math.round(Math.max(0, box.right - frame.right)),
          }
        })
        assert(strip, 'mobile landscape: no mode strip on the page')
        if (strip.scrolls) {
          assert(strip.clippedLeft <= 1 && strip.clippedRight <= 1,
            `mobile landscape: the active mode pill "${strip.label}" is clipped by `
            + `${strip.clippedLeft}px on the left and ${strip.clippedRight}px on the right`)
          console.log(`  mode strip: "${strip.label}" scrolled into view on a strip that overflows`)
        }
        await page.getByRole('button', { name: 'Human vs Human', exact: true }).first().click()
        await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
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

        // Contrast, on the surfaces a reader actually lands on, in both
        // themes. A hand pass found six of these in one sitting and every one
        // was a value correct in one theme or one state and not the other, so
        // the sweep runs twice and covers a dialog as well as the panels.
        /**
         * The surfaces a reader actually lands on. The dialogs are in here
         * because two of the seven defects this sweep exists for were in them
         * -- the New Game dialog's selected time control and the PGN dialog's
         * Lichess link -- and a gate that never opens a dialog would have
         * found neither.
         */
        const openDialog = async (label, panel) => {
          await page.getByRole('button', { name: label }).first().click()
          await page.locator(panel).waitFor({ timeout: 5000 })
        }
        const closeDialog = async (panel) => {
          await page.keyboard.press('Escape')
          await page.locator(panel).waitFor({ state: 'detached', timeout: 5000 })
        }
        const sweepSurfaces = async (theme) => {
          await page.getByRole('button', { name: 'Analyze', exact: true }).first().click()
          await page.waitForTimeout(300)
          await assertContrast(page, `${theme} / analyze`)

          await page.getByRole('button', { name: 'Review', exact: true }).first().click()
          await page.waitForTimeout(300)
          await assertContrast(page, `${theme} / review`)

          await openDialog(/start new game/i, '.new-game-dialog')
          await assertContrast(page, `${theme} / new game`, 15)
          await closeDialog('.new-game-dialog')

          // Export, not the Import tab it opens on: the defect that put this
          // dialog in the sweep was the "Open in Lichess" link, which only
          // exists on Export. A gate pointed at the wrong tab would have
          // missed the one thing it was written for.
          await openDialog(/pgn and fen/i, '.pgn-dialog')
          await page.locator('.pgn-dialog').getByRole('button', { name: 'Export', exact: true }).click()
          await page.waitForTimeout(300)
          await assertContrast(page, `${theme} / pgn export`, 12)
          await closeDialog('.pgn-dialog')

          // The empty shelf, which is what this suite's browser has: nine text
          // nodes and no rows. It does not reach the favourite star or the
          // status line, whose inks only appear once something is saved.
          await openDialog(/saved games library/i, '.library-dialog')
          await assertContrast(page, `${theme} / library`, 8)
          await closeDialog('.library-dialog')

          await page.getByRole('button', { name: 'Play', exact: true }).first().click()
          await page.waitForTimeout(400)
          await assertContrast(page, `${theme} / play`, 20)
          await page.getByRole('button', { name: 'Analysis', exact: true }).first().click()
          await page.waitForTimeout(400)
        }

        await openSettings(page)
        await assertContrast(page, 'dark / settings', 30)
        await closeSettings(page)
        await sweepSurfaces('dark')

        await openSettings(page)
        await chooseTheme(page, 'Light')
        await assertContrast(page, 'light / settings', 30)
        await closeSettings(page)
        await sweepSurfaces('light')

        // Back to the theme and tab the rest of the suite expects.
        await openSettings(page)
        await chooseTheme(page, 'Dark')
        await closeSettings(page)
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

      /**
       * Contrast at the narrow sizes, which the desktop sweep says nothing
       * about. Most colour is viewport-independent, but not all of it: the
       * Settings panel carries copy that exists *only* on a touch pointer --
       * the two paragraphs explaining that drawing arrows needs a mouse -- and
       * no sweep had ever measured them. The board has no game here, so this
       * covers the resting panel and Settings rather than the review.
       */
      if (viewport.name !== 'desktop') {
        await assertContrast(page, `${viewport.name} / dark`, 20)
        await openSettings(page)
        await assertContrast(page, `${viewport.name} / dark settings`, 25)
        await chooseTheme(page, 'Light')
        await assertContrast(page, `${viewport.name} / light settings`, 25)
        await closeSettings(page)
        await assertContrast(page, `${viewport.name} / light`, 20)
        await openSettings(page)
        await chooseTheme(page, 'Dark')
        await closeSettings(page)
      }

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

      /**
       * And the two bars, whose only other control is a 14px strip with a 3px
       * pill in it -- no shortcut and no menu item, so a reader who never finds
       * the strip never learns the bars fold. Checked here rather than trusted
       * because the value is in the outcome, not the row: collapsing the top bar
       * is worth 70px of board on a 1440px desktop, which is the width of a
       * whole rank.
       *
       * What is asserted is that the bar gives its space back, which is the
       * thing that once went wrong here: a transform slid it out of view and
       * left its full height reserved, so folding it bought a blank band rather
       * than a bigger board. The board itself is only asserted not to shrink,
       * because whether it *grows* depends on which axis binds -- 667px to
       * 737px at 1440x900, where height binds, and 546px unchanged at the
       * 1280x800 this runs at, where the two panels decide the width.
       *
       * On a phone the bars have no handle at all, so the command is disabled
       * with its reason rather than hidden -- the same courtesy the Pro-only
       * commands get, and the same thing asserted about them. That the search
       * still narrows to one row there is part of the assertion: the reason is
       * matched along with the label, so a reason carrying "top" -- "Desktop
       * only" did -- pulls the bottom bar's row in beside it.
       */
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
      await page.locator('[data-command-input]').fill('top bar')
      const barRows = await page.locator('[data-command-id]').allTextContents()
      assert(barRows.length === 1 && /top bar/i.test(barRows[0]),
        `${viewport.name}: typing "top bar" left ${barRows.length} commands: ${barRows.join(', ')}`)
      const barRow = page.locator('[data-command-id]').first()
      const barDisabled = await barRow.getAttribute('aria-disabled')
      if (viewport.name === 'desktop') {
        assert(barDisabled !== 'true', 'desktop: the top bar command is disabled where the bar folds')
        const boardBefore = (await page.locator('.board-surface').boundingBox()).width
        const barBefore = (await page.locator('.top').boundingBox()).height
        await page.keyboard.press('Enter')
        await page.waitForFunction(() => document.querySelector('.top')?.classList.contains('hidden'),
          null, { timeout: 5000 })
        const barAfter = (await page.locator('.top').boundingBox()).height
        assert(barBefore > 20 && barAfter <= 2,
          `desktop: the folded top bar still reserves ${Math.round(barAfter)}px of the ${Math.round(barBefore)}px it had`)
        const boardAfter = (await page.locator('.board-surface').boundingBox()).width
        assert(boardAfter >= boardBefore,
          `desktop: folding the top bar shrank the board to ${Math.round(boardAfter)}px, from ${Math.round(boardBefore)}px`)

        // And back, by the same route: a command that cannot undo itself is a
        // trap, and the strip that could is invisible once the bar is gone.
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
        await page.locator('[data-command-input]').fill('top bar')
        const backRows = await page.locator('[data-command-id]').allTextContents()
        assert(backRows.length === 1 && /expand/i.test(backRows[0]),
          `desktop: with the bar folded the command reads "${backRows.join(', ')}"`)
        await page.keyboard.press('Enter')
        await page.waitForFunction(() => !document.querySelector('.top')?.classList.contains('hidden'),
          null, { timeout: 5000 })
      } else {
        assert(barDisabled === 'true',
          `${viewport.name}: the top bar command is offered where the bar has no handle`)
        assert(/wider window/i.test(barRows[0]),
          `${viewport.name}: the disabled top bar command gives no reason: "${barRows[0]}"`)
        await page.keyboard.press('Escape')
        await page.locator('[data-command-palette]').waitFor({ state: 'detached', timeout: 5000 })
      }

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

    await checkTypedMoveEntry(browser)
    await checkAutosaveFailure(browser)
    await checkEngineStartupTimeout(browser)
    await checkLabSettingsStayInSync(browser)
    await checkSingleThreadReviewPool(browser)
    await checkCoachUsesPositionScore(browser)
    await checkBoundedScoreIsIgnored(browser)
    await checkPlayedMoveBecomesTheGame(browser)
    await checkTakebackHandsTheClockBack(browser)
    await checkKeepSearchingIsUnbounded(browser)
    await checkAutoplayWalksTheLine(browser)
    await checkTypedMoveLands(browser)
    await checkMoveTimesAreGraphed(browser)
    await checkResignationEndsTakeback(browser)
    await checkQuickStartRemembersTheLastGame(browser)
    await checkBlunderIsPointedOut(browser)
    await checkReviewReportHoldsStill(browser)
    await checkDrillLeavesTheLineAlone(browser)
    await checkDrawModeEndsWithItsPurpose(browser)
    await checkEverySquareAnswersAFinger(browser)
    await checkATapSurvivesTheFingerThatMakesIt(browser)
    await checkTheBoardIsNotADeadZone(browser)
    await checkEveryControlIsFingerSized(browser)
    await checkTheWinrateCardFollowsTheBoard(browser)
    await checkTheReviewCardNamesItsSet(browser)
    await checkAFullLibraryStopsReadingTheFile(browser)
    await checkABigFileIsDescribedNotShown(browser)
    await checkADroppedPgnIsTaken(browser)
    await checkBackClosesTheSheet(browser)
    await checkThePromotionChooserCanBeHit(browser)
    await checkANoticeIsSeenAndFits(browser)
    await checkHighContrastKeepsTheBoard(browser)
    await checkDialogActionsStayOnScreen(browser)
    await checkHiddenAnalysisPausesAndResumes(browser)
    await checkAutomaticAnalysisIsReused(browser)
    await checkOpeningTableStaysOutOfBoot(browser)
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
    console.error(error.stack || error.message)
    process.exit(1)
  },
)
