# Audit — September 2026, third pass

A third sweep, after [the first](audit-2026-09.md) and [the second](audit-2026-09-pass-2.md),
with the brief widened: bugs, the largest remaining performance gains, what a
strong player still lacks here and what a beginner does, and the interface
itself. Seven commits on `main`, none pushed.

The same convention: **measured**, **reasoned**, or **refuted**. The refuted
entry cost the most time and is the one most worth keeping.

---

## Bugs

**A takeback left the opponent's clock running.** **Measured** in a 3+2
pass-and-play game: 1. e4, Take back, and the strip read "White to move" over
Black's face marked running and losing seconds. A move presses the clock for
the other side; the takeback put the turn back and nothing told the clock.
Against the engine the two-ply takeback hid it, because undoing both moves
lands on the side the clock was already running for -- a one-ply takeback
while the engine thinks had the same fault. The takeback now makes the same
handover `resume` does, with no refund, and not for a game that has ended off
the board. Pinned in the browser suite, which is the only tier that can drive
a timed game.

**End pressed inside a variation left the variation.** `goLast` walked the
game's main line, so from 2. Nc3 in a sideline End landed on the last move of
the game, while the button beside it was enabled by whether *this* line went
on. It now walks the current node's first-child chain, which is what Lichess
and every desktop GUI mean by End. **Measured** by building a sideline and
pressing it.

**Take back stayed live after a resignation.** **Measured** in a pass-and-play
game: 1. e4, Resign, Confirm, Take back -- e4 came off the board and left a
locked position under a strip still reading "Black resigned · White wins",
with nothing to do but New Game. A flag and a resignation are the two endings
that leave every move legal, which is why the board lock is told about them
separately; the takeback rule never was. It now says "The game is over." for
either. A checkmate is deliberately still undoable, because taking back the
losing move is what a beginner wants after one and the position unlocks on
its own.

**The evaluation bar went blank in the opening.** **Measured** on the start
position with the engine at depth 16: the label read +0.2 and the bar sat at
an even three-way split. The bar only ever drew from a WDL split; a Lichess
cloud evaluation has a score and no split, and in every ordinary opening the
cloud reading outranks the local search on depth, so the stored snapshot was
the cloud one. An `[%eval]` read out of a PGN and a search with `UCI_ShowWDL`
off have the same shape. `evalBarSplit` now draws the classic bar from winning
chances on the same curve the trend graph and the accuracy read, with no draw
band because nothing measured one.

**Turning off WDL removed the evaluation bar.** The whole column was gated on
the WDL switch, so switching off a Pro reading took away the one reading a
beginner has. The column follows the engine alone now; the switch keeps the
draw band, the per-line splits and the WDL graph, and its copy says so.

---

## Performance

The question was where the largest gain still is, and the answer is that the
previous two passes took it. **Measured**, production build, Apple Silicon:

| | |
| --- | --- |
| board painted | ~90 ms after navigation |
| engine ready | ~460 ms |
| JavaScript transferred | ~205 kB gzipped (index 89, React 59, board 37, CSS 19) |
| Play → Analysis worker re-boot | ~600 ms, three times in a row |
| 116-position review at depth 16 | under 10 s on the four-engine pool |

The one candidate left -- keeping the analysis worker alive across Play and
Analysis so the switch is free -- would save about 0.6 s per switch for the
cost of a WASM heap held idle through every game. Not taken. The numbers in
`docs/architecture.md` under "Profiling React here in dev" still hold: there is
no rendering problem in this app.

Two things worth knowing that came out of measuring:

- The Browser pane keeps `document.hidden` true, and `useStockfishEngine`
  **parks any infinite search while hidden**. With the new Pro switch on,
  nothing is analysed in the pane at all. Every timing above came from a
  headless Playwright script against the dev server, which is visible to the
  page.
- `.analysis-context-row` renders the engine name and the status with no
  separator: "Stockfish 18 Lite WASM Multithreadedready". A `\bready\b` matcher
  never fires; `/ready$/` does. One timeout was spent learning this.

---

## New

**A first screen.** Read as a product, the largest gap was the first thing a
reader saw: an empty pass-and-play board beside a paragraph saying the engine
was on standby, and a returning player had to open the dialog and re-pick
Human vs AI, the level and the side on every visit. The Play panel now opens
on a Start card: *Play Stockfish* on the level, side and clock used last time
(now persisted, with Random kept as Random), one press and no dialog; the
dialog itself; pass and play; the PGN dialog; the analysis board. The card
gives way to the opponent panel the moment a game begins, and does not come
back for an empty board once a game has been asked for this visit. The same
reading of the product added *Play again* to the result card -- the rematch
every other board puts beside the result, which here meant a trip through
the dialog -- and *Import or fetch a game* to the empty analysis board -- and, once a
game is in, *Review this game* on the Analyze tab it landed on, since the
review is the reason most games are brought here and it sat a tab switch
and a button away with nothing saying so. Offered until the pass has run. And
the tab's title now says what the tab is doing -- "Your move", "Engine
thinking", the result, the players of an imported game -- where it read
"Web Chess" whatever was on the board. The difficulty
descriptions were rewritten to say what each level plays like and the Elo it
asks for -- "Perfect for learning chess basics" was describing a 1320, which
the *Refuted* section below is about. Checked in the browser suite: stored
as Master, Black, 3+2, a fresh load says so on the button and one press
starts that game with `UCI_Elo 2600` and the engine to move.

