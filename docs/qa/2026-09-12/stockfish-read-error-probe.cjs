/** Inspect the published 18.0.8 loader's reader-error handler in isolation.
 * Usage: node stockfish-read-error-probe.cjs /path/to/stockfish-18-lite-single.js
 * No worker boot, engine search, or network operation is performed here.
 */
const fs = require('node:fs')
const crypto = require('node:crypto')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const bytes = fs.readFileSync(process.argv[2])
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
assert.equal(sha256, '5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391')
const source = bytes.toString('utf8')
const snippet = 'function e(n){r.error(n),e(n)}'
assert(source.includes(`.catch(${snippet})`), 'published reader-error handler changed')
let calls = 0
let controller
const stream = new ReadableStream({ start(value) { controller = value } })
const handler = vm.runInNewContext(`(${snippet})`, { r: { error(error) { calls++; controller.error(error) } } })
const injected = new TypeError('Synthetic interrupted WASM response')
let thrown
try { handler(injected) } catch (error) { thrown = { name: error.name, message: error.message } }
;(async () => {
  const streamError = await stream.getReader().read().catch(error => ({ name: error.name, message: error.message }))
  assert.equal(thrown?.name, 'RangeError')
  assert(calls > 100)
  assert.equal(streamError.name, 'TypeError')
  console.log(JSON.stringify({
    source: 'https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js', sha256, bytes: bytes.length,
    handler: snippet, controllerErrorCalls: calls, thrown, streamError,
    scope: 'Isolated published reader-error handler with a real ReadableStream controller. This does not measure full worker startup, search speed, or the installed 18.0.7 build.',
  }, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
