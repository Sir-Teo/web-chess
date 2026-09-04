# Audit — September 2026, second pass

A second sweep over the same repo, after [the first](audit-2026-09.md). Sixteen
commits on `main`, none pushed.

The same convention as the first pass: every claim is marked **measured** or
**reasoned**. This pass added a third category that turned out to matter more
than expected — **refuted**, for the things that looked like defects under a
number and were not under a photograph. Three of my own hypotheses died that
way, and each would have cost a change that made the app worse.

---

## Bugs

Ordered by what they would have cost a reader.

**A flag was a win whatever was left on the board.** FIDE 6.9 draws a game where
the clock runs out and the opponent "cannot checkmate by any possible series of
legal moves". A bare king was being handed the win on time — on screen and in
the PGN `Result` tag, which travels into the library, the auto-save and the
review's narrative tags. Lichess and chess.com both rule it a draw, so this was
the app disagreeing with every other board about a finished game.

The one-sided question is the whole difficulty: `chess.js`'s
`isInsufficientMaterial` asks whether *neither* side can mate, which is a
different question and the wrong one exactly when the material is lopsided —
which after a flag it usually is. `matingMaterial.ts` is python-chess's
formulation inverted, because that is the one the ecosystem has already argued
over. The criterion is a *helpmate*, so two knights win on time against a bare
king and one knight wins against a king that still has a pawn to be smothered
by.

**You could win any timed game against the engine by doing nothing.**
**Measured:** with the speed set to Step, the engine's clock kept running while
it waited to be let go — six seconds lost in six seconds waited. Step mode holds
the game, so it has to hold the clock, which is the rule `pause` already follows
and the one behind stepping out to Analysis. The subtlety is *where* the time
goes back: before the search, not after the move, because an increment is only
paid for a move made on a running clock.

**The "Paused" badge was inverted in both directions.** **Measured**, both
halves. It rendered on `paused && running !== null`; a real pause goes through
`pauseClock`, which clears `running`, so pressing Space stopped the clock and
showed nothing. Meanwhile step mode sets `paused` after every engine move while
the clock keeps counting, so the badge appeared over a clock running down from
2:55 to 2:52.

**A finished review changed while you read it.** **Measured**, stepping back
through one 116-move game:

| | Inaccuracy | Mistake | Blunder | Overall |
| --- | --- | --- | --- | --- |
| after the review | 2 | 1 | 0 | 96.1 |
| one step back | 1 | 1 | 0 | 96.7 |
| three steps back | 1 | 1 | 1 | 94.9 |
| four steps back | 1 | 0 | 2 | 94.2 |

Two blunders out of nothing and 1.9 points of accuracy, with no move played. The
stepper read "Mistake 2 of 2", then "2 of 3", then "1 of 3" — its total growing
while its index shrank.

The first pass left this open as "a question about what a review *is*", and
framed it as freezing versus letting the numbers improve. The measurement says
it was never that question. A grade is the difference between two evaluations,
and browsing replaces one of the pair: `buildReviewRows` computes
`-after - before`, and visiting the position after a move re-takes its reading
far deeper than the one still standing before it. A depth-16 reading against a
depth-30 one manufactures faults. It was not the review improving; it was two
different things being measured against each other.

Frozen at the pass that produced it, and only the report — the eval bar, the
Coach card and both graphs still read live, because deepening those is the point
of browsing. The snapshot is held with the line it was taken for, so a line that
was never reviewed reads live rather than reporting itself unevaluated.

**Every move hint failed the graphical-contrast bar, on every board.** The dots
showing where a picked-up piece may go were one hardcoded pair for all five
schemes. **Measured** against the squares they are drawn on: the quiet dot
between 1.6:1 and 1.8:1, the capture disc between 1.01:1 and 1.16:1 — neither
clears WCAG 1.4.11's 3:1 for a graphical object you need in order to understand
the content. Same defect the coordinates had, one layer further down, where the
contrast sweep cannot reach because a square has no text in it to measure. See
*Refuted* below for what that ratio does **not** mean.

**The accuracy number was wrong twice**, both found by reading Lichess's source
rather than their explainer.

`accuracyAggregate.ts` shipped only the weighted half of the published
aggregate, and said so honestly: the harmonic mean collapses on a near-zero
move, and "Lichess must floor the inputs somewhere ... without their source in
front of me any floor here would be a number I made up." It is `Math.max(1, v)`,
in `Maths.harmonicMean` in `lichess-org/scalalib`. The floor was knowable, so
the game score is now the published mean of the two halves. It is not gentle and
is not meant to be: 39 moves at 95 and one blunder reads **85** where the plain
mean says 93, which is the entire point of the metric.

And a point was missing from every move: Lichess adds 1 before clamping, an
"uncertainty bonus (due to imperfect analysis)". Without it every move scored a
point below the same move on Lichess, and a flawless game read 99.99 — the curve
at zero loss is 99.9999 and never reaches the top.

