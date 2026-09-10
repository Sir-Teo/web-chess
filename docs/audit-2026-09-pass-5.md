# Audit — September 2026, fifth pass

A fifth sweep, after [the first](audit-2026-09.md),
[the second](audit-2026-09-pass-2.md), [the third](audit-2026-09-pass-3.md) and
[the fourth](audit-2026-09-pass-4.md). The brief was one word — responsiveness —
and the pass took it in both its senses: the layout answering the screen it is
given, and the app answering the reader who touches it.

The fourth pass read this interface at a dozen sizes in a desktop browser and
found thirty-four things. This one is mostly about what that method cannot
reach. Four of its findings were invisible to it *by construction*: two because
`vh` and `dvh` are the same number where no browser chrome retracts, one
because the first paint of a single-page app is not a thing you can see by
looking at a page that has already loaded, and one because a synthetic click
carries no pointer movement, so every test in this repo had been exercising the
one case that always worked.

Same convention: **measured**, **reasoned**, or **refuted**. The refuted
section is again the longest, and again the one worth keeping — this time
because the app turned out to be in good shape almost everywhere it was
looked at, and knowing *which* everywhere is what stops the next pass
re-deriving it.

---

## What a reader could not see

**A tap did not survive the finger that made it.** `dragActivationDistance`
decides how far a pointer may wander before react-chessboard calls it a drag
rather than a tap. Its default is **1px**, this app had never set it, and no
finger is that still. **Measured** at 390x844 on the production build, with
real touch events rather than a synthetic click: tapping the e2 pawn dead still
lit two legal targets, and tapping it with 1px of drift lit none. Nor did 2, 3,
5, 8 or 12px. What the reader got for a tap was a drag that picked the pawn up
and set it back on its own square — which lands in `onPieceDrop`, clears the
selection, and swallows the click that would have made one. No move, no
highlight, nothing. Tap to select, which is how this board is documented to
work and how most people use it on a phone, was reachable only with a mouse.
8px is where Android draws the same line — `getScaledTouchSlop()` is 8dp — and
under a fifth of a square on the narrowest phone here.

Nothing had caught it because nothing could: `element.click()` and Playwright's
`locator.click()` carry no pointer movement at all, so every existing check
landed in the 0px case. The guard added for it drives CDP touch events and
asserts both ends, because either alone is passable and wrong.

**The phone's move-navigation bar was behind the URL bar.** `.app-shell` was
`height: 100vh; overflow: hidden`. `100vh` is the *large* viewport — the height
a phone browser has once its chrome has retracted — so while that chrome is up,
60 to 115px of an iOS Safari screen, the shell is taller than the window and
its last band is off it. **Measured** at 390x844: the whole row, "Go to first
position" through "Autoplay the moves", at y=762..802, with **no scrollable
ancestor**. Nothing could scroll it back, and nothing on the page scrolls the
root either, so the bar covering it never retracted. `100vh` then `100dvh`.

**The sheets were a share of a screen nobody was looking at.** The same unit,
one layer in. These scroll, so unlike the shell nothing was unreachable — what
was wrong is the share, and a share is the whole point of the rule. `85vh` on
the phone's settings sheet is 0.85 x 844 = 717px against the 729px actually
showing: **98%**, and a 12px strip of board left visible where the rule means
127px. A sheet that fills the screen has stopped being a sheet. Eight
declarations, and the giveaway was that the *backdrop* dimming that sheet had
measured itself with `100dvh` all along, in the rule directly above it.

**Nothing was on the screen until the JavaScript arrived.** **Measured** on the
production build at 390x844, cold cache, 4x CPU: first contentful paint at
1651ms behind 4G and 5446ms behind 3G, every millisecond of it blank — no
brand, no shape, no sign of progress. Screenshotted at 2600ms to be sure it was
blank rather than merely sparse. Nothing could paint sooner because the only
thing in the body was an empty `#root`: the first content this app draws is
drawn by React, at the end of 214kB of stylesheet and script. On a phone that
does not read as loading, it reads as broken. A board-shaped placeholder styled
from a `<style>` in the head paints when the stylesheet lands: **956ms** and
**2688ms**, cuts of 42% and 51%.

