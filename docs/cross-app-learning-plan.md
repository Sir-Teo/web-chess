# Cross-App Learning Plan: web-katrain / web-chess / web-xiangqi

*Survey performed 2026-08-27 across the three sibling repos in `~/Developer`,
plus an external research pass over the ecosystems the three apps live in (§8).*

*Since 2026-08-28 this is no longer a read-only document: §9 records what has
actually been built, and the tables below have been corrected where reading the
code contradicted the original survey. Rows marked ✅ are done.*

## TL;DR

The three apps are the **same application built three times**: a client-side
board-game analysis studio — engine in a Web Worker, move tree, eval graph, WDL
bar, review pass with accuracy, saved games, share links, GitHub Pages deploy.
They have already forked into three dialects of the same code (chess and xiangqi
literally ship diverged copies of `WdlBar`, `MoveListTree`, and `WatchControls`).

Each repo is strongest in a different layer, and each is missing something a
sibling already solved:

- **web-katrain** owns *product surface and app architecture* — and is the only
  one whose CI never runs its own 250 tests.
- **web-chess** owns *protocol handling and test discipline* — and is the only
  one where you cannot save a game.
- **web-xiangqi** owns *the engine toolchain and real-browser verification* —
  and is the only one with zero unit tests.

The plan below is graded: Tier 0 costs almost nothing, Tier 1 is where the value
is, Tier 2 is deliberately small.

---

## 1. The three apps at a glance

| | web-katrain | web-chess | web-xiangqi |
| --- | --- | --- | --- |
| Domain | Go (KataGo) | Chess (Stockfish) | Xiangqi (Pikafish) |
| `src` files | 229 | 82 | 31 |
| `src` LOC | 65,767 | 16,425 | 13,285 |
| Test files | 250 files / 1,327 tests | ✅ 35 files / 261 tests | ✅ 4 files / 75 tests (was **0 unit**) |
| Commits | 1,213 | 626 | 493 |
| Biggest file | `store/gameStore.ts` (5,217) | `App.tsx` (**5,310**) | `App.tsx` (**4,950**) |
| State | Zustand store + selectors | `useState` in `App.tsx` | `useState` in `App.tsx` |
| Engine | KataGo weights + **MCTS written in TS** (TFJS WebGPU→WASM→CPU) | prebuilt `stockfish` npm worker | **Pikafish built from source** (patch + emsdk) |
| Engine transport | custom worker protocol | UCI | UCI |
| Saved games | IndexedDB, folders, tags, favorites, zip backup | ✅ IndexedDB + JSON backup (was **none**) | flat localStorage, 500-game / 3 MB cap |
| PWA / offline | manifest + real `sw.js` + install banner + update checks | `coi-serviceworker` only | actively **unregisters** SWs |
| CI gates | ✅ audit → lint → test → typecheck → build (was **build only**) | audit → lint → test → build | ✅ + `npm test`, then WASM build → smoke → parity → Playwright |
| Style | semicolons, 2-space | **no semicolons**, 2-space | semicolons, **4-space** |
| Branch | `main` | `main` | `main` (the survey said `ui-polish-pass`; it has since moved) |

Feature presence (files matching each concern):

| Concern | katrain | chess | xiangqi |
| --- | --- | --- | --- |
| Command palette | 7 | 0 | 0 |
| Keyboard shortcut system | 30 | 2 | 5 |
| Sound | 12 | 0 | 2 |
| Haptics | 1 | 0 | 0 |
| Themes | 18 | 0 | 1 |
| Auto-save / crash recovery | 5 | ✅ yes | ✅ yes |
| Error boundary component | yes (+ lazy-modal boundary) | **yes** — inline in `main.tsx`, with reload and reset-workspace actions. The original survey said "no" because it looked for a component *file*; that was wrong. | yes |
| `aria-*` attribute variety | 25 kinds, 143 `role=` | 18 kinds, 38 `role=` | 21 kinds, 60 `role=` |

---

## 2. The structural finding

Three concerns are implemented three times with no shared abstraction:

**a. The UCI client (chess ↔ xiangqi).** Same wire protocol, two implementations.
`web-chess/src/hooks/useStockfishEngine.ts` (921 lines) has a proper command
queue with per-command completion detection (`isQueuedCommandDone`), a
no-reply-command set, `parseInfoLine`, `parseOptionLine`, a raw-line ring buffer,
and a 100 ms state flush. `web-xiangqi/src/hooks/useEngine.ts` (923 lines)
re-derives a thinner version (`parseBestMoveUci`, `parsePvUciMoves`, a 200 ms
flush, no option parsing, no queue). Neither can borrow the other's bug fixes.

**b. Review classification (all three).** `web-xiangqi/src/utils/review.ts` and
`web-chess/src/engine/analysis.ts` define the *same* model — `best | good |
inaccuracy | mistake | blunder`, centipawn-loss thresholds, win-percent-loss
thresholds, per-side accuracy, average CPL, key moments — with different
constants and no shared math. `web-katrain/src/utils/gameReport.ts` does the
same thing again in Go terms (policy rank + points lost), and goes further with
game phases and narrative tags.

**c. Presentation components (chess ↔ xiangqi).** `WdlBar`, `MoveListTree`, and
`WatchControls` exist under both repos with matching names, matching props in
spirit, and fully diverged bodies. `WatchControls` even redefines `AiSpeed`
locally in xiangqi while chess keeps it in `components/aiSpeed.ts`.

---

## 3. What each repo should donate

### 3.1 web-chess → siblings

| Donate | Where it lives | Recipient and why |
| --- | --- | --- |
| **UCI command queue** | `hooks/useStockfishEngine.ts`, `engine/uci.ts` | **xiangqi.** Replaces ad-hoc `postMessage` sequencing in `useEngine.ts`; brings completion detection, option parsing, and search-timeout stop handling (`shouldStopTimedOutSearchCommand`). |
| **Declarative engine profiles** | `engine/profiles.ts` | **xiangqi + katrain.** A profile list with `requiresIsolation`, `source: local\|cdn`, and `EngineCapabilities` beats xiangqi's scattered variant strings and katrain's `backendFallback` ad-hockery. |
| **Rate-limited external-API layer** | `engine/lichessQueue.ts`, `cloudEval.ts`, `cloudEvalPolicy.ts`, `tablebase.ts`, `openingExplorer.ts`, `storageCache.ts` | **katrain.** `utils/ogs.ts` / `ogsSync.ts` fetch without a shared queue, cache, or degradation policy. |
| **Colocated unit tests** | 31 `*.test.ts` sitting beside nearly every `engine/` module | **xiangqi.** Near-1:1 module-to-test ratio on pure logic is the single most copyable habit in these repos. |
| **Deploy gate order** | `.github/workflows/deploy.yml`: audit → lint → test → build → deploy | **katrain.** Its `deploy-pages.yml` runs `npm ci` then `npm run build`. 250 test files never execute in CI. |
| **Position editor** | `engine/positionSetup.ts` | **xiangqi.** No FEN/position editor today. |
| **Board accessibility model** | `engine/boardAccessibility.ts` (+ tests) | **xiangqi.** Tested, portable square-description logic. |

### 3.2 web-katrain → siblings

