# Audit — September 2026, fourth pass

A fourth sweep, after [the first](audit-2026-09.md),
[the second](audit-2026-09-pass-2.md) and [the third](audit-2026-09-pass-3.md).
The brief this time was narrower and, it turned out, deeper: the interface on a
phone and on a desktop, read side by side at 320, 375, 390, 844×390, 1280 and
1440, in both themes and at 100%, 150% and 200% text. Nineteen commits of
changes, pushed, and this record.

The same convention: **measured**, **reasoned**, or **refuted**. The refuted
section is the longest of the four passes' and the one most worth keeping: two
of its entries are my own mistakes, one of which I had shipped, and three more
are defects I went looking for, measured, and did not find.

The third pass left two things open. One of them — touch gestures for arrows
and marks — is done here. The other, a weaker floor for the opponent, is
untouched and its *Refuted* section still stands.

---

## What a reader could not see

Ordered by what each cost. The first five are on both platforms, then the
phone, where every row is already full, then the two import boxes and the
shared link, which are neither platform's in particular, and last the drill,
which asks the reader a question and so has the most to lose by being out of
sight.

**The evaluation bar disagreed with everything beside it.** **Measured** on the
start position at 1440×900 and 375×812: the bar gave White 8% of its height,
under a label reading "+0.4", beside a verdict reading "White is slightly
better · 53% for White" and a winrate card reading "53.4%". Forty-five points
of disagreement, and the bar was the only reading on the screen taking its
number from the WDL split rather than from the score. Stockfish calls the start
position roughly `wdl 83 912 5`, so a bar drawn as three shares is 91% draw
band and White's white is whatever `w` happens to be. The third pass fixed the
readings that carry *no* split — a cloud evaluation, a PGN's `[%eval]`, a search
with `UCI_ShowWDL` off — and left the path that has one, which is the default.
`evalBarWhiteShare` puts the boundary on the same `winPercentFromCp` curve
everything else uses. The draws stayed, as a band *over* the bar rather than a
share of it, carried by two hairlines: in an opening the band is nearly the
whole bar, and a wash heavy enough to see is a wash over everything.

**The coordinates were unreadable over the pieces.** Each scheme's ink is
measured against its *squares*, and `boardThemes.ts` is careful about it — but
no coordinate on a starting board is on an empty square. The file letters run
along the rank nearest the reader, under the back rank, and the rank digits up
the file beside it. **Measured** in the pane at 375px, where a square is 43px
and the coordinate 11px: the `c` under the c1 bishop was unreadable and `b`,
`f` and `g` sat on the knights' outlines. Dark ink on a piece's black outline
is a ratio near 1 whatever the square underneath measures — the same blind spot
the move hints had one layer down, and for the same reason. A one-pixel ring of
the square's own colour fixes it and is invisible on an empty square, because
the ring is the square.

**There was no last-move highlight at all.** The only answer to "what was just
played" was the amber arrow, drawn only while board arrows are on — so turning
them off, which Settings offers in one press, left a board with no memory of its
own last move. The blindfold is worse: its copy promises that "the move list,
the coordinates and the last move stay", and with arrows off the last move did
not. Amber is forced by this board's language and is also the hardest colour to
spend here, because the default scheme's squares are a cream and a brown.
**Measured** over all five schemes and all three colour visions: the strongest
amber *wash* worth drawing reaches ΔE 13 and 1.14:1 — visible, but not something
to rest a reading on. A solid amber ring is ΔE 22.8 at worst, past the bar the
move hints are held to, because an edge separates by shape and not by the square
under it. Ring over a light wash, which is what a premove and a previewed move
already look like here.

**The last-move arrow crossed out the pieces beside it.** At 0.8 it painted over
whatever stood between its two squares. **Measured** on 10...Nbd7 at 375px: the
bishop on c8 and the queen on d8 were both under it, saying something the two
new rings had already said. 0.55.