Two things about it are worth writing down. The render-blocking stylesheet is
the floor, not the HTML — an inline `<style>` does not paint ahead of a
`<link rel="stylesheet">`, because the link blocks rendering of the whole
document and the animation clock does not start until styles first resolve; so
the skeleton buys the gap between the sheet and React, and going further would
trade it for the app itself flashing unstyled. And the checkerboard everyone's
recipe gives — two `linear-gradient(45deg, …)` layers — paints triangles, whose
seam down every square read as a bevel at this contrast. One `conic-gradient`
with hard stops is clean.

---

## Refuted

Each of these was gone looking for, measured, and not found. Ordered by how
plausible it had seemed.

**The first move of a game is not slow app code.** It costs a 135ms long task
and it is the worst repeatable interaction in the app, so it was chased to the
bottom: **+5 DOM elements**, zero measurable time in `localStorage`,
`JSON.stringify/parse`, `getBoundingClientRect` or `getComputedStyle`, and
across reloads in one browser it goes 152ms, then 40ms, then 40ms — *still*
40ms with `Network.setCacheDisabled` (so not the HTTP or code cache) and
*still* 40ms with localStorage and IndexedDB wiped (so not app state). What
survives a reload but not a fresh process is V8's in-memory compilation cache.
It is the interaction code being compiled the first time it is called. There is
no expensive function to find; the only lever is shipping less JavaScript.

**The engine does not cost the interface anything.** With real multi-threaded
Stockfish 18 running an infinite search, every interaction measured identical
to idle, ±8ms, zero long tasks. During a full **116-position review** at 4x CPU
on a phone viewport, the worst interaction was 96ms against 88ms before it
started — and the review still finished 116/116 in about seven seconds while
being clicked through the whole time. The worker architecture keeps the main
thread free.

**Nothing drops a move, however fast it is asked to.** A 116-ply game scrubbed
forward at 120ms, 33ms (key repeat) and zero gaps, by arrow key and by tapping
the button, at 4x CPU: 12 of 12, 20 of 20, 20 of 20, 12 of 12, 20 of 20. No
input is coalesced away and no animation swallows one.

**There is no tap delay.** Driven by real touch events at 4x CPU, the click
answering a finger leaving the glass arrived **0ms** later on every control
measured. Touch latency mirrors mouse latency throughout: worst 168ms (the
compile above), everything else at or under 96ms.

**Typing is not parsing.** The PGN box was suspected of running its paste
detectors over the whole text on every keystroke. Empty box: median 16ms, worst
24ms. Box holding an 851-character game: median 16ms, worst 24ms. Identical.

**The layout answers a rotation without being reloaded.** Every size resized
live and then loaded fresh at the same size, and the board landed on the same
number both ways at 390x844, 844x390, 360x640, 768x1024 and 1440x900 — 364,
197, 288, 471 and 667px.

**Nothing is dropping frames.** p50 16.7ms and zero frames over 33ms while a
piece moves, the board flips, and the settings sheet opens and closes. The one
117ms frame is the compile above.

**No text is clipped out of its box.** The two boxes in the app that clip
overflowing content are the deliberate screen-reader pattern —
`h1.app-brand` and `.panel-header-title-only`, both with `clip-path: inset(50%)`.

**Switching modes leaks nothing.** Four Play↔Analysis round trips with the real
engine left the JS heap flat at 16MB.

Two of these had to be un-found first, which is the usual story with a probe in
this repo. A blocking-touch-listener sweep reported two, and one of them was
**Playwright's own** hit-target interceptor, which has to be filtered out or it
reads as an app defect. And the first version of the viewport-unit guard swept
up nothing at all: `\bvh\b` cannot match `72vh`, because a digit and a `v` are
both word characters and there is no boundary between them. It is now pinned by
a count before anything is asserted from it.

**Focus does everything it should.** All five overlays — the settings sheet,
the command palette, New Game, the library, and PGN/FEN — opened from the
keyboard move focus inside, hold it there (Tab pressed twelve times escaped
none of them), close on Escape, and hand focus back to the control that opened
them.

**Promotion survives a finger too.** On the position `7k/P7/8/8/8/8/8/7K w`,
tapped with 3px of drift throughout: a7 lit its one legal target, a8 raised the
picker, and Queen played `a8=Q+` and closed it. Its five choices are 65x91px at
the smallest, well past the 44px the rest of this app is held to.

