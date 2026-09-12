/** Record local Stockfish output for repeatable UI profiles without competing WASM work. */
const { chromium } = require('playwright')
const { Chess } = require('chess.js')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const pgn = fs.readFileSync(path.join(__dirname, 'fixtures/review-game.pgn'), 'utf8')
  const game = new Chess()
  game.loadPgn(pgn)
  const moves = game.history({ verbose: true }).map(move => move.from + move.to + (move.promotion || ''))
  const durationMs = 6000
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(process.env.TRACE_URL || 'http://127.0.0.1:4324/web-chess/')
    const recording = await page.evaluate(async ({ moves, durationMs }) => {
      const { createStockfishWorker } = await import('/web-chess/src/engine/stockfishWorker.ts')
      const { profileById } = await import('/web-chess/src/engine/profiles.ts')
      const { worker, blobUrl } = createStockfishWorker(profileById('lite-single-local'))
      const lines = []
      const events = []
      const commands = []
      let startedAt
      let bootError
      worker.onmessage = event => {
        for (const text of String(event.data).split('\n')) {
          lines.push(text)
          if (text.startsWith('__BOOT_ERROR__:')) bootError = text
          if (startedAt !== undefined && text.startsWith('info ') && text.includes(' pv ')) {
            events.push({ atMs: Math.round(performance.now() - startedAt), line: text })
          }
        }
      }
      const send = command => { commands.push(command); worker.postMessage(command) }
      const waitFor = async text => {
        const deadline = performance.now() + 30000
        while (!lines.some(line => line.startsWith(text))) {
          if (bootError) throw new Error(bootError)
          if (performance.now() > deadline) throw new Error('Engine timed out waiting for ' + text)
          await new Promise(resolve => setTimeout(resolve, 20))
        }
      }
      try {
        send('uci')
        await waitFor('uciok')
        send('setoption name Hash value 64')
        send('setoption name MultiPV value 5')
        send('setoption name UCI_ShowWDL value true')
        send('isready')
        await waitFor('readyok')
        send('position startpos moves ' + moves.join(' '))
        startedAt = performance.now()
        send('go infinite')
        await new Promise(resolve => setTimeout(resolve, durationMs))
        startedAt = undefined
        send('stop')
        await waitFor('bestmove ')
        return { engine: lines.find(line => line.startsWith('id name ')), commands, events }
      } finally {
        worker.terminate()
        URL.revokeObjectURL(blobUrl)
      }
    }, { moves, durationMs })
    if (recording.events.length < 10) throw new Error('Too little engine output to replay')
    const result = {
      recordedAt: new Date().toISOString(),
      packageVersion: require('stockfish/package.json').version,
      fixtureSha256: createHash('sha256').update(pgn).digest('hex'),
      fen: game.fen(), durationMs, ...recording,
    }
    const output = process.env.TRACE_OUTPUT || '/tmp/web-chess-analysis-trace.json'
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify({ output, engine: result.engine, events: result.events.length }))
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
