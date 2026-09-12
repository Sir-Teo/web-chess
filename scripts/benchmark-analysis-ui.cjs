/**
 * Production UI profiling with controlled UCI telemetry; this does not measure
 * Stockfish search speed or field INP. Build with `npm run build -- --sourcemap`
 * and preview on port 4336, then run this script. No result is a test threshold.
 * Set BENCH_TRACE=scripts/fixtures/analysis-stockfish-18.json to replay changing
 * lines at their recorded timings. Refresh with capture-analysis-trace.cjs
 * against the dev server; no live engine runs during the measured interval.
 */
const { chromium } = require('playwright')
const { Chess } = require('chess.js')
const { SourceMap } = require('node:module')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const base = process.env.BENCH_URL || 'http://127.0.0.1:4336/web-chess/'
const output = process.env.BENCH_OUTPUT || '/tmp/web-chess-analysis-profile'
const samples = Number(process.env.BENCH_SAMPLES || 3)
const width = Number(process.env.BENCH_WIDTH || 1280)
const cpuRate = Number(process.env.BENCH_CPU_RATE || 4)
const flipIntervalMs = Number(process.env.BENCH_FLIP_MS ?? 500)
const reducedMotion = process.env.BENCH_REDUCED_MOTION === '1'
const pgn = fs.readFileSync(path.join(__dirname, 'fixtures/review-game.pgn'), 'utf8')
const tracePath = process.env.BENCH_TRACE
const trace = tracePath ? JSON.parse(fs.readFileSync(tracePath, 'utf8')) : null
const durationMs = trace?.durationMs ?? 6000

function validateTrace() {
  if (!trace) return
  const board = new Chess()
  board.loadPgn(pgn)
  if (trace.fixtureSha256 !== createHash('sha256').update(pgn).digest('hex') || trace.fen !== board.fen()) {
    throw new Error('Stockfish trace does not match the benchmark game')
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0 || trace.events.length < 10) throw new Error('Invalid trace duration or event count')
  let previousTime = -1
  const uniquePvs = new Set()
  for (const event of trace.events) {
    if (!Number.isFinite(event.atMs) || event.atMs < previousTime || event.atMs > durationMs || !event.line.startsWith('info ')) {
      throw new Error('Invalid trace event')
    }
    previousTime = event.atMs
    const pv = event.line.split(' pv ')[1]
    if (!pv) throw new Error('Trace event has no PV')
    uniquePvs.add(pv)
    const replay = new Chess(trace.fen)
    for (const move of pv.split(' ')) replay.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] })
  }
  if (uniquePvs.size < 10) throw new Error('Trace does not exercise changing PVs')
}

function fixturePositions() {
  const game = new Chess()
  game.loadPgn(pgn)
  const moves = game.history({ verbose: true })
  const board = new Chess()
  const byMoves = { '': board.fen() }
  const linesByFen = {}
  const ucis = []
  for (let index = 0; index <= moves.length; index++) {
    const fen = board.fen()
    const legal = board.moves({ verbose: true })
    linesByFen[fen] = legal.slice(0, index === 0 || index === moves.length ? 5 : 1).map(move => {
      const pvBoard = new Chess(fen)
      const pv = []
      for (let ply = 0; ply < 8; ply++) {
        const next = ply === 0 ? move : pvBoard.moves({ verbose: true })[0]
        if (!next) break
        pv.push(next.from + next.to + (next.promotion || ''))
        pvBoard.move(next)
      }
      return pv
    })
    if (index === moves.length) break
    const move = moves[index]
    board.move(move)
    ucis.push(move.from + move.to + (move.promotion || ''))
    byMoves[ucis.join(' ')] = board.fen()
  }
  return { byMoves, linesByFen }
}