**The board jumped when the opening got its name.** The row that names the
opening was rendered only once there was a name to put in it, which is the
moment after the first move — so the board moved down the screen exactly between
a player's first move and their second, while their finger was already going for
it. **Measured**: 29px at 375×812, which is two thirds of a square; 19px at
1440×900; and on a landscape phone 14px, which put the board 4px past the bottom
of a stage whose container clips rather than scrolls, so the last rank went
under the edge. The row is drawn from the first paint now, its pill hidden until
it has something to say — `visibility`, not `display`, so the pill still
measures itself and the row is exactly as tall as it will be. It costs no board
anywhere: the stage had the room all along.

**The phone's primary button was cut in half.** **Measured** at 375×812: the
panel under the board has 122px above the fold, and 41 of them went to a header
whose entire content was the word "Play" — the word already lit in the tab pills
two rows up. The Start card's "Play Stockfish" ran to 728 under a fold at 715,
so a reader landing on a phone saw its top half and no subtitle. The header
folds away on a phone when its title is all it holds; in Analysis it also
carries the tab strip and the engine's name and status, so it stays.

**The strip crushed its own readings.** A flex row with nowhere to put its last
item takes the width out of whichever item will give it up, and the strip had
already been trimmed once for exactly this. **Measured** at 375px with an
imported game: the result was drawn as "·0" — 18px of a pill that wanted 55 —
and at 320px both it and a button were 0px wide, which is to say the button
could not be pressed. The row now works the way the top bar above it already
does: what the strip *says* scrolls behind a fading edge, and what it offers to
*press* is pinned past the end. Ordered so that what goes out of sight is what
the strip can most afford to lose.

**The clock scrolled off in a timed game.** **Measured** in 3+2 against the
engine: at 375px the clock sat at 167..277 in a 276px window, and at 320px more
than half of it was off the right edge, behind a move number the move list gives
anyway. A clock you have to scroll to is not a clock. It goes first now, ahead
of whose move it is — the running face says that too, and "White to move"
tolerates a faded last letter where a seconds digit does not.

Two things had been holding that row in the wrong place, and only one of them
was the one I first blamed. `overflow-anchor: none` changed nothing. The cause
was **snap re-targeting**: the row re-snapped to whatever it had snapped to
last, so a 3+2 game at 320px *opened* already 52px along with the clock half off
the *left*. Both snapping and scroll anchoring exist to hold a position across a
change, and every change to this row is a pill appearing or leaving — so both
held the wrong thing. Turning the snap off also gave the edge fades somewhere to
rest between the two ends.

**The review list did nothing you could see.** **Measured** at 375×812 after a
review: tapping a move left the board 816px above the top of the container with
none of it on the screen, and scrolled *further* from it, because the only thing
that moved was the list. The position changed, the arrows changed, the
evaluation changed, and the reader saw a list. The rule was already in the file,
written for the Previous/Next mistake buttons — "jumping to a mistake that stays
off-screen is a jump the reader cannot see" — and the practice button follows it
too. Three presses on lists inside the panel did not: the review list, the
Critical Moments rows, and the move tree in all three places it is drawn, which
is every remaining way to move the board from the panel.

**Four of the top bar's six controls disappeared at a larger text size.** The
board sizing is rem-based on purpose — "at 150% text the old fixed pixel
allowances were outgrown by the bars they were guessing at" — and the five icon
buttons grow with it too. `justify-self: center` sizes a grid item to its
content and centres it, so past about 125% the group was wider than the bar and
hung out of both ends into a panel that clips. **Measured** at 375×812: at a
20px root "New game" was 7px off the left edge; at 24px it sat at −46..20, two
thirds of it gone; at 32px it and Flip were off the screen entirely while
Commands was cut off the right. WCAG 1.4.4 asks for 200%. `max-width` holds the
group inside its column and it scrolls there, wearing the same edges as the two
strips below it — checked by scrolling to each button and clicking it, all five
reachable at 16, 24 and 32px roots, all still 44px.

