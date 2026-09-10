# Audit — September 2026, fifth pass

A fifth sweep, after [the first](audit-2026-09.md),
[the second](audit-2026-09-pass-2.md), [the third](audit-2026-09-pass-3.md) and
[the fourth](audit-2026-09-pass-4.md). The brief was one word — responsiveness —
and the pass took it in both its senses: the layout answering the screen it is
given, and the app answering the reader who touches it.

The fourth pass read this interface at a dozen sizes in a desktop browser and
found thirty-four things. This one is mostly about what that method cannot
reach. Its first four findings were invisible to it *by construction*: two
because `vh` and `dvh` are the same number where no browser chrome retracts, one
because the first paint of a single-page app is not a thing you can see by
looking at a page that has already loaded, and one because a synthetic click
carries no pointer movement, so every test in this repo had been exercising the
one case that always worked.

The rest came from three lenses that measurement does not have. **Rendering a
state and reading it** — a card that reported the end of the game whatever ply
was on the board, a row that called an inaccuracy a mistake. **Putting bad input
in and reading the answer** — four different failures answering with one
sentence. And **asking what happens when something never comes back** — a
network call with no timeout, behind a queue that serialises every other one.

Same convention: **measured**, **reasoned**, or **refuted**. The refuted section
is again the longest, and again the one worth keeping — the app turned out to be
in good shape almost everywhere it was looked at, and knowing *which* everywhere
is what stops the next pass re-deriving it.

One warning before the entries, earned four times over in this pass and written
out again under *Method*: **a probe that reports nothing is not the same as
nothing being there.** Four readings here were retracted after being published
in an earlier draft of this file, each one a measurement that ran, printed a
plausible number, and had measured nothing at all.

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

**The same mistake, one axis over — and a fix that fixed nothing measurable.**
Checking that the sheets still fit at the shorter heights `dvh` gives them —
they do, the settings sheet holding at exactly 85% of the screen at 393x745,
375x564, 360x540 and 320x480, everything scrolling, nothing stranded — turned
up 5px of horizontal scroll at 320px wide, on a layout that has none at any
other size. `100vw` is the viewport *including* a classic scrollbar, and five
things were sized against it: the body's own cap, the phone shell's width and
max-width, the settings backdrop, the lazy-dialog error toast, and the command
palette. They are `100%` now, which is the room there is, and for a fixed
element the initial containing block, which is the same thing. The unit was
wrong and the change is right.

**It did not fix the 5px, and the entry first written here said it had.** The
verification behind that claim was a single pass over five sizes. Repeated
eight times at each size it comes out **8/8 overflowing**, and against the
build from *before* the change, **6/6 overflowing by the same 5px** — the fix
changed nothing about the symptom that motivated it. What the 5px actually is:
`documentElement.scrollWidth - clientWidth` equal, every time, to
`window.innerWidth - clientWidth`, which is the scrollbar Playwright's mobile
emulation draws. With emulation off, the same probe on the same build reports
**0/5** at both sizes. A real phone draws an overlay scrollbar and has none of
this.

So: a correct change, a false claim about it, and the thing that caught the
false claim was repetition. One pass over five sizes read 0px; eight passes over
one size read 5px every time. Nothing about the first run said it was the
unreliable one.

**The command palette was not made of things a finger can hit.** **Measured**
at 375x564: its search field is 343x**21**px carrying `padding: 1px 2px`, which
is the user agent's own and means it had never been given any, and its 33
command rows come out at 42px — two short of the 44px every other control on a
phone is held to. The fourth pass's sweep put `min-height: 44px` on fourteen
selectors and every one of them is in App.css; this dialog's styles are in a
file of their own, which is the whole reason it was missed. Now 44px for both,
scoped to the same breakpoint as the other fourteen, since 44px is a touch
standard and a mouse does not need it.

That came out of a sweep of the overlays at 100%, 150% and 200% text on the two
shortest phones — the pairing of the fourth pass's text sizes with the shorter
sheets `dvh` now gives them, which nothing had put together. The sheets
themselves are fine: at every text size and both sizes, nothing is stranded
outside a scroller, no sheet is cut off at the top, the move-navigation bar
stays on the screen, and the board's squares stay at or above 24px — 24.0 at
100% and, because this layout is measured in `rem`, *larger* at 200%, 34.4px at
320x480.

Two other things the same sweep flagged were the false positive this repo
already knows about. Five controls in the settings sheet measure 20.8px, and
each is a tick box inside a `label` measuring **335x44** — the label is the
target, the box is the picture of it. The rule about confirming a flagged
element by hand paid for itself again: the same list held one real defect and
five decoys, and only the wrapping label told them apart.

**Nor was anything else styled outside App.css, nor two things inside it.**
The palette was the first thread; pulling it gave a sweep of every surface this
app opens, at 375x667, with the two decoys filtered rather than ignored. What
it found, all measured: the library's search field 343x**32**, its four sort
buttons at 32, its rename field and Save at 36, its per-row actions at 30 — a
dialog with its own stylesheet, exactly like the palette — and then two that
are in App.css and were missed for having their own selector. The bottom bar's
four navigation buttons and Autoplay come out at **40px**, from a rule asking
for `2.5rem`; that is the row this pass rescued from behind the URL bar in its
first commit, and it was four pixels short the whole time. And the Draw switch
is 61x**36**, from a rule inside `@media (pointer: coarse)` — a rule whose
entire audience is fingers — asking for 2.25rem.

Raising the bar was measured before it was done, because it costs board: 46 to
50px of bar, and the squares lose between nothing and half a pixel at 375x667,
375x564, 360x540, 320x568 and 320x480. Neither of the two sizes already sitting
on the fourth pass's 24px floor moves off it, the bar never wraps, and the
navigation stays on the screen at every size. Afterwards, 132 controls across
five surfaces all clear 44px.

The guard is a sweep and not a list of selectors, because a list of selectors is
what let this happen. It counts what it filtered and asserts that the count is
not zero, so a decoy filter that stopped matching would fail rather than quietly
pass everything.