function installFixture({ byMoves, linesByFen }) {
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    return url.hostname === 'lichess.org' || url.hostname.endsWith('.lichess.ovh')
      ? Promise.resolve(new Response('{}', { status: 404 })) : nativeFetch(input, init)
  }
  window.__benchmarkWorkers = []
  window.__benchmarkTick = 0
  window.__benchmarkSearches = 0
  window.Worker = class {
    constructor() {
      this.fen = byMoves['']
      this.multiPv = 1
      this.listeners = []
      window.__benchmarkWorkers.push(this)
    }
    addEventListener(type, listener) { if (type === 'message') this.listeners.push(listener) }
    removeEventListener(type, listener) { this.listeners = this.listeners.filter(item => item !== listener) }
    send(data) {
      setTimeout(() => {
        const event = { data }
        this.onmessage?.(event)
        this.listeners.forEach(listener => listener(event))
      }, 0)
    }
    info() {
      const tick = ++window.__benchmarkTick
      const lines = linesByFen[this.fen] || linesByFen[byMoves['']]
      for (let i = 0; i < Math.min(this.multiPv, lines.length); i++) {
        this.send(`info depth 24 seldepth 30 multipv ${i + 1} score cp ${30 - i * 12 + tick % 9} nodes ${tick * 100000} nps 1000000 hashfull ${tick % 900} time ${tick * 100} wdl 300 500 200 pv ${lines[i].join(' ')}`)
      }
    }
    finish() {
      if (!this.searching) return
      this.searching = false
      this.send(`bestmove ${(linesByFen[this.fen] || [])[0]?.[0] || '0000'}`)
    }
    postMessage(command) {
      const text = String(command)
      if (text === 'uci') {
        this.send('id name UI Profile Fixture')
        for (const option of ['Threads type spin default 1 min 1 max 8', 'Hash type spin default 64 min 1 max 512', 'MultiPV type spin default 1 min 1 max 5', 'UCI_ShowWDL type check default true']) this.send('option name ' + option)
        this.send('uciok')
      } else if (text === 'isready') this.send('readyok')
      else if (text.startsWith('setoption name MultiPV')) this.multiPv = Number(text.split(' ').at(-1))
      else if (text.startsWith('position')) {
        const [, moves] = text.split(' moves ')
        this.fen = moves ? byMoves[moves] : text.startsWith('position fen ') ? text.slice(13) : byMoves['']
      } else if (text.startsWith('go')) {
        window.__benchmarkSearches++
        this.searching = true
        this.info()
        if (!text.includes('infinite')) setTimeout(() => this.finish(), 20)
      } else if (text === 'stop') this.finish()
    }
    terminate() { this.searching = false; this.onmessage = null; this.listeners = [] }
  }
}

function profileSummary(profile) {
  const maps = new Map()
  const frames = new Map(profile.nodes.map(node => [node.id, node.callFrame]))
  const totals = new Map()
  for (let i = 0; i < profile.samples.length; i++) {
    const frame = frames.get(profile.samples[i])
    let label = `${frame.functionName || '(anonymous)'} ${frame.url}:${frame.lineNumber + 1}`
    if (frame.url.includes('/assets/')) {
      const file = path.join(__dirname, '../dist/assets', path.basename(new URL(frame.url).pathname)) + '.map'
      if (!maps.has(file)) maps.set(file, fs.existsSync(file) ? new SourceMap(JSON.parse(fs.readFileSync(file, 'utf8'))) : null)
      const source = maps.get(file)?.findEntry(frame.lineNumber, frame.columnNumber)
      if (source?.originalSource) label = `${source.name || frame.functionName || '(anonymous)'} ${source.originalSource}:${source.originalLine + 1}`
    }
    totals.set(label, (totals.get(label) || 0) + profile.timeDeltas[i] / 1000)
  }
  return [...totals].map(([frame, selfMs]) => ({ frame, selfMs: Math.round(selfMs) })).sort((a, b) => b.selfMs - a.selfMs).slice(0, 30)
}

