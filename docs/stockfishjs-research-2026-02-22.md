# Stockfish.js Research (Verified: 2026-02-22)

## 1) Latest versions

- Upstream Stockfish latest official release: `sf_18` (published 2026-01-31).
- `nmrugg/stockfish.js` latest GitHub release tag: `v18.0.0` (published 2026-02-11).
- npm `stockfish` latest dist-tag: `18.0.5` (registry modified 2026-02-12).

## 2) Stockfish.js 18 build flavors (from official README + npm package)

- `stockfish-18.js` + `stockfish-18.wasm`
  - Largest and strongest build.
  - Multithreaded (requires cross-origin isolation / SharedArrayBuffer support).
  - `stockfish-18.wasm` is about 113MB.
- `stockfish-18-single.js` + `stockfish-18-single.wasm`
  - Same strength class, single-threaded.
  - Works when cross-origin isolation is not available.
  - `.wasm` about 113MB.
- `stockfish-18-lite.js` + `stockfish-18-lite.wasm`
  - Multithreaded but weaker, much smaller (~7MB wasm).
- `stockfish-18-lite-single.js` + `stockfish-18-lite-single.wasm`
  - Single-threaded lite fallback (~7MB wasm).
- `stockfish-18-asm.js`
  - ASM.js fallback; slowest and weakest.

## 3) Full UCI options actually exposed by Stockfish 18 WASM builds

The options below are from live `uci` output from installed `stockfish@18.0.5`.

### Full builds (`stockfish-18.js`, `stockfish-18-single.js`)

- `Threads` (spin)
  - MT build: default 1, min 1, max 32
  - Single build: default 1, min 1, max 1
- `Hash` (spin) default 16, min 1, max 33554432
- `Clear Hash` (button)
- `Ponder` (check) default false
- `MultiPV` (spin) default 1, min 1, max 256
- `Skill Level` (spin) default 20, min 0, max 20
- `Move Overhead` (spin) default 10, min 0, max 5000
- `nodestime` (spin) default 0, min 0, max 10000
- `UCI_Chess960` (check) default false
- `UCI_LimitStrength` (check) default false
- `UCI_Elo` (spin) default 1320, min 1320, max 3190
- `UCI_ShowWDL` (check) default false
- `EvalFile` (string)
  - full default: `nn-c288c895ea92.nnue`
- `EvalFileSmall` (string)
  - full default: `nn-37f18f62d772.nnue`

### Lite builds (`stockfish-18-lite.js`, `stockfish-18-lite-single.js`)

- Same option set as full, with these differences:
  - `EvalFile` default is `nn-9067e33176e8.nnue`
  - `EvalFileSmall` default is `<empty>`
  - `Threads` max follows build type:
    - lite MT: max 32
    - lite single: max 1

## 4) What is "best performance" for GitHub Pages specifically?

- Pure engine strength/performance winner: multithreaded `stockfish-18.js`.
- GitHub Pages constraint:
  - SharedArrayBuffer / WASM threading needs cross-origin isolation.
  - GitHub Pages does not provide native custom response headers for COOP/COEP yet (as of 2026-02-22 discussion thread).
- Practical recommendation for GitHub Pages:
  - Default engine: `stockfish-18-single.js` (best strength without relying on COOP/COEP headers).
  - Mobile/low-memory fallback: `stockfish-18-lite-single.js`.
  - Optional advanced mode: add `coi-serviceworker` to simulate COOP/COEP in contexts where headers cannot be configured (with first-load reload tradeoff).

## 5) Recommended runtime engine selection policy

1. If `crossOriginIsolated === true` and `SharedArrayBuffer` available:
   - load `stockfish-18.js` (MT), set `Threads` to a safe auto value.
2. Else if desktop class and enough memory:
   - load `stockfish-18-single.js`.
3. Else:
   - load `stockfish-18-lite-single.js`.
4. Last-resort legacy fallback:
   - `stockfish-18-asm.js`.

## 6) Sources

- Stockfish.js repo (README): https://github.com/nmrugg/stockfish.js
- Stockfish.js latest release: https://github.com/nmrugg/stockfish.js/releases/latest
- npm package: https://www.npmjs.com/package/stockfish
- npm registry API used for exact latest tag: https://registry.npmjs.org/stockfish
- Official Stockfish releases: https://github.com/official-stockfish/Stockfish/releases/latest
- SharedArrayBuffer cross-origin isolation requirements: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- GitHub Pages COOP/COEP header request discussion: https://github.com/orgs/community/discussions/13309
- COI service worker (headerless workaround): https://github.com/gzuidhof/coi-serviceworker
