# Audit — September 2026, fourth pass

A fourth sweep, after [the first](audit-2026-09.md),
[the second](audit-2026-09-pass-2.md) and [the third](audit-2026-09-pass-3.md).
The brief this time was narrower and, it turned out, deeper: the interface on a
phone and on a desktop, read side by side at 320, 375, 390, 844×390, 1280 and
1440, in both themes and at 100%, 150% and 200% text, and at 320×480, 360×640
and 375×667 once it became clear the short phones were where the layout gave
way — and, late on, at 1920, 2560 and 3440, in Windows high contrast, and with
every control asked what the page hands a press at its centre. Thirty-four
commits of changes, pushed, and this record.

The same convention: **measured**, **reasoned**, or **refuted**. The refuted
section is by some way the longest of the four passes' and the one most worth
keeping: two of its entries are my own mistakes, one of which I had shipped, and
the rest are defects I went looking for, measured, and did not find.

The third pass left two things open. One of them — touch gestures for arrows
and marks — is done here. The other, a weaker floor for the opponent, is
untouched and its *Refuted* section still stands.

---

## What a reader could not see

Ordered by what each cost. The first five are on both platforms, then the
phone, where every row is already full, then the two import boxes and the
shared link, which are neither platform's in particular, then the drill, which
asks the reader a question and so has the most to lose by being out of sight —
and last the ten found after that, under their own headings, because each took
more than a paragraph to say. The worst of the pass is among them and was found
late, which is the argument for the pass having gone on as long as it did.

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

### The narrowest phone could not make the first move

The worst of the pass, and the last found. `body { min-width: 320px }` is the
width this app claims to support, and at 320×568 the board opened with three
ranks below the fold of the scrolling container — both ranks of the reader's
own pieces among them. **Measured** by asking the page what it hands a press at
each square's centre: a tap on e2 landed on `div.panel-content`. A game could
not be started until the reader thought to scroll a board that looked complete.
360×640 lost rank 1 the same way.

Two causes, and both had to go.

**The top bar took 42% of the screen.** The three game-mode pills wrapped, so
their group stood 99px tall with "AI vs AI" alone on the second line stretched
to 280px, and the bar measured 236px against the 189px the same bar measures at
375px. One scrolling row now — which is what that wrapper was already built for,
with the overflow, the scroll-snap and the edge fades that say a row goes on.
`min-width: max-content` on the pills is what makes that safe: they still grow
to share a row that fits and refuse to shrink below their label when it does
not, so the row overflows into the scroll rather than truncating the mode a
player is reading. With `nowrap` alone all three clip at 320px, which is the
thing the rules around them exist to prevent.

**And the board took a share of the screen rather than the room.** Its height
cap was `max(300, 0.46 × viewport height)`, which describes a phone whose bars
leave room for it; at 320×568 they leave 235px and that floor drew 294. The room
could not be read from the stage — on a phone the stage is `flex: none` and
takes its height from the board inside it, so it can only report what was
already drawn, and capping by it chases its own tail. The container between the
two bars is `flex: 1`, so its height *is* the room and nothing the board does
changes it.

Down to a point. A phone short enough to need squares under 24px cannot have
both a board that fits and one a finger can hit; `MIN_TOUCH_BOARD_PX` picks the
squares — eight of 24px, WCAG 2.5.8's target minimum — and lets the board run
past the fold as it did everywhere before. 320×480 is that case and is tested as
one.

**Measured** after: 216px at 320×568 and 288px at 360×640, every square
answering a press at both; 375×667, 375×812 and 390×844 unchanged to the pixel,
where the width has always been the smaller cap.

### Every piece stood 7px outside its square

Not visible, and it moved the board. The board library leaves each piece's SVG
`display: inline` inside the draggable wrapper it gives it, so the wrapper's box
is a *line* box — the art plus the strut's descender under it. **Measured** at
six sizes from 320×568 to 1440×900: 7px at every one of them, because the
leading comes from the inherited font and not from the board.

The art is right, which is why it survived: the SVG is square, top-aligned and
exactly the square's size. The box is what the browser focuses and scrolls to.
Tabbing to a piece on the near rank scrolled the board's own `overflow: hidden`
grid down 7px to reveal a box that did not fit — `scrollTop` 0 → 7, the whole
board shifting up under the reader with the far rank sliced off the top, and
back again on reaching rank 8. And on that rank the focus ring's bottom edge was
clipped away by the board's edge, so the piece a keyboard player is most likely
to be on was the one drawn without a full ring. `display: block` on the SVG is
the whole fix.

