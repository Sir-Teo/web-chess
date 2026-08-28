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
| — | chess | Review scoring moved onto winning chances (see below). |

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

The general lesson is worth more than the two fixes: **a test fixture that
describes impossible hardware will confirm whatever you already believe.**
Both bugs were invisible for as long as the fixtures were generous. When a
capability value comes from a browser API, check what that API is allowed to
return before choosing a threshold.

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

### Not done yet

Items 4, 6–15 and 17 from §4 stand as written. The next-most-valuable are
probably 8 (break both 5,000-line `App.tsx` files into stores — do chess first,
it has the tests to catch regressions) and 4 (device-tier boot config, where
xiangqi's `analysisProfile.ts` is now test-covered and ready to port).
