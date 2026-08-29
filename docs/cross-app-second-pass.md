# Cross-App Second Pass: what the three can still learn from each other

*Read-only survey of `web-katrain`, `web-chess` and `web-xiangqi`, 2026-08-28,
after the first pass landed in all three. **No code was changed in any repo**;
every number below is a static measurement of the working tree as it stands,
and the commands that produced them are in §5 so they can be re-run.*

This is a companion to [`cross-app-learning-plan.md`](cross-app-learning-plan.md),
not a replacement. That document surveyed the three apps, ranked seventeen
moves, and then became the log of the eight that were done. This one re-measures
the three as they are now and reports what that survey did not look at. Where a
figure here disagrees with the first document, this one was measured today.

---

## 0. The five things to do next

| | Do | Repo | Cost | Why now |
| --- | --- | --- | --- | --- |
| 1 | **Gate the Pages deploy on the checks** | xiangqi | minutes | Its deploy workflow runs no audit, no lint, no tests, no typecheck. Both siblings gate theirs. §2.1 |
| 2 | Port the **hostile-input parser sweep** (`src/__fuzz.test.ts`) | katrain, then xiangqi | hours | katrain has 13 modules that parse outside input and no pathological-input test over any of them. §2.4 |
| 3 | Adopt **device-tier boot + live-analysis policy** (`analysisProfile.ts`) | katrain, then chess | hours | katrain sizes its whole search with `min(8, hardwareConcurrency)`. The module is also the most extraction-ready file in the three repos. §2.7 |
| 4 | Write **`docs/parity.md`** in each repo | all three | an hour each | The one Tier-0 item nobody did, and the one that would have caught §2.1 and §2.8. |
| 5 | Move **game state out of `App.tsx`** into something a test can drive | chess first | weeks | Not because the file is big. Because 22 katrain test files drive its game state directly and **zero** do in either sibling. §2.2 |

Items 1–4 are worth doing before item 5, and item 5 is worth starting before the
next round of ports, for the reason in §2.2.

---

## 1. The three, re-measured

| | web-katrain | web-chess | web-xiangqi |
| --- | --- | --- | --- |
| `src` files | 231 | 117 *(survey: 82)* | 68 *(survey: 31)* |
| `src` LOC | 66,066 | 20,325 | 17,348 |
| Test files | 264 | 53 | 30 |
| `it()` / `test()` calls | 1,403 | 408 | 325 |
| Commits | 1,247 | 745 | 599 |
| Largest `src` file | `store/gameStore.ts` 5,217 | `App.tsx` **5,500** | `App.tsx` **5,110** |
| Largest file in the repo | `store/gameStore.ts` 5,217 | `App.tsx` 5,500 | `scripts/test-ui-layout.cjs` **6,412** |
| `App.tsx` | **13 lines, 0 `useState`** | 5,500 lines, 80 `useState` | 5,110 lines, 54 `useState` |
| Deploy runs the checks | yes | yes | **no** |
| Browser/interaction tests | 1 viewport script (3,174 lines) | **none** | Playwright harness (6,412 lines) + 5 parity scripts |
| Pathological-input tests | none | 6 entry points × 11 inputs | 1 module |
| Storage keys | `app:thing:v1`, namespaced | `webchess:thing:v1`, namespaced | `xiangqi-thing`, unversioned |
| Docs | 7 files | 4 | 1 |

The first survey's headline — *the same application built three times* — holds.
What changed in one session is the rate: chess went 82 → 117 `src` files and
xiangqi 31 → 68, so the two smaller apps grew by roughly a third each while
katrain grew by two files. The gap the first document set out to close is
closing.

---

## 2. What this pass found

### 2.1 web-xiangqi deploys without running its checks

`web-xiangqi/.github/workflows/deploy-pages.yml` runs, in order: checkout,
setup-node, cache, `npm ci`, install emsdk, `npm run build` (the WASM),
`npm run build:react`, upload, deploy. There is no `npm run audit`, no
`npm run lint`, no `npm test`, no `npm run typecheck`, and no `needs:` on the
CI workflow. Its 325 tests do not gate the deploy.

Both siblings gate theirs — chess runs audit → lint → test → build before
uploading, katrain the same plus `test:typecheck`.