### A drawing mode that outlived the board it was drawn on

Draw eats presses by design: while it is on a tap is an arrow, not a move. That
is right while the reader is annotating and a trap the moment the app hands the
board back to be moved in — and nothing turned it off but its own button.
**Measured** at 375×812: switching to Play left it on and e2–e4 moved nothing; a
new game left it on; and a drill started with it on sat asking for a move that
no tap could make, its own pill reading "Drill · 1/2" for as long as the reader
kept trying. The board's blue ring was the only thing that said why, and the
control is `pointer: coarse` only — so this was a phone's trap, on the device
where Draw is the only route to an arrow at all.

The state itself had already argued the point. It is not persisted, because "a
board that would not move pieces on the next visit because of a switch thrown
last week is a bug report". This was that bug report over a shorter span.

**And a drill taking the board is the end of a replay**, the same way the engine
taking it is — the app says so in those words on the effect that stops autoplay
for the AI. **Measured** at 1440×900 with autoplay running: pressing Drill gave
a drill that broke itself, opening at "Playing White · move 1 of 4" and reading
"Paused … the board has moved off the line" 2.5 seconds later while the replay
kept stepping. Only the replay already running: pressing Autoplay *during* a
drill is the reader leaving the line on purpose, which the paused card already
explains and offers a Restart from.

### A game that was a position

A study chapter — `[SetUp "1"]`, `[FEN …]`, `*` — was refused with "PGN import
needs at least one legal move", and the dialog stayed open. The reader is
pointed at move text that was never going to exist, and the one thing the file
did contain, which this app has a board for, was thrown away. Puzzle exports and
tactics trainers all ship that shape.

A game with no moves really is nothing when its root is the starting position,
so that refusal stands. With a position in the headers the position is the
import. Reading a bare `!moves.length` as "there was no move text" is safe
because every other way of having none throws before that line — an illegal move
raises "Invalid move: Qh5", unparseable text raises the grammar error, and a
malformed header raises from `rootFenFromPgnHeaders` — and all three are pinned
in tests beside the new behaviour rather than trusted, since the change rests on
them.

Said out loud on import, because an empty move list after pressing Import
otherwise reads as an import that failed.

### Three things a screen reader was told wrongly

**The page had no `h1`.** The brand was a `<div>`, so the document's outline
opened on an h3 — **measured** at three sizes: zero `h1` elements, first heading
"h3 Historical Library". The stylesheet had said otherwise in three places for a
long time: it resets the UA heading size and margins because "It is the page's
`<h1>`", the phone's grid drops the brand column because "the `<h1>` is visually
hidden on phones", and the phone hides it with a clip-path rather than
`display: none` because that "would leave a phone with no top-level heading at
all". The care taken to keep the phone's heading in the accessibility tree was
keeping a `<div>` there. One tag, and the element's box is identical to the
pixel afterwards — which is what those resets were always for.

**The analysis panel was an unnamed landmark.** An `<aside>` is a landmark
whether or not it is named, and the computed accessibility tree read: main "",
region "Chessboard", complementary "" — an empty row for the panel holding every
reading in the app. Named from the heading it already carries rather than a
second string invented for a screen reader, so it says "Analysis" or "Play" with
whichever the panel is showing and cannot drift from the word on the screen. The
left panel is deliberately left alone: an unnamed `<section>` is not exposed as a
landmark at all, so it adds no empty row.

**A tick box was not a square.** **Measured** at 200% text on a 375px phone: the
five boxes in Settings came out 23×42, 26×42, 42×42, 42×42 and 20×42 — a
different rectangle on every row, decided by how many lines the label beside it
wrapped to. `width` is a hint a flex item gives up, and the only axis that held
was the height. And on a desktop, 13×13 at both 100% and 200% text: there was no
rule outside the phone's media query, so it stayed the user agent's size while
the text beside it doubled. Everything else here is rem-based for exactly this
reason. One rem, unshrinkable, with the phone's 1.3rem kept for a finger.

### In high contrast there was no board