**And four more on the surfaces that sweep had not reached.** Widening it to
the import dialog's tabs and the analysis panel, at 375 *and* 320: the archive
count's field is 50x**27** — its wrapper had already been given 44px and the
field inside it left at 27, so what a finger lands on was a third short of what
the stylesheet appears to promise; "Enter a move by name" is a 331x**39**
disclosure; and the position-setup palette's thirteen buttons are **36px wide**
at 320, from `repeat(7, minmax(0, 1fr))` in 275px of room. That last one is the
sharpest of the set, because the rule directly beneath it had already raised the
same buttons to 44px *tall*: the same control was finger-sized one way and not
the other, in adjacent lines. `repeat(auto-fit, minmax(44px, 1fr))` takes five
columns at 320 and six at 375, and stops being a number that has to be right.

The fourth finding is not one. The two export links, "Open in Lichess" and "Open
in chess.com", are 15px tall and sit inline in a paragraph either side of a
separator — which is the exception **2.5.8** names, and giving them 44px would
break the sentence to satisfy a rule that does not ask for it. The sweep
exempts them by shape rather than by name, counts the exemption, and asserts the
count is not zero, so an exemption that stopped matching fails rather than
hiding a real target.

**A reading that did not follow the board.** The winrate card's two numbers —
the one in its heading and the one beside "White win chance" — took
`winratePoints[length - 1]`, the last ply of the line, whatever ply was being
looked at. **Measured** on a 58-move game at five positions: the coach beside it
read 42%, 22%, 45%, 30% and 46%, and the card read **42.1% at every one of
them**, which is the value at the end of the game. A reader stepping back
through a collapse watched the coach fall to 22% while the panel above it went
on saying White had a 42% chance.

The graph *between* those two numbers was already right. It takes `currentIndex`
and lights the point it belongs to, and it carries a comment about a reader
scrubbing with the arrow keys having "nothing to read on screen" — so the lesson
had been learned one element over and not applied to the card wrapped around it.
The highlighted dot and the number under it were two different plies of the same
game.

What the guard asserts is the *pair agreeing at four plies*, not the card's
value: a card frozen on the last ply agrees with the coach there and nowhere
else, so any check on a single position would have passed the defect. It also
asserts the value moved at all, since a card that never changes would agree with
itself forever. This is the fourth pass's own finding — a reading that disagreed
with everything beside it — in a different card, found the same way: by putting
two numbers that describe one position next to each other and reading both.

**An inaccuracy called a mistake.** The review card's chips grade every move —
Book, Best, Excellent, Good, Inaccuracy, Mistake, Blunder — and the row beneath
them steps through the ones worth revisiting, which is the last three added up.
It called them mistakes. **Measured** on the sample game: the chips read
"Inaccuracy 6" and "Mistake 2", and one line below them the row read **"8
mistakes"**. Two numbers, one word, in the same card. Stepping into it then read
"Mistake 3 of 8" over a move the card itself had graded an inaccuracy.

The code had always known better: the count behind the row is
`reviewFaultCount`, and the comment directly above it calls them faults. Only
the words a reader sees said otherwise. They are "costly moves" now, in the card
and in the two palette commands, with `mistake` kept as a search keyword because
it is what someone will type even though it is not what the set is.

What the guard asserts is the *relationship*, not the wording: whatever the row
calls them, its number has to be the three grades added up, and it must not
borrow the name of one of them. A check on the literal string would go green the
day somebody wrote "8 mistake s".

**A refused paste now says which move refused it.** Ten kinds of bad input were
fed to the import box and the message read back. Two of them are as good as this
app gets: a FEN pasted into the PGN box answers "That is a FEN — one position,
not a game. Load it from the FEN tab above", and a link answers "That is a link
to a game, not the game." Both name what is wrong and what to do instead, and
both refuse before the button is even enabled.

Four others -- prose, a game cut off mid-move, a move that cannot be played, and
a huge repeated string -- all came back with the same sentence: "Failed to parse
PGN. Check the move text, headers, and move numbers." Three things to check, no
clue which, on failures that are nothing like each other.

The parser knew more than that for two of the four. A paste cut off mid-move --
"1. e4 e5 2. Nf" and nothing after it, which is what half a copied game looks
like -- throws `Invalid move: Nf`, with the offending token in it. It could not
get out because the messages a reader is allowed to see are matched **exactly**
against a fixed set, and this one is different every time. Matched by prefix
instead, the same paste now answers *"Nf" is not a legal move where it appears.
Everything before it read fine, so start there.*

The other two keep the general message and should: text that is not move-shaped
fails chess.js's grammar rather than any move, and there is no move to name. The
prefix belongs to a dependency, so it is matched deliberately loosely -- if the
wording ever changes this stops matching and the message falls back to the one
that was shown before, which is the thing being improved on rather than
something worse.

**And a refused FEN says which field is wrong.** The same reading, one tab
over. This one starts from a better place: "Invalid FEN: kings cannot be
adjacent or missing" and "Invalid FEN: the side that is not to move is already
in check, which no legal game can reach" are two of the best sentences in the
app, and every bad input correctly disabled the button rather than failing after
a press.

But a bad side-to-move and a pawn on the last rank both came back with "Failed
to parse FEN. Check piece placement, side to move, castling rights, and
counters" -- four fields named, and no indication which. chess.js had already
said: `side-to-move is invalid`, `some pawns are on the edge rows`, `castling
availability is invalid`, `en-passant square is invalid`. All of it was thrown
away except a `/king/i` test. It is passed through now, in the same "Invalid
FEN:" shape the file's own two sentences use, with a full stop added because
those end in one and chess.js's do not.

One of the nine is deliberately *not* passed through, and finding out why was
the useful part. "Must contain six space-delimited fields" is what chess.js says
about text that is not a FEN at all, and a **test written in an earlier pass
pinned prose to the general message** -- `'not a fen at all'` must answer
"Failed to parse FEN". That pin is right: telling someone who typed a sentence
about space-delimited fields is worse than a message that at least lists what a
FEN is made of. The failing test was the thing that said so, and the rule it
forced -- name a field only when a field is what is wrong -- is better than the
one it replaced.