Two rules in that block were dead and are why it took two tries: a `gap` and a
button size on a plain `.mobile-actions` selector that same-specificity rules
further down the file beat on source order. The first fix set `flex-shrink` on
what turned out to be a *grid* item, and did nothing at all.

**Both import boxes described the thing the reader had not pasted.** A position
is what chess sites hand you to copy and a share link is one click, so a FEN or
a URL in the PGN box are the two commonest wrong pastes there are — and both
were answered with "Failed to parse PGN. Check the move text, headers, and move
numbers", a fault in move numbers that were never there. The FEN box had the
same fault mirrored: a game or a link pasted there was told to check its piece
placement, side to move, castling rights and counters, four fields a game does
not have. Each sent the reader hunting for a fault in the one thing they got
right, while the tab they wanted sat a row or two above the box.

Each box now says which of the three things it is. The detectors are
deliberately shallow — telling a FEN from a game from a link needs no parser,
and a FEN with a bad castling field is still the FEN the reader meant, so
validity stays the other validator's job. A position wins the tie against a
game, so a FEN is never misread as one. They land in the existing content
checks, so the dialogs' live validation picks them up for free: the message
appears as the text is pasted, the box is marked invalid, and the button
disables before anything is pressed.

Not fetching the link. The single-game endpoint exists here — the historical
samples use it — but it is Lichess-only, and a chess.com link would have to fail
differently after promising the same thing, which is a worse answer than a true
sentence.

**A mangled shared link said nothing at all.** **Measured** on the four shapes a
link arrives in after a chat app has had it — truncated mid-FEN, a board with
seven ranks, a position with no kings, and plain words — every one dropped the
app to the starting position in Play mode in silence. The reader followed a link
somebody sent them, got the default board, and is left to conclude the sender
got it wrong. The cause is that both parsers answer `null` to "there was nothing
here" and to "there was something here and it did not work", and those want
different answers; `hashCarriesShare` tells them apart on the key alone. An
empty `#fen=` stays silent, because a key with nothing after it is a stray
character rather than a share.

The message is held for six seconds rather than the receipt's 2.4. Every other
notice is a receipt for something the reader just did — "FEN copied" — and can
be missed without cost; this one explains why the board is not the one they were
promised, and they have to read it to act on it.

The shared *game* half of the hash already handled this well: `replaySharedGame`
plays a truncated link as far as it really goes rather than throwing it away.
This is the position half catching up.

**The phone buried each tab's content under the controls it shares.**
**Measured** at 375×812 with a game loaded: the Analyze tab put 391px of shared
controls between the tab a reader had just pressed and the content it is for,
and the Review tab 285px — against a container about 526px tall, so the Coach
card opened with 135px of itself showing. Engine Lab, which shares none of
them, starts its content at 13px.

The two rows that *leave* the analysis rather than read it — "Play from here"
and "Drill this line" — now sit under the reading on a phone instead of over
it. Analyze's content starts at 286px and Review's at 180px, which roughly
doubles what opens on the screen. Nothing moves on a desktop, where there was
room for all of it.

Chosen in `App.tsx` off `isMobileLayout` rather than with `order` in the
stylesheet. `order` would have left the focus order following the old one, and
traded a density problem for an accessibility one — which is the reason this
entry sat in *Left undone* for six commits, until it turned out both rows were
already extracted as variables and the move was four lines.

**A drill started out of sight.** Starting one turns the board round, plays the
opponent's moves up to the first question, and waits for the reader to answer
it. **Measured** at 375×812: the Drill button sits far enough down the panel
that reaching it leaves the board 889px above the top of the container with none
of it on the screen, and starting from there scrolled 154px *further* away. The
board then sat waiting for a move nobody could see it asking for.

