# Architecture

Web Chess is a single-page React app with the engine in a Web Worker. Game
state, analysis results and every setting live on the main thread; Stockfish
runs in a worker so the board stays responsive while it searches.

Structured to mirror [web-katrain's `docs/architecture.md`][katrain], so the
three sibling apps can be read against each other. The third is
[web-xiangqi][xiangqi]; how the three compare, and what is worth moving
between them, is tracked in [the cross-app learning plan](cross-app-learning-plan.md)
alongside this file.

[katrain]: https://github.com/Sir-Teo/web-katrain/blob/main/docs/architecture.md
[xiangqi]: https://github.com/Sir-Teo/web-xiangqi/blob/main/docs/architecture.md

## Runtime Overview

```mermaid
flowchart LR
  User["User input"] --> App["App.tsx"]
  App --> Tree["useGameTree"]
  App --> Engine["useStockfishEngine"]
  Engine <--> Worker["Stockfish worker (UCI)"]
  App --> Cloud["Lichess services"]
  App --> Storage["localStorage / IndexedDB"]
  Tree --> App
  Engine --> App
```

## Main Thread

`src/App.tsx` is the whole application shell, and at ~5,300 lines it is by far
the largest file in the repo. It owns the board, the panels, every dialog, and
all persisted settings. This is the one place the three apps diverge sharply:
web-katrain moved the equivalent state into `store/gameStore.ts` and has
component-level tests as a result. Breaking `App.tsx` into a store is the
largest outstanding item in `docs/cross-app-learning-plan.md`.

What is already factored out and worth reaching for before adding to `App.tsx`:

- `src/engine/` — pure logic: UCI parsing, analysis math, PGN, FEN, the
  saved-games model, opening and tablebase clients. Nearly every module here
  has a colocated `*.test.ts`; **this is where new logic belongs.**
- `src/hooks/` — stateful glue: the engine, the game tree, the AI player,
  cloud evaluation, the library.
- `src/components/` — dialogs and panels. The three dialogs share
  `NewGameDialog.css` and `useModalFocus`.

## Game Tree

`useGameTree` owns the move tree and is the only thing that mutates it. It
returns a memoized handle, so `gameTree` keeps its identity between renders
and changes only when the tree does — which several effects depend on.

Nodes carry the move, the FEN after it, a comment and a review quality label.
Variations are real: `mainLine()` and `currentPath()` are different walks, and
PGN export can include either.

## Engine Boundary

`useStockfishEngine` is a full UCI client, not a thin wrapper:

- Commands go through a queue with per-command completion detection, so
  `isready`/`uci`/`go` are never interleaved wrongly.
- `info` lines are parsed by `parseInfoLine` and flushed to React on a 100 ms
  interval rather than per line, because the engine emits far faster than the
  UI can usefully render.
- Engine builds are declared in `engine/profiles.ts` with the capabilities each
  needs. `lite-single-local` is the default because it needs no special
  headers; the multi-threaded builds need cross-origin isolation, which
  `index.html` obtains on GitHub Pages via `coi-serviceworker`.
- Thread count and starting hash size are sized to the device by
  `recommendedThreadCount` and `recommendedHashMb`.

Both sizing functions compare memory well below 8, because **browsers disagree
about the top of `navigator.deviceMemory`'s range**. The spec describes
clamping the value to limit fingerprinting, and Chromium 148 was observed here
reporting `32`. A threshold at 8 therefore sorts identical hardware differently
depending on the browser — the same desktop got four threads in one and eight
in another. Below 4 is a constraint under either behaviour; 8GB is not.

## Evaluations

Evaluations are keyed by FEN in a single `Map` on `App.tsx`.
`mergeEvaluationSnapshot` decides whether a new snapshot replaces a stored one
— deeper, more nodes, and a live search beats a cloud probe of equal depth.

The map gets a **new identity on every accepted engine update**, which is
several times a second during a search — `shouldReplaceEvaluationSnapshot`
takes a reading with more nodes at the same depth as an improvement, so every
100ms flush produces a new Map. Measured in `analysis.test.ts`: 100 identity
changes across 100 flushes of a live search.

Anything that reacts to evaluations must expect that. A debounced effect that
lists it as a dependency will never fire while the engine runs — the auto-save
did, and a game review could grind through a hundred positions with nothing
written. It keeps the dependency, deliberately, so a recovered game carries the
analysis it had; what changed is that `autoSaveDelayMs` adds a five-second
deadline to the 700ms debounce, so the wait shrinks as the deadline approaches
and reaches zero at it.

There is a second cost to the churn, and it is the reason `analysis.ts` caches
its replay: every consumer of the map recomputes at that rate. `buildReviewRows`,
`buildWinrateSeries` and `buildWdlSeries` each walked the whole game from the
root, 14.72 ms together on a 120-ply game, ten times a second. They now share
one content-keyed replay — 0.09 ms warm, 1.11 ms cold — because none of the
replay depends on an evaluation.

## Review and Accuracy

`engine/analysis.ts` turns the evaluation map into review rows. Scoring is on
**winning chances, not centipawns**, using Lichess's published curves:

- `winPercentFromCp` — the win-percentage model, also used by the trend graph.
- `accuracyFromWinPercentLoss` — accuracy from percentage points given up.
- Quality labels take the milder of the raw centipawn reading and the
  practical one, with the win-percent ladder *derived* from the centipawn
  ladder so the two agree at equality and only diverge once a game is decided.
  That derivation is what makes "take the milder" safe rather than a silent
  re-grading; `qualityAgreement.test.ts` pins it.

Every row also carries the phase it was played in:

- `gamePhase.ts` reads the phase from **material**, not the move number.
  web-katrain splits by move number, which suits Go; here a queen trade on move
  8 and a 90-move rook ending are both "the middle" by move count.
- The phase is taken from the position *before* the move, so the move that
  trades the last queen is filed in the middlegame it was played in rather than
  the endgame it created.
- The ply is counted from the start of the **game**, not the review, so
  analysing from a mid-game FEN does not restart the phase clock and call move
  20 an opening.
- `summarizeAccuracyByPhase` splits accuracy by phase and omits a phase with
  nothing scored; `filterReviewRowsByPhase` narrows the whole review to one.
  Nothing about the phase is persisted — it is recomputed from the position.

## Storage

| What | Where | Module |
| --- | --- | --- |
| Saved games | IndexedDB `web-chess-library`, falling back to localStorage then memory | `engine/gameLibraryStorage.ts` |
| Game in progress | localStorage, one slot | `engine/autoSave.ts` |
| Analysis settings | localStorage | `storageKeys.ts` |
| Cloud eval / tablebase / opening caches | localStorage, bounded | `engine/storageCache.ts` |

Everything read back from storage goes through a normalizer that drops
anything malformed, so a corrupted store degrades to empty rather than
reaching the UI.

`engine/storage.ts` is the boundary where storage is allowed to *fail* —
distinct from the normalizers, which handle data that is present but wrong.
`readStorage`/`writeStorage`/`removeStorage` return `null`/`false` instead of
throwing, so private mode, a blocked-cookie setting and a quota error stop being
things each reader has to remember. Ported from web-katrain, which guards once
at the boundary rather than once per reader.

`autoSave.ts` uses it. The others still carry their own `try`/`catch`, which
works — the wrapper is for anything new, and for whichever of them is next
touched. Worth knowing why it exists at all: `autoSave` had a private
`getDefaultStorage` that was a duplicate of `getLocalStorage` down to the
`globalThis` fallback, and web-xiangqi's `autoSave` had independently grown the
same eight lines. A missing abstraction had manufactured the duplication twice
over.

## External Services

Lichess cloud evaluation, the opening explorer and the tablebase all go
through `engine/lichessQueue.ts`: one request at a time, with a shared backoff
after a 429. Tokens are session-only and never persisted.

## Data Formats

- PGN import/export: `engine/pgn.ts`. Import builds the whole variation tree
  and recovers the machine annotations.

  A PGN is this app's save format, so what it can carry decides what a saved
  game keeps. Three things were being lost, all for one reason — they were
  written for a human to read rather than for the app to read back:

  | | was | is |
  | --- | --- | --- |
  | Per-move evaluation | `[%eval 0.31]`, recovered | unchanged |
  | Root evaluation | never written; first move ungradable on reload | written in the comment ahead of the first move |
  | Best move | prose `Best Nf3`, unreadable | also `[%wcbest e2e4]`, beside the eval it belongs to |
  | Quality label | prose `Blunder`, re-appended every round trip | derived from the evaluations, not stored |

  The rule the three arrived at is in the invariants: a machine annotation gets
  a `[%name ...]` command, because the standard reserves that shape and nothing
  else in a comment is distinguishable from something the reader typed. Import
  strips every such command from the human comment now, not only `[%eval]` —
  a Lichess export's `[%clk 0:03:00]` was being shown as a comment.

  Note what is *not* stored: the quality labels. They are recomputed from the
  evaluations on load, which is why removing them from the comment lost
  nothing. Verified by saving a reviewed game and loading it back: every row
  returns with its grade and its best move.
- FEN parsing, validation and the position editor: `engine/fen.ts`,
  `engine/positionSetup.ts`.
- Share links: `engine/shareLink.ts` (FEN in the URL hash).

## Board measurement in a zero-sized viewport

`react-chessboard` measures its own container and throws `Square width not
found` from `<Piece2>` when that container has no width. `AppErrorBoundary`
catches it; enough repeats and the app falls back to its error screen.

The only trigger found is a viewport of literally `0 × 0` — a hidden or
collapsed browser window, which is what an automation pane looks like when it
is not on screen. Every real size behaves: 800×500, 800×700 and 1400×900 all
load a historical game without complaint, in dev and in a production build.

Recorded because it is easy to misdiagnose, and was: it first looked like a
dev-only timing issue sensitive to `App.tsx`'s import graph, then like a
regression from a specific commit, because the pane happened to be hidden for
some runs and not others. It is neither. If you see it, check `innerWidth`
before bisecting anything.

**Guarded.** `<Chessboard>` is held back while the computed board width is
zero. The guard is on the width the board is *given* rather than on a measured
container: only the mobile branch of the sizing maths can reach zero, because
it is `max(0, viewport - chrome)` and goes to zero as soon as the chrome is
wider than the window, while the desktop branch floors at 260px.

Measured at `innerWidth` 80, the narrowest this repo's preview allows: before
the guard, 64 squares and `Square width not found` thrown repeatedly; after,
no board, no throw, and the rest of the app intact. At 1440x900 the board
still renders 64 squares at 667px.

Written after hitting it for real while resizing the preview, which is what
turned the note above from a curiosity into a guard.

## A mate turns the centipawn loss into nonsense

Found by reading a finished review rather than a test. On the Opera Game the
panel showed **ACPL 316** beside **Mistake 0, Blunder 0**, which cannot both be
true, and one row read:

    15... Nxd7   Lost 93.61   Inaccuracy

A 93.61-pawn loss labelled an inaccuracy. The mechanism:

- `scoreToCp` maps any mate to ±10000, whatever its distance.
- Black stands at roughly -500 and plays into a forced mate. `before` is -500
  from Black's point of view; `after` is +10000 from White's. The delta is
  therefore about -9500, i.e. "lost 95 pawns".
- `summarizeAccuracy` averages that raw figure, so one such move adds ~284 to a
  33-move ACPL. That is nearly all of the 316.
- The *label* is right, because labels moved to win-percent loss: someone
  already lost gives up little by being mated. So the label and the number next
  to it disagree, and the number is the wrong one.

This predates the win-percent work but was hidden by it: when labels were also
centipawn-based the two at least agreed with each other, wrongly. Only the
scoring changed; nobody looked at ACPL in a game that ends in mate.

**Fixed.** `reportedCentipawnLoss` bounds what gets reported at 1000cp, the
figure Lichess uses. The raw `deltaCp` is left raw — move quality reads winning
chances and is unaffected, and anything that legitimately wants the real number
still has it. Measured on the same review of the Opera Game: ACPL 316 -> 62, and
the row above from "Lost 93.61" to "Lost 10.00+". Accuracy and every quality
count were unchanged, which is the point — only the centipawn half was wrong.

The trailing "+" is deliberate: it says the real figure is off this scale, which
is what a forced mate is, rather than presenting a bound as though it had been
measured.

## A third pair, latent: two accuracy curves

Found by applying the rule the two real defects suggested — look for one
judgement expressed two ways — rather than by hitting it.

`accuracyForRow` prefers `accuracyFromWinPercentLoss` (Lichess's curve over
winning chances) and falls back to `accuracyFromCentipawnLoss`
(`100 * exp(-loss/300)`) for a row with no win-percent reading. Those are two
answers to "how accurate was this move", and neither is derived from the other.
They disagree, measured at equality:

| centipawn loss | via winning chances | via centipawns | gap |
| --- | --- | --- | --- |
| 20 | 92.1 | 93.6 | -1.5 |
| 100 | 66.2 | 71.7 | -5.4 |
| 200 | 44.7 | 51.3 | **-6.6** |
| 800 | 11.4 | 6.9 | +4.4 |

**Unreachable, and now pinned as such** by `accuracyCurveReach.test.ts` — the
claim was read off the code, so it is enforced rather than trusted. Deliberately
kept: `buildReviewRows` sets
`winPercentLoss` on every row it also gives a finite `deltaCp`, and
`summarizeAccuracy` skips anything pending, so the fallback has no live caller.
It exists for rows built before the win-percent work and is pinned by a test.

The hazard is not today's behaviour, it is the shape: `winPercentLoss` is
optional on `ReviewRow`, so any future producer that omits it puts rows scored
on *different curves* into the same average, differing by up to 6.6 points, with
nothing to signal it. If the legacy path is ever confirmed dead, deleting it
removes the second representation entirely, which is the fix this codebase keeps
arriving at.

## The winrate line draws across gaps it does not have data for

`buildWinrateSeries` skips a ply whose position has no evaluation
(`if (!isFiniteNumber(cp)) continue`), and the trend graph then joins the
remaining points with one continuous path, positioning each by its real `index`.
A skipped ply is therefore drawn as a straight segment spanning it — a line
where there is no evaluation.

The full picture only shows this after a completed review, where every position
is evaluated and there are no gaps. It is visible during a partial analysis,
which is exactly when someone is watching the graph fill in.

Not changed, for two reasons: interpolating a trend line across a missing sample
is a defensible reading rather than plainly wrong, and the `area` fill is built
by closing the same path string, so breaking the stroke into subpaths needs the
fill reworked with it and a look at the result. web-katrain's `buildPath` is the
pattern if it is ever done — it sets `started = false` on a gap so the stroke
stops and restarts, and it filters non-finite values before taking min/max for
the axis, since one bad value there poisons the whole scale rather than one
point. This repo is safe from the scale half already, because the skip happens
at the source and the series only ever holds finite numbers.

## What `npm run verify` covers

`npm run verify` runs typecheck, lint, the test suite and the build — every gate
CI runs except `npm audit`, which is left out so the command works offline. For
this repo that is the whole of CI, so a green verify means the deploy should go
through.

Two things worth knowing about the pieces:

- `tsc -b` here *does* include the test files, unlike web-katrain where `test/`
  sits outside the built projects and needs a separate `test:typecheck`.
  Confirmed by putting a type error in a test file: verify exits 2.
- `npm test` alone does not typecheck anything. Vitest transpiles without
  checking, so a test can pass while failing to compile — which is how a broken
  fixture was committed tonight.

Run `verify` rather than the parts. Chaining them by hand is how the same
mistake gets made twice: `npm run typecheck | tail -2 && npm run lint` reports
tail's exit code, not the compiler's.

## A derived default becomes a stored preference on first run

`defaultHashMb()` sizes the engine hash from `detectEngineCapabilities()`, and
settings load takes the stored value if there is one:

    hashMb: normalizeInteger(parsed.hashMb, 16, 512, defaultHashMb())

But `persistSettings` runs from an effect on mount and writes the whole settings
object. So on a first visit the derived value is computed, immediately written to
localStorage, and read back on every later visit. It stops being a default and
becomes a stored preference the user never set.

The consequence: improving `recommendedHashMb` reaches only browsers that have
never opened the app. Anyone already using it keeps whatever their first visit
concluded — which for most existing users is the flat 64 that predates the
capability-aware sizing.

A setting the user *chose* should of course persist. The problem is that a
derived default is indistinguishable from a choice once it is in the same
object, so there is no way to re-derive it without also discarding real
preferences. The fix would be to store only what was explicitly set and derive
the rest on load, which is the same "keep the evidence, not the conclusion"
shape as web-xiangqi's stored review summary.

Not changed: it alters stored user settings and wants a decision about whether
existing values are preferences or fossils. Recorded because it silently caps
what a change to the sizing logic can achieve.

## The share hash is unbounded, and that is fine

`parseFenShareHash` puts no length limit on the URL hash, which looks like an
omission next to web-xiangqi, whose `shareTree.ts` bounds its share parameter to
8,000 characters before decoding. It reads like a missing guard, and it runs at
startup — `loadSharedFenFromUrl` is called from a `useMemo` during the first
render, so a slow parse would delay first paint on a link someone clicked.

Measured rather than assumed:

| hash size | parse | validate |
| --- | --- | --- |
| 10,000 | 0.3ms | 0.1ms |
| 100,000 | 1.0ms | 0.0ms |
| 1,000,000 | 4.1ms | 0.0ms |
| 5,000,000 | 32.4ms | 0.1ms |
| 4,000,000 of alternating whitespace | 121.0ms | — |

Nothing here is quadratic. `normalizeFenForShare`'s `\s+` collapse is linear
even on input that is half whitespace, and `validateFenForAnalysis` rejects on
the rank count before doing any real work, which is why validation is flat at
0ms regardless of size.

So the asymmetry with xiangqi is real but not a defect: xiangqi needs its bound
because it base64-decodes and JSON-parses its parameter, which is work
proportional to the input. Here the input is rejected before anything expensive
happens. Recorded so the next reader who spots the missing limit does not have to
re-derive this, or add a bound that buys nothing.

## A derived annotation came back in as user data

`commentForNode` writes what the app concluded — `[%eval 0.31]`, `Best Nf3`,
`Blunder` — into a move's PGN comment, alongside whatever the reader wrote
there. The importer stripped `[%eval ...]` and kept the rest as the move's
human comment.

So the app's own words came back as the reader's, and the next export appended
freshly derived copies beside them. One export/import cycle, one more copy;
measured over four rounds on a single move, `Best d4` appeared 1, 2, 3, then 4
times. The auto-save writes a PGN and restoring reads it back, so a reload was
a full cycle, and the slot found on the board during this work read:

    2. Bc4 { [%eval 0.00]; Best Nf3; Best Nf3; Best Nf3; Best Nf3 }

Growth is unbounded against a 2 MB auto-save ceiling, past which the snapshot
is *removed* rather than truncated — so the end state is the analysed game
quietly no longer being offered back.

**Fixed** by dropping, on import, the fragments the exporter regenerates:
`Best <move>` and the six quality words, matched whole and anchored. A note
that merely contains one ("Blunder, but the only practical try") is not a match
and survives. Existing PGNs are cleaned by the same rule on the way in, so
nothing had to be migrated.

This is the same shape as the two defects recorded above and as web-xiangqi's
stored review summary: **keep the evidence, derive the conclusion**. The
evaluation map is the evidence and it round-trips fine — `[%eval]` is read back
into it. The conclusions drawn from it should not have been persisted in a
field that also carries user text, because nothing downstream could then tell
which was which. `[%eval]` gets this right by being namespaced; the two plain
sentences beside it did not.

## Setting an engine option is not free

`buildAnalyzeCommand` names every option a search depends on — `Hash`,
`MultiPV`, `UCI_ShowWDL` — because an analyze request is self-describing, and
`startAnalysis` sent all of them before every `go`. One of them has a side
effect: `setoption name Hash` resizes the transposition table, and a resize
clears it whatever size is asked for. Every search therefore began by deleting
what the last one learned.

Measured against `stockfish-18-lite-single`, one position searched twice to
depth 20:

| | nodes on the 2nd search |
| --- | --- |
| table survives | 0.63x |
| same-value `Hash` sent in between | 1.12x |

and over the sequence a game review actually sends — 61 positions of a 60-ply
game at depth 16, MultiPV 1 — 21.1M nodes and 12.9s became 19.3M and 11.2s,
repeatable to a tenth of a second. Navigating back and forth over an analysed
line gets the larger figure, because there it really is the same position
twice.

`changedSetOptions` in `engine/uci.ts` is the rule; `useStockfishEngine` keeps
the record of what its worker was last told, resets it when the worker is
replaced, and clears it when the Engine Lab console sets an option behind its
back. A valueless option is a UCI button rather than a setting, so it is always
sent.

The general shape: **a UCI option is a command, not a declaration.** Before
sending one every search, check what the engine does when it receives it.

## Profiling React here in dev measures the dev runtime

A render-cost investigation on the dev server said each re-render during a live
search cost 150-230ms, which for a page with 421 DOM nodes is absurd on its
face. Two things were wrong with the measurement, and both are easy to repeat:

- **A hidden browser pane throttles everything.** `document.hidden` was true, so
  timers were clamped to ~1s and the renderer was deprioritised. Check
  `document.hidden` before trusting any number taken from an automation pane.
- **`jsxDEV` dominates a dev profile.** A CPU profile against the dev server
  attributed ~1.5s of an 8s window to `exports.jsxDEV` — element creation in the
  development JSX runtime, which the production build does not use.

The same scenario against `vite preview` — a 60-ply game, infinite analysis,
MultiPV 3, 8 seconds — leaves the main thread **94% idle**, with the non-idle
remainder mostly `(program)` and a few ms of `chess.js`. There is no React
rendering problem in this app today.

Recorded because the conclusion is the opposite of what the dev numbers say, and
because the fix someone would reach for — memoising subtrees, splitting
`App.tsx` for performance — would have bought nothing. Split `App.tsx` for
testability, which is the reason `docs/cross-app-learning-plan.md` gives; not
for speed.

## Project Invariants

- Engine scores are POV side-to-move; after a move the perspective flips.
  `deltaCp` in a review row is `-after - before` for that reason.
- Anything user-facing derived from an evaluation should be win-percent based,
  not centipawn based, so it reads correctly in a decided position.
- New pure logic goes in `src/engine/` with a colocated test, not into
  `App.tsx`. This is about *new* logic: `App.tsx` already carries 44 top-level
  helpers that predate the rule, so it is "stop adding", not "this is already
  true". 31 of those are six lines or fewer and not worth moving. The ones with
  enough logic to deserve a test if they are ever touched are
  `describeBestMove` (~69 lines, builds user-facing tags and a summary, no
  test), `loadPersistedSettings`, `buildBatchReviewTargets`, `defaultHashMb`
  and `topArrowColor`.

  The trap is editing one in place: `reviewImpactLabel` was modified while the
  centipawn bound was added, which quietly changed the text under every review
  row with nothing asserting any of it. Moving it out took ten minutes and
  found nothing broken — but that is the point at which the cost is lowest and
  the risk highest. Treat "I am changing a pure helper in `App.tsx`" as the
  moment to extract it.
- Storage readers must never throw on bad data; return empty and move on.
- Anything the app derives and writes into a field that also carries user text
  must be recognisable on the way back in, or the next export appends to its
  own output. Prefer a namespaced marker like `[%eval ...]`; a plain sentence
  is indistinguishable from something the reader typed.
- A capability value read from a browser API needs its documented range
  checked before a threshold is chosen against it.
- Anything the reader draws on the board takes a colour the engine does not
  already use. Amber is the move that was played, violet the threat probe, and
  the red-to-green scale a candidate's ranking; a mark in green would assert
  something about a square the reader picked. `boardMarks.test.ts` pins the
  three against the four engine colours.
- Performance claims about this app come from a production build. See
  "Profiling React here in dev measures the dev runtime".