**A fetch that comes back with no games said it had fetched one.** The third
error surface, and the one that talks to the network. Five of its six answers
are the best writing in the app: a 404 gives "Lichess has no player called
“someplayer”", a 500 gives "Lichess is having trouble right now. Try again
shortly", a 429 names the rate limit and the minute to wait, an empty archive
says there are no public games, and a dropped connection says "Lichess could not
be reached. Check your connection — the board and the local engine keep working
without it", which answers the question a reader actually has.

The sixth was wrong. A **200 carrying something that is not a game** -- served
with a PGN content type, which is what a captive portal's sign-in page looks
like when it answers a fetch -- was reported as **"Fetched 1 game for
someplayer"**, and the text was pasted into the box as though it were the game.
`splitPgnGames` hands back any non-empty chunk it finds, and one chunk of
anything counts as one game.

Anything without a tag pair or a numbered move in it is not a game, and
`looksLikeGame` already knew how to say so -- it is what the FEN tab uses to
tell a game from a position. Filtered at the one place both sources come back
through, a body of nothing now yields no games, and the panel's existing
sentence for that fires instead.

Two things about the tests for it. They were written first against a `requester`
stub that does not exist -- the file's own option is `requesters`, keyed by
site -- and every one of them passed four games back regardless of the body,
which is the "measuring nothing" failure in its test-writing form. And the case
that matters is not the obvious one: a body holding a proxy's note *and* a real
game keeps the game and drops the note, which a filter written slightly
differently would have thrown away whole.

**A fetch that is never answered now gives up.** The engine has had a startup
timeout for a long time -- "did not finish starting. Check your connection or
reload to retry" -- and the network calls beside it had none. **Measured**
against a host that accepts the connection and then says nothing: "Fetching…"
stayed on screen at 400ms, at 1.5s, at 4s and at 9s, and would have stayed for
as long as anyone was willing to look at it.

Everything around that was already right, which is why it took a hanging host to
find. The button reads "Fetching…" and disables itself, a Cancel appears, Escape
closes the dialog, closing it aborts the request, and the board stays entirely
usable throughout -- a move played during the hang measured 176ms, which is the
compile and nothing to do with the fetch. The one gap was that the only way out
was dismissing the dialog, which takes whatever else had been typed into it.

Twenty seconds now, at the one place both sources go through, with the site
named: "Lichess did not answer in time. Try again, or ask for fewer games."
Verified end to end against the hanging host: "Fetching…" at 2s and 10s, and at
21s the button is back and the sentence is on screen.

Two things in the writing of it are worth more than the timeout. It is a
**race**, not a bare signal: a requester that ignores its signal -- a stub, or a
transport without support -- would otherwise hang for ever with the timeout
attached and doing nothing. And the timeout is checked **before** the
abort-passthrough, because a timeout cancels the request in flight and so comes
back *as* an abort; read the other way round, every timeout would be mistaken
for a reader changing their mind and the panel would say nothing at all. The
first version had that order wrong, and the only reason it showed was a test
stub written to honour its signal the way a real `fetch` does. A stub that
ignored the signal made the same test hang and pass nothing.

**One silent socket stopped every Lichess feature in the app.** The timeout
added for the archive fetch was an instance of a class, so the class was swept:
cloud evaluations, the tablebase and the opening explorer all had **no request
timeout either**, and all three go through one `fetch` in `lichessQueue`.

That queue is **serial** -- every request chains off the one before -- so a
request that never settles never lets the next one start. **Measured** in the
browser against a host that accepts the connection and then says nothing: one
hanging `/api/cloud-eval` at 3.5s, and after it, navigating four plies asked for
**nothing**, and pressing Fetch sent **no request at all** -- the button sat at
"Fetching…" while its request waited behind a cloud evaluation that would never
arrive. Not one panel stuck: every one of them, until the page was reloaded.

Ten seconds now, at that one `fetch`, shorter than the archive's twenty because
these are small JSON reads and each is holding the queue while it waits. Same
shape as the archive's: a race rather than a bare signal, and the timeout
checked before the abort passthrough. Measured after: the first request gives up
at 13.5s and the next goes out immediately, the second at 23.5s and the archive
request goes out behind it. The features recover instead of being dead until
reload.

