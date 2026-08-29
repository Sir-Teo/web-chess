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

## Start here, in the morning

The overnight pass is finished. 68 commits across the three repos, each on a
branch called `overnight-cross-app-2`, nothing pushed, every repo committed
clean with its own gates green.

- **What to review first:** the commit logs. Every commit says what it changed
  and why, and several say what was wrong with the previous attempt.
- **What landed:** §6, the progress log.
- **What is left:** §7, and it is one item — the store work, now scoped to the
  engine wiring in `App.tsx` rather than to the file's size.
- **What the comparison taught:** the bullets at the end of §7. Those are the
  parts that generalise past this codebase.

The loop that produced this was stopped once the worklist was empty. The last
three passes found, in order: one divergence in a module ported earlier the same
night, nothing, and nothing — the final pass raised three failures that all
turned out to be the test instrument rather than the apps. That is the point at
which more passes cost more than they return.

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

**Measured, 2026-08-29, and the claim above was too strong.** All three apps
could already review a game with nothing mounted: web-katrain through
`computeGameReport` in `gameReport.test.ts`, web-xiangqi through
`computeReviewArtifacts` in three test files, and web-chess now through
`reviewEndToEnd.test.ts`. For the *analysis* half the distance is zero
everywhere. A PGN parses to a move tree, the entries carry their `Move`,
and `buildReviewRows`, `summarizeAccuracy`, the side filters and the critical-
moment ranking are all already pure. The one link that lives in the component is
the walk down the first-child chain, which `useGameTree` does; reproducing it is
six lines.

That narrows this item considerably. What is still trapped in `App.tsx` is the
**engine wiring** — dispatching searches, collecting `info` lines, deciding when
a position is evaluated deeply enough, cancelling stale work. That is what a
store would actually buy, and it is a smaller and better-defined job than
"break up a 5,500-line file". Whoever picks it up should scope it to that.

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
| One device-tier policy | xiangqi | `useEngine` kept a second copy of the sizing judgement that read `window.innerWidth <= 900` — 1 thread and 16MB where the tier module says 3 and 64MB. The repo had learned that lesson in App.tsx and left the mistake in the file beside it. |
| Device-tier boot | katrain | The WASM backend took every core up to eight with no other signal. Now cores minus headroom for the UI, held down on a machine short of memory, as a tested function rather than three lines inside `initWasmBackend`. |
| `docs/parity.md` | **all three** | The feature matrix, plus what each repo is the reference for and what it is still missing. |
| Weighted accuracy | chess, xiangqi | Game accuracy is the volatility-weighted mean of per-move accuracy rather than a flat average. Aronian-Carlsen: 98.3% → 98.0%, ACPL and every move label unchanged. |
| — | xiangqi | **Stored review summaries are rebuilt from their annotations on load**, the fix `docs/architecture.md` had been asking for. Without it, changing the accuracy math would have left saved reviews reporting numbers the current code cannot produce, sorted and averaged beside ones that can. |
| Fake-engine browser test | chess | Its first test that clicks anything: loads a game, runs a full review, asserts the summary, at 1280x800 and 375x812, against a fake Stockfish injected in place of the worker. The technique is web-xiangqi's; the seam here is `new Worker`. |
| — | katrain | Long game names on the mobile home wrap to two lines with a title, instead of truncating at one with no way to read the rest. |
| Port `engine/uci.ts` | xiangqi | **The review searched from a bare FEN while live analysis sent the move history.** Pikafish detects repetition from the move list, and in xiangqi perpetual check and chase *lose* — so a review of a game with a repetition was scored by an engine that could not see the rule deciding it. |
| — | xiangqi | Saved review summaries are rebuilt at the read boundary, not only on load: the library card and the loaded game were reporting 66% and 42% for the same game. |
| — | katrain | **Pull requests were verified on Node 20 while releases were built on Node 24.** Two workflows in one repo, each valid alone, never read side by side. Guarded by a test that also checks the README names the same major. |
| — | chess, katrain | **Both service workers cached on `response.ok`, which is true for 206 Partial Content — and `cache.put()` throws on those.** Both apps serve exactly the large assets that attract Range requests. |
| — | katrain | The CORS failure message for a model download named a "Download" button the dialog does not have; every model row offers "Copy URL". The recommended b18 host sends no `Access-Control-Allow-Origin`, so that failure is the *only* path for that model. |
| — | chess | **Command+F flipped the board and swallowed Find.** The shortcuts bound bare keys and never checked modifiers, so Control/Command+F and Alt+Arrow — Find and Back — were intercepted and `preventDefault`ed. katrain's registry matches modifiers per binding; xiangqi escapes it by binding only Escape. |
| — | chess | The COI service worker, the only reason threaded Stockfish is reachable on GitHub Pages, is now covered by a second server that sends no COOP/COEP — the condition Pages is actually in. This is the guard that made the blocked PWA item attemptable. |
| Command palette (item 11) | chess, xiangqi | **Done in both.** Ported chess → xiangqi by copy, in that repo's dialect, with the source named at the top of the file. |
| — | chess | **Done.** Ctrl/Cmd+K, ranked matching with recents, disabled commands shown with their reason. Declared as a chord rather than by loosening the modifier guard added earlier. |
| Real service worker (item 12) | chess | **Done.** COI and offline caching in one fetch handler, because a second worker at the same scope replaces the first. Cached responses carry the isolation headers, which is the half that breaks quietly; swapping the two lines was checked and the suite fails. |
| — | chess, xiangqi | **A bounded engine score was being read as an evaluation.** `score cp 900 lowerbound` means "at least 900"; it arrives from an aspiration re-search, after the exact line at the same depth and with more nodes behind it. chess parsed the flags and dropped them before they reached anything; xiangqi did not parse them at all. Both had the defect twice over — once in the stored evaluation and once in the live line the UI reads. |