**Nothing is slow on a low-end phone either.** The fourth pass's sizes were
measured at 4x CPU; the whole interaction set was swept again at **6x** with a
116-ply game loaded, and **0 of 14** interactions passed 200ms. The worst is
opening the library at 120ms, and all but three are under 100ms.

**There is no cheap way to ship less JavaScript.** Time to a playable board is
2054ms behind 4G and 5855ms behind 3G, gated by 193kB of script, so the main
chunk's 303kB was attributed back to its sources through the build's own
sourcemap. **`src/App.tsx` is 121kB of it — 40%** — and nothing else reaches
12kB: `useStockfishEngine` 12kB, `analysis` 10kB, `pgn` 9kB, `TrendGraph` 9kB,
`icons` 9kB, and a long tail under that. There is no module to make lazy that
would matter. The only lever is the one the first pass already named and
already judged: splitting App itself, which is maintenance work rather than a
promised speedup.

Two more probes had to be un-found. A press-feedback sweep reported that **ten
of eleven controls did nothing under a finger**, which would have been a real
defect on a phone, where there is no hover and `-webkit-tap-highlight-color` is
`transparent`. It was wrong: forcing the pseudo-state with CDP
`CSS.forcePseudoState` shows `transform: scale(0.96)` arriving on every one of
them, from a single rule that covers `button`, `.wc-btn`, `.gc-pill`,
`.mode-pill`, `.analysis-tab-btn` and `summary`. Synthesised touch events do not
set `:active` in headless Chromium; that is the probe's limit, not the app's.
And a synthesised touch swipe reports that nothing scrolls anywhere, including
where scrolling plainly works — `Input.synthesizeScrollGesture` with
`gestureSourceType: 'touch'` is the call that goes through the real gesture
pipeline, and hand-rolled `Input.dispatchTouchEvent` sequences are not.

**A returning reader waits for nothing, and the connection stops mattering.**
Every load measured until now had been a first one. Measured across three
visits and then offline, at 4x CPU: first visit 906ms to paint and 1973ms to a
move behind 4G, 2724ms and 5825ms behind 3G — and **every visit after that
129ms to paint, 391ms to a move, on either connection**, with all five assets
served off the network by the worker. Offline is 112ms. The connection only
decides the first visit; after that the numbers are identical on 3G and 4G
because neither is being used. That is the frame the cold-load work above
belongs in: it is a first impression being bought, not a daily cost.

**The clock keeps time.** The app's one real-time surface, sampled every 40ms
for twelve seconds in a 3+2 game at 4x CPU: twelve changes, gaps of 969 to
1010ms, no second skipped and none shown twice, and **zero drift** — eleven
seconds lost off the face over eleven seconds of wall clock. The paused side
held at 3:01 throughout, increment included.

**The library does not care how much is in it.** Ninety saved games, seeded
through the app's own multi-game import: opening it costs 362ms the first time
— that is the lazy chunk arriving, not the games — and **103ms at thirty games
and 93ms at ninety**. Every row is in the DOM, unvirtualised, and scrolling
sixty of them produced 87 frames with **none** over 33ms. Nothing here needs
virtualising.

**And a multi-game paste is handled better than it was asked to be.** Pasting
sixty games disables Import & Analyze and says why — "The board takes one game
at a time, and this file holds several. Add them all to the library, or paste a
single game" — beside a button reading "Add 60 games to the library". The count
is in the label.

**A long session does not wear the app down.** Six rounds of three hundred
navigations, twelve mode switches, eighteen dialogs opened and closed, and a
flip apiece, at 4x CPU with a 116-ply game loaded, garbage collected before each
reading: the heap stayed at **11MB throughout**, the DOM settled at 1267
elements after the first round and never moved again, and the touch listener
count held at nine. Every one of the nine sampled interactions came out
**faster** worn than fresh -- 8 to 24ms faster, which is the JIT and not an
improvement. Nothing accumulates.

**Nor does a tree full of branches.** A game carrying forty variations, each
with a nested sub-branch of its own -- 520 chips and 1164 elements in the move
list, 2158 on the page -- at 4x CPU: every interaction at or under **104ms**,
and scrolling the tree produced 92 frames with **none** over 33ms.

That is six probes in this pass that produced a false result before a true one,
on top of the four the fourth pass recorded. Two of the six were the pass's own
measurement rather than its subject, and both are worth the space.

The library's open cost first read 2434ms, because a two-second settle had been
left inside the stopwatch. The real number is a twenty-sixth of that.