**Keep searching until the board moves.** The automatic analysis stopped at
the depth slider, sixteen by default, which on a desktop is over in about a
second; the panel then sat at D16 for as long as the reader looked. A switch
under the Coach/Pro toggle, Pro only, asks for `go infinite` instead. Every
piece an unbounded search needs already existed -- a new position replaces it,
Stop stops it, a hidden tab parks and resumes it, and the navigation cache
never held infinite searches. Pro only for two reasons: Coach mode is never
left running the machine, and a persisted switch behind a view that does not
show it would be a setting nobody could find to turn off.

**Move times, as a graph.** The review list has printed the clock beside
each move since the clock landed, which is the right place for one reading
and the wrong place for the shape of sixty. `engine/moveTimes.ts` turns the
line's `[%clk]` readings into seconds spent -- the same side's previous
reading, less this one, plus the increment from the `TimeControl` header,
skipping a side's first move when there is no header to start it from --
and a third card in the left panel draws them as bars, White up and Black
down, with the longest think named. It needs no engine, so it fills live in
a timed game and works in Play mode too. Checked with a ten-move 3+2 PGN
whose 5. O-O took 47 seconds.

**Autoplay.** The only way to watch a game here was a held-down arrow key. A
play button beside the move navigation, wherever no engine is on move, walks
the moves already on the board at the speed pills' pace and switches itself
off at the end of the line or when the reader takes over. Space toggles it in
Analysis; in Play mode Space still holds the game, clock and engine both,
which a pass-and-play clock depends on.

---

## Refuted

**A depth cap does not make the Beginner weaker.** Stockfish's `UCI_Elo` stops
at 1320, which is a club player, and the most common complaint about every
Stockfish-based trainer is that its easiest level crushes a learner. The
hypothesis: replace levels one and two with `Skill Level 0` and `3` under
`go depth 2` and `4`, the way Lichess caps its low levels at depth five.

Built, tested, and **measured** against the previous commit in a git worktree
on its own dev server -- AI-vs-AI games, 60 plies, reviewed at depth 16, two
games each, old and new run one after the other because a strength run is
CPU-bound:

| | accuracy | ACPL |
| --- | --- | --- |
| Beginner, Elo 1320 (before) | 83.4, 83.8 | 66, 50 |
| Beginner, Skill 0 at depth 2 | 85.0, 53.5 | 45, 100 |
| Novice, Elo 1500 (before) | 91.5, 87.6 | 34, 37 |
| Novice, Skill 3 at depth 4 | 90.8, 91.6 | 26, 32 |

Novice was no weaker, and Beginner was erratic rather than weak: one game
fine, one with six blunders. The reason is quiescence search -- even at depth
one the engine resolves every capture, so it never hangs a piece, and the
Skill Level randomisation only picks among its top four lines. Reverted, and
the second pass's reasoning stands: the Elo limit is the right tool, and its
floor is the floor.

**Neither does a wider blunder window.** The remaining lever was the one the
second pass built: `pickVarietyMove` chooses among the engine's own lines
within a window of the best. Widened for Beginner from 180cp among four
lines at a 38% chance to 400cp among six at 45%, and measured the same way,
six old games against four new:

| Beginner, 60 plies each | accuracy |
| --- | --- |
| Elo 1320, 180cp window (before) | 83.4, 83.8, 89.0, 93.3, 83.5, 84.1 |
| Elo 1320, 400cp window | 75.8, 78.4, 86.0, 90.2 |

The first two new games sat below every old one and the next two sat inside
the old range. A 4-point difference of means under a 15-point spread is not
a result, and one old Novice game came in at 76.6 with four blunders on the
unchanged code -- the noise in a sixty-ply self-play game is larger than
either lever's effect. Reverted as well. What is left below 1320 is an
engine with negative skill levels, which Lichess has and this app does not,
or a measurement with far more games than an evening allows. The two
attempts are recorded so the next pass does not spend the time again.

---

## The interface, read against Lichess, chess.com and En Croissant

Checked in the pane at 1280×800, 375×812 and 844×390, both themes; nothing
under the contrast floor, nothing overflowing, every top-bar control at 44px.
What a strong player has elsewhere and has here: infinite analysis (now),
MultiPV with hover preview, threads and hash, WDL, cloud evaluation, opening
explorer with a token, tablebase, a UCI console, a move tree with promotion
and discard, glyphs and notes, a review with accuracy and ACPL, a drill. What
a beginner has: Coach mode's verdict in words, hints, a takeback, a blunder
nudge while playing, practice on the critical moments, an evaluation bar that
now never goes blank, and autoplay.

Still missing, in rough order of what each audience would notice, and left
for a pass with time to measure them:

- A weaker floor for the opponent; see *Refuted* for what does not work.
- Touch gestures for arrows and marks.

One I listed here first and then found: keyboard move entry exists, folded
under "Enter a move by name" at the top of the analysis panel. I had built a
second one before noticing, which is the cost of a control that hides behind
a summary. The duplicate is gone; what stayed is that the existing field now
takes the forms people type -- `nf3`, `0-0`, `e8q` -- where before it refused
each of them and told the reader to type `Nf3`, which they thought they had.

---

## Method

`npm run verify`: green before and after. Browser suite: green, with four new
App-level checks -- the takeback clock, the keep-searching `go`, autoplay
reaching the end of a line, and the two-way eval-bar split is unit-tested
beside the component. The takeback fault was measured by hand with the same
DOM query the check uses before the fix existed.

## What I did not do, and why

**Pushing.** Seven more commits on local `main`, still outward-facing.

**Shipping the ladder.** See *Refuted*: a change that measured as a coin
toss is not an improvement, however good the reasoning behind it.
