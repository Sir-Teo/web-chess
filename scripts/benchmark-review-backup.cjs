/**
 * Restore 50 distinct saved runs while exercising the actual board controls.
 * Start a production preview first; this script never rebuilds a running server:
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4336
 * node scripts/benchmark-review-backup.cjs
 *
 * Scores are fixtures, not a Stockfish strength/throughput measurement. The
 * importer, dedicated worker, IndexedDB and UI are the production implementation.
 */
const { chromium } = require('playwright')
const { Chess } = require('chess.js')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')

const base = process.env.BACKUP_BENCH_URL || 'http://127.0.0.1:4336/web-chess/'
const output = process.env.BACKUP_BENCH_OUTPUT || '/tmp/web-chess-review-backup-benchmark.json'

async function main() {
  const pgn = fs.readFileSync(path.join(__dirname, 'fixtures/review-game.pgn'), 'utf8')
  const game = new Chess()
  game.loadPgn(pgn)
  const moves = game.history({ verbose: true })
  const root = moves[0].before
  const fens = [...new Set([root, ...moves.map(move => move.after)])].filter(fen => !new Chess(fen).isGameOver())
  const engine = { profile: 'lite-single-local', name: 'Backup benchmark fixture', version: 'fixture' }
  const reviews = Array.from({ length: 50 }, (_, i) => ({
    version: 1, id: `benchmark-${i}`, title: `Benchmark run ${i + 1}`,
    pgn, lineKey: JSON.stringify([root, ...moves.map(move => move.from + move.to + (move.promotion || ''))]),
    settings: { engine, depth: 6, hashMb: 64, showWdl: true }, startedAt: 10, finishedAt: 20 + i,
    total: fens.length, evaluated: fens.length, reused: 0, complete: true,
    evaluations: fens.map(fen => [fen, { cp: i, depth: 6, engine, wdl: { w: 300, d: 400, l: 300 }, purpose: 'batch-review' }]),
  }))
  const text = JSON.stringify({ format: 'web-chess-review-backup', version: 1, exportedAt: Date.now(), reviews })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 812 }, reducedMotion: 'reduce' })
    await page.route(/https:\/\/(lichess\.org|[^/]*lichess\.ovh)\//, route => route.fulfill({ status: 404, body: '{}' }))
    await page.addInitScript(() => localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({
      workspaceMode: 'analysis', analysisExperience: 'pro', analysisTab: 'review', autoAnalyze: false, engineProfile: 'lite-single-local',
    })))
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('.analysis-context-row')?.textContent?.toLowerCase().includes('ready'))
    await page.locator('.saved-reviews summary').click()
    await page.evaluate(() => {
      const benchmark = window.__backupBenchmark = { started: performance.now(), frames: [], longTasks: [], interactions: [], active: true }
      let previous = performance.now()
      function frame(now) {
        if (!benchmark.active) return
        benchmark.frames.push(now - previous)
        previous = now
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      benchmark.observer = new PerformanceObserver(list => benchmark.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime - benchmark.started, duration: entry.duration }))))
      benchmark.observer.observe({ type: 'longtask' })
    })
    await page.getByLabel('Review backup file', { exact: true }).setInputFiles({ name: 'benchmark.json', mimeType: 'application/json', buffer: Buffer.from(text) })
    for (let i = 0; i < 8; i++) {
      const before = await page.evaluate(() => ({
        x: document.querySelector('#chessboard-square-a1').getBoundingClientRect().x,
        time: performance.now(), importing: document.querySelector('.saved-review-notice')?.textContent?.startsWith('Importing'),
      }))
      if (!before.importing) break
      await page.getByRole('button', { name: 'Flip board', exact: true }).click()
      await page.waitForFunction(x => Math.abs(document.querySelector('#chessboard-square-a1').getBoundingClientRect().x - x) > 50, before.x)
      await page.evaluate(before => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__backupBenchmark.interactions.push({ ms: performance.now() - before.time,
          completedWhileImporting: document.querySelector('.saved-review-notice')?.textContent?.startsWith('Importing') === true })
        resolve()
      }))), before)
      await page.waitForTimeout(50)
    }
    await page.getByText('Imported 50 reviews; 0 identical reviews skipped.', { exact: true }).waitFor({ timeout: 120_000 })
    await page.waitForFunction(() => document.querySelectorAll('#saved-review-choice option').length === 50)
    const measurement = await page.evaluate(() => {
      const b = window.__backupBenchmark
      b.active = false
      b.observer.disconnect()
      const frames = b.frames.slice(1).sort((a, b) => a - b)
      return { elapsedMs: performance.now() - b.started, frameCount: frames.length,
        frameGapP95Ms: frames[Math.floor(frames.length * 0.95)] ?? null, maximumFrameGapMs: frames.at(-1) ?? null,
        longTasks: b.longTasks, interactions: b.interactions,
        assets: [...document.querySelectorAll('script[src]')].map(script => script.src),
      }
    })
    assert.ok(measurement.interactions.some(sample => sample.completedWhileImporting), 'no board input completed while validation was active; this run does not establish responsiveness')
    const result = { base, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      records: 50, pliesPerRecord: moves.length, readingsPerRecord: fens.length, bytes: Buffer.byteLength(text),
      viewport: { width: 1280, height: 812 }, reducedMotion: true, cpuThrottle: 1, ...measurement,
      limitation: 'Synthetic saved scores; one local sample. Automation-to-two-frame timings include protocol and frame scheduling and are not field INP or search speed.' }
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result, null, 2))
  } finally { await browser.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