**An impossible position loaded, and blamed Lichess for it.**
`4k3/8/8/8/8/8/8/r3K3 b - - 0 1` — Black to move with White already in check —
cannot arise in a game, for the same reason adjacent kings cannot, and it takes
only the wrong letter in the side-to-move field. **Measured:** the board took it,
the local engine returned no line and no evaluation at all, and the panel
reported "Tablebase: Lichess tablebase request failed (400)", pointing at the
network for a position that cannot exist. `threats.ts` already guarded this case
locally and its comment says `chess.js` accepts it; the guard belongs at the
import boundary too.

**Chess960 games were reported as damaged.** Fetching a real chess.com account's
last ten games said "3 games could not be read". They were Fischer Random:
`chess.js` rejects Shredder-FEN castling rights, and the importer had no
category for "a game this board does not play", so it used the one for damage.
Now named and counted separately.

**A drill outlived its game.** Found by crossing a new feature against a flow it
was not built with. Because a drill and a new game both start from the initial
position, a drill left running stayed *live*: start a new game after drilling
and your first move was silently refused unless it happened to be the line's,
with nothing on screen to say why. That also produced a stranger symptom chased
first — a freshly started drill opening with "Not the line. Try again." already
showing — because the moves meant to build the new line had been eaten, so there
was no line, `startDrill` bailed on its own guard, and the previous drill's miss
count was what stayed up. Two bugs that looked like three.

**"W/D/B progression graph"**, under a panel headed WDL. B reads as Black, which
is a different axis entirely.

---

## New features

**Fetch your own games by username.** The board could read a PGN database and
link *out* to Lichess, but not bring anything back — so the most ordinary reason
to open a review board, "look at the games I just lost", meant leaving the app,
exporting a file, finding it and pasting it in. Type the name instead, on the
Import tab, for either Lichess or chess.com.

The result lands in the same textarea a pasted file does, so nothing downstream
is new: the multi-game notice, the "add them all to the library" offer and the
single-game import are all the code that already ran for a paste.

Two things in it are findings rather than plumbing, and both came from a live
account rather than documentation:

- **A chess.com month is not in date order.** Its July archive holds daily games
  that *finished* in July and started in June, appended after the live games and
  out of order among themselves. "The last N in the file" is not "the N most
  recent games".
- **The archives endpoint hands back absolute URLs**, which are read for their
  year and month and then discarded; the URL actually fetched is rebuilt from the
  username the app already holds. A list of addresses from a remote service is
  not a list of addresses to fetch.

**Drill a line from memory.** The other half of opening preparation: the explorer
says what is played and the review says what went wrong, but neither asks you to
*produce* a move, and a repertoire you can recognise is not one you can play.
`Drill this line · White / Black` puts the board back at the top of the line you
are standing in and asks for it.

Three behaviours make it a drill rather than a replay. The line answers back, so
a correct move advances two plies and you are asked your own next move rather
than your opponent's reply. A wrong move is judged before anything is recorded
and then undone, so a drill cannot fill the tree with the moves you were trying
not to play — pinned in the browser suite, and the check is verified by the
mutation that actually produces that bug. And the answer appears after two
misses, which is review practice's threshold, because it is the same promise.

Not a new subsystem, which is the point: `addMove` de-dupes by UCI, so replaying
a line navigates the existing tree. A repertoire line is a line in the game tree,
which means it is also a game in the library, which means it already imports,
exports, saves and shares.

**Blindfold.** The pieces are drawn transparent rather than left unrendered —
they still have to be picked up and dragged, which also rules out
`visibility: hidden` — and everything else stays. The accessible names are
untouched on purpose: a blindfold is a thing you choose, and enforcing it by
taking the board from a screen reader would take it from someone who did not.

**A random colour.** The dialog had White and Black, so the default was White
every game, and a player who only ever has the first move never practises the
half of chess that starts a tempo down. What was *asked for* is remembered
rather than what it rolled: a random button that forgets is worse than none.

---

## Refuted

Three hypotheses that a number supported and a measurement killed. Each is
recorded because each would have cost a change that made something worse.

**Scrubbing a game was not slow.** The Browser pane showed **four long tasks
totalling 530ms** over twenty plies — 150ms of frozen UI at a time. Under a CPU
profile of the **production** build: **zero long tasks**, 2774ms idle out of
3335ms, about 19ms per ply, the largest single cost being chess.js move
generation at 4.4ms per navigation. The jank was `jsxDEV` and React's
development-only prop validation, which is a developer's problem and not a
reader's. Acting on the first number would have meant breaking up `App.tsx` to
fix nothing.