This is item 1 of the first plan, which was closed for katrain and assumed for
the other two. It was missed because **xiangqi's `ci.yml` is the most elaborate
of the three** — 91 lines, a 90-minute timeout, emsdk, Playwright, worker
parity, review parity — so the repo reads as the best-verified of the three
from the outside. All of that runs in a *different workflow*, on a trigger that
happens to fire at the same time as the deploy and is not upstream of it. A red
suite ships and turns the CI badge red afterwards.

Two smaller things in the same file, both fixed in the siblings this session and
not here:

- `ci.yml` triggers on `push: main` **and** `pull_request`, which is the
  double-run both siblings removed ("Stop CI running twice for every change").
  Here it is the expensive one to leave in place: it builds the WASM twice.
- `ci.yml` has no `concurrency` group, so a second push does not cancel the run
  in flight. Both siblings cancel. Again, this is the 90-minute job.

**Do:** add the gates to the deploy job (or `needs:` the verify job), drop the
`push` trigger, add the concurrency group. Copy chess's `deploy.yml` step list.

### 2.2 Every donation lands in `App.tsx`

The session that ported auto-save, the library, narrative tags, phases, the
storage boundary and the lazy boundary — everything committed since
2026-08-27:

| | commits | new files under `src` (source / test) | net lines into `App.tsx` |
| --- | --- | --- | --- |
| web-chess | 113 | 38 (16 / 22) | **+190** (251 added, 61 removed) |
| web-xiangqi | 84 | 39 (9 / 30) | **+133** (164 added, 31 removed) |
| web-katrain | 33 | 2 (2 / 0) | 0 — its `App.tsx` is 13 lines |

The ports themselves are clean, tested modules in their own files. Their
*wiring* is not: state, effects and callbacks for each new feature land in the
one file, so both `App.tsx` files grew while 25 well-factored source modules and
52 test files were added around them. Chess is now at 80 `useState`, 60
`useCallback`, 31 `useMemo`, 32 `useRef` and 28 `useEffect` in one component;
xiangqi at 54/72/36/37/34.

This reframes item 8 of the first plan. That item says "break the 5,000-line
`App.tsx` into a store", and the plan's own review of it notes that no defect
found this session was caused by file size — which is true, and is not the
argument. Two better ones:

**The cost of the next port is set by this file.** Each of the remaining large
items — the analysis queue, the command palette, the PWA merge, themes, study
modes — lands here, and each is larger than anything ported so far. At the rate
above, two or three more rounds like the last one put both files past 6,000
lines, and the command palette alone has to reach every action in them.

**The measurable goal is not size, it is whether the state can be driven
without rendering.** katrain's `App.tsx` is 13 lines with no state at all; its
game state lives in `store/gameStore.ts`, and **22 test files import
`useGameStore` and drive it directly**. Chess and xiangqi have **zero** tests
that import `App`. Their component tests (6 and 7 files) render markup with
`renderToStaticMarkup`; nothing exercises app behaviour.

Be honest about the target, though: katrain moved *domain* state into a store
and left *view* state in a 3,936-line `Layout.tsx` with 60 `useState` calls of
its own. The lesson is not "no big components". It is: **the game must be
playable by a test with no DOM.** That is the line worth copying, and the
acceptance test for item 8 is a test that plays a game, reviews it, and asserts
on the result without mounting anything.

### 2.3 The extraction rule can be measured

The first plan proposed extracting `review/` first, then corrected itself after
porting four modules: start with "whatever has no board in it". That rule can be
computed rather than judged. Counting the share of lines that mention a board
concept (`board|piece|square|stone|fen|sgf|pgn|pawn|red|black|white|move`):

