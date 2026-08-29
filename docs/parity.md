# Parity with the sibling apps

web-chess is one of three apps built to the same shape — an engine in a worker, a
move tree, an eval graph, a review pass with accuracy, a saved-game library, a
GitHub Pages deploy — for a different game each:

- [web-katrain](https://github.com/Sir-Teo/web-katrain) — Go, KataGo in the browser
- [web-chess](https://github.com/Sir-Teo/web-chess) — chess, Stockfish in the browser
- [web-xiangqi](https://github.com/Sir-Teo/web-xiangqi) — xiangqi, Pikafish compiled to WASM

**Update the table below when a feature lands here.** That is the whole point of
the file. The three drift at the speed they are worked on, and nothing else in
these repos notices: the plan that proposed this file spent a night finding
things that were only visible by comparison — a deploy that ran no checks, a
search box none of the three bounded, a lesson learned in one file and left
unfixed in the file beside it. A table that is kept current turns those into
something a reader spots in a minute.

The deeper comparison, and what is worth moving next, lives in web-chess's
[`docs/cross-app-learning-plan.md`](https://github.com/Sir-Teo/web-chess/blob/main/docs/cross-app-learning-plan.md)
and [`docs/cross-app-second-pass.md`](https://github.com/Sir-Teo/web-chess/blob/main/docs/cross-app-second-pass.md).

## Where the three stand

Measured 2026-08-29.

| | web-katrain | web-chess | web-xiangqi |
| --- | --- | --- | --- |
| Domain | Go (KataGo) | Chess (Stockfish) | Xiangqi (Pikafish) |
| `src` files | 233 | 118 | 71 |
| Test cases | 1,417 | 410 | 338 |
| App state | Zustand store | `useState` in `App.tsx` | `useState` in `App.tsx` |
| Deploy runs the checks | yes | yes | yes |
| `npm run verify` | yes | yes | yes + engine smoke/parity |
| Hostile-input parser sweep | yes | yes | yes |
| Bounded search query | yes | yes | yes |
| Namespaced, versioned storage keys | yes | yes | yes |
| One device-tier sizing policy | threads only | capabilities + hash | full tier + live/review policy |
| Saved-game library | IndexedDB, folders, zip | IndexedDB, JSON backup | localStorage, flat |
| Auto-save + crash recovery | yes | yes | yes |
| Error boundary | component + lazy-modal | inline + lazy-dialog | component + lazy-panel |
| Command palette | yes | no | no |
| Board / UI themes | yes | no | no |
| Sound | yes | no | partial |
| Haptics | yes | no | no |
| Analysis queue with position cache | yes | no | no |
| Real service worker + install banner | yes | `coi-serviceworker` only | unregisters legacy SWs |
| Position / FEN editor | no | yes | no |
| Cloud eval, opening explorer, tablebase | no | yes | no |
| Browser (Playwright) tests | one viewport script | boot, review, layout at two sizes | layout + parity + review |
| Engine built from source | no | no | yes (emsdk) |

## What this repo is the reference for

**Protocol handling and test discipline.** `engine/uci.ts` is a pure,
fully-tested command builder and line parser; web-xiangqi re-derives a thinner
version inside a 938-line hook. Nearly every `engine/` module has a
`*.test.ts` beside it, and `__fuzz.test.ts` — eleven adversarial inputs across
six parser entry points, asserting a time bound — is the habit both siblings
have now copied.

**The outside world.** Cloud evaluation, the Lichess opening explorer,
tablebase lookups, and the rate-limited queue and cache in front of them.
web-xiangqi could port that layer almost 1:1 onto chessdb.cn.

**A position editor**, and a review that scores on winning chances rather than
raw centipawns.

## What this repo is still missing

A store (state is in a 5,500-line `App.tsx`), a command palette, themes, sound,
haptics, a real service worker, and the analysis queue with position caching.

Two gaps closed since this file was written: game accuracy is no longer a plain
mean — it is weighted by how volatile the game was around each move — and there
is now a browser test that loads a game, runs a review and asserts the summary,
against a fake engine injected in place of the Stockfish worker.