**`eco.json` should not become `JSON.parse`.** The standard advice for a 470 kB
object literal is to emit `JSON.parse("…")`, which Vite will do on request.
**Measured** on the real file: the literal is **faster** (0.47ms against 0.81ms
median) *and* smaller (484 kB against 520 kB, because of string escaping).
Applying the well-known optimisation would have been a regression in both
directions.

**The panel divider does not strand its drag.** `startLeftResize` listens on
`mousemove`/`mouseup` only, which is the classic shape of a drag that never ends
when the button is released outside the window. Driven with real input:
Chrome delivers the `mouseup`, `body.resizing` clears, and a subsequent
button-up move does not drag. No bug.

**And one of my own claims, corrected mid-flight.** I read the capture hint's
1.01:1 as "invisible" and wrote it into a commit message. Rendering the old
board showed the orange disc plainly visible, and `colorVision.distanceAsSeen` —
already in this repo, for the review palette — puts it **24 to 57 ΔE** from its
square even simulated for protanopia. It failed a *luminance* criterion while
carrying its difference in hue. The quiet dot was the one that was actually
faint, at 13.5 to 16.9 ΔE. The case for changing them is not that they could not
be seen; it is that a hint should not need hue to be seen at all, that the
orange sat close to the amber this board already spends on "the move that was
played", and that five schemes sharing two values picked against one of them is
exactly how the coordinates went wrong.

---

## Checked and sound, no change

Recorded so the next pass does not spend the time again: the Settings popover
(`max-height: 72vh; overflow-y: auto` — the clipping is its scroll edge), the
game share link round trip (886 characters for 116 plies, same final position on
reopen), variation create → promote → discard, the annotation glyph picker
(already in the move list), the Coach card at a checkmate, `nullMoveProbe`'s
refusal to answer a finished game, `aiDifficultyCommands`' handling of
`UCI_Elo` versus `Skill Level`, and the ECO table's en-passant convention, which
matches `chess.js`'s.

Later passes added: premoves against the engine (the piece holds while it thinks
and lands the instant the reply arrives); the auto-save round trip for a timed
game, where the clock comes back *stopped at the committed bank* rather than at
the live-ticking display, because the reader was not thinking while the page was
shut; and the engine-choice matrix in `profiles.ts`, whose two thresholds have to
agree with `recommendedThreadCount` or a machine is given the threaded build and
then a single thread. All three were already right; the last is now tests rather
than a coincidence, at 97.9% of statements from 77%.

A hostile-input sweep was extended to the readers that had none. The sweep
covered every reader a *position* arrives through but not the one a *game*
arrives through — the more expensive of the two by its own account, since
`shareGame.ts` replays every move on a real board where the FEN reader rejects on
the rank count first. Fifty-four cases, including a two-hundred-thousand
character hash and a response nested two hundred deep. Nothing fell over, which
is the result worth having from a net.

---

## A number worth knowing

**Review accuracy has about ±1 point of noise in it.** **Measured:** three
identical review runs of the same game at the same depth gave **93.8, 95.3 and
96.1** overall. That is not a bug — multi-threaded Stockfish is nondeterministic
even at fixed depth, because lazy SMP's search tree depends on thread timing.
The first pass saw a smaller version of this and reported grades "within 0.3
accuracy points"; over three runs of a different game the spread is 2.3. Worth
saying out loud before anyone compares two players' accuracy on this board.

---

## Method

Every fix has a test that fails without it. The two that could only be reached
through App state went into the browser suite, and the review one is **verified
by mutation** — with the freeze disabled it fails with both reports in the
message.

Building that check is worth recording, because it passed twice while testing
nothing, and mutation is what caught both. First, the fake engine returned a
different score on a repeat search at the *same depth*:
`shouldReplaceEvaluationSnapshot` only replaces on greater depth, so the map
never moved, and a scenario that cannot change the map cannot test a freeze.
Then the line was 1.e4 e5 2.Nf3 Nc6 — entirely in the opening table, so every
move graded *Book* whatever the engine said, and no evaluation could move a
single tally.

`npm run verify`: 1360 passed, 1 skipped, from 1219 at the start. Browser suite:
green, including the 22 contrast sweeps and two new App-level checks — the frozen
review report and the drill's invariance — both verified by mutation.

## What I did not do, and why

**Publishing or pushing.** Twenty-seven commits sit on local `main`. Outward-facing,
so it waits.

**The two untidy FENs.** Castling rights with no rook to castle, and an
en-passant square no pawn could have created, both load. `chess.js` tolerates
them and neither can produce an illegal move — untidy, not impossible.

**The board's drag announcement.** It reads "Draggable item e2 was dropped over
droppable area h4" — `@dnd-kit`'s generic default. `react-chessboard` renders its
`DndContext` without an `accessibility` prop, so there is no supported way to
override it, and the app's own keyboard path already gives good labels
("e4, empty square, legal move target"). Not worth working around the library.