Two findings from doing the work, both worth carrying:

- **A partial fix can be worse than none.** Repairing only the SGF parser's two
  recursive walks would have let a long record parse and then overflow inside
  the store — turning a caught "Invalid SGF import" into an uncaught error. The
  unit of work was the chain, not the function.
- **The bug none of the three could see alone was in all three.** The unbounded
  search query is a single idiom, copied three times, with no owner. It took
  reading the same line in three repos to notice that none of them bounded it.
- **A lesson learned in one file does not travel to the file beside it.**
  web-xiangqi's App.tsx carries a comment explaining exactly why sizing the
  engine from the window is wrong. `useEngine`, in the same repo, sized the
  engine from the window. Writing a judgement down twice is how one copy gets
  fixed and the other does not.
- **A test can pin the wrong thing and fail on an improvement.** katrain's
  `pwaAssets.test.ts` asserted the literal string `if (response.ok)` and broke
  when that guard was made *stricter*. Assert the intent, not the spelling.
- **Check that a new test fails for the reason you think.** The Range-request
  check here first passed against a 200, because the bare test server ignored
  the header; and after that was fixed it still passed with both guards removed,
  because the rejection is swallowed inside `waitUntil`. Both times the test
  looked like coverage and was not. The comment beside it now says what it
  actually covers.
- **Ask what your own change just broke.** Making the service worker register
  even when the page is already isolated — right for offline — also pointed it
  at the dev server, where a caching worker caches every Vite module request
  under a `?t=` timestamp. Nothing failed; `sw.js` was simply controlling dev
  with a cache beside it. The old code had avoided that by accident, because it
  only registered when the page was *not* isolated. Found by asking what the
  previous commit could have broken, not by a red test.
- **A hunt that finds no bug can still find something.** Checking whether
  chess's isolation worker could be donated to katrain turned up why it cannot
  be donated blindly: katrain fetches model weights cross-origin, and the host
  sends no CORS headers at all. That is not a defect — the app catches it and
  explains — but the explanation named a button that does not exist.