**Two existing tests had to change and both were asserting the wrong thing.**
They pinned the caller's `AbortSignal` as being *the same object* handed to
`fetch` -- which the queue can no longer do, because it needs its own controller
to cancel a request without cancelling the reader's. Identity was standing in
for behaviour, and the behaviour it stood for is already driven end to end by
the test directly beneath each of them ("does not cache a response aborted
during parsing", "does not return text when the request is aborted during
parsing"), both of which still pass untouched. The first replacement written for
them was also wrong -- it aborted *after* the request had resolved, by which
time the listener is deliberately gone -- which is worth writing down as the
same lesson one more time: a test that cannot fail for the reason it names is
not a test.
**A shared link cut short showed half a game and said nothing.** A game link
was copied, opened the way somebody receiving it would, and then damaged six
ways. The intact link brings back exactly what was sent, and a link whose
payload is corrupted or replaced answers "That shared link could not be read —
showing the starting position". But a link **cut short** — which is what a chat
app does to a long URL, and the failure this app's `hashCarriesShare` work was
about — came up with **six of eight moves, three of eight, six of eight**, and
said nothing at all. Whoever opened it had no reason to think anything was
missing.

Playing as far as a damaged link really goes is deliberate and right; the
decoder says so in its own words, and six moves beat none. The gap was the
sentence. It is there now: "That shared link was cut short — showing the 6 moves
that survived it", and an intact link still says nothing.

Finding where to detect it took two tries. The obvious signal -- the replay
stopping before the end of the decoded moves -- never fires, because the loss
happens one step earlier: `"…g1f3 b8c"` is two tokens and one move, and the
normaliser drops the broken one before the replay ever sees it. The decoder now
keeps the count of what arrived beside the count of what it could read, which
is the only place the difference still exists.

**Opening a games database froze the app for a minute.** "Open PGN File" invites
a database, and that is exactly how Lichess and chess.com hand games over — by
the thousand, in one file. **Measured** at 4x CPU on the production build,
pressing "Add N games to the library" on an empty library that holds 500:

| the file | the button offered | frozen for |
|---|---|---|
| 500 games, 0.16 MB | Add 500 games | 2.5s |
| 2,000 games, 0.64 MB | Add 2000 games | **9.2s** |
| 14,276 games, 4.60 MB | Add 14276 games | **64.7s** |

Not slow — *stopped*. Nothing painted, nothing answered, for sixty-five seconds
of a one-press action, on a screen still showing a button that looked pressable.
The cost was flatly linear in the size of the **file**, which is the tell: every
game in it had its whole move tree built by `parsePgnMoveTree` before the loop
reached the line asking whether there was anywhere to put it. 13,776 of those
14,276 parses were thrown away the instant they finished.

The check moved ahead of the read, and what is past the cap is now counted
rather than parsed. All three sizes are flat at **~3.1s**, which is the honest
price of parsing the 500 games actually kept — 626ms unthrottled, and the only
thing left in the profile (the variant check is 1ms, naming 5ms, building the
records 4ms). What the reader is told afterwards is unchanged, word for word:
"Added 500 games to the library; 13776 games left out — the library holds 500."

The guard counts rather than times, because a stopwatch assertion is a machine's
opinion. Its file is 520 playable games followed by 40 with illegal movetext:
reading the whole thing reaches the broken ones and names them, stopping at the
cap never sees them. Before the fix the app said "40 games could not be read, 20
games left out"; after it, "60 games left out". A note that can name those games
as unreadable is proof the file was read long past the point of any use — at any
speed, on any machine.

The first fixture measured with was **worse than useless**: its movetext had an
illegal `22. Bxh5` in it, so all 500 games came back "No readable game was found
in that file" and the timings were of parses failing rather than parses
succeeding. It was caught by the app's answer being wrong, not by the numbers
looking odd — they looked entirely plausible. Every fixture since is checked
against `parsePgnMoveTree` before it is measured with, and the checker is itself
shown rejecting the bad one.

**"Up to 5 MB" refused a 4.86 MB file.** Two ceilings guard the import and they
were not the same number: the file is checked at `5 * 1024 * 1024` bytes, and
the text it decodes to at a round `5_000_000` characters — 4.77 MiB. A PGN is
one byte a character, so everything in the 243 KB between them passed the size
check, was read into memory in full, and was then refused by a sentence naming
a limit it was under. **Measured**: a 5,100,051-byte export, 4.86 MB by the
reader's own file manager, answered "PGN import supports one game up to 5 MB.
Choose a smaller file." There is no smaller file to choose and no way to work
out what would be small enough.

The character ceiling is now the byte ceiling, so the sentence is true: a
5,120,020-byte file that used to be turned away now opens (15,145 games, offered
to the library), and a 5,300,090-byte one is still refused, which is what "up to
5 MB" means. UTF-8 spends at least one byte a character, so this gate never lets
through anything the byte gate would have caught.

Both existing tests for the limit passed throughout, and could not have done
anything else: each builds its input out of `MAX_PGN_IMPORT_CHARS` and so moves
with it, however far it drifts from the size the reader is told about. The guard
added is measured against the *sentence* — it reads the number out of the
message and requires a file of exactly that size to be accepted.

**The paste box was given a database to lay out.** A textarea lays out every
character it holds, seen or not. **Measured** at 4x CPU, setting a value on a
600x240 box: 220 KB costs **73ms**, 900 KB **299ms**, 4.9 MB **1639ms** — all of
it spent on the twelve lines of a 15,000-game export that fit on the screen, in
a box whose contents nobody can read, edit or scroll to any purpose. Opening a
4.88 MB file took **2404ms** end to end before the reader could do anything with
it. Everything else in that path is cheap by comparison: scanning the text for a
second game is 1ms, splitting 4.67 MB into 17,228 entries 29ms.

Past the largest single game the library will take — `MAX_LIBRARY_PGN_LENGTH`,
so anything the box is still useful for is still shown — a loaded file is now
described instead: "2,200 games · 667 KB · too much to show here", with the file
name above it, the offer below it, and a **Clear** that gives the box back. The
same 4.88 MB file opens in **720ms**. A paste is deliberately left alone: the
browser has already laid it out before React hears about it, so replacing it
would take the reader's own text off the screen and save nothing.

The guard opens two files, one either side of the ceiling. Only checking the big
one would pass just as well for a rule that hid the text at any size and took
the paste box away from the case it exists for.

**Three seconds at a button that still looked unpressed.** What is left after
the two fixes above is the honest cost of the work: parsing the 500 games the
library keeps, 3.1s at 4x CPU, on the thread that draws. **Measured** by
sampling the button's own label on every frame the browser got to draw between
the press and the answer: **there were none**. The label never changed, nothing
else moved, and the first sign that the press had registered was the result.

The press now sets the label to "Adding…", disables the button, and waits two
animation frames before starting — long enough for that to be painted. The wait
is exactly as long as it was; what changed is that the reader can see it is a
wait. The guard reads the set of labels drawn across those frames and requires
"Adding…" to be among them; without the two frames the set is empty.

**Dragging a PGN onto the board took the reader off the page.** The app had no
drag handling at all — no `dragover`, no `drop`, nothing in the source.
**Measured** by listening at the window and dragging a `.pgn` over the board
through the browser's own drag machinery: `dragenter` and two `dragover` events
arrive, **cancelable and uncancelled**, and then **no `drop` event is delivered
at all**. That is the whole mechanism. An uncancelled `dragover` is how a page
refuses a drop, so the browser keeps the file and does what it does with a file
no page wanted: opens it, in place of the app. Next to a button that says "Open
PGN File", dragging one onto the board is the obvious thing to try, and it lost
the screen it was tried on.

A drop is now taken. The dialog is opened with the file already read, rather
than the board being changed behind the reader's back — a drop is a proposal,
and the dialog is where proposals are looked at, and where the size limits, the
"this file holds several" notice and the offer to keep them all already live.
The picker and the window end up in the same function, so a dragged file meets
exactly the same limits and messages as a chosen one: measured, a single game
lands in the box (314 characters, named), a 30-game file lands with "Add 30
games to the library" beside it, and a shopping list named `.txt` lands as its
own 25 characters, all with the app still on screen.

Only drags carrying files are taken, so a piece dragged across the board is
untouched — the suite's two touch-drag checks pass unchanged. The guard asserts
the **drop event itself**: it cannot be delivered unless something cancelled the
`dragover` before it, so a run where the file reaches the dialog is a run where
the browser was never going to navigate. Before the fix that count is zero.

**Back left the app instead of closing the sheet.** The app touched browser
history nowhere at all — no `pushState`, no `popstate`, nothing in the source —
so it did what an app that ignores history does. **Measured** at 390x844 with a
move played on the board and each of three sheets open in turn:

| open | Back lands on | the sheet | the app |
|---|---|---|---|
| the PGN dialog | `about:blank` | gone | gone |
| the library | `about:blank` | gone | gone |
| the command palette | `about:blank` | gone | gone |

Coming Forward again met the auto-save recovery prompt rather than the board.
On a phone these sheets fill the screen and read as pages, so Back is exactly
the gesture that gets tried on them — and it took the reader out of the app,
mid-game, three times out of three.

One history entry is now pushed when the first sheet opens and taken back when
the last one closes. Back closes the sheet and the board is left byte for byte
where it was (e2 and e4 measured before and after). The entry is only taken
back when it is still the current one, so anything that pushed over it — a
shared link followed from inside the app — keeps its place.

Both halves are guarded, because the careless version of this fix is worse than
the defect it fixes: after a sheet is opened and closed the ordinary way, **one
more Back still leaves the app**. A history trap would pass every assertion
about closing sheets.

**The promotion chooser was too small to hit, sideways.** Nothing had ever
checked it: it exists only between a pawn reaching the last rank and the piece
being chosen, so the suite's sweep of every control has never met it.
**Measured** on a white pawn on b7 at five sizes:

| viewport | each piece | Cancel |
|---|---|---|
| 1440x900 | 94x91 | 398x**34** |
| 390x844 | 65x91 | 284x**34** |
| 320x568 | 48x91 | 214x**34** |
| 844x390 | **31**x91 | 147x**34** |
| 667x375 | **27**x91 | 134x**34** |

Cancel was under the 44px floor everywhere — the one target in the app the
sweep could not see — and sideways on a phone the four piece buttons were 31px
and 27px wide, because the chooser is sized by the board and the board is 203px
wide there. That is the press that decides what a pawn becomes.

Cancel is 44px, and in landscape the chooser is sized by the window instead of
by the board: 94px a choice at both landscape sizes, everything else unchanged.
Everything the chooser already did well it still does — it appears in under
450ms, sits wholly on screen at every size, opens with focus on Queen, and
Escape puts the pawn back on b7.

**Widening it put it behind the analysis column**, and two probes in a row said
otherwise. `elementFromPoint` reported the buttons on top and a real click
landed on them — hit-testing did put the chooser first — while the screenshot
showed a sliver with a "Q" in it and the panel over the rest. `.board-stage` is
`position: relative; z-index: 1` and `.panel` is `z-index: 4`, so nothing
inside the stage paints above a panel whatever z-index it asks for; the
overlay's own 3000 changed nothing at all. The stage is lifted to 2500 while a
promotion is pending, and only then.

Comparing **pixels** was the second wrong answer. Capturing the same rectangle
with the chooser up and again once it is gone, and requiring them to differ,
passes with the fix backed out: the panels re-render when the position changes,
so that rectangle differs either way. What is asserted instead is the rule that
decides paint order — wherever the chooser overlaps a panel, the stage must sit
above it — which fires at 844x390 and 667x375, names both panels, and stays
silent at 390x844 where the chooser is inside the board and the stage being
underneath is correct. It is guarded in turn: a flat comparison of z-indexes
across two different parents is only meaningful while nothing between the stage
and the shell starts a stacking context, and the check says so and fails if
that stops being true.

---

## Refuted

Each of these was gone looking for, measured, and not found. Ordered by how
plausible it had seemed.

**The Export tab's four options.** All four were suspected of being decoration
after a first probe showed three of them changing nothing. They were measured
against a game that could not tell them apart -- no variations, no comments, no
glyphs -- and the fourth "change" was the engine's evaluations still arriving.
Re-measured against a game built to hold all four (33 plies, a side line at
every move, a comment and a glyph on each), from 20,189 characters: Variations
drops 17,337, Comments 14,409, Engine evals 1,768, Glyphs 777, and every one
comes back byte for byte. Worst toggle 88ms at 6x CPU.

**Rotating a phone.** 390x844 to 844x390 and back, plus 320x568, 1440x900 and
a drag across the 900px breakpoint: the board resizes with the window every
time (374 to 203 to 374, 687 on a desktop), no long task, longest frozen frame
**29ms**, no sideways overflow at any size, and nothing left off the screen
except the two skip links, which are off it until they are focused.

**The library at the cap it now reaches easily.** 500 games in, through the
app's own import: the dialog opens in ~0.5s, renders 100 rows a page, filters
on every keystroke without a keystroke costing more than 80ms, and scrolling
the whole list holds at a 52ms worst frame -- all at 4x CPU.

**Motion the reader asked not to see.** With `prefers-reduced-motion: reduce`
emulated, every element on the board, the PGN dialog, the library and the
command palette was swept for a computed animation or transition longer than
50ms: **zero**, on all four, and none of them outside `.app-shell`, which is
what the blanket rule is scoped to. The same sweep with the preference off
finds 56 to 68, so it discriminates.

**The meta strip's clipped move number.** In landscape the strip is the board's
width, 203px, and its two remaining readings want 138px in the 120px left
beside the Draw button, so "Move 1" is drawn as "Mov". It is not a defect: the
row is deliberately a scroller below 900px, with a fade at its edge to say so,
and the reasoning is written into the rule -- the readings keep their own
widths rather than shrinking each other to nothing, which is what they did at
320px before. Nothing was changed.

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

**The engine does not cost the interface anything — and the first measurement
of that was worthless.** The claim is right; how it was first reached was not,
and the failure is a good one to have written down.

The original sweep compared "engine idle" with "engine searching" and told the
two apart by whether a **Stop analysis** button existed. That button exists
while the engine is idle. And the default search finishes in about 150ms:
polled every 90ms after pressing Run analysis, `status analyzing` appears in
**one sample out of forty-four** and `ready` in the other forty-three. So the
sweep compared idle with idle, forty times over, and every delta it printed was
noise reported as a result.

Re-measured with the state asserted rather than assumed — `continuousAnalysis`
seeded on so the search does not end, and `.status.analyzing` counted at every
step of the sweep. Engine verifiably searching, **6 of 7 samples**: every
interaction between 24 and 72ms. Engine verifiably idle, **0 of 7**: 16 to
32ms. Both are far inside the 200ms bar, and the gap between them is tens of
milliseconds.

The conclusion had a second leg all along, which is why it survives: a full
**116-position review** at 4x CPU on a phone viewport, whose running was never
in doubt because it finished 116/116 while being clicked through, kept the
worst interaction at 96ms against 88ms before it started. That is the
measurement the claim rests on now.

What made the first version fail is worth more than the number: the signal it
chose was a control's *existence*, and a control that is always rendered can
never say what state the app is in. The class the app puts on its own status
row can.

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

**Nothing is slow on a low-end phone either — and two rows of the first table
were measuring nothing.** The whole interaction set was swept at **6x** CPU with
a 116-ply game loaded. The first version reported 0 of 14 over 200ms with a
worst of 120ms, and two of its rows were no-ops: importing a game lands on its
*last* position, so the two `ArrowRight` presses moved nothing and timed an app
that had been asked to do nothing.

Re-run from the first move, with a fingerprint of the app taken before and after
every interaction — the current ply, the board, the orientation, which dialog is
up, which tab is lit, where the move list is scrolled — and each one required to
have changed something: **13 of 14 verifiably did work**, and the worst is
**128ms**. Higher than the number it replaces, on interactions that actually
happened, and still comfortably inside the 200ms bar. The fourteenth is a move
played into a position that had been navigated away from, which is the probe's
limit rather than the app's.

This is the fourth time in this pass a reading has been retracted for measuring
nothing, and by now the shape is clear enough to state as a rule: **a latency
number is only worth as much as the proof that the interaction did something.**
An event fires, an entry is recorded and a duration is printed whether or not
the app moved. The fingerprint costs one `evaluate` per step and turns the whole
class of failure into a visible line of output.

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

**Handing the empty squares to the browser costs nothing, and breaks nothing.**
Two things had to be checked about the change above, because both would have
been introduced by it rather than found by it. `:has()` is re-evaluated as the
DOM changes and the board changes on every move, so sixteen moves were played
against the shipped build and against the same build with the `@supports`
condition falsified: **median interaction 24ms either way**, p90 32 against
40ms, one long frame each, and no long frame reporting more than 1ms of style
and layout. And the second tap of a two-tap move lands on an *empty* square,
which is exactly the one now handed to the browser — tapped with 0, 2, 4, 6, 8
and 10px of drift, straight down and diagonally, the move landed every time.
The guard now covers that second tap at 8px, which is where a drag takes hold
and so where a pan would if one were going to.

**The library survives having its storage taken away, and says so only when it
should.** Three ways of breaking storage, all measured in the browser.

Three malformed records written straight into the object store -- one missing
every field, one with a number where the PGN goes and a string where the date
goes, one with nulls -- and after a reload the library reads **"5 games · 580
ply · 3.8 KB"**: the bad rows are validated out on read, the count is right, and
nothing crashes.

`localStorage` made to throw on access, which is how a locked-down context
behaves: the board keeps working and an alert appears reading "Latest changes
are not saved for recovery. Browser storage could not save this game. Download a
PGN before closing this tab", with **Download recovery PGN** and **Retry
autosave** beside it. The problem, the consequence, and two ways out.

`indexedDB` made to throw: the library still saves, and the saved game is
**still there after a reload** -- there is a real fallback, so "Saved to the
library" is a promise it can keep. And with **both** gone, the save still
succeeds, and *now* a warning appears: "This browser is not letting the page
store data, so saved games last only until this tab closes. Export the library
to keep them." A reload then finds nothing, exactly as promised. The warning is
absent in the case above it, because there the save really was durable. The
sentence tracks the truth rather than the API.

The probe took three attempts to be worth anything, which is the part worth
keeping. The first "blocked" stub called the native `open` and fired an extra
error event beside it, so the real request still succeeded -- a save went
through while the probe reported the store was blocked. It was caught by the
result being too good: a save cannot succeed against a store that is not there.
The second attempt could not tell its own stub from a working browser. Only the
third checked, from inside the page, that reading `window.indexedDB` actually
threw before believing anything that came after it.

**The two long local operations are both well made.** Having swept the network
for calls that can hang, the same question was put to the work the app does
without a network. A **116-position review** at 4x CPU reports 16/116, then
92/116, then 116/116, and carries a stopper the whole time labelled **"Stop game
review. 20 of 116"** -- the count is in the button, so the thing that says how
far it has got is the same thing that stops it. **Adding 200 games** to the
library takes under a second, which is why it needs no stopper at all, and the
number it reports is true: the dialog says 200, the object store holds 200.

The library shows 100 of them, and that had every appearance of half a
collection being unreachable until the probe was made to look at more than the
row count. There is a **"Show 100 more"** button under the list, the header
reads **"200 games · 23200 ply · 154.0 KB"**, and searching for the two
hundredth game by name finds it. The total, the page and the way to the rest are
all on screen; only the first probe was not.

**The header's "+N" is the material, and it is right.** Computed from the
board's own labels at seven plies of the sample game and compared with the badge
beside the move number: **6, 4, 5, 3, 3, 3 — matching every time**, and no badge
at all at the ply where material is level, which is the better half of the
design. It reads oddly next to an evaluation of -0.9, and that is only because
the two measure different things.

**A drill reads correctly.** Started for White at ply 40 and given a wrong move:
the header badge reads "Not the line · 1/58", the card reads "Playing White ·
move 1 of 58" and "Not the line. Try again.", the eval bar reads -2.2 against
the coach's -2.23, and the winrate card reads 30.6% against the coach's "31% for
White". Every number in the state agrees with every other. The engine's arrow is
still drawn during a drill, which looks like it is giving the answer away and is
not: the drill follows the game's line and the arrow is the engine's own
opinion, which is a different move.

**"Stop" is enabled with nothing to stop, and that is the right call.** It is
the one transient control in this app that is not disabled when it cannot act --
the navigation before a move exists, Hint before an engine, Take back and
Resign before a move, `bench` behind its expert box are all disabled, most of
them with the reason in the label. **Measured**: `Stop` is enabled before a
search, during one, and after, and pressing it while idle changes nothing.

The reason to leave it is in a number from earlier in this pass. A default
search ends in about 150ms -- polled every 90ms, `status analyzing` appears in
one sample out of forty-four -- so a Stop that disabled itself outside the
search would spend almost all its time disabled and flicker on for a frame at a
time. A control that cannot be pressed because it is only enabled for 150ms is
worse than one that is always enabled and sometimes does nothing.

**Three more states read, and all three of the things that looked wrong were
right.** The reading lens that found the two cards above was pointed at the
states nothing had rendered before -- a finished review, the Engine Lab, and a
timed game against the engine -- and this time it caught only itself.

In a live game the bottom bar grows a row reading "Pause" and "SPEED · Slow ·
Normal · Fast · Step", which looks exactly like the autoplay cluster appearing
where no autoplay is running. The accessible names say what it is: **"Pause AI"**
and **"Set AI speed to Slow"**. The visible text is truncated and the row beside
it disambiguates, so a reader has more to go on than a screenshot does.

The Engine Lab's `bench` and `perft 3` are drawn in the danger colour under an
unchecked "Enable expert commands" box, which reads like two live buttons
styled as a warning. They are **disabled**, and they carry the reason -- "Expert
mode only: these commands take the engine over for a while" -- and ticking the
box enables them. `d` and `eval` beside them are live, and against the real
engine they return a board diagram and NNUE piece values.

And running a command grows two more buttons labelled `d` and `eval`, which
reads like the quick row having been duplicated. They are a **re-run history**
in `.lab-history-list`, and at 32px they are under the bar -- on a **desktop**,
where 44px is not the bar. At 375px they clear it, which is the scoping every
other rule of its kind in this app uses.

Worth keeping for the shape of it: the history chips only exist *after* a
command has been run, so no static sweep could ever have seen them. The check
that found them ran the commands first. A control that a sweep cannot reach
until it has interacted is invisible to a sweep that does not.

**Everything else that is shown twice agrees.** The winrate card was found by
eye, so the class it belongs to was then swept on purpose: every quantity this
app displays in more than one place, read at six plies of a 58-move game and
compared. The evaluation, on the bar and in the coach: -0.9/-0.87, +0.1/+0.07,
+1.4/+1.44, +3.1/+3.10, -2.0/-2.02, -2.0/-1.96 — agreeing to the rounding. The
best move, in the coach and in the status bar: the same at every ply. The
winrate, after the fix below: the same at every ply. And the review report
checked against itself — overall **95.8** against a White of 95.3 and a Black of
96.3, whose mean is 95.8; **116 grades over 116 moves**, adding up exactly;
116 review rows for 116 chips.

So the card was the only one of its kind within reach, which is worth knowing:
the value of the sweep is not that it found a second, but that it says there
isn't one.

**Every stop on the keyboard announces itself.** Fifty distinct controls
reached by tabbing through the app at 1280x900, each compared against a
snapshot of its own resting style rather than against its neighbour: **fifty of
fifty** changed something visible — an outline, a shadow, a border or a
background. Driven by real Tab presses rather than a forced pseudo-state,
because Tab is what a keyboard reader does and it is the only thing that puts
Chrome into the modality where `:focus-visible` applies.

**And everything visible can be reached.** Of 22 controls on screen at 1280x900
and 17 at 375x667, every one that Tab never reached was `disabled` — the
navigation buttons before a move exists, the hint, the take-back and the
resignation. A disabled control not taking focus is the platform working.

**The on-screen keyboard is survivable.** Android hands a page a shorter
viewport when the keyboard opens, and at 375x340 with the import dialog's
textarea focused the field sits at y=397..577 — entirely below the fold, which
is the shape of a real defect: typing into a box you cannot see. It is not one.
`.dialog-body` is a working scroller (194px of 579), `scrollIntoView` puts the
field back at y=64..244, and scrolling the focused editable into view on a
viewport change is what the browser itself does. The library's rename field and
the palette's search box do not even need it — both re-centre on their own, to
y=96 and y=92. What this instrument cannot reproduce is the browser's own
scroll, so what is recorded is that the room to do it exists, not that the
browser did it.

**Turning animation off does not turn the feedback off.** Under
`prefers-reduced-motion: reduce`, seven indicators lose their animation by
`!important` -- the analysing bar, the thinking dots, the lazy-dialog spinner,
the pulsing primary button and three status glyphs -- which raises a fair
question about whether a reader who asks for less motion is still told the
engine is working. They are: the status row carries the class `analyzing` and
the word "analyzing", and neither is an animation. The bar's `active` class
lands at the same moment. Nothing about the signal depends on something moving.

**The deeper actions are quick too, and this time with proof of work.** Twelve
of them at 6x CPU on a phone -- playing a move, the reply, a third, taking one
back, starting autoplay, navigating, switching into Analysis, opening the
library, saving a game to it, closing it -- each required to have changed the
app's fingerprint before its latency counts. All twelve did work and **none
passed 200ms**; the worst is the first move at 192ms, which is the compile
above, and the rest sit between 16 and 136ms.

**Branching costs what the first move costs, once.** Playing an alternative at
ply 8 of a 116-ply game builds a variation -- 116 chips to 117, no variations to
one -- and the first one measures **240ms** at 6x CPU, which is over the bar.
The second, third and fourth measure **96, 88 and 88ms**. That is the same
signature as the board's first move and the same cause: the path is being
compiled, not the tree being slow to mutate.

Two things in that sweep looked like defects and were the probe. Autoplay
appeared to have no way to stop -- the click timed out -- and in fact **"Stop
autoplay" is right there** the moment it starts, beside three speed controls;
the selector had matched something else that was not actionable. And a loop
that clicked each piece and read its legal targets found *nothing selectable*
anywhere on the board, because a React state change is not visible inside the
evaluation that caused it. One click per call, and the same loop finds a move
immediately. That quirk was already written down in this repo's notes, which is
the more useful half of the story.

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

**Two timing tests fail under load.** `__fuzz.test.ts > survives: many braces`
bounds one parse at an absolute 1000ms, and `importRobustness.test.ts > grows
about linearly` divides a 400,000-character parse by a 50,000-character one and
requires the ratio under 24. Both failed in one `npm run verify` during this
pass — 1220ms, and a ratio of 187 — and both passed on their own immediately
after, as did the full suite on a re-run. Nothing in that iteration touched the
parser. The second is the more fragile: its denominator is a sub-millisecond
measurement, so a single scheduling hiccup there moves the ratio by an order of
magnitude. Recorded rather than changed, because a bound loosened to survive
load stops guarding what it names.

**On a phone the board was a dead zone for scrolling — and this entry was
wrong.** It is left here with its correction because the reasoning failed in an
instructive way. **Measured** at 390x844 with a game on: `.main-container`
holds 1061px of content in 558px, and of thirteen sample heights down it only
three scrolled — one strip above the board and two below.

The conclusion drawn at the time was that `touch-action` was not the cause,
because forcing `.board-wrap` to `pan-y` freed nothing. That measurement was
taken while a drag still took hold after **1px** of movement, so the sensor had
claimed every gesture before the browser could look at it. Once
`dragActivationDistance` was 8, the same experiment read differently — and the
honest fix is narrower than `pan-y` on the whole board anyway.

Only a square with a piece on it can start a drag. Handing the rest back is not
a race: `touch-action` is intersected from the touched element up through its
ancestors, so a piece's `none` still wins wherever a drag could actually begin,
and it is settled at touch-down rather than fought out over the first few
pixels. Measured with a finger that starts slowly, 2px at a time: eight of
eight drags in eight directions still play, three of three taps still select,
all eight sampled empty squares scroll, and none of the six sampled squares
holding a piece does. Behind `@supports selector(:has(*))`, because a browser
that ignored only the second rule would hand the whole board to the scroller,
which is worse than the dead zone.

The lesson is not about touch. A limit recorded in one pass was measured under
a condition another pass then changed, and nothing connected the two. Every
entry in this section is a claim about the app *as it stands*, and this one
stopped being true the moment a different commit landed.

**One blocking touch listener, and it costs nothing measurable.**
react-chessboard's dnd-kit `TouchSensor.setup()` registers a *noop* `touchmove`
on `window` with `passive: false` — its documented workaround so
`preventDefault()` works in dynamically added handlers on iOS Safari. Removing
it would break dragging a piece, so it stays; the question was what it costs.
Until the board could scroll at all there was no surface to measure it on.
Now there is: swiping up from an empty square, eight times each way, the touch
reaches the scroller in a median **40ms as shipped and 41ms with every touch
listener forced passive** — no difference.

The case where a blocking listener costs the most, a main thread already busy,
**cannot be measured with this instrument at all**: any `setInterval` spinning
on the thread stops `Input.synthesizeScrollGesture` from scrolling anything, in
every configuration, at 12ms of work in every 60 as readily as at 40. That is
recorded rather than reported as a result, because "nothing scrolled" reads
identically to the defect.

**The engine reboots on every switch into Analysis.** **Measured** with the
real engine: 484, 461, 460, 459ms, four times running. Keeping it warm across
the switch would mean holding an idle WASM instance beside the one Play mode's
own opponent uses, which is a phone's memory spent to save a toggle, and the
reader is told it is loading while it happens.

**A phone shorter than about 500px still scrolls to its back rank**, and **a
small phone on its side gets squares under 24px**. Both carried over unchanged
from the fourth pass, where the reasoning is.

They were re-measured here, because sizing the shell in `dvh` gives the board
*less* room than the fourth pass had: on a phone showing its chrome the shell is
now the 60 to 115px shorter thing it always should have been. A headless
viewport of H is exactly what `dvh` resolves to, so the small height is how that
phone is reproduced. The board does shrink — 367 to 343px on an iPhone 15, 307
to 212 on an SE, 288 to 192 on a small Android, 216 to 192 at 320 wide — and at
every one of those heights the squares are **24px or more**, the back rank is
reachable, and the move-navigation bar is on the screen. Two of them land on
24.0px exactly, which is the floor from the fourth pass doing its job rather
than a coincidence. Nothing went under it.

---

**One thing recorded and not changed.** The coach renders search depth as
`D22`, which is also a valid ECO code — and this app prints ECO codes two cards
away, in the same letter-and-two-digits shape. The regex written to find ECO
codes in this sweep matched the depth, which is weak evidence but not nothing.
Under its own "POSITION DEPTH" heading it is unambiguous, and `D${depth}` was
written deliberately, so it stays; noted because the next reader to see `D22`
beside `A00` deserves to know it was looked at.

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
