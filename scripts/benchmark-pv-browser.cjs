/** Conversion microbenchmark, not an end-to-end UI or engine speed claim. Start Vite first. */
const { chromium } = require('playwright')
const base = process.env.BENCH_URL || 'http://127.0.0.1:4324/web-chess/'
;(async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.addInitScript(() => localStorage.setItem('webchess:analysis-settings:v1', JSON.stringify({ workspaceMode: 'play' })))
    await page.goto(base)
    console.log(JSON.stringify(await page.evaluate(async () => {
      const { pvToSan, pvLineMoves } = await import(new URL('src/engine/analysis.ts', location.href).href)
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      const lines = [
        'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6',
        'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7',
        'c2c4 e7e5 b1c3 g8f6 g2g3 d7d5 c4d5 f6d5',
        'g1f3 d7d5 g2g3 g8f6 f1g2 e7e6 e1g1 f8e7',
        'b2b3 e7e5 c1b2 b8c6 e2e3 d7d5 f1b5 f8d6',
      ].map(text => text.split(' '))
      const durations = []
      let checksum = 0
      for (let sample = 0; sample < 6; sample++) {
        const start = performance.now()
        for (let frame = 0; frame < 100; frame++) {
          checksum += pvToSan(fen, { pv: [...lines[0]], depth: 20, multipv: 1 }, 6).length
          checksum += pvLineMoves(fen, [...lines[0]], 6).length
          for (const pv of lines) checksum += pvLineMoves(fen, [...pv], 8).length
        }
        durations.push(performance.now() - start)
      }
      return { workload: '100 repeated renders of a 5-PV panel; conversion functions only', samplesMs: durations, checksum }
    }), null, 2))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