Windows' high-contrast mode replaces every background and border with the
reader's palette and drops box-shadows. **Measured** at 1440×900 with
`forced-colors: active`: all 64 squares came back `rgb(255, 255, 255)` — light,
dark, and the two the last move was played between. What was left was a piece
diagram on a blank field. No light or dark complex, no way to see which bishop
is which, and no memory of the last move, whose ring is a box-shadow the mode
drops and whose wash is a background it overrides. The evaluation bar lost its
fill the same way and kept only its "+0.4", so the one reading a beginner has
became a number to interpret.

The rest of the app is *better* for that mode and is left alone: the bars,
buttons, panels, the Coach card, the move list, the library and both graphs all
render and read correctly, because their meaning is in text and in SVG strokes,
which forced colours leave alone. These two are different in kind — the colour
*is* the reading, so replacing it deletes the content rather than restyling it.
`forced-color-adjust: none` is what the spec provides for exactly this, and it
inherits, so one declaration on each covers the squares, the coordinates, the
marks, the arrows and the bar's two halves.

### A dialog's Close button, half off the screen

The actions row is right-aligned, so when it does not fit it runs off the *left*
edge rather than the right. **Measured** on the PGN dialog's Export tab at
320×568: four buttons want 343px of a 320px screen, and Close sat at x=−39 with
its own centre off the screen, so a press aimed at the middle of the button
landed on nothing. Found by a click the browser automation refused to make,
which is the same refusal a finger would have discovered the hard way.

Wrapping is the only answer that keeps all four — they are already 80px tall
with their labels broken over two lines inside them, so there is nothing left to
squeeze. Scoped to the narrow block where that footer is already special-cased:
a flex row wraps at its items' natural width rather than shrinking them first,
so wrapping everywhere would take the desktop footer from one row to two, 30px
of a dialog whose row was never cut.

### The desktop layout came apart on a wide monitor

Past a point a wider window is not more room, it is more distance. The board
stops growing at `MAX_BOARD_PX`, so every pixel past that went into the gap
around it while the two panels stayed pinned to the far edges. **Measured** with
a game loaded: at 1920 the board sits 257px from the left panel and 223px from
the right, which reads as breathing room; at 2560 those are 577 and 543; at
3440, 1017 and 983 — the Coach card and the winrate graph a metre apart on a
real monitor, the board marooned between them, and the reader's eyes crossing
the whole screen to compare two readings of one position.

The middle column is capped at the width it already has on a 1920 screen and the
three centre. 1280, 1440 and 1920 are unchanged to the pixel; 2560 and 3440 get
exactly the gaps the widest ordinary desktop has. The board stays 800px: that
cap is its own decision, and a wide monitor is not a reason for a bigger board —
it is a reason not to scatter what is around it.

### Boxes measured in rows of text, measured in pixels

Five boxes are "space for N lines" written as a pixel height: the move list in
two places, the engine's principal variations, the review's book rows and the
Engine Lab's log. Each was sized for a 16px reader, so each held fewer lines the
larger the reader's text got — the opposite of every other measurement here, and
the opposite of what one of them says it is for: *"Allocate space for 14 rows so
the UI below doesn't jump"*. Fourteen rows is fourteen of the reader's rows, or
the space stops matching the thing it was reserved for.

**Measured** on the move list at 1440×900: 180px held 5.6 rows at 100% text, 5
at 150% and 5 at 200%; on a 375px phone at 200% it held two. A reader who asked
for larger text got a third as much of the game through the same window, while
the rows inside it grew as they should. rem at the 16px baseline: identical at
100%, 10 rows at 200%.

### The review's headline, in a tooltip a phone cannot show

The summary chips are the one-line story of a reviewed game — "Wire-to-wire",
"Missed win", "Comeback", "Nail-biter" — and the sentence behind each lived only
in a `title`, which is nothing at all on a touch screen. The sentence is not a
paraphrase of the label either: it names the side, which no label does. "White
led from the opening on." "Black reached a winning position and lost."

Written under the chips on a coarse pointer and hidden on a fine one, where the
tooltip already says it — the same pair the board's gestures and the keyboard
list already use. The invariant it rests on is pinned in `narrativeTags`: across
five shapes of game every title ends in a full stop, runs to more than three
words, is not its own label restated, and names a side wherever the shape has
one.

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