- **The blocked item was blocked on not being able to see.** Item 12 (a real
  service worker) has been open across two passes because a second worker at
  the same scope replaces `coi-serviceworker`, and the symptom — threaded
  Stockfish quietly unavailable on Pages — is invisible locally, where the
  preview server sends the headers itself. Serving the build from a second
  server with no COOP/COEP reproduces the deployed condition, so the failure is
  now loud. Unblocking a task can mean building the instrument rather than
  doing the task.
- **`verify` being green is not the same as the change being right.** Three
  separate defects from earlier commits on this branch were sitting in
  web-xiangqi's browser suite, which is not in `verify`: a storage rename that
  left the harness clearing keys nothing wrote, so a Pro-mode check silently
  read "coach"; a fixture whose accuracy the weighting had moved; and a fake
  engine matching positions by a FEN the review no longer sends. All three were
  invisible to 396 passing unit tests.
- **The interaction tier earned its keep on its first outing.** The bounded-score
  fix passed its unit tests and the eval bar still read +9.0, because the unit
  tests cover the snapshot merge and the defect happened one level above it, in
  the live line. Nothing below the browser could have seen that.
- **And it nearly hid the bug it found.** The harness built only when `dist/`
  was missing, so with a build already present it served the previous commit:
  the fix was in the source, the browser kept showing the defect, and the code
  looked wrong when the artifact was old. A test that can report on code other
  than the code in front of you is not a test.
- **Three for three on katrain being structurally unable to have the bug.**
  KataGo reports a winrate and a score lead, both of which mean the same thing
  at every magnitude. There is no bound to mistake for a value, just as there
  was no mate sentinel to mistake for an evaluation.
- **A fake that is easier than the real thing is not a fake, it is a different
  program.** The first version of the injected engine replied inside
  `postMessage`. A real worker cannot do that, and the app deadlocked: it sent
  "go", received the answer before it had finished setting up, sent "stop", and
  waited for a bestmove that had already gone past. The fake has to be wrong in
  the same places the real one is.
- **Ship the half you can justify.** The published accuracy method has two
  halves and I implemented both before checking what the second one does: the
  harmonic mean is unbounded in its sensitivity to near-zero values, and a
  six-move game ending in mate scored 31 where every other reading was in the
  eighties. The upstream must floor its inputs somewhere; inventing that floor
  would have been guessing. The weighted half stands on its own, so that is
  what shipped — and the correction is a separate commit rather than a quiet
  amend, because the first one claimed more than it had earned.

---

### The palette had no button, so touch users had no palette

Found by asking a question the earlier passes never asked: not "does this
feature work" but "can a user find it". `setShowCommandPalette` had exactly one
caller in both web-chess and web-xiangqi -- the Cmd/Ctrl+K handler. There is no
Cmd key on a phone, so this was not a discoverability problem on mobile, it was
an availability one: every command in the palette was unreachable. Nothing in
either UI named the chord, so on desktop the only way to learn the feature
existed was to read `App.tsx`.

web-katrain had it right from the start, and this is the first item in the whole
effort where the flow ran that way -- katrain to the other two -- rather than
the reverse. It surfaces the palette in the top bar, the mobile drawer and the
view menu, and names the shortcut in each. What was *not* ported is its label
machinery: a full remappable-shortcut registry, far more than one button needs,
and it prints "Ctrl" on a Mac. The idea travelled; the implementation did not.

Two details worth keeping:

- **web-xiangqi needed two entry points, web-chess one.** Xiangqi's top-bar row
  is `display: none` at 375px, so a top-bar button alone would have left mobile
  exactly as broken as before. Measured, not assumed: the button reports 0x0 at
  that width. Chess's toolbar is shared across widths and collapses to a 44x44
  icon instead.
- **The shortcut is named in the tooltip and `aria-keyshortcuts`, never in
  visible text**, and not at all in xiangqi's mobile menu. A phone has no hover
  and no modifier key; a chord printed beside a tappable control there is noise.