| Donate | Where it lives | Recipient and why |
| --- | --- | --- |
| **Store-shaped architecture** | `store/gameStore.ts` + selector-reading components; `docs/architecture.md` states "components should not talk to the worker directly" | **chess + xiangqi.** Both have a ~5,000-line `App.tsx` holding all state. Katrain's file is the same size but it is a *store*, which is why it has 250 tests and the siblings' `App.tsx` files have ~0 direct coverage. |
| **Analysis queue + position cache** | `utils/analysisQueue.ts`, `analysisPositionKey.ts`, `analysisSmoothing.ts`, `analysisCoverage.ts` | **chess + xiangqi.** Cancelation/staleness error types, cache-size listeners, dedup by position key. Both siblings re-search positions on every navigation. |
| **Game report** | `utils/gameReport.ts`, `narrativeTags.ts`, `moveInsight.ts`, `playedMoveQuality.ts` | **chess + xiangqi.** Phase split (opening/middle/endgame), mistake distribution, per-phase filters, and auto-generated arc labels ("Epic Comeback"). Both siblings compute accuracy and stop. |
| **Real library** | `utils/library.ts`, `libraryZip.ts`, `libraryImportValidation.ts`, `libraryTextImport.ts`, `libraryKeyboard.ts` | **chess (critical)** — chess has exactly one storage key (`webchess:analysis-settings:v1`) and no way to save a game. **xiangqi** — upgrade from a capped flat localStorage list to folders + zip backup. |
| **Auto-save + crash recovery** | `utils/autoSave.ts`, `AutoSaveRecoveryModal.tsx` | **chess + xiangqi.** Neither survives a reload. |
| **Command palette + shortcut registry** | `utils/commandPalette.ts`, `shortcuts.ts`, `keyboardHelp.ts`, `CommandPaletteModal`, `ShortcutSettingsPanel`, `KeyboardHelpModal` | **chess + xiangqi.** |
| **PWA done properly** | `public/sw.js`, `manifest.webmanifest`, `utils/pwa.ts`, `PwaInstallBanner`, update checks in `main.tsx` | **chess + xiangqi.** Chess ships only `coi-serviceworker`; xiangqi's `serviceWorkerCleanup.ts` deletes SWs rather than using one. |
| **Error containment** | `AppErrorBoundary.tsx`, `LazyModalBoundary.tsx`, `utils/errorReporting.ts` | **chess** (no boundary component at all). |
| **Themes / sound / haptics** | `utils/boardThemes.ts`, `uiThemes.ts`, `sound.ts`, `haptics.ts` | **chess** (zero of the three), **xiangqi** (sound only). |
| **Docs set + competitive practice** | `docs/{architecture,engine,development,deployment,diagram}.md` and `docs/competitor-analysis.md` | **chess + xiangqi.** Chess has 2 ad-hoc docs; xiangqi's `docs/` is empty and its README carries everything. |
| **Study modes** | `data/lessons.ts`, `botPersonas.ts`, `utils/problemMode.ts`, `punishQuiz.ts`, `guessMove.ts`, `tournament.ts`, `gauntlet.ts` | **chess + xiangqi**, later. Highest effort, most differentiating. |

### 3.3 web-xiangqi → siblings

| Donate | Where it lives | Recipient and why |
| --- | --- | --- |
| **Device-tier analysis budgeting** | `utils/analysisProfile.ts` | **chess + katrain.** Detects tier from viewport, `hardwareConcurrency`, `deviceMemory`, and coarse pointer, then emits both an `EngineBootConfig` (threads / hash / variant / `saferBoot`) *and* a `LiveAnalysisPolicy` (debounce, primary budget, deepen-after-delay). More principled than chess's single `recommendedThreadCount` or katrain's static `visitPresets`. |
| **Build-engine-from-source pipeline** | `patches/pikafish-wasm.patch`, `templates/emscripten/*`, `scripts/build-pikafish.sh`, pinned `PIKAFISH_UPSTREAM_REF`, threaded/single/SIMD flavors, `public/THIRD_PARTY_NOTICES.md` | **chess.** Chess is pinned to whatever `stockfish@18` ships and pulls full-strength builds from a CDN. This pipeline is the escape hatch, and the licensing/notice discipline is worth copying regardless. |
| **Real-browser test harness** | `scripts/test-ui-layout.cjs` (Playwright), `test-worker-parity-browser.cjs`, `test-review-parity.cjs`, `test-review-fixtures-browser.cjs`, `test-serve-demo.cjs` | **chess + katrain.** Node-vs-browser parity checks and layout assertions on a real engine. Katrain has one viewport smoke test; chess has no browser tests. |
| **Performance regression gates** | `scripts/bench-nps.cjs` with `--compare`, `--min-median-nps`, `--max-median-wall-ms`, `--max-cold-start-ms` | **katrain.** Its MCTS is hand-written TypeScript — the codebase most likely to silently regress in throughput, with no benchmark today. |
| **Engine crash containment** | `shouldSuppressEngineRuntimeError`, `shouldSuppressEngineRuntimeRejection`, `hasMemoryAccessOutOfBounds` in `useEngine.ts` | **chess + katrain.** WASM OOM and runtime aborts surface as opaque global errors; xiangqi already classifies them. |
| **Conditional caching for huge artifacts** | `scripts/serve-demo.cjs` | **katrain**, which ships a ~96 MB recommended model. |
| **CI caching layout** | `ci.yml` caches npm, emsdk, and Playwright browsers separately | **chess + katrain.** |

---

## 4. Priority ranking

Ordered by (value ÷ effort), highest first.

| # | Move | Repo | Source | Effort |
| --- | --- | --- | --- | --- |
| 1 | Run lint + the 250 existing tests in CI before deploying | katrain | chess `deploy.yml` | trivial |
| 2 | Add Vitest + colocate unit tests for `review.ts`, `xiangqi.ts`, `moveNotation.ts`, `gameLibrary.ts`, `openings.ts` | xiangqi | chess's `engine/*.test.ts` habit | small, compounding |
| 3 | Ship a game library (IndexedDB, folders, zip) | chess | katrain `utils/library.ts` | medium, **unblocks a missing core feature** |
| 4 | Adopt device-tier boot + live-analysis policy | chess, katrain | xiangqi `analysisProfile.ts` | small |
| 5 | Auto-save + crash recovery | chess, xiangqi | katrain `utils/autoSave.ts` | small |
| 6 | Put the UCI queue behind one implementation | xiangqi | chess `useStockfishEngine.ts` | medium |
| 7 | Analysis queue with position-key caching | chess, xiangqi | katrain `utils/analysisQueue.ts` | medium |
| 8 | Break `App.tsx` into a store | chess, xiangqi | katrain `store/gameStore.ts` pattern | large, **highest long-term payoff** |
| 9 | Phase-aware game report + narrative tags | chess, xiangqi | katrain `gameReport.ts` + `narrativeTags.ts` | medium |
| 10 | NPS benchmark with regression thresholds | katrain | xiangqi `bench-nps.cjs` | small |
| 11 | Command palette + shortcut registry + keyboard help | chess, xiangqi | katrain `utils/commandPalette.ts` | medium |
| 12 | Real service worker, manifest, install banner, update check | chess, xiangqi | katrain `public/sw.js` + `utils/pwa.ts` | medium |
| 13 | Playwright layout + worker-parity checks | chess, katrain | xiangqi `scripts/test-*.cjs` | medium |
| 14 | Themes, sound, haptics | chess, xiangqi | katrain `utils/{boardThemes,uiThemes,sound,haptics}.ts` | medium |
| 15 | `docs/architecture.md` + `docs/engine.md` per repo | chess, xiangqi | katrain `docs/` | small |
| 16 | Rate-limited external-API queue for OGS sync | katrain | chess `lichessQueue.ts` | small |
| 17 | Study modes (lessons, quiz, problems, ladder, personas) | chess, xiangqi | katrain `data/` + `utils/` | large |

---

## 5. Shared-code strategy

Three separate repos, one author, three GitHub Pages deploys, and three
different engine toolchains. A monorepo would be the textbook answer and the
wrong one here: it forces one release cadence onto an emsdk build, a TFJS model
fetch, and a plain Vite app.

**Recommended: three tiers, only the third of which shares code.**

### Tier 0 — Convention parity (no code moves)

Make the repos *legible to each other* so a port is a copy, not a translation.

- One formatting convention. Today: chess is semicolon-free/2-space, xiangqi is
  semicolons/4-space, katrain is semicolons/2-space. Pick katrain's (majority of
  the LOC) and add Prettier or matching ESLint stylistic rules to all three.
- One directory vocabulary: `engine/` (protocol + analysis math), `store/`,
  `hooks/`, `components/`, `utils/`, `data/`, `docs/`.
- One quality-gate script name set across all three: `lint`, `test`,
  `test:typecheck`, `build`, `audit` — with the same CI ordering.
- One `docs/architecture.md` shape per repo, mirroring katrain's.
- A `docs/parity.md` in each repo: the feature matrix from §1 of this document,
  updated when a feature lands. This is what keeps the three from drifting
  further.

### Tier 1 — Port by copy (most of the value)

For everything in §4, copy the module, adapt the domain types, keep the tests.
Deliberate duplication with a shared *shape* is cheaper than premature
extraction, and it is how items 1–7 and 9–17 should be done. Note the source
repo and commit at the top of each ported file so drift is traceable.

### Tier 2 — Extract a package (deliberately small)

Only for modules where duplication is already proven and the logic is genuinely
game-agnostic. A fourth repo, `board-study-kit`, consumed as a git submodule or
a GitHub Packages npm dependency. Initial contents, in order of readiness:

1. **`uci/`** — command queue, `parseInfoLine`, `parseOptionLine`, option types,
   search-timeout handling. Consumers: chess, xiangqi. *Already duplicated.*
2. **`review/`** — quality thresholds, centipawn↔win-percent conversion,
   accuracy and average-CPL math, key-moment extraction, line signatures.
   Consumers: chess, xiangqi; katrain adapts via a points-lost shim.
   *Already triplicated.*
3. **`device/`** — device tiering and analysis budgeting (from
   `analysisProfile.ts`). Consumers: all three.
4. **`library/`** — IndexedDB store, folder tree, zip backup/restore, import
   validation, with a **pluggable serializer** so SGF / PGN / xiangqi JSON each
   supply their own encode/decode. Consumers: all three.
5. **`ui/`** — `WdlBar`, `EvalGraph`, `MoveTree` render primitives, watch
   controls, command palette, shortcut registry. Consumers: all three.

**Explicitly not shared:** rules engines, move generation, notation
(SGF / PGN / WXF), opening books, board rendering geometry, engine binaries.
Anything with per-game semantics stays in its own repo.

---

## 6. Phasing

**Phase A — Gates and conventions (days).** Items 1, 2, 15 plus all of Tier 0.
Ends with: every repo runs audit → lint → test → build before deploy, xiangqi
has a Vitest suite, and all three have a `docs/architecture.md` and a
`docs/parity.md`.

**Phase B — Close the embarrassing gaps (weeks).** Items 3, 4, 5, 6, 10. Ends
with: chess can save games, all three size their search to the device, none of
them lose a game on reload, xiangqi has one UCI client, katrain has a
throughput benchmark.

**Phase C — Architecture (weeks, one repo at a time).** Item 8, then 7 and 9.
Do chess first (it has tests to catch regressions), then xiangqi. Ends with:
no repo has a 5,000-line `App.tsx`.

**Phase D — Extraction (only after Phase C).** Tier 2, starting with `uci/` and
`review/`, which will by then have three call sites each and settled interfaces.

**Phase E — Surface (ongoing).** Items 11–14, 16, 17.

---

## 7. Risks and non-goals

- **Extracting too early.** `review/` and `uci/` interfaces are not settled in
  xiangqi yet. Tier 2 must not start before Phase C; Tier 1 duplication is the
  correct intermediate state.
- **Submodule friction on Pages deploys.** If Tier 2 lands, CI checkout needs
  `submodules: recursive` (or a package registry auth step) in all three deploy
  workflows. Verify before extracting, not after.
- **xiangqi is on `ui-polish-pass`, not `main`.** Land or close that branch
  before making it a donor or recipient of a port.
- **Katrain's engine is not portable.** Its MCTS and feature encoders are
  Go-specific and hand-written; nothing in `engine/katago/` belongs in a shared
  kit. Only the *queue and caching* layers above it travel.
- **Chess's Stockfish assets are GPL-3.0** while app code is MIT. Any shared
  package must stay MIT and must not vendor engine binaries — follow xiangqi's
  `THIRD_PARTY_NOTICES.md` practice.
- **Not a goal:** unifying the UIs. The three games have genuinely different
  board geometry, notation, and idioms. Share the machinery, not the look.

---

## 8. External research findings (2026-08-27)

A deep pass over the ecosystems each app competes in. Four findings change or
sharpen the plan above; the rest confirm it.

### 8.1 The shared review math should not be invented — it is published

All three repos hand-rolled their quality thresholds (§2b). The industry-anchor
formulas are open:

- **Lichess win% from centipawns:**
  `Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`
- **Lichess per-move accuracy from win% loss:**
  `Accuracy% = 103.1668 * exp(-0.04354 * (win%Before - win%After)) - 3.1669`
- **Game accuracy aggregation:** Lichess does *not* average per-move accuracy.
  It computes a volatility-weighted mean (sliding windows over win%, stddev as
  weight) and a harmonic mean, then averages the two — precisely to stop one
  blunder in an even game, or noise in a decided game, from distorting the
  number. None of our three apps does this; all three average naively.
- **Chess.com's taxonomy** (brilliant/great/best/excellent/good/book/
  inaccuracy/mistake/blunder/miss) is likewise driven by win-probability loss,
  not raw centipawns; "brilliant" is now simply *a good piece sacrifice*. The
  interesting cross-app idea is the **"Miss"** label — a move that fails to
  punish the opponent's last mistake. Katrain has the punish concept
  (`punishQuiz.ts`, punished-mistake dot sizing per desktop KaTrain); chess and
  xiangqi have nothing like it.

Consequences for the plan:

1. The Tier 2 `review/` module (§5) should implement Lichess's published
   win%/accuracy formulas and window aggregation as its core, with thresholds
   expressed in win-percent loss. Xiangqi's `review.ts` already carries
   `REVIEW_WIN_PERCENT_LOSS_THRESHOLDS` beside its centipawn table — it is
   halfway there; chess's `analysis.ts` is centipawn-only.
2. **Caveat on cp scales:** since Stockfish 15.1, evaluations are *normalized*
   so +100 cp = 50% win probability in self-play; the WDL model further depends
   on ply/material. Pikafish inherits Stockfish conventions; KataGo natively
   outputs winrate and score lead, so katrain plugs into a win%-based module
   directly — one more argument for win%-basis rather than cp-basis in shared
   code. Prefer engine-reported WDL (`UCI_ShowWDL`) over converting cp when
   available; both chess and xiangqi already parse WDL.

### 8.2 Precedent for the Tier 2 extraction — and a license trap

Lichess itself runs the strategy §5 recommends: the server (lila) stays a
monolith while genuinely reusable pieces are published standalone —
**chessground** (board UI), **chessops** (rules/notation), **pgn-viewer** — and
consumed by dozens of third-party apps. Extraction of settled, game-agnostic
modules works; nobody extracts the server.

The trap: **chessground and the Stockfish/Pikafish builds are GPL-3.0.**
web-chess's app code is MIT with GPL engine *assets* — fine as long as GPL code
is a separate worker/process boundary. But `board-study-kit` must never vendor
engine code or derive from chessground, or the kit (and arguably its consumers)
becomes GPL. Same reason web-katrain must not copy from Kaya (AGPL-3.0). Keep
the kit MIT, clean-room, engine-agnostic.

Also checked: no existing npm package covers our shared-UCI need. `node-uci`
and friends are Node child-process oriented; browser-worker UCI clients get
re-written per app everywhere (lila does its own too). The Tier 2 `uci/`
module fills a real gap and is not reinventing an available wheel.

### 8.3 The engine-flavor matrix is convergent evolution — standardize it

Lichess's `lila-stockfish-web` and nmrugg's `stockfish` npm package (which
web-chess consumes) both ship the same shape of matrix web-xiangqi built for
Pikafish: lite-single default (works everywhere), full-multi behind
COOP/COEP + SharedArrayBuffer, no-SIMD fallback for old Safari, plus special
workarounds (a no-worker build exists solely for a Chrome 109 bug). Thread
count is further capped by WASM memory (lichess: 4 threads at 16 MB hash).

This is three independent confirmations of the same design. The Tier 2
`device/` module (from xiangqi's `analysisProfile.ts`) plus chess's
`profiles.ts` declarative shape is the right abstraction; katrain should adopt
it for its TFJS WebGPU→WASM→CPU ladder too. Also worth copying from lichess
practice: persist the user's thread/hash choices per device (lichess stores
`analyse.ceval.threads` / `hash-size` in localStorage).

### 8.4 New donor: the outside world (features none of the three has)

- **chessdb.cn Xiangqi Cloud Database** — a free REST API
  (`chessdb.php?action=queryall|querybest|queue`, FEN in, eval/moves/EGTB out)
  built by engine analysis, the direct xiangqi analog of the Lichess
  cloud-eval + opening-explorer + tablebase stack that web-chess already
  integrates. **web-xiangqi can port chess's `cloudEval.ts` /
  `cloudEvalPolicy.ts` / `lichessQueue.ts` / `storageCache.ts` layer nearly
  1:1 with chessdb.cn as the backend** — the highest-leverage new feature this
  research surfaced. (A sibling API exists for chess as a second cloud-eval
  source.)