**The folding bars, in the palette.** The top and bottom bars were the only
things in the app whose one and only control is a 14px strip with a 32×3px pill
in it — no shortcut, no menu item, and nothing in the palette, which carries
everything else this app does. A feature whose only handle is a hairline between
two panels is one most readers never find, and it is the one they most want when
the board is short of height: **measured** at 1440×900, folding the top bar
takes the board from 667px to 737px, the width of a whole rank.

The strip is a proper button already — named, focusable, activated from the
keyboard — so this is discovery rather than reach. Named the way the strip names
itself, so a search for "top bar" finds the words the handle carries, and the
label flips to Expand once the bar is folded: a command that cannot undo itself
is a trap, and the strip that could undo it is invisible with the bar gone.

Disabled with its reason on a phone, where the bars have no handle at all. The
reason is "Needs a wider window" rather than "Desktop only", because the palette
matches the reason along with the label and "Desktop" carries "top" — with it,
typing "top bar" on a phone pulled the bottom bar's row in beside the one asked
for. It is also the truer word: the condition is the window's width, and a
narrow window on a desktop folds nothing either.

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

**The landscape strip is not wider than the board it labels.** It measured 241px
against a 197px board with a game loaded, which the stylesheet forbids in as many
words — "as wide as the board it labels, never wider". Four candidate caps
changed nothing, which is the clue: `.board-wrap` measures 241 too. The
difference is the evaluation column, which appears when the engine does and is
44px of board row. The strip is the width of the row, and the row is right.

**The drill's verdict passes its contrast floor.** The pill was added to a strip
no contrast sweep visits with a drill running, so its four tones had never been
measured anywhere. Run with the suite's own probe over a whole drill in both
themes: 173–183 elements measured, 0 under the floor, in every state.

**The browser's toolbar tint matches the page.** `theme-color` follows the
resolved theme already, and the values are within four parts in 255 of what is
actually painted at the top of the page — `#0b0d11` against `#0d1117` dark,
`#f7f8fa` against `#f3f4f6` light. Nothing a reader can see.

**The promotion chooser is sound at 320px.** All four choices on screen at 48×91
with their labels whole, a 214×34 Cancel, and a translucent ground so the
position is still readable behind it.

**Every empty state carries its copy.** The Library says "Play or import a game
to have something to save" over "Nothing saved yet"; the three analysis tabs and
the Play panel all open with content rather than a blank column.

**Blindfold outliving a mode change is not the same bug as Draw.** It survives
every transition Draw was just stopped from surviving — and should: it is a
setting the reader keeps, it is persisted on purpose, and it hides pieces rather
than eating presses. A blindfold drill is an exercise, not a trap.

**A 150-move game is fine at both sizes.** Imported in 1.4s to 300 move nodes
and 1,646 DOM nodes, nothing spilling sideways, ten keyboard steps in 2.2s.

**Every dialog holds at 200% text.** Settings, PGN, Library and New Game at
375×812 and 1440×900: nothing off-screen, nothing clipped, no horizontal page
scroll. The only thing under 24px in any of them was the tick box, which is a
bug entry above.

**Focus comes back to the button that opened the dialog.** All five — PGN,
Library, New Game, Settings, the command palette — at both sizes: focus moves
inside on open and returns to the exact opener on close, every time.

**A game can be played from the keyboard alone.** Focus a piece and it reads
"e2, White pawn"; Enter makes it "e2, White pawn, selected"; the legal
destinations become focusable and read "e4, empty square, legal move target";
Enter there plays the move and focus follows the piece. Nothing to add.

**No control anywhere is under 24px.** Swept across Play, all three analysis
tabs and every dialog at 320px and 375px, counting a control inside a clickable
label as the size of the label. Nothing.

**Nothing else is cut off by a screen edge.** The same question the dialog
footer failed, asked of every control on every surface at 320, 375, 844×390 and
1280, discounting anything a scroller can bring back: the footer was the only
one.

**Rotating a phone leaves nothing behind.** Portrait to landscape and back, at
375×812 and 320×568, five times over: the board returns to exactly its previous
size, every square still answers a press, and no page error is raised.

**A share link round-trips.** A 300-ply game makes a 2,113-character link that
reopens in a clean browser with all 300 plies at move 151. The producer already
refuses a game past the decoder's bound, with a message naming the PGN as the
way to send it instead.