async function main() {
  validateTrace()
  fs.mkdirSync(output, { recursive: true })
  const positions = fixturePositions()
  const browser = await chromium.launch()
  const results = []
  try {
    for (let sample = 0; sample < samples; sample++) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(installFixture, positions)
      await page.addInitScript(() => localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({
        workspaceMode: 'analysis', analysisExperience: 'pro', autoAnalyze: false,
        multiPv: 5, continuousAnalysis: true, analyzeMode: 'infinite', showAdvancedAnalyze: true,
        engineProfile: 'lite-single-local',
      })))
      await page.goto(base)
      await page.getByRole('button', { name: 'Open PGN and FEN dialog' }).click()
      await page.locator('.dialog-panel textarea').first().fill(pgn)
      await page.getByRole('button', { name: 'Import & Analyze', exact: true }).click()
      await page.waitForTimeout(2000)
      await page.locator('.sample-sweep-copy').waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: 'Run analysis', exact: true }).click()
      await page.waitForFunction(() => window.__benchmarkWorkers.some(worker => worker.searching && worker.multiPv === 5))
      await page.waitForTimeout(500)
      const client = await context.newCDPSession(page)
      await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
      await client.send('Performance.enable')
      await client.send('Profiler.enable')
      await client.send('Profiler.setSamplingInterval', { interval: 1000 })
      const before = Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
      await client.send('Profiler.start')
      const observed = await page.evaluate(async ({ duration, flipInterval, trace }) => {
        const longTasks = []
        const observer = new PerformanceObserver(list => list.getEntries().forEach(entry => longTasks.push(entry.duration)))
        observer.observe({ type: 'longtask' })
        let updates = 0
        const worker = window.__benchmarkWorkers.findLast(item => item.searching && item.multiPv === 5)
        if (trace && worker?.fen !== trace.fen) throw new Error('Trace position is not active')
        const traceTimers = trace ? trace.events.map(event => setTimeout(() => {
          worker.send(event.line)
          updates++
        }, event.atMs)) : []
        const timer = trace ? null : setInterval(() => {
          const worker = window.__benchmarkWorkers.findLast(item => item.searching && item.multiPv === 5)
          if (worker) { worker.info(); updates++ }
        }, 100)
        const flips = []
        const inputTimer = flipInterval > 0 ? setInterval(() => {
          const start = performance.now()
          const flip = document.querySelector('button[aria-label="Flip board"]')
          if (!flip) throw new Error('Missing board flip control')
          flip.click()
          requestAnimationFrame(() => requestAnimationFrame(() => flips.push(performance.now() - start)))
        }, flipInterval) : null
        await new Promise(resolve => setTimeout(resolve, duration))
        if (timer !== null) clearInterval(timer)
        traceTimers.forEach(clearTimeout)
        if (inputTimer !== null) clearInterval(inputTimer)
        observer.disconnect()
        return { updates, longTasks, flipToTwoFramesMs: flips }
      }, { duration: durationMs, flipInterval: flipIntervalMs, trace })
      const { profile } = await client.send('Profiler.stop')
      const after = Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]))
      const metrics = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'].map(key => [key, after[key] - before[key]]))
      fs.writeFileSync(path.join(output, `sample-${sample + 1}.cpuprofile`), JSON.stringify(profile))
      const result = { sample: sample + 1, metrics, observed, errors, topFrames: profileSummary(profile) }
      results.push(result)
      console.log(JSON.stringify(result))
      if (errors.length || (trace ? observed.updates !== trace.events.length : observed.updates < 30)) throw new Error('Fixture did not run a valid telemetry workload')
      await page.screenshot({ path: path.join(output, `sample-${sample + 1}.png`) })
      await context.close()
    }
  } finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({
      commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
      sourceDiff: execFileSync('git', ['diff', '--', 'src'], { encoding: 'utf8' }),
      productionAssets: fs.readdirSync(path.join(__dirname, '../dist/assets')).filter(file => file.endsWith('.js')),
      base, width, cpuRate, durationMs, flipIntervalMs, reducedMotion,
      trace: trace ? { ...trace, events: undefined, path: tracePath, eventCount: trace.events.length, uniquePvs: new Set(trace.events.map(event => event.line.split(' pv ')[1])).size } : null,
      workload: `116-ply game, five legal PVs, ${trace ? 'recorded Stockfish output at original timings' : 'telemetry every 100ms'}, ${flipIntervalMs > 0 ? `board flip every ${flipIntervalMs}ms` : 'no board flips'}; production build, main thread only`, results,
    }, null, 2) + '\n')
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
