/**
 * Real WASM review benchmark. Start Vite first:
 * npm run dev -- --host 127.0.0.1 --port 4324
 * node scripts/benchmark-review-browser.cjs
 *
 * Same positions/depth/total hash; fresh workers each run; ABBA order.
 * This measures independent single-thread engines, not fake UCI responses.
 */
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const base = process.env.REVIEW_BENCH_URL || 'http://127.0.0.1:4324/web-chess/'
const totalHashMb = Number(process.env.REVIEW_BENCH_HASH_MB || 64)
const parallelWorkers = Number(process.env.REVIEW_BENCH_WORKERS || 4)

async function main() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(base)
    const pgn = fs.readFileSync(path.join(__dirname, 'fixtures/opera-game.pgn'), 'utf8')
    const results = await page.evaluate(async ({ pgn, base, totalHashMb, parallelWorkers }) => {
      const moduleUrl = file => new URL(`src/engine/${file}.ts`, base).href
      const { parsePgnMoveTree, flattenPgnMainLine } = await import(moduleUrl('pgn'))
      const { planBatchReview } = await import(moduleUrl('batchReview'))
      const { runReviewPool } = await import(moduleUrl('reviewPoolRunner'))
      const { profileById } = await import(moduleUrl('profiles'))
      const game = parsePgnMoveTree(pgn)
      const positions = [{ fen: game.rootFen, uci: '' }, ...flattenPgnMainLine(game.moves).map(n => ({
        fen: n.fen, uci: n.move.from + n.move.to + (n.move.promotion || ''),
      }))]
      const depth = 18
      const targets = planBatchReview(positions, game.rootFen, new Map(), depth).queue
      const results = []
      for (const workers of [1, parallelWorkers, parallelWorkers, 1]) {
        const started = performance.now()
        let nodes = 0
        let completed = 0
        let scored = 0
        const run = runReviewPool({
          targets,
          plan: { workers, threadsPerWorker: 1, hashMbPerWorker: Math.floor(totalHashMb / workers) },
          profile: profileById('lite-single-local'), depth, showWdl: true,
          callbacks: {
            onResult: (_, snapshot) => {
              if (snapshot.depth < depth) throw new Error('Position did not reach requested depth')
              nodes += snapshot.nodes || 0
              scored++
            },
            onProgress: () => { completed++ },
          },
        })
        await run.done
        if (completed !== targets.length || scored !== targets.length) throw new Error('Review did not score every target')
        results.push({ workers, ms: Math.round(performance.now() - started), nodes, completed, scored })
      }
      return { cores: navigator.hardwareConcurrency, depth, totalHashMb, targets: targets.length, results }
    }, { pgn, base, totalHashMb, parallelWorkers })
    console.log(JSON.stringify(results, null, 2))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
