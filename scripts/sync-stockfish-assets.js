import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const stockfishRoot = path.join(repoRoot, 'node_modules', 'stockfish')
const stockfishBin = path.join(stockfishRoot, 'bin')
const publicEngine = path.join(repoRoot, 'public', 'engine')

const files = [
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm',
  'stockfish-18-lite.js',
  'stockfish-18-lite.wasm',
]

function copyFile(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing Stockfish asset: ${source}`)
  }
  fs.copyFileSync(source, destination)
}

fs.mkdirSync(publicEngine, { recursive: true })

for (const file of files) {
  copyFile(path.join(stockfishBin, file), path.join(publicEngine, file))
}

copyFile(path.join(stockfishRoot, 'Copying.txt'), path.join(publicEngine, 'Copying.txt'))

const packageJson = JSON.parse(fs.readFileSync(path.join(stockfishRoot, 'package.json'), 'utf8'))
// Track the build actually copied into public/, even if node_modules changes later.
fs.writeFileSync(path.join(repoRoot, 'src', 'engine', 'localStockfishBuild.json'),
  `${JSON.stringify({ version: packageJson.version }, null, 2)}\n`)
console.log(`Synced Stockfish ${packageJson.version} assets to public/engine.`)
