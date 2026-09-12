// Run the existing real-Stockfish smoke workflow at a short desktop height.
// Start Vite on 4324 first; SMOKE_URL / SMOKE_BROWSERS / SMOKE_OUTPUT still work.
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../../..')
const original = fs.readFileSync(path.join(root, 'scripts/smoke-engines-browser.cjs'), 'utf8')
const source = original.replace('viewport: { width, height: 812 }', 'viewport: { width, height: 360 }')
if (source === original) throw new Error('The smoke viewport changed; inspect it before rerunning this probe.')
process.env.SMOKE_WIDTHS ||= '901'
process.env.SMOKE_OUTPUT ||= '/tmp/web-chess-short-real-engines'
new Function('require', source)(createRequire(path.join(root, 'package.json')))