And the variation-tree generator written to feed the sweep above placed the
inner branch at the same ply as the outer one — `(1. d4 d5 (1. d4 Nf6 …))`,
which asks for d4 to be played twice — so the app refused the file, quite
rightly. What makes that one instructive is what nearly happened next: chess.js
loads the same text without complaint, which reads as an interoperability
defect in this app until you count the plies it hands back and find it discards
recursive variations rather than validating them. The corroborating tool was
the misleading part, not the probe. Written correctly, `(1. d4 d5 (1… Nf6 …))`,
this app takes nesting two deep, three deep, off a black move, and three
siblings on one move.

The rule this repo already had — confirm one flagged element by hand before
acting on the list — has now earned a second half: confirm one *unflagged*
element too, because a probe that silently reports nothing is the more
expensive failure.

---

## Limits, recorded rather than fixed

**On a phone the board is a dead zone for scrolling.** **Measured** at 390x844
with a game on: `.main-container` holds 1061px of content in 558px, and of
thirteen sample heights down it only three scroll — one strip above the board
and two below. The board's drag sensor claims every touch that starts on it and
prevents the default, so the swipe never reaches the scroller. `touch-action`
is *not* the cause: the hit elements compute `auto`, and forcing `.board-wrap`
to `pan-y` frees nothing. Nothing is unreachable, since the strips do scroll,
and every resolution costs more than it buys — an activation *delay* would make
moving a piece a press-and-hold, and react-chessboard does not expose its
sensors to ask for one. This is what a board being a manipulation surface
costs, and every other board on the web pays it.

**One blocking touch listener, and it is not ours.** react-chessboard's dnd-kit
`TouchSensor.setup()` registers a *noop* `touchmove` on `window` with
`passive: false` — its documented workaround so `preventDefault()` works in
dynamically added handlers on iOS Safari. Removing it would break dragging a
piece.

**The engine reboots on every switch into Analysis.** **Measured** with the
real engine: 484, 461, 460, 459ms, four times running. Keeping it warm across
the switch would mean holding an idle WASM instance beside the one Play mode's
own opponent uses, which is a phone's memory spent to save a toggle, and the
reader is told it is loading while it happens.

**A phone shorter than about 500px still scrolls to its back rank**, and **a
small phone on its side gets squares under 24px**. Both carried over unchanged
from the fourth pass, where the reasoning is.

---

## Method

Everything above was measured on the **production** build. The second pass had
already established why: the development build shows long tasks that are
`jsxDEV` and React's prop validation, which is a developer's problem and not a
reader's. This pass found the mirror image — a production build with a real
135ms freeze that a development build's noise would have buried.

The instrument was a Playwright script against `vite preview`, reading two
observers injected before boot: `PerformanceObserver({type: 'event'})` for
per-interaction input delay, processing and presentation — the same data INP is
computed from — and `{type: 'long-animation-frame'}` for attribution, which
names the invoker and splits script from style-and-layout. Storage, JSON and
layout primitives were wrapped in timers so a single run could rule them out.
`Emulation.setCPUThrottlingRate` at 4x for a phone's processor and
`Network.emulateNetworkConditions` for its connection.

Four things about that rig are worth the next reader's time. The CDP
`Profiler` domain **deadlocks** here — with a profile running, any
`page.evaluate` or click hangs until it times out and `Profiler.stop` never
returns; long-animation-frame attribution answers the same question and needs
no CDP. `vite preview` binds `localhost`, not `127.0.0.1`, and a probe pointed
at the latter is simply refused. Playwright's `page.screenshot` waits for
webfonts, which during a throttled load is exactly what is still downloading —
CDP `Page.captureScreenshot` does not. And network emulation set on the page
does **not** reach a worker's own fetches, so the 7MB engine appearing to
arrive in 767ms over emulated 4G means nothing at all; that number was
discarded rather than reported.

New guards, each confirmed to fail without its fix: a sweep of all five
stylesheets and index.html for a height in `vh` with no `dvh` line after it,
which names its own file and line; the boot skeleton's two halves that would
otherwise break silently — the markup being inside the container `createRoot`
clears, and the styles being in the document rather than in the sheet they
exist to pre-empt — beside its reduced-motion and `aria-hidden` behaviour; and
in the browser suite, a tap that drifts 3px still selecting while a drag still
drags.