`commandPaletteShortcutLabel` and `isApplePlatform` are the same helper in both
repos, with the same tests, and should be kept that way. Both consult
`userAgentData`, then the deprecated `navigator.platform`, then the user agent,
and fall back to the portable spelling -- including when there is no `navigator`
at all, which is real under Node and would otherwise take the app down for a
tooltip.

**And a fourth entry for the list below.** The negative control for the chess
test failed at `tsc`, not in the browser: deleting the button orphaned an import
and a callback, so the assertion never ran. A negative control that fails in the
wrong phase proves nothing. Renaming the test id instead keeps the build valid
and fails where intended; shrinking the button to 20x20 fails only the two
narrow viewports, which also proves the viewport branch works. Same rigour in
xiangqi: deleting the mobile menu item fails `test:ui:layout` on a real timeout.

## 7. Where this stands

*Written 2026-08-29, at the end of the overnight pass. Every claim here was
checked by running the thing, and each gate below was run for its exit code
rather than read from its output — which matters, because a `verify | grep`
chain reports grep's status and let one commit land on a failing typecheck
during this session.*

**The ordered worklist in §3 is finished, except the store item, which has been
rescoped rather than done.** Items 11 and 12 — the command palette and a real
service worker — landed this pass, along with the parity docs, the storage-key
versioning, the device-tier work and the hostile-input sweeps.

All six gates pass:

| | `verify` | browser suite |
| --- | --- | --- |
| web-katrain | 1,482 tests | viewport check, 8 sizes |
| web-chess | 486 tests | boot, palette, review, offline, isolation, 3 viewports |
| web-xiangqi | 408 tests | full Playwright layout suite |

**The store item, as far as it goes.** It was scoped to the engine wiring in
`App.tsx`, and two slices of that are now lifted out and tested:

- `recordEvaluation` — the writer both effects had their own copy of. Its
  return-the-same-map-when-nothing-improves behaviour is load-bearing (auto-save
  debounces on that identity) and now has a test that drives twenty shallow
  lines through and asserts the map comes out identical.
- `engine/batchReview.ts` — deciding what a review has to search. A checkmate is
  dropped rather than skipped; a game already analysed reports `done === total`
  so a re-run shows a full bar. Neither rule could be exercised before without
  mounting the app.

Also `engineLineToSnapshot`, so the engine's reading is built the same way the
cloud path's already was.

**What was deliberately left.** The two queue drains — batch review and import
sweep — look like duplication and are not. They share three lines (shift, mark
active, dispatch) and differ in their guards, their search limits and what
happens when the queue empties. A shared drain would need a parameter per
difference and would hide the interesting half. The progress clamp is genuinely
duplicated, and is two identical lines that both already clamp correctly.

So the remaining engine wiring is coordination rather than logic, and extracting
it would be churn. `App.tsx` is still ~5,500 lines and that is not the metric:
what changed is that the rules inside it are now reachable from a test.

Note what this did *not* do: there is still no store in the katrain sense, and
no component here reads state through a selector. That is a larger design change
and remains unmade.

**The findings that generalise past this codebase**, in the order they cost the
most to learn:

- A bug that lives in one idiom copied three times has no owner. The unbounded
  search query was one line in each of three repos and none of them had it
  bounded.
- A partial fix can be worse than none: repairing the SGF parser's two recursive
  walks alone would have turned a caught error into an uncaught one.
- `verify` being green is not the change being right. Three defects sat in
  web-xiangqi's browser suite, which is not in `verify`, while 396 unit tests
  passed.
- Check that a new test fails for the reason you think. Two tests written this
  session looked like coverage and were not — one passed against a 200 because
  the test server ignored `Range`, and one passed with the guard it was written
  for removed entirely.
- Ask what your own change just broke. The service worker registering in dev,
  and the palette ports missing katrain's live region, were both found that way
  rather than by anything failing.
- "Does it work" and "can it be found" are different questions, and the second
  one went unasked for most of this effort. The command palette worked perfectly
  in all three repos and was unreachable on a phone in two of them.
- A negative control has to fail in the phase you are testing. One here failed
  at `tsc` before the browser assertion ran, which looks like proof and is not.