**The panels scroll rather than clip, at every window height.** 1280×600 up to
1920×1080: content of 1,340px in windows from 370 to 850, always `overflow-y:
auto`, never clipped.

**The clock's low-time state is not colour alone.** The amber is emphasis on a
number that already says 0:07, and the spoken label reads the time too.

**The analysis panel's header at 200% text is arithmetic, not a defect.** At
1440×900 it takes 327px of the panel's 475 — the three tabs stack one per row,
54px each, where they share one 32px row at 100%. Nothing is lost: the panel
scrolls, every tab is reachable, and stacked tabs are comfortable targets. This
is what 200% text costs on a 900px-tall window, and redesigning it on a hunch
would have been the wrong call.

---

## Left undone

**A bare username pasted into the PGN box.** It still gets the generic parse
error. The dialog has a username field two rows above it, so the intent is
guessable — but a single word could be anything, and a detector that guesses
wrong is worse than the generic answer. Left alone deliberately.

**A weaker floor for the opponent.** Untouched. The third pass's *Refuted*
section is still the state of the art: the `UCI_Elo` limit is the right tool and
its floor is the floor.

**The bars' 14px strips are still 14px.** Under WCAG 2.5.8's 24px, and the
spacing exception does not save them: the horizontal strip crosses the vertical
one, so a 24px circle on either meets another target. Growing them is not free —
at 1440×900 the clear band between the bar's buttons and the board's own strip
is 28px, so a 24px handle would sit 4px from the buttons above it and touch the
strip below, and that clearance is not something to spend on a control that now
has a full-size route beside it. The palette command is that route, and it is
also 2.5.8's own answer: a control of the required size that does the same
thing.

**A phone shorter than about 500px still scrolls to its back rank.** Deliberate,
and the reasoning is in the bug entry above: below that the board cannot both
fit the room and keep squares a finger can hit, and this app picks the squares.
Recorded here rather than left silent, because it is the one size where the
sweep's own standard is not met.

**A small phone on its side gets squares under 24px, and the same floor cannot
save it.** **Measured** at 568×320: a 127px board, so 16px squares. The floor
that fixed portrait works because the container scrolls there — the board runs
past the fold and the reader can reach it. Landscape clips instead
(`overflow: hidden`, so the panels beside the board keep their room), so a
floored board there would simply have its last rank cut off, which is worse than
a small one. 844×390, the common landscape phone, measures 24.6px squares and
clears the bar by half a pixel. Everything a reader could reach at 568×320 was
still reachable — **measured** with the same press test, no square unanswered —
so this is a limit rather than a defect, and it is the size at which this layout
runs out.

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
unchanged beside them; `hashCarriesShare` over the shapes a chat app makes of a
link; the position-only import beside the three ways of having no usable moves
that must still throw; the tick box's two axes coming from one rem in both
breakpoints; and the phone board against the room it has, down to the floor
where squares stop being tappable.

Where a defect was about a laid-out page rather than a value, the guard went
into the browser suite instead, and each was confirmed to fail without its fix
rather than assumed to: every piece measured against its square at all three
viewports and the board asked to hold still while a near-rank piece takes focus
("pieces standing outside their square: a8 by 7.0px"); the two folding bars
searched for, run and undone from the palette; Draw asked to end at the move
into Play and to still be available there ("Draw mode survived the move into
Play"); a drill started during a replay ("the replay kept running into a drill
that had just started"); every square asked what the page hands a press at its
centre, at 320×568, 360×640 and 375×812 ("320×568: 24 squares a finger cannot
reach"); the board asked whether its light and dark squares are still different
colours in a forced-colours context ("high contrast flattened the board: a1 and
a2 are both rgb(255, 255, 255)"); and every button in a dialog's actions row
asked to be inside the screen at 320px, on all three of that dialog's tabs
(`"Close" [-39..30]`).

The rest carry no test of their own, and for one reason: where a reading sits on
a phone is not a fact a module can answer. The exception is the last-move
arrow's opacity, which is a judgement about what a translucent shape does to the
pieces under it — a screenshot answers that and a number does not.

Everything above was measured in a real browser at a real size. Nothing in this
pass was found by reading the code.