Every sibling that hands the board back already reveals it — "Play from here",
the review's practice button, and the review list since the ninth commit of this
pass. `startDrill` was the one that did not, which is the pattern of the phone's
remaining defects: not a missing mechanism, a caller that forgot to use the one
already there.

**And then refused moves without saying why.** A drill judges every move and
says so in a card down the panel, which on a phone is below the fold.
**Measured** at 375×812: playing d4 against a line that opens 1.e4 was refused
with "Not the line. Try again." in a card nobody could see. The piece snapped
back, and the strip above the board still read "White to move · Move 1" —
exactly what it said before the move. A rejection with no reason anywhere on the
screen is the app declining to explain itself.

The review's practice mode had already answered this: it reports from the
board's own strip, because a mode that judges the reader's moves has to report
from where the moves are made. The drill now does the same, off the same three
numbers the card reads, in the tones the review already uses, and ahead of the
move number — while a drill runs, its verdict is the reading being acted on.
Short, because the strip is a row of pills and this one shares the row with the
turn: measured at 113..232 of a 276px row and fully visible. The card keeps the
whole sentence, the revealed answer, and the Restart and Stop buttons.

**Measured** over a whole drill afterwards, on the line `1. e4 e5 2. Nf3 Nc6`:
the pill reads "Drill · 1/2" on start, "Not the line · 1/2" after d4, "Drill ·
2/2" after e4, and "Drill · done" on Nf3 — each in its own tone, each carrying
the sentence for a screen reader, and each wholly inside the strip rather than
scrolled off the end of it.

---

## New

**Arrows and marks with a finger.** Settings had said it plainly since the marks
landed: "Drawing arrows and marking squares needs a mouse — they are on the
right button, and there is no touch equivalent yet." The board library binds
both gestures to `button === 2`, and nothing on a phone produces that button, so
the whole feature was unreachable on the device most of these games are read on.

A modifier key has no touch equivalent either, so the gesture cannot be
overloaded onto the one press a finger has: a long press is how a phone already
opens menus, and a two-finger drag is how it already zooms. What is left is a
mode — which is also the only shape a reader can *find*, and an undiscoverable
gesture is not a feature. Draw sits beside the board, on a coarse pointer only;
inside it a drag is an arrow and a tap is a mark, told apart the same way the
right button tells them apart, by whether the release lands on the square the
press started on. Drawing the same one again takes it away or recolours it, and
lifting off the board abandons it.

The layer that reads the gesture covers the board exactly, so it takes the press
before a piece can be picked up with it, and its own rectangle is what the
square is read out of — no dependence on the library's DOM.
`engine/touchDraw.ts` is arithmetic over a rectangle, so all sixty-four squares,
both orientations, the off-board cases and the toggle are tested without a
browser.

**Edges that mean something.** Two strips scroll sideways on a phone now, and
both faded their trailing edge always and their leading edge never — which is
wrong at both ends of the scroll at once. At the end of the row it still
promised more to the right; anywhere at all it said nothing about the items now
off the left, and the left is the edge a reader is likeliest to have forgotten
about, because they pushed the row there themselves. Each edge is a registered
number driven by the scroller's own progress, so the fades track a finger
exactly and `prefers-reduced-motion` leaves them alone — there is no duration
for it to cut, which was **measured** rather than assumed. A browser with no
scroll timelines gets exactly what this used to draw.

---

## Refuted

**Tap-to-move was not broken after the first move.** It looked like it was, and
the measurement said so: at 375×812 with touch, 1. e4 played and every move
after it did nothing. It reproduced on `main`, so it was not this branch. What
it actually was: the harness had measured the board's rectangle once, and the
opening's name appears after the first move and moved the board 29px down, so
every later tap landed one rank high. The app was fine. Chasing it is how the
board-jump above was found, which is the only reason this entry is not simply
wasted time — but the lesson is the plain one, that a measurement of a moving
layout has to be re-taken and not cached.

