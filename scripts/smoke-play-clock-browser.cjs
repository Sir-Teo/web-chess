/**
 * A timed game against real Stockfish. Start a preview first; no UCI fixtures.
 *
 *     npm run build && npx vite preview --port 4324 --strictPort
 *     node scripts/smoke-play-clock-browser.cjs
 *
 * Every clock check in `test-ui-browser.cjs` runs against a fake engine whose
 * search is instant and whose boot is a constructor. That is the right seam
 * for asserting rules, and it means three of them have been asserted and
 * never observed: that the engine keeps its time while it loads, that it pays
 * for its own search, and that the `[%clk]` written into the game is the
 * reading the player can see on the face.
 *
 * Those three are what this plays one move to watch. `SMOKE_BROWSERS` and
 * `SMOKE_URL` work as they do in `smoke-engines-browser.cjs`.
 */
const { chromium, firefox, webkit } = require('playwright')
const assert = require('node:assert/strict')

const browsers = { chromium, firefox, webkit }
const BASE = process.env.SMOKE_URL || 'http://localhost:4324/web-chess/'
const INITIAL_SECONDS = 180
const INCREMENT_SECONDS = 2

/** "3:00" and "0:03:00" are the same reading. */
const toSeconds = text => {
  const parts = String(text).trim().split(':').map(Number)
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
}

async function playOneTimedMove(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error).slice(0, 160)))
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    const startFresh = page.getByRole('button', { name: /start fresh/i })
    if (await startFresh.count()) await startFresh.first().click()

    await page.getByRole('button', { name: 'Start new game' }).click()
    await page.locator('.new-game-dialog').waitFor({ timeout: 15000 })
    await page.locator('.mode-card', { hasText: 'Human vs AI' }).click()
    await page.locator('.time-control-card', { hasText: '3 + 2' }).click()
    await page.locator('.btn-start').click()
    await page.locator('.chess-clock').waitFor({ timeout: 20000 })

    // The boot is real here, which is the whole reason for this script: the
    // clock is handed to the engine the moment White moves, and until the
    // worker answers `readyok` there is nobody to hand it to.
    const bootStart = Date.now()
    await page.waitForFunction(() => /ready to play/.test(document.body.innerText), null, { timeout: 120000 })
    const bootMs = Date.now() - bootStart
    const afterBoot = await page.locator('.clock-face.clock-black strong').textContent()
    assert.equal(toSeconds(afterBoot), INITIAL_SECONDS,
      `Black lost time during a ${bootMs}ms boot: ${afterBoot}`)

    const searchStart = Date.now()
    await page.click('#chessboard-square-e2')
    await page.click('#chessboard-square-e4')
    await page.waitForFunction(
      () => document.querySelectorAll('.mtree-chip').length >= 2, null, { timeout: 60000 })
    const searchMs = Date.now() - searchStart
    await page.waitForTimeout(400)

    const blackFace = await page.locator('.clock-face.clock-black strong').textContent()
    const spent = INITIAL_SECONDS - (toSeconds(blackFace) - INCREMENT_SECONDS)
    assert.ok(spent > 0,
      `the engine searched for ${searchMs}ms and its clock did not move: ${blackFace}`)
    // The face rounds a part-second up, and the speed throttle is inside the
    // wall time, so the bound is the wall clock plus a second of rounding.
    assert.ok(spent <= Math.ceil(searchMs / 1000) + 2,
      `the engine was charged ${spent}s for a ${searchMs}ms search: ${blackFace}`)

    await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
    await page.locator('.dialog-panel').waitFor({ timeout: 15000 })
    await page.locator('.dialog-panel button', { hasText: /^Export$/ }).first().click()
    await page.waitForFunction(
      () => [...document.querySelectorAll('textarea')].some(area => /^\[Event/m.test(area.value)),
      null, { timeout: 15000 })
    const pgn = await page.evaluate(() => [...document.querySelectorAll('textarea')]
      .map(area => area.value).find(value => /^\[Event/m.test(value)) || '')
    const recorded = [...pgn.matchAll(/\[%clk\s+([0-9:]+)\s*\]/g)].map(match => match[1])
    assert.equal(recorded.length, 2, `expected a reading for each move, got ${recorded.length}`)
    assert.equal(recorded[1].replace(/^0:0?/, ''), blackFace,
      `Black's face reads ${blackFace} and the game recorded ${recorded[1]}`)
    assert.equal(errors.length, 0, `page errors: ${errors.join('; ')}`)

    return { browser: name, status: 'passed', bootMs, searchMs, afterBoot, blackFace, spentSeconds: spent, recorded }
  } finally {
    await context.close()
  }
}

async function main() {
  const names = (process.env.SMOKE_BROWSERS || 'chromium').split(',').map(part => part.trim()).filter(Boolean)
  let failed = 0
  for (const name of names) {
    assert.ok(browsers[name], `Unknown browser: ${name}`)
    const browser = await browsers[name].launch()
    try {
      console.log(JSON.stringify(await playOneTimedMove(browser, name)))
    } catch (error) {
      failed += 1
      console.log(JSON.stringify({ browser: name, status: 'failed', error: error.message || String(error) }))
    } finally {
      await browser.close()
    }
  }
  if (failed) process.exit(1)
  console.log('play clock: the engine kept its time through the boot, paid for its own search, '
    + 'and the export agreed with the face')
}

main().catch(error => { console.error(error.message || error); process.exit(1) })