| Module | Repo | Lines | Domain lines | Density |
| --- | --- | --- | --- | --- |
| `utils/analysisQueue.ts` | katrain | 303 | 0 | **0.0%** |
| `engine/lichessQueue.ts` | chess | 115 | 0 | **0.0%** |
| `utils/commandPalette.ts` | katrain | 131 | 0 | **0.0%** |
| `engine/storageCache.ts` | chess | 90 | 0 | **0.0%** |
| `engine/gameLibraryStorage.ts` | chess | 154 | 0 | **0.0%** |
| `utils/analysisProfile.ts` | xiangqi | 260 | 1 | **0.4%** |
| `engine/storage.ts` | chess | 53 | 1 | 1.9% |
| `engine/uci.ts` | chess | 210 | 12 | 5.7% |
| `utils/review.ts` | xiangqi | 609 | 59 | 9.7% |
| `utils/gameReport.ts` | katrain | 687 | 72 | 10.5% |
| `engine/analysis.ts` | chess | 731 | 129 | **17.6%** |

Checked against the four modules already ported into both siblings, where
divergence is known:

| Module | Domain density (chess / xiangqi) | Lines differing between the two copies |
| --- | --- | --- |
| `storage.ts` | 1.9% / 0.0% | 66 — and the first pass showed all of it is the doc comment and formatting |
| `autoSave.ts` | 8.8% / 3.2% | 138 |
| `narrativeTags.ts` | 8.3% / 8.3% | 217 |
| `gamePhase.ts` | 29.2% / 32.4% | 121 |

It predicts the extremes and mis-ranks the middle: `narrativeTags` is only 8%
domain by this measure and diverged the most, because its content is
user-facing prose — "Comeback", "Wire-to-wire" — where the divergence is in
wording rather than in board vocabulary. So use the number to **exclude**, not
to select: below ~2% the two copies really are one module; above ~15% they will
be adapted whatever the plan says; in between, read the file.

By that rule the Tier 2 ordering in the first plan is upside down. It lists
`uci/` first and `review/` second; `review/` is the *last* thing to extract, and
the ready ones are the queues, the caches and the device profile.

### 2.4 Only one of the three sweeps its parsers with hostile input

`web-chess/src/__fuzz.test.ts` throws eleven adversarial inputs — 20,000 open
braces, 5,000-deep nesting, a 200,000-character token, `'(){}'.repeat(20000)` —
at six parser entry points and asserts each finishes in under a second.

- **web-xiangqi** has the timing guard on one module (`moveImport.test.ts`),
  which is where its own quadratic bracket scan was caught.
- **web-katrain** has none. It has *thirteen* modules that parse input from
  outside the app: `sgf.ts`, `katrainSgfAnalysis.ts`, `kayaSgfAnalysis.ts`,
  `pasteSgfInput.ts`, `dragImport.ts`, `libraryTextImport.ts`,
  `libraryImportValidation.ts`, `libraryZip.ts`, `modelUpload.ts`, `ogs.ts`,
  `ogsSync.ts`, `shareLink.ts`, `importSummary.ts` — twelve test files over SGF
  and import behaviour, and not one pathological input or timing assertion in
  the repo.

The first pass fixed the same quadratic-regex bug in chess and in xiangqi, and
praised katrain for not having it: its SGF reader is a hand-written character
scanner, measured once at 640k characters in under a millisecond. **That
measurement is not pinned by any test.** The property that makes katrain the
reference here is currently a fact about the current implementation, not an
invariant, and the obvious future refactor — "replace this hand-rolled scanner
with a regex" — reintroduces the bug the siblings just paid to find twice.

**Do:** port the shape of `__fuzz.test.ts` to katrain over its thirteen input
modules, then widen xiangqi's from one module to all of them. It is the cheapest
item in this document and it defends the one place the three genuinely differ in
quality.

### 2.5 One accuracy curve, three ladders, two naive averages

All three now show the user a percentage, and all three compute it differently:

| | Move accuracy | Quality ladder | Game accuracy |
| --- | --- | --- | --- |
| chess | Lichess curve on win% loss | cp 20/70/140/260, win% ladder **derived** from it | plain mean of per-move accuracy |
| xiangqi | Lichess curve on win% loss, same three constants | cp 40/90/180/320 **and** an independent win% ladder 2/5/20/30 | plain mean of per-move accuracy |
| katrain | — | policy rank + points lost | `100 × 0.75^weightedPointLoss`, **weighted by position difficulty** |

Two things follow that neither app can see from inside itself:

**The two UCI apps share the curve constants and nothing around it.**
`MOVE_ACCURACY_SCALE = 103.1668`, `DECAY = 0.04354`, `OFFSET = 3.1669` are
written out in both repos. But chess's "best" is ≤20cp and xiangqi's is ≤40cp —
the ladders are a factor of two apart, and xiangqi's second ladder is
independent of its first, which is the crossing the first plan measured and left
open deliberately. The shared constant triple is the only part that is safe to
extract today; the ladders are a policy decision that has to be made before a
shared `review/` module can exist at all.

**Both siblings average naively; katrain does not, and that is the third time
katrain has turned out to be the reference.** §8.1 of the first plan records
that Lichess does not average per-move accuracy — it takes a volatility-weighted
mean over sliding win% windows and a harmonic mean and averages the two, so that
one blunder in an even game, or noise in a decided one, does not distort the
number. chess sums per-move accuracies and divides by the count
(`summarizeAccuracy`); xiangqi does the same (`accuracySum / count`). katrain
weights each move by how hard the position was — a policy-prior-weighted
expected loss over the candidate moves, floored at `pointsLost / 4` and clamped
to `[0.05, 1]` — and only then maps the weighted loss to a percentage.

Two independent designs, KaTrain's and Lichess's, reached the same conclusion:
**the mean is the wrong aggregate for this number.** The two apps closest to
Lichess in every other respect are the two doing the thing it explicitly warns
against, and they cannot see it from inside themselves, because per-move
accuracy is right and the aggregate looks like arithmetic.

This is the most visible number in each app's review panel, the method is
published, it is identical for all three games, and by the metric in §2.3 it is
**0% domain** — it consumes a list of win-percent losses and returns a number.

**Do:** implement the aggregation once, against the published method, with the
same tests in each repo. It is the strongest candidate in the three repos for
"the first genuinely shared module", ahead of everything Tier 2 lists. Note that
it moves an accuracy figure users have seen, so it belongs in the same decision
as xiangqi's two ladders rather than in a separate one — and xiangqi persists
its review summaries, so that repo needs the storage-key version from §2.8
first.

### 2.6 The interaction tier exists in one repo only

All three test at two levels and nothing between them:

- **Static render.** No repo has jsdom, happy-dom or testing-library; every
  component test is `renderToStaticMarkup` plus assertions on markup. Fast,
  cheap, consistent across all three — and unable to click anything.
- **Real browser.** xiangqi drives Chromium through `scripts/test-ui-layout.cjs`
  (6,412 lines, the largest file in the repo, larger than its `App.tsx`) plus
  five parity and review scripts. katrain has `check-viewports.mjs` (3,174
  lines). **chess has nothing.**

So chess — the repo the first plan holds up as the model for colocated unit
tests — is the only one with no test that has ever clicked a button.

The portable part of xiangqi's harness is not its assertions, which are about
xiangqi's layout. It is `buildFakePikafishScript`: the harness injects a fake
engine into the page before the app boots, so the UI can be driven in a real
browser deterministically, with no WASM, no NNUE and no nondeterministic search.
That technique is exactly what chess needs (its local Stockfish build is a 7 MB
`.wasm` with its own search timing) and what katrain needs even more (its
default model is 3.6 MB and the recommended one is 96 MB).

**Do:** port the fake-engine injection, not the harness. One scripted path in
chess — load a PGN, run a review, assert the summary — against a scripted engine
is worth more than another hundred unit tests, and it is the tier where every
bug the first pass found by *running the app* would have been caught by CI.

### 2.7 katrain sizes its engine with one line

`web-katrain/src/engine/katago/worker.ts`:

```ts
// abridged; the real lines cast through globalThis
const hc = navigator?.hardwareConcurrency ?? 1;
const numThreads = Math.max(1, Math.min(8, Math.floor(hc)));
```

That is the whole policy, and it only applies when the page is cross-origin
isolated. No memory signal, no pointer/viewport signal, no live-analysis budget,
no review budget — in the one app of the three that ships a neural network and
runs its own MCTS, where the cost of getting it wrong is highest.

`web-xiangqi/src/utils/analysisProfile.ts` is 260 lines that answer exactly this
question — `detectDeviceTier`, `resolveEngineBootConfig`,
`resolveLiveAnalysisPolicy`, `resolveReviewPolicy` — and it is **0.4% domain**
by §2.3's measure: one line mentions a board concept. It is simultaneously the
most portable module and the least ported one in the three repos.