- **Human-like opponents:** katrain's persona bots map to **Maia** in chess —
  nine lc0-loadable networks (1100–1900, CC BY-NC-SA implications to check)
  trained to predict human moves, or the zero-dependency fallback of
  Stockfish's `UCI_LimitStrength`/`UCI_Elo`. web-chess's `useAiPlayer` +
  `profiles.ts` is the natural seam.
- **Repertoire training with spaced repetition** (En Croissant / Pawn Appétit,
  the leading open-source desktop chess GUIs) — a study mode none of the three
  apps has; it generalizes across all three games and fits katrain's existing
  lessons/quiz frame.
- **Board photo recognition for xiangqi:** the 棋弈江湖 Xiangqi PWA ships an
  open-source ONNX board recognizer + 7300-puzzle DB; katrain already has
  `photoBoardRecognition.ts`. If katrain's recognizer is ever generalized,
  xiangqi has a proven reference implementation to compare against.
- **Go competitive context** (confirms katrain's `docs/competitor-analysis.md`):
  AI Sensei and ZBaduk are server-side; katrain's fully client-side analysis
  remains the differentiator. Kaya (AGPL) is still the closest analog — study
  its features, never its code.
- **lixiangqi** (Lichess fork for xiangqi) ships an independently deployable
  open-source xiangqi opening explorer — a candidate data source or self-host
  path if chessdb.cn access becomes a concern.

### 8.5 Platform practice checks

- **Large-model caching (katrain) — checked, no action needed.** Chrome's
  guidance for browser AI models recommends the **Cache API** first, and OPFS
  writes a 100 MB buffer ~10× faster than IndexedDB (~90 ms vs ~850 ms).
  That gap is specifically about **ArrayBuffers**, which IndexedDB
  structured-clones byte by byte. `modelUpload.ts` stores a **Blob**, and
  IndexedDB keeps Blobs by reference in the browser's blob store rather than
  serializing them — which is the recommended way to put large binary data in
  IDB. So the benchmark does not transfer and there is nothing to fix here.
  The rule to carry forward: only reach for Cache API or OPFS if a call site
  is holding an ArrayBuffer.
- **Service worker for chess/xiangqi (§4 item 12):** if adopting
  `vite-plugin-pwa`/Workbox rather than porting katrain's hand-rolled `sw.js`,
  note Workbox's 2 MiB `maximumFileSizeToCacheInBytes` default — engine
  `.wasm`/`.nnue` files must go through runtime caching (as katrain's SW and
  xiangqi's `serve-demo.cjs` conditional-caching already do), not the precache
  manifest.
- **COOP/COEP reality check (all three):** confirmed unchanged upstream —
  threaded WASM needs cross-origin isolation everywhere; GitHub Pages still
  cannot set those headers, so single-thread fallbacks remain load-bearing on
  the current hosting. `coi-serviceworker` (which chess ships) is the
  community workaround; katrain and xiangqi rely on graceful fallback. Worth
  aligning all three on one approach in Tier 0.

### Sources

- [Lichess accuracy metric](https://lichess.org/page/accuracy) — win% and accuracy formulas, window aggregation
- [Chess.com Game Review terms](https://www.chess.com/terms/game-review) and [move classifications](https://chessda.com/guide/move-classifications)
- [Stockfish normalized eval](https://github.com/official-stockfish/Stockfish/commit/ad2aa8c06f438de8b8bb7b7c8726430e3f2a5685), [WDL model](https://github.com/official-stockfish/WDL_model), [Useful data](https://github.com/official-stockfish/Stockfish/wiki/Useful-data)
- [lila-stockfish-web](https://github.com/lichess-org/lila-stockfish-web), [stockfish.wasm](https://github.com/lichess-org/stockfish.wasm), [stockfish npm package](https://www.npmjs.com/package/stockfish) ([nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js/))
- [chessground](https://github.com/lichess-org/chessground), [chessops](https://www.npmjs.com/package/chessops), [lichess pgn-viewer](https://github.com/lichess-org/pgn-viewer), [lichess source list](https://lichess.org/source)
- [node-uci](https://github.com/ebemunk/node-uci) (Node-oriented; confirms the browser-UCI gap)
- [Xiangqi Cloud Database API](https://www.chessdb.cn/cloudbook_api_en.html) and [info page](https://chessdb.cn/cloudbook_info_en.html)
- [Maia chess](https://github.com/CSSLab/maia-chess), [Lichess Maia announcement](https://lichess.org/blog/X9PUixUAANCqFRSh/introducing-maia-a-human-like-neural-network-chess-engine)
- [En Croissant](https://github.com/franciscoBSalgueiro/en-croissant), [Pawn Appétit](https://github.com/Pawn-Appetit/pawn-appetit/)
- [AI Sensei](https://ai-sensei.com/), [ZBaduk](https://www.zbaduk.com/), [KaTrain (desktop)](https://github.com/sanderland/katrain)
- [awesome-xiangqi](https://github.com/lucaferranti/awesome-xiangqi), [lixiangqi](https://github.com/travis-mallett/lixiangqi), [xiangqi.js](https://github.com/lengyanyu258/xiangqi.js/)
- [Chrome: cache AI models in the browser](https://developer.chrome.com/docs/ai/cache-models), [web.dev OPFS](https://web.dev/articles/origin-private-file-system), [Lumafield OPFS benchmark](https://barndoors.lumafield.com/3x-faster-project-loads-with-the-origin-private-file-system/)
- [Vite PWA precache guide](https://vite-pwa-org.netlify.app/guide/service-worker-precache)

---

## 9. Progress log

Work done on the `overnight-cross-app-improvements` branch in each repo,
2026-08-28. Every change was verified with that repo's own gates (lint,
typecheck, tests, build); UI changes were additionally exercised in a browser.

### Done

| # from §4 | Repo | What landed |
| --- | --- | --- |
| 1 | katrain | Deploy gated on audit, lint, the 250-file suite, and the test type-check. All four already passed; they simply never ran in CI, so a red suite could ship. |
| 2 | xiangqi | Vitest added and wired into CI. 75 tests over review scoring, the movement rules, device tiering, and auto-save. |
| 3 | chess | A saved-games library: PGN model, IndexedDB store with a localStorage→memory fallback, hook, dialog, toolbar entry, JSON backup import/export. |
| 5 | chess, xiangqi | Auto-save and crash recovery, ported from katrain's `autoSave.ts`. |
| 16 | katrain | OGS requests routed through a backoff queue (see below). |
| 9 | chess, xiangqi | Narrative tags — Comeback, Wire-to-wire, Missed win, Draw, Nail-biter — ported from katrain, plus the opening/middlegame/endgame split (see below). |
| 10 | katrain | The search benchmark reports again (its output was hidden), and now writes JSON, compares against a baseline, and can gate on a threshold. |
| — | chess | Review scoring moved onto winning chances (see below). |
| — | katrain, xiangqi | Library and pro-game search match every term rather than the query as one phrase. |
| — | chess, xiangqi | Comment stripping made linear, so a wrong file cannot freeze the tab on import. |
| — | chess | The library renders a page of 100 rows with a "Show more", instead of all 500. |
| — | katrain | The library pages at 100 rows too — it had no cap and rendered every one. |

### What was verified by running the apps, not just the tests

Written down because the tests passing is the weaker claim:

- **chess** — saved a game, reloaded, loaded it back; exported a backup, deleted
  the game, imported it back intact; rejected a duplicate, a foreign JSON file
  and garbage. Reviewed Aronian–Carlsen end to end: 116/116 evaluated,
  **98.3% accuracy**, Best 111 / Good 5 / no mistakes, ACPL 4 — a believable
  reading for a GM draw, which is the real evidence the win-percent curve
  behaves. A blitz endgame then exercised the critical-moments ranking
  (3.27 → 2.79 → 1.88 → 1.81 → 1.44). PGN export still carries its headers and
  79 `[%eval]` annotations after the analysis changes.
- **xiangqi** — auto-save written, restored and dismissed; library search
  measured live (`"hu 1977"` 0 → 1 game); narrative tags rendered from a stored
  review. With the engine deliberately failed, the app still plays moves, offers
  book continuations and saves, reporting "Recovering engine".
- **katrain** — runs its KataGo MCTS on WebGPU. The OGS import path was driven
  end to end against a stubbed response: one request to the right URL, SGF
  parsed, game loaded. The pro-game search fix confirmed live: `"sedol"` 3
  games, `"sedol 2005"` 2 (correctly dropping the 2003 game), `"sedol zzz"` 0.


### Bugs found while doing the work

Fourteen so far, across all three. Grouped by the lens that found them, because
the lens generalises better than the individual fix.

**A threshold sitting exactly where browsers disagree.** Both siblings tested
`navigator.deviceMemory <= 8` as though 8 meant "constrained". Browsers do not
agree on the top of that range: the spec describes clamping the value to limit
fingerprinting, and Chromium 148 was observed reporting `32`. So the same
machine was sorted differently depending on the browser — in web-chess, four
threads or eight; in web-xiangqi, the mid tier or the high one. Both now
compare below 4, which reads as a constraint under either behaviour.

*This entry was rewritten.* It first claimed the value is capped at 8, that
the wider branches were therefore unreachable, and that the tests missed it
because their fixtures were unrealistic. Measuring the actual browser showed
32, so the fixtures were fine and the branches were reachable. The change is
still right — it removes the browser-dependence — but the original reasoning
for it was not.

**A phrase match where a term match was meant.** `filterProGames` in
web-katrain joined every field into one string and asked whether the query
appeared as one run of characters, so `"sedol 2005"` found **nothing** — the
player and the year are different fields and never adjacent. web-xiangqi had
the same bug in both library filters (`"hu 1977"` → 0 games). web-katrain's own
`library.ts` already tokenised correctly, so that repo was inconsistent with
itself. All now require every whitespace-separated term.

**A cap checked after the fact.** `extractUciMoveLine` tested its limit after
pushing, returning 1025 moves against a stated cap of 1024 — and the library
refuses a line longer than the cap, so the longest importable game was one the
app then silently refused to save. Its sibling `extractUciMoveTree` checked
before incrementing and was correct.

**A non-finite number reaching the UI.** web-xiangqi's `WdlBar` rendered
`Red NaN%` in the label *and* the aria-label on a malformed engine reading,
with two segments at 100%; an all-zero triple showed a confident
0.0%/0.0%/0.0%. web-chess already rejected exactly those three cases.

**A regex used where a scan was needed.** Both siblings stripped PGN comments
with a pattern of the shape `\{[^}]*\}`, which backtracks from every opening
brace that has no closing one — quadratic. Measured in web-chess: 10k braces
43ms, 20k 168ms, 40k 622ms, 80k 2.5s. The importer accepts 5MB, so pasting
something full of braces that is not really a PGN — a minified script, a JSON
dump, any wrong file — would have hung the tab instead of being rejected.
web-xiangqi had it for both its tag brackets and its comment braces, freezing
for about ten seconds at its 200k cap.

**web-katrain does not have this bug, and the reason is the interesting part.**
Its SGF reader is a hand-written character scanner rather than a set of
regexes, and it parses 640k characters of pathological input in under a
millisecond — flat, where the siblings were quadratic. The rule worth carrying
across: *for delimited runs in untrusted text, scan for the closing character;
do not ask a regex to backtrack until it finds one.* Both siblings now do.

**Unreachable code.** `resolveEngineBootConfig` branched on `mobileLike` inside
its mid and high tiers, but a mobile-like device is always the low tier.

**Data listed twice.** Four opening lines appear under two names each, so the
second name can never be shown, and the duplicates inflated a move's apparent
branching in the Book Continuations ordering. Ordering fixed; the naming is a
terminology call left open.

**Output that never appeared.** web-katrain's search benchmark reported through
`console.log`, which Vitest's default reporter hides for a passing test — so
the readout it exists to produce printed nothing.

**Two of my own, caught by reviewing my own work.** A backoff that made an OGS
sync ignore its own Stop button for up to four minutes. And "1 move were in
progress", caught by the first component test in that repo.

**And two of my own that were not bugs at all**, which is the more useful
entry. I reported a debounced auto-save "starving" during analysis in both
siblings, and a board-measurement fragility in web-chess. Both were wrong:

- The auto-save writes 2.9s after a game loads, while the status reads
  *Analyzing*, and writes once in ten seconds. `mergeEvaluationSnapshot`
  returns the previous map unchanged when an update does not improve on it, so
  the identity does not churn per info line the way I assumed. Reverted in
  both repos — the original was better, because depending on the evaluations
  means the stored snapshot is refreshed as they improve.
- The board error came from a viewport of literally `0 × 0`, an automation
  pane that was not on screen. Every real size is fine, in dev and in a
  production build, on this branch and on `main`.

Both followed the same pattern: a plausible mechanism, evidence consistent
with it, and no measurement. Both were caught only by going back and
measuring. **Read that as a discount on every unmeasured claim in this
document** — the entries above with numbers attached were measured; treat any
that are not with suspicion.

### Three findings that came out of doing the work

**Chess was grading every move by centipawns alone.** Accuracy ran off
`100 * exp(-loss / 300)`, so a 300cp drop scored 36.8% whether it threw away an
equal game or shaved a rounding error off a won one. It now scores on winning
chances using the curve in §8.1 — the same move reads 31.4% from equality and
98.8% from +18. Labels follow the same rule, and the win-percent ladder is
*derived* from the existing centipawn ladder (20cp → 1.8 points, 260cp → 22.3)
so the two readings agree at equality by construction and only diverge once the
position is decided. Borrowing xiangqi's round thresholds (2/5/20/30) was the
other option and was too lenient: it downgraded a lost-from-equality blunder to
a "mistake".

**Katrain's OGS sync turned throttling into data loss.** `downloadNewOgsGames`
fetches one SGF per game in a loop with nothing watching for HTTP 429, so a
throttled download threw and the game was filed under `failed` — the reader was
told their games were broken when the server had only asked us to slow down,
and the rest of the sync kept hammering at the same rate. Now behind a queue
that parks on a 429 and retries, honouring `Retry-After` (capped, so a bad
header cannot park a sync indefinitely).

**Xiangqi's boot config had unreachable branches.** `resolveEngineBootConfig`
asked `profile.mobileLike` inside its mid and high tiers, but `detectDeviceTier`
sends every mobile-like device to the low tier. The invariant is now pinned by a
test and the dead branches are gone.

**`navigator.deviceMemory` is capped at 8, and both siblings read it as if it
were not.** The Device Memory API rounds and clamps its reading to one of
0.25, 0.5, 1, 2, 4, 8 — so 8 means "8 or more", and any `<= 8` test matches
every device that reports at all. Both apps had one:

- **web-chess** capped threads at `deviceMemoryGb <= 8 ? 4 : 8`, so the
  eight-thread path was unreachable and every desktop ran on four. Its test
  passed because the fixture claimed 32 GB, describing hardware no browser
  reports — it asserted eight threads for a machine that cannot exist while
  real machines got four.
- **web-xiangqi** gated its mid tier on `hardwareConcurrency <= 8 ||
  hasLowMemory(memory, 8)`, which put the **high tier out of reach in Chrome
  entirely**. The same 32-core workstation got two threads and 32 MB of hash
  in Chrome and three threads and 64 MB in Firefox — because Firefox does not
  implement the API and so reports nothing. Its fixtures claimed 16 and 32 GB
  too.

Both are fixed, and the fixtures now use values a browser can actually
produce. web-katrain reads only `hardwareConcurrency` and was unaffected.

The general lesson survived the rewrite, in a better form: **check what a
browser API actually returns before choosing a threshold against it — and do
not trust the spec to tell you.** The spec said one thing, the browser did
another, and a threshold placed on the boundary made behaviour depend on which
was true. Put thresholds where every plausible implementation agrees.

**Two of the three CIs were already red, and nobody had noticed.** Both
web-chess's deploy and web-xiangqi's CI run `npm audit` before anything else,
and both had been failing on advisories in transitive dev dependencies of vite
and eslint — packages neither app ships. The consequences differed:

- **web-chess's Pages deploy was blocked outright.** No push to `main` had
  deployed since those advisories landed.
- **web-xiangqi's checks aborted at line one.** Its "React app checks" step
  runs its commands under `bash -e`, so the audit failure took lint, the
  openings and library tests, and the React build down with it. The unit tests
  added earlier on this branch would have been dead on arrival for the same
  reason.

`npm audit fix` cleared both inside existing semver ranges — lockfile only, no
package.json change, every check still passing. web-chess's gate was
additionally bare `npm audit`, which fails on *any* severity; one low advisory
in a dev dependency was enough to stop a release. It now uses the
`--audit-level=moderate` threshold the other two already use.

Worth watching: this will recur. A static site's deploy being gated on
dev-dependency advisories means any new npm advisory can block a release
without a line of app code changing. `npm audit --omit=dev` audits only what
actually ships and would end the class of failure; it was not adopted here
only because it would make one repo diverge from the other two again.

### Corrections to this document

Four claims in the original survey did not survive contact with the code. They
are fixed above, and recorded here because each one would have sent work in the
wrong direction:

1. **Katrain's accuracy formula is not crude.** §3.2 implied its game report was
   behind the siblings. It computes `100 * 0.75^weightedPtLoss` with
   complexity weighting — the upstream KaTrain desktop formula, and the one its
   users already know. Left alone deliberately.
2. **Katrain's model storage needs no change.** Corrected in §8.5: the OPFS
   benchmark is about ArrayBuffers, and `modelUpload.ts` stores a Blob.
3. **Chess has an error boundary.** It is inline in `main.tsx`, not a component
   file, which is why a filename-based scan missed it.
4. **Xiangqi is on `main`**, not `ui-polish-pass`.

The pattern is worth noting for whoever picks this up: the file-level survey in
§1 is a good map but a poor source of truth. Three of its four errors made
katrain look *worse* than it is. Read the code before acting on a row.

### A blocker on item 12 (PWA), found before starting it

Porting web-katrain's `public/sw.js` into web-chess is not the small job the
table makes it look like. web-chess already registers a service worker:
`coi-serviceworker`, from `index.html`, which is what obtains cross-origin
isolation on GitHub Pages and therefore what makes the multi-threaded
Stockfish builds usable at all.

A second service worker registered at the same scope replaces the first. Drop
katrain's `sw.js` in as-is and the app silently loses cross-origin isolation,
`SharedArrayBuffer` goes away, and every threaded engine profile falls back to
single-threaded — a performance regression with no error message.

Whoever picks this up has to **merge** the two: take the COI request-rewriting
`fetch` handler and add caching to it, rather than registering a second
worker. web-xiangqi is in a different position again — it deliberately
unregisters service workers (`utils/serviceWorkerCleanup.ts`) to stop a stale
demo shell serving old engine assets, so it would need that cleanup narrowed
to the old scope first.

This is why the item is still open rather than done: it is a genuine piece of
design work, not a port.

### What testing bought, and where it stopped paying

Test count went from 1,327 / 203 / 0 to roughly 1,430 / 300 / 226. The bug
yield was front-loaded: the first few untested modules in each repo turned up
real defects, and by the end new test files were mostly confirming correct
behaviour. Two things stayed reliably productive past that point:

- **Testing a module the author never tested**, especially one handling input
  from outside the app — an engine, a paste, a stored record.
- **Reviewing my own changes as if someone else wrote them.** Two of the three
  bugs I introduced were found this way rather than by a test.

What stopped paying was writing tests for components that were already
carefully built. Those are worth having as regression cover, but they are not
where the defects were.

### The one place katrain was the wrong model (item 9's phase split)

katrain splits a game into opening, middle game and endgame by **move number**,
from a table per board size: on 19x19 the opening is the first 50 moves. That
is right for Go, where the board fills at a predictable rate, and it is the
kind of thing the ground-truth rule says to copy.

Copying it would have been wrong. In chess and xiangqi the move number says
almost nothing about the phase: a queen trade on move 8 and a 90-move rook
ending are both "the middle" by move count. So both ports read the phase from
**material** instead, with a move-number cap only to stop a quiet symmetrical
opening being called an opening forever. The phase *names* still match
katrain's, so all three reports read the same way.

The thresholds are the domain's, not invented:

| | chess | xiangqi |
| --- | --- | --- |
| Counted | queens, rooks, bishops, knights (9/5/3/3) | chariots, cannons, horses (9/5/4) |
| Full board | 62 | 72 |
| Endgame at | ≤ 26 — a queen ending or a double-rook ending qualifies; queens *and* rooks does not | ≤ 28 — a chariot and cannon each qualifies; two chariots each does not |
| Opening while | ply ≤ 24 and ≥ 56 (one pair of minors may be swapped) | ply ≤ 24 and ≥ 62 (one pair of cannons or horses may be swapped) |

Xiangqi counts only the attacking pieces: advisors and elephants never leave
their own half and pawns are worth little before the river, so none of them
track the shape of the game.

Both count plies from the start of the *game*, not the start of the review.
Each app first used its loop index or its tree-relative `ply`, which is one
whether the game began at move one or from a FEN taken at move 20 — so a
mid-game analysis of a closed position with nothing captured yet was filed as
an opening. Chess takes the ply from the position's own move number; xiangqi
reads an offset off the root FEN, which is what its move display already did.
The same bug, found once and fixed in both.

Re-verified in the browser afterwards, because changing how a ply is counted is
exactly the sort of edit that quietly regresses the ordinary case: the Opera
Game still groups as 20 opening moves and 13 middlegame ones, unchanged. Its
accuracy figures moved a little (92.8 against the earlier 93.4) because the
engine reached slightly different depths on the second run — the grouping, which
is what the change could have broken, did not move at all.

Both read the phase from the position *before* the move, so the move that
trades the last queen is filed in the middlegame it was played in rather than
the endgame it created. Chess replays the line and has the FEN to hand;
xiangqi needs no replay at all, because a move record already stores the board
after the move and what it captured, and the position before it is the two
added back together.

Both then gained the *filter* katrain's report has had all along, since a
breakdown that says the endgame went badly is more useful if you can then look
at just those moves. Clicking a phase narrows the review in chess (move list,
accuracy figures and critical moments) and the key-moment list in xiangqi,
which is the shape that panel already used for side and quality. In both, the
breakdown itself deliberately reads the *unfiltered* rows so every phase stays
visible and switchable — the same split katrain makes.

Adding a filter also quietly invalidated a sentence. Chess's critical-moments
panel read "No major swings found in this reviewed line" — a claim about the
whole game, written when nothing could narrow the view. With a phase selected it
became false: filter to the opening, find it clean, and the app tells you the
line was clean. Its side filter had the same flaw already. The copy now names
what is on screen ("Black's moves in the opening").

Checking the other two settled why. Neither needed a fix, and both were built
with filters from the start:

- **xiangqi** already showed a `filtered/total` count and distinguished "No
  moments match these filters" from "No critical moments in this line".
- **katrain** goes further and computes a whole report per phase
  (`reportsByPhase`), naming the phase in its own advice copy — "Filter
  {player} in {phase} by ...".

So all three ended up correct, but only chess had to be corrected, and the
split falls exactly along when the filter arrived. Copy written before a filter
exists makes claims the filter breaks — so when porting a filter into an app,
the strings around it are part of the port, not collateral.

The clickable rows did *not* flow back to katrain, and deliberately. Its report
already has a first-class phase filter — a four-button grid at the top carrying
per-phase move counts and disabling a phase with nothing in it — and its
accuracy table further down is a separate read-only summary. The siblings
combine the two because they had no filter control at all; adding a second way
to set the same state in katrain would mean two controls with different
affordances (the table rows carry no counts and no disabled state) for one
piece of state. That is a downgrade, not parity, so the ground-truth rule holds.

Neither app persists the phase. Chess recomputes it per row; xiangqi looks it up
per move index. That was deliberate: putting it on the stored summary would have
meant a migration in the library's normalizer for something that is derived.

Verified in chess on the Opera Game: opening W 98.1 / B 87.9 over 20 moves,
middlegame W 98.5 / B 88.6 over 13 — summing to the 33 evaluated moves and
bracketing the 98.3 and 88.2 overall figures. The opening ends at ply 20, where
`cxb5` wins the knight, rather than at a fixed move number. Selecting a phase
was checked against the same game: the opening gives 20 of the 33 moves and an
overall of W 98.1 / B 86.4, exactly what the opening row reports, and the
middlegame gives 13 and W 98.9 / B 89.5. That game never
reaches an endgame, and correctly: the final position is queen, rook, knight
and bishop against rook and bishop, which is 28 — two points the wrong side of
the threshold.

The xiangqi half could not be driven end-to-end in a browser, because Pikafish
never finished loading there (it went to "Recovering engine", the degradation
path). Its stylesheet was checked against the live layout, and the part the
browser would have proved is covered by a test instead: the panel derives its
breakdown from the move records rather than from the stored summary, so it only
works if a review actually writes `winPercentLoss` onto those records.
`reviewPhaseChain.test.ts` computes a review, writes the annotations back the
way `setNodeReviewDataBulk` does, and reads the breakdown off the records — the
one link that was otherwise only traced by reading.

### The same bug a third time, left unfixed on purpose

Having found the ply-counting bug in both ports, the obvious question was
whether katrain has it. It does, in its own form — but fixing it is a judgment
call about Go, not a defect to clean up, so it is recorded here rather than
changed.

`buildGameReport` takes each move's number from `n.gameState.moveHistory.length`,
and the SGF loader writes `AB`/`AW` setup stones straight into the initial board
without ever putting them in the move stream (`sgf.ts`, `applyPlacement`). Only
`B`/`W` properties become moves. So for an SGF that opens on a set-up position,
the first played move is move 1, and on 19x19 anything up to move 50 is
"Opening" — including the first move of a 150-stone mid-game diagram.

What makes this a decision rather than a fix is that the two cases pull in
opposite directions:

- **Handicap games** carry 2–9 setup stones, and move 1 genuinely *is* move 1.
  Counting the stones toward the move number would shift the phases wrongly.
- **Mid-game diagrams** carry a hundred or more, and calling the play that
  follows an opening is plainly wrong.

Counting `setupStoneCount` fixes the second and breaks the first. A threshold
("count them only above N") would work but is a Go convention question, and the
standing rule for this work is to deviate from katrain only for a *real*
improvement. This is not clearly one.

Worth noting how narrow the blast radius is: it only affects the game report's
phase filter, only for SGFs that begin from a set-up position, and the report is
over the played moves either way — so the numbers are right and only their
grouping is off. That is a large part of why it was left alone.

### The donation that ran backwards (library paging)

Everything else this document proposes flows out of katrain. One thing flowed
into it.

Both siblings page their saved-game lists at 100 rows. katrain — the app the
other two are modelled on, and the one with no size cap on its library and a
bulk ZIP importer — rendered every row. Seeded with 1,200 games it mounted:

| | before | after |
| --- | --- | --- |
| Folder view | 1,208 rows / 35,496 DOM nodes | 107 rows / 3,568 nodes |
| Search results | 1,200 rows | 100 rows |

Those are DOM counts, not timings, and they are the claim — see the measurement
note below for why no latency figure is quoted.

Two details were worth getting right, and both came from having done the same
change in chess an hour earlier:

- **Reset the page count during render, not in an effect.** An effect runs
  after paint, so typing in the search box paints every matching row before
  trimming it back — which is precisely the frame the paging exists for. In
  chess the reset lives in the two setters; katrain's filters are set from half
  a dozen places, so there it keys on a view string computed during render.
- **Selection must still span every match**, not the mounted rows. Verified:
  "Select all" over 1,200 matches still reports "1200 selected" with 100
  rendered, which is what it did before.

Expanded folders are paged too, each keeping its own count keyed by folder id —
a single shared limit would have made revealing more in one folder silently
reveal more in all of them. Measured with a folder of 250 games: expanding it
went from 289 rows to 139.

The general lesson is the one this document keeps arriving at from different
directions: *the most polished app is not uniformly the most correct one.*
"Treat katrain as ground truth" is right about conventions, structure and
taste. It is not a reason to skip looking, and two of the night's findings —
this and the phase split — are places where looking paid.

### A fourth measurement lesson: the browser pane throttles timers

The night's recurring mistake was reasoning about mechanisms instead of
measuring them. The library-pagination work added a variant worth writing down,
because it makes measurements look precise while being wrong.

Timing an interaction by dispatching an event and awaiting `setTimeout` gave
plausible-looking numbers — a search costing 56ms, a star toggle 103ms. Those
numbers are not trustworthy. The automation browser pane spends much of its
time hidden, and hidden pages throttle `setTimeout` to a second or more and
never fire `requestAnimationFrame` at all. The same measurement script that
returned tidy millisecond figures one moment timed out after 30 seconds the
next, on unchanged code. An earlier "2285ms to open" figure was worse still: it
silently included the wait I had asked for.

The rule that came out of it:

- **Don't measure interaction latency through an automation browser.** Use it
  to check *behaviour* — what rendered, what the labels say, whether the state
  is right — which is what it is reliable for.
- **Measure cost where it is deterministic.** `renderToStaticMarkup` in a test
  run is katrain's own technique, it runs in Node, and it counts what actually
  scales. The pagination change is asserted that way: 500 games in, 100 rows
  out.
- **A number with no stated method is a guess.** All three earlier corrections
  in this document were mechanism-reasoning; this one was measurement without a
  method. Both fail the same way — they read as evidence.

The pagination commit therefore claims only what was checked: a full shelf
renders one page rather than every row, and searching a seeded 500-game library
went from momentarily rendering 176 rows to a flat 100. No latency claim is
made, because none could be measured here.

One real design point did fall out of it. The page reset was first written as
`useEffect(() => setVisibleLimit(PAGE_SIZE), [query, sort])`, which is the
obvious form and is wrong: effects run *after* paint, so a keystroke could paint
the whole un-paginated list and only then trim it — defeating the pagination on
exactly the frame that needed it. Resetting inside the `query` and `sort`
setters keeps it in the same batched render. This was visible in the DOM (176
rows mid-search) without any timing at all, which is the point.

### Not done yet

Three things were deliberately left alone rather than changed:

- **web-xiangqi's review thresholds.** web-chess's win-percent ladder is now
  *derived* from its centipawn ladder so the two readings agree at equality.
  Applying the same derivation to xiangqi would change grading its users
  already see, on the strength of a rule invented here rather than upstream.
  The two apps therefore grade slightly differently, which the Tier 2 `review/`
  module will have to reconcile deliberately.
- **`EvalGraph`'s non-finite guard.** It carries evaluations forward with
  `typeof x === 'number'`, which admits `NaN`, and one `NaN` blanks the whole
  line rather than a point. But nothing was shown to produce one, and the loose
  check is the dominant idiom in that repo (55 sites to 22). Recorded in
  web-xiangqi's `docs/architecture.md` instead.

### One gap in the local checks, closed

`tsc --noEmit` against the root config does not check the test files. `tsc -b`,
which every repo's build runs, does. Making `phase` a required field on chess's
`ReviewRow` therefore looked clean locally and broke the build — the fixtures
had no phase. CI would have caught it (all three repos build in CI), but only
after a push.

All three now have `npm run typecheck` running `tsc -b`, under the same name,
so the local gate matches the one that actually enforces. This is the cheapest
kind of Tier 0 convention parity and it was found the way most of the night's
findings were: by running the thing rather than reasoning about it.

### Why katrain cannot have the centipawn bug, and what that says about the fix

Completing the sweep on the mate/ACPL defect: chess has it, xiangqi has it
worse, katrain cannot have it — and the reason is structural rather than lucky.

KataGo reports `rootScoreLead`, a continuous quantity in points that means the
same thing at every magnitude. `computePointsLostStrict` subtracts two of them
and that is the whole story. There is no second kind of value to encode.

UCI engines report *either* a centipawn score *or* a mate distance, and both
siblings flatten the second into the first with a sentinel — 10000 in chess,
30000 in xiangqi. That sentinel is not a large evaluation; it is a different
kind of statement wearing the units of one. Subtracting it from a real
centipawn score produces a number with no meaning, and averaging that number is
what puts "ACPL 316" next to "Blunder 0".

**Both siblings now carry the same 1000cp bound.** Chess was measured on screen
(ACPL 316 -> 62 on the Opera Game, with accuracy and every quality count
unchanged — only the centipawn half was ever wrong). Xiangqi was confirmed
without an engine, because `useEngine` encodes the sentinel itself, so the
numbers are known and everything after them is arithmetic: a six-move review
whose ordinary moves cost tens of centipawns was averaging 5017.

The fix is better understood as *not mixing the two kinds* than as capping a
big number. A cap is a reasonable implementation of that — Lichess's ±1000cp is
the well-trodden one — but framing it as "clamp an outlier" invites the wrong
question ("is 1000 the right threshold?") instead of the right one ("what
should a move that forces mate contribute to an average of centipawn losses?").
Whatever is chosen, both siblings should get the same answer, because they have
the same encoding problem with different constants.

katrain earns its ground-truth status here by not having the problem to solve,
which is the most useful kind of comparison the three apps have produced: not a
better fix, but an absent bug, traceable to an engine that never needed the
sentinel.

### What both sibling defects have in common

The two real defects found in the siblings — and not in katrain — turned out to
have the same shape, which is worth naming because it predicts where to look
next.

| | katrain | web-chess | web-xiangqi |
| --- | --- | --- | --- |
| Kinds of evaluation | one (`rootScoreLead`, continuous) | two (centipawns *or* a mate sentinel) | two (centipawns *or* a mate sentinel) |
| Grading ladders | one (point loss) | two, **derived** from each other | two, **independent** |
| Consequence | — | none | ACPL 5017; a 190cp loss at equality graded an inaccuracy |

Both defects are the same failure: **two representations of one judgement, kept
in different places, drifting apart.** A mate and a centipawn score are two ways
of saying "how good is this position"; a centipawn ladder and a win-percent
ladder are two ways of saying "how bad was this move". Neither pair is wrong to
exist — but each needs one of them to be *defined in terms of* the other, or
they will disagree and something downstream will silently pick one.

katrain has neither pair, and that is most of why it reads as the polished one.
It is not that its two representations are better synchronised; it never took on
the second representation. web-chess has both pairs and got away with it once by
accident of ordering — the win-percent ladder was derived from the centipawn one
when it was added — and once not at all, until the mate sentinel was bounded.

Applying that to all three sharpened it, because katrain *does* carry two
accuracy numbers — and correctly. It has `accuracy` (`100 * 0.75^weightedPtLoss`,
from points lost) and `policyAccuracy` (averaged from a policy-rank category).
Two numbers, but answering two different questions — "how much did you give
away" and "how far from what the engine would have played" — each kept under its
own name, and neither ever silently standing in for the other.

So the rule is not "avoid two numbers". It is:

> When two numbers answer the **same** question, one must be computed from the
> other, and the place they meet should be a no-op safety net. When they answer
> **different** questions, keep both, name both, and never let one substitute
> for the other.

One more case forced a third clause, and it is the one that stops the rule being
applied mechanically. katrain's `classifyMoveByRankAndPolicy` looks exactly like
the defect: it grades a move twice — once by its rank among candidates, once by
its prior relative to the best move — from *independent* threshold constants,
and keeps `Math.min` of the two, i.e. the milder. Structurally identical to
`classifyMoveQualityForEval`.

It is not the same thing, and "fixing" it would make it worse. Rank and prior
are **complementary** signals about one judgement, not two encodings of it. A
move ranked fifth whose prior is nearly the best move's is a close second, and
forgiving it is the intended behaviour; so is forgiving a highly-ranked move
that carried little probability mass. The milder-of-two is doing real work in
both directions, deliberately.

Compare xiangqi: a centipawn loss and a winning-chance loss are the *same*
quantity twice, one recoverable from the other by a fixed sigmoid. There the
milder-of-two is not charity, it is one ladder silently overruling the other's
stated boundary.

So the test is not "are two numbers combined" but **"could one be computed from
the other?"** If yes, they are one judgement and must be derived. If no, they
are separate evidence and combining them is a design choice to be made openly.

Every defect found in the siblings is the first clause violated. `qualityForMove`
survives it because its two ladders are derived. `classifyMoveQualityForEval`
does not, and re-grades moves at equality. `accuracyForRow` does not either, and
is only safe because its second branch has no live caller. katrain never trips
the first clause and observes the second by construction — which is a better
account of "the most polished" than any individual technique it uses.

### Store the evidence, not the conclusion

A late finding, and the most directly actionable thing the three-way comparison
produced.

| | what is persisted | what a change to the maths costs |
| --- | --- | --- |
| katrain | raw engine output (`scoreLead`, `winrate`, `visits`, `prior`); every derived field is recomputed on read | nothing — it reaches every stored game for free |
| web-chess | a PGN and a move count; the review is rebuilt from evaluations | nothing |
| web-xiangqi | the whole review summary — accuracy, per-side accuracy, counts, key moments | a read-path clamp was needed when the per-move loss was bounded, and the open grading-ladder decision now carries a migration |

`katrainSgfAnalysis.ts` is explicit about it: it sets `pointsLost: 0` while
reading and then recomputes `m.pointsLost = sign * (rootScoreLead - m.scoreLead)`.
The stored file never holds the answer, only what the answer is computed from.

xiangqi is the only one of the three storing a conclusion, and it is the only
one where changing how a number is computed has cost anything. It already saves
per-move annotations, so a summary rebuilt from them on load would remove the
class of problem rather than patch each instance — which is what the read-path
clamp is, and what the ladder decision would need next.

The rule generalises past this codebase: **persist what you were told, derive
what you concluded.** A stored conclusion is a copy of your code's behaviour at
the moment it was written, and it does not get updated when the code does.

### Where the open questions ended up

Worth noticing that almost every open decision below is in web-xiangqi, and that
is not because it was looked at hardest — chess got the most changes, and
katrain the most scrutiny per line. It is because xiangqi is where the same few
patterns keep landing: a second representation of one judgement (two grading
ladders, two device tests), and a stored conclusion rather than the evidence for
it (the review summary).

katrain has neither pattern anywhere it was checked. chess has both but got away
with them — its second ladder is derived, its second accuracy curve is
unreachable, and it persists nothing derived at all.

That is a more useful summary of "which app needs work" than a defect count, and
it says where to look first next time.

### Decisions left open, and where each one lives

These are judgment calls rather than unfinished work — each was investigated to
the point where the remaining question is a preference, not a fact. Collected
here because they ended up scattered across three repos' docs.

| Question | Where | What is already known |
| --- | --- | --- |
| Should katrain count setup stones toward the move number? | this doc, "The same bug a third time" | Handicap games (2–9 stones) and mid-game diagrams (100+) want opposite treatment. A threshold would work; picking it is a Go convention call. Affects only the report's phase grouping, never its numbers. |
| Should either eval/winrate graph break its line at a gap? | `web-chess/docs/architecture.md`, `web-xiangqi/docs/architecture.md` | katrain's `buildPath` is the pattern. In chess this is cosmetic (it drops the point, so only the stroke spans it) and the area fill shares the path string. In xiangqi it is two failures at once — the stroke carries a value forward *and* one `NaN` takes out the axis — so both halves are one change or neither. |
| Should xiangqi's two grading ladders be reconciled? | `web-xiangqi/docs/architecture.md` | Now measured, not assumed. Its centipawn and win-percent ladders are independent constants and they cross: 180cp really costs 15.99 win% against a threshold of 20, so a 190–200cp loss **at equality** grades as an inaccuracy though its own centipawn ladder calls it a mistake. chess derives one ladder from the other, which is why its milder-of-two is a no-op. Either derive, or set both so they meet at equality. Untouched because it moves grades users have seen — and because xiangqi persists a whole review summary, so any change strands saved records on the old scale while the library sorts and averages across both. `gradingLadders.test.ts` reports which grades move when either ladder is edited. |
| Should xiangqi's engine size itself off the device rather than the window? | `web-xiangqi/docs/architecture.md` | `useEngine` picks thread count and hash size from `window.innerWidth <= 900`; `detectDeviceTier` answers the same question from viewport, pointer, cores and memory and is already computed at startup. A desktop in an 800x900 window with 8 cores and 8GB is cut to one thread while the app's own tier calls it mid. chess never consults the viewport for this. Left alone because it is runtime resource policy and Pikafish would not load here to observe it. |
| What are the four duplicated xiangqi opening lines actually called? | task chip `task_bda45f65` | The ordering bug behind the inflated branch counts is fixed; only the naming is left, and it is a terminology call. |
| Does xiangqi's phase panel look right against a live review? | — | Never seen rendering from a real engine review; Pikafish would not load in the automation browser. The chain is covered by `reviewPhaseChain.test.ts` and the stylesheet was checked against the live layout. |

None of these blocks anything. Each is written down at the point where picking
it up costs a decision rather than an investigation.

### Where this stands

Items 6, 7, 11, 13, 14 and 17 from §4 stand as written; 4, 9, 10, 15 and 16 are
done, and 12 is blocked as described above. The next-most-valuable is 8 (break
both 5,000-line `App.tsx` files into stores — do chess first, it has the tests
to catch regressions).

All three repos are committed clean, build, lint, typecheck and pass their
suites: katrain 1,428 tests, chess 367, xiangqi 271.