**The amber ring round the board was not a defect either.** It appeared in every
screenshot taken after a dialog and looked like a stuck focus ring. It is
`:focus-visible` doing its job: focus moves to the board stage after an import,
correctly, and the harness pressed Escape to close the dialog, which is a key
press, which is what makes the ring visible. A finger never produces it.

**Adding the opening's row to the board's height budget was wrong.** Reserving
the row is right; telling `boardSizing` about it is not. The budget already
ignored the row before this pass — the row simply appeared after the first move
and used slack the stage had anyway — so counting it took 38px off the desktop
board to buy nothing. **Measured** both ways: with the budget untouched, nothing
moves and no board loses a pixel at any of the four sizes. Reverted.

**Rendering both copies of the opening's name and hiding one was worse than
choosing.** The name goes in the strip on a phone and on a centred row on a
desktop. Two elements with a `display: none` each is the obvious way to do that,
and it cost twenty seconds of the browser suite: its check for the opening's
code found the invisible copy first and waited for it to become visible.
`App.tsx` picks which one exists now, and only one of them is ever in the
document.

**The top bar's focus rings were not missing.** A tab-order probe reported
eleven controls with no visible focus indicator, which would have been a WCAG
2.4.7 failure across the whole bar. The probe looked at `outline` and
`box-shadow`; the ring is drawn as a `border-color` change, and a screenshot
shows it plainly. The 32 board tab stops beside them are not a defect either —
the two skip links at the top of the tab order are exactly the standard answer,
and they are already there.

**Cloud evaluation and the tablebase were not failing silently.** Routing every
`lichess.org` request to an abort and then to a 429 produced no visible
complaint — because it produced no requests: both are opt-in, and neither had
been turned on. Their error paths carry explicit messages, including the
rate-limit one. Nothing to fix, and the measurement only says that the default
build does not call them.

**The Library needed nothing.** Five saves at both sizes with the awkward names
— blank, duplicated, far too long, and a `<script>` tag. A whitespace-only name
falls back to the suggested one, a duplicate becomes "Short (2)", a long one
ellipsises, the tag renders as text, and the dialog overflows at neither size.

---

## Left undone

**A bare username pasted into the PGN box.** It still gets the generic parse
error. The dialog has a username field two rows above it, so the intent is
guessable — but a single word could be anything, and a detector that guesses
wrong is worse than the generic answer. Left alone deliberately.

**A weaker floor for the opponent.** Untouched. The third pass's *Refuted*
section is still the state of the art: the `UCI_Elo` limit is the right tool and
its floor is the floor.

---

## Method

`npm run verify` and the browser suite green on every commit, including the
suite's contrast sweeps at 375px and 1280px in both themes — which is where the
strip's "·0" was plainest, and is the reason the light theme is worth sweeping
even when nothing in a change is about colour.

New tests, all computing their numbers rather than trusting them: the
coordinates' ring against every scheme; the last-move ring's ΔE against every
scheme and colour vision, beside the wash that would not have done; the
evaluation bar's boundary against the curve the rest of the screen prints; the
horizontal WDL bar's ramp direction; the scrolling strips' two edges, the strips
they name and their fallback; `touchDraw` over all sixty-four squares in both
orientations; the three paste detectors, including every FEN judgement pinned
unchanged beside them; and `hashCarriesShare` over the shapes a chat app makes
of a link.

Nine of the nineteen carry no unit test, and eight of those for one reason:
where a reading sits on a phone, and whether the board is on the screen when it
asks for a move, are not facts a module can answer — only a laid-out page can.
The ninth is the last-move arrow's opacity, which is a judgement about what a
translucent shape does to the pieces under it; a screenshot answers that and a
number does not.

The last two — the drill's reveal and its verdict pill — were checked by walking
a whole drill at 375×812 and reading the pill's text, tone, spoken label and
position in the strip after every move, because those four can only be wrong
together.

Everything above was measured in a real browser at a real size. Nothing in this
pass was found by reading the code.