Item 4 of the first plan ("adopt device-tier boot + live-analysis policy",
effort: small) is still the best value-per-hour move available, and it is now
also the obvious first extraction. Note the caveat the first plan already
recorded, which travels with it: xiangqi's *own* `useEngine` still picks threads
and hash from `window.innerWidth <= 900` instead of calling its own module, so
whoever ports it should port the module and fix its home call site in the same
pass.

### 2.8 The conventions drifted again, in one session

The first plan's Tier 0 was "make the repos legible to each other". One session
of parallel work later:

- **`docs/parity.md` — proposed in Tier 0, written in none of the three.** It is
  the item that would have surfaced §2.1 by inspection.
- **CI shape**: chess and katrain share a `ci.yml` down to identical comment
  paragraphs; xiangqi's differs in trigger, concurrency and gating (§2.1).
- **Deploy shape**: chess runs `npm test -- --run` as a step, katrain runs the
  steps plus `test:typecheck`, neither calls the `npm run verify` all three
  gained this session. Three spellings of one gate.
- **Storage keys**: katrain `web-katrain:thing:v1`, chess `webchess:thing:v1`,
  xiangqi `xiangqi-game-library` — unnamespaced and unversioned. This one has a
  consequence already written down: the first plan notes that changing xiangqi's
  grading ladder would strand saved reviews on the old scale. A version in the
  key is how that stops being a reason not to fix the ladder.
- **Formatting** is still three dialects (chess semicolon-free/2-space, xiangqi
  semicolons/4-space, katrain semicolons/2-space), which is why the `storage.ts`
  pair diffs at 66 lines while being the same code.
- **Stale script twins** in xiangqi: `serve-demo`, `test-smoke`, `test-parity`
  and `test-worker-parity-browser` each exist as both `.js` and `.cjs`.
  `package.json`, the workflows and the README reference only the `.cjs` half,
  and the `.js` halves have drifted 83, 157, 133 and 181 lines away from them —
  so they are not aliases, they are four unreferenced older copies of the test
  harness sitting next to the real ones.

None of these is expensive. The pattern is the point: the three drift at the
speed they are worked on, and nothing in the repos notices. A parity doc per
repo, updated when a feature lands, is the cheapest instrument that would.

---

## 3. What to do, in order

| Do | Repo | Source | Cost | Section |
| --- | --- | --- | --- | --- |
| Gate the deploy; drop the double trigger; add concurrency | xiangqi | chess `deploy.yml` | minutes | §2.1 |
| Hostile-input sweep over the 13 import modules | katrain | chess `src/__fuzz.test.ts` | hours | §2.4 |
| Widen the hostile-input sweep past `moveImport` | xiangqi | same | hours | §2.4 |
| `docs/parity.md`, one per repo, from §1's table | all three | first plan, Tier 0 | ~1h each | §2.8 |
| Namespace and version the storage keys | xiangqi | chess `storageKeys.ts` | ~1h | §2.8 |
| Device-tier boot + live-analysis policy | katrain, chess | xiangqi `analysisProfile.ts` | hours | §2.7 |
| Point `useEngine` at its own `analysisProfile` | xiangqi | itself | ~1h | §2.7 |
| Weighted accuracy aggregation instead of the plain mean | chess, xiangqi | Lichess method + katrain `gameReport.ts` | ~1 day | §2.5 |
| Fake-engine injection + one scripted browser path | chess | xiangqi `buildFakePikafishScript` | ~1 day | §2.6 |
| Port `engine/uci.ts` (pure builders/parsers only) | xiangqi | chess `engine/uci.ts` | ~1 day | §2.3 |
| Decide the two grading ladders, then extract `review/` | chess + xiangqi | — | weeks | §2.5 |
| Game state out of `App.tsx`, provable by a test with no DOM | chess, then xiangqi | katrain `store/gameStore.ts` | weeks | §2.2 |

