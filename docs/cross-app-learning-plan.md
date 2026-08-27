# Cross-App Learning Plan: web-katrain / web-chess / web-xiangqi

*Read-only survey performed 2026-08-27 across the three sibling repos in
`~/Developer`. No source files were modified; this document is the only output.*

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
| Test files | 250 (`test/`, Vitest) | 31 (colocated, Vitest) | **0 unit** (Node/Playwright scripts only) |
| Commits | 1,213 | 626 | 493 |
| Biggest file | `store/gameStore.ts` (5,217) | `App.tsx` (**5,310**) | `App.tsx` (**4,950**) |
| State | Zustand store + selectors | `useState` in `App.tsx` | `useState` in `App.tsx` |
| Engine | KataGo weights + **MCTS written in TS** (TFJS WebGPU→WASM→CPU) | prebuilt `stockfish` npm worker | **Pikafish built from source** (patch + emsdk) |
| Engine transport | custom worker protocol | UCI | UCI |
| Saved games | IndexedDB, folders, tags, favorites, zip backup | **none** | flat localStorage, 500-game / 3 MB cap |
| PWA / offline | manifest + real `sw.js` + install banner + update checks | `coi-serviceworker` only | actively **unregisters** SWs |
| CI gates | `npm ci` → **build only** | audit → lint → test → build | lint → build → WASM build → smoke → parity → Playwright |
| Style | semicolons, 2-space | **no semicolons**, 2-space | semicolons, **4-space** |
| Branch | `main` | `main` | `ui-polish-pass` |

Feature presence (files matching each concern):

| Concern | katrain | chess | xiangqi |
| --- | --- | --- | --- |
| Command palette | 7 | 0 | 0 |
| Keyboard shortcut system | 30 | 2 | 5 |
| Sound | 12 | 0 | 2 |
| Haptics | 1 | 0 | 0 |
| Themes | 18 | 0 | 1 |
| Auto-save / crash recovery | 5 | 0 | 0 |
| Error boundary component | yes (+ lazy-modal boundary) | no | yes |
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