The `uci.ts` row is deliberately narrower than item 6 of the first plan. That
item is "put the UCI queue behind one implementation", which means touching
xiangqi's 938-line `useEngine` and its lifecycle. The pure half — 210 lines of
command builders and line parsers, already fully tested in chess — can be
copied on its own, pinning the wire format in tests without touching the hook.
Do that first; the queue can follow once there is something to test it against.

---

## 4. What this pass did not do

- **It did not run anything.** No suite, no build, no app, no CI history. Every
  claim is a static reading of the working tree; the deploy findings in §2.1 are
  read from the YAML, not from an observed failed deploy.
- **Test counts are static `it()` counts**, not runner output — parameterised
  cases are undercounted.
- **Domain density is a screen, not a proof**, and §2.3 shows the case it gets
  wrong.
- **It re-opens nothing the first plan settled.** The judgement calls collected
  under "Decisions left open" there — the grading ladders, the graph gaps, the
  setup-stone move numbering, the opening-line names — are unchanged and are
  still decisions, not investigations.

## 5. Re-running the measurements

```bash
cd ~/Developer
# size, tests, commits
for d in web-katrain web-chess web-xiangqi; do
  echo "$d"
  find $d/src -name '*.ts' -o -name '*.tsx' | wc -l
  grep -rhoE "^\s*(it|test)\(" $d/src $d/test 2>/dev/null --include='*.test.*' | wc -l
  git -C $d rev-list --count HEAD
done

# where the ported features actually landed.
# Use --since, not -N: `git log -60 -- <path>` means "the last 60 commits that
# touched that path", which silently reaches back past the window you meant.
for d in web-chess web-xiangqi; do
  git -C $d log --since=2026-08-27 --numstat --format= -- src/App.tsx |
    awk 'NF==3{a+=$1;d+=$2} END{print "App.tsx net:", a-d}'
done

# domain density of an extraction candidate
W='board|piece|square|stone|fen|sgf|pgn|pawn|\bred\b|\bblack\b|\bwhite\b|\bmove\b'
f=web-xiangqi/src/utils/analysisProfile.ts
echo "$(grep -icE "$W" $f) of $(wc -l < $f)"
```

---

## 6. Progress log

Work on the `overnight-cross-app-2` branch in each repo, from 2026-08-28.
Every change was verified with that repo's own `npm run verify`; UI changes
were additionally exercised in a browser at 375x812 and at desktop width.

| From §3 | Repo | What landed |
| --- | --- | --- |
| Gate the deploy | xiangqi | `deploy-pages.yml` runs `npm run verify` after the WASM build; `ci.yml` loses its double trigger and gains the concurrency group both siblings have. An `audit` script was added under the name the siblings use. |
| Hostile-input sweep | katrain | 23 adversarial inputs across nine parser entry points, asserting a time bound rather than a value. |
| — | katrain | **Stack overflow on a long record**, found by that sweep. Three walks recursed once per SGF node; a 20,000-node file threw `RangeError` and was reported as "Invalid SGF import". All three now use an explicit stack. |
| Hostile-input sweep | xiangqi | 17 inputs across nine entry points, plus the deep-nesting case that pins the saved-tree normalizer against katrain's bug. |
| — | **all three** | **A pasted record froze the library filter.** All three split an unbounded query and required every term to match, so a 380KB paste was 60,000 terms scanned per game — measured at 900ms against a *single* haystack. The query is now truncated to 200 characters, with `maxLength` on the input as well. |
| — | katrain | **The PWA install banner covered a recent-games row at every phone width.** The rule that moves it keys off `:root[data-mobile-home='open']`, which nothing set. Also a guard test: every `:root[data-x='v']` selector must have a source file that assigns `dataset.x`. |
| Version the storage keys | xiangqi | `xiangqi:thing:v1`, matching both siblings, with a read-through migration from the old names. Verified in the browser against real stored data. |

Two findings from doing the work, both worth carrying:

- **A partial fix can be worse than none.** Repairing only the SGF parser's two
  recursive walks would have let a long record parse and then overflow inside
  the store — turning a caught "Invalid SGF import" into an uncaught error. The
  unit of work was the chain, not the function.
- **The bug none of the three could see alone was in all three.** The unbounded
  search query is a single idiom, copied three times, with no owner. It took
  reading the same line in three repos to notice that none of them bounded it.
