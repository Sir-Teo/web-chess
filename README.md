# Web Chess 1.0

A browser chess app for playing, importing, and reviewing games with Stockfish-powered analysis.

## Features

### Playing

- **Play and watch modes**: Play human vs human, human vs Stockfish, or AI vs AI with adjustable difficulty, pause/resume controls, speed control, and single-step playback. At *Maximum* the opponent searches on every thread the device can spare — the levels below it are capped by Elo, where extra threads buy nothing — and the panel says so. The two weakest levels vary their play by choosing among the engine's own top lines within a small window of the best, not by playing a random legal move: a Beginner that hangs its queen every third move is not one a learner can learn from. With a clock, a takeback, premoves and a resign button below, a game against the engine is a game rather than a position trainer.
- **A clock**: Pick a time control when you start a game — bullet through
  classical, or none, which stays the default. Both clocks sit in the strip
  above the board, the side to move is highlighted, tenths appear under ten
  seconds, and running out ends the game and records it in the PGN result. The
  engine plays to the clock rather than to a stopwatch: it takes a share of what
  it has left, so it cannot flag itself in a bullet game, and it uses a long
  clock when there is one to use.
  `Space` pauses the clock as well as the AI, and stepping out to Analysis stops
  it rather than letting it run while you consult the engine.
- **Premoves**: While the engine is thinking, drag or tap your reply and it is
  held, both squares ringed, then played the instant the position arrives. A
  premove the engine's reply made illegal is dropped without comment, a pawn
  reaching the last rank promotes to a queen without asking, and clicking
  anywhere else cancels — the same rules every other board uses, because they
  are the ones a premove has to follow to be worth having.
- **Hint**: `H`, or the button in Play mode, asks the engine what it would play
  and draws it on the board in the green the analysis side already uses for
  "the engine likes this". Asked at *full* strength rather than the opponent's,
  because the question is what the best move is — the engine is back at its own
  setting by its next move, which the tests check rather than assume.
- **Take back**: One button in Play mode, undoing back to the last position you
  were asked to move from — both plies when the engine has replied, one when it
  has not, and disabled with a reason when there is nothing of yours to undo.
  The move you took back stays in the game as a variation, and the clock is not
  refunded.
- **Who is up material**: A pill in the strip above the board reads "White +3"
  whenever the material is uneven, with what each side has taken spelled out in
  words for the tooltip and the screen reader. Counted from the position the
  game started from, so a FEN pasted in does not open fourteen captures down,
  and read from the board rather than the moves, so it is right in a variation
  and at any position you navigate to.
- **Resign**: Concede the game rather than playing a lost position out to mate
  or waiting for the clock. Two clicks — Resign, then Confirm? — and never a
  keyboard shortcut, because one keystroke should not end a game. Against the
  engine it resigns for you whoever is on move, so you can give up in its
  thinking time; on a shared board it resigns for the side to move. The game
  ends properly: the clock stops, the board locks, the result is written, and
  the review is offered.
- **Move sounds**: A knock when a piece lands, heavier for a capture, a two-part
  knock for castling, and tones for check, promotion and the end of the game.
  Synthesized in the browser rather than shipped as audio files, and off with
  one switch in Settings. Moves you *navigate* to are silent — scrubbing a
  60-move review with the arrow keys should not be a hundred knocks.
- **A review offered where the game ends**: when a game finishes in Play mode
  the result card offers to review it, rather than leaving you to find the
  Review tab yourself.
- **A word after a blunder, while it can still be taken back**: against the
  engine, a move that gives up a lot is pointed out as it is made — "Qh4 looks
  like a blunder: it gave up about 3.0 pawns", or "walks into a forced mate" —
  with the take-back beside it. Judged from the opponent's own two searches,
  the one before its last move and the one after your reply, so it costs no
  search of its own; and because the first of those is the engine's *best*
  line, a weak level that chose a worse move on purpose can only make the
  nudge miss a mistake, never invent one. Mistakes and blunders only, on the
  review's own ladder, and off with one switch in Settings.

### Studying

- **Beginner and pro analysis**: Coach mode keeps the right panel focused on plain-language move guidance — it opens with the evaluation *in words*, "Black is slightly better · 46% for White", rather than with `-0.48` — while Pro mode exposes MultiPV, WDL, cloud evals, opening stats, tablebase moves, and UCI controls.
- **Search diagnostics for pros**: Pro mode reports ordinary and selective depth, nodes, NPS, transposition-table occupancy, tablebase hits, and elapsed time from Stockfish's live UCI output, so Hash and Syzygy settings can be judged from evidence rather than guesswork.
- **Game review, of the line you are on**: Import a PGN, run a review pass, filter critical moments by side, inspect accuracy, and jump from a review row back to the board. The review follows the branch the board is standing in, so a variation can be reviewed like the game — and when that is not the main line it says so. Accuracy and move labels are scored on winning chances rather than raw centipawns, so an imprecision in a decided game is not called a blunder. The labels are the ones readers arrive knowing: *Book* while a sound move stays in the opening table, *Best* for the engine's own move and nothing else, *Excellent* for one that gave up almost nothing, then Good, Inaccuracy, Mistake and Blunder — so a row never reads "Best e4" beside a move it also calls Best. A best-move hint appears only once a search deep enough to grade the move has run; the 70 ms import sweep's choice is not one.
- **Practice critical moments**: In Coach mode, a critical mistake becomes a
  playable retry. Engine answers and candidate arrows are hidden, wrong moves
  snap back without adding junk variations, and the answer appears after two
  misses. Promotions are graded exactly, including the chosen piece. Done
  returns to the game, so the next critical moment is where you left it — the
  solved line stays in the tree as a variation.
- **Time trouble, in the review**: A move's clock reading rides with it — read
  from `[%clk]` on import, recorded from the running clock in a timed game, and
  written back out. So a review of a real blitz game shows *0:07* beside the
  blunder, which is the explanation the centipawns never carry.
- **Steppable engine lines**: Click any move in a principal variation — in the
  Lines panel or the Coach card — and the board walks into the line up to that
  move. It lands as a variation like any other, so it can be reviewed, promoted
  to the main line, or discarded.
- **See a line without playing it**: point at any move in a principal
  variation — in the Lines panel or the Coach card — and the board shows that
  position, ringed in green, with the move that reached it drawn on. Nothing
  else moves: not the evaluation, not the move list, not the engine. Take the
  mouse away and the board is back. Clicking is unchanged and still walks the
  line into the game as a variation, so reading three lines no longer means
  committing to three branches and navigating out of each. Borrowed from
  Nibbler, which answers the same question the same way.
- **Threats**: `T`, or the button in the Coach card, asks what the opponent is
  threatening — a null-move search, drawn on the board in violet so it reads as
  neither the move that was played nor a move the engine recommends.
- **Play from here**: On both analysis tabs — including Review, next to the
  critical moments, which is where the reader who wants it actually is. Hand the
  position on the board to the engine and take the
  move yourself — to try a critical moment again, or to see whether you can
  convert the endgame the review just graded. New Game always starts from the
  initial position; this does not.
- **Variations you can manage**: A move played from a mid-game position becomes
  a variation. Promote one to the main line and the review, the accuracy
  summary, both graphs and the exported PGN follow it; discard one and it is
  gone from all of them. The move list shows the branch you are standing in
  however deep you have gone, and says how much of it is still folded away.
  `↑` and `↓` step between the lines at a fork, the way they do in every
  desktop GUI; anywhere else they are the browser's and scroll.
- **Every variation, however deep, and the glyphs on it**: The move list
  draws a variation inside a variation in brackets within its row, numbered
  the way a PGN is, so an annotated game reads on screen as it does on paper.
  A `$1` in the file shows as `!` and a `$16` as `±`, and the current move can
  be judged from the list — `!!`, `!`, `!?`, `?!`, `?`, `??` — which is written
  as the move's suffix and exported with it.
- **Interactive analysis visuals**: Clickable winrate/WDL graphs, move transcript navigation, and board arrows for the played move, best move, and candidate lines. Point at either graph and it reads the ply under the pointer — "12. Nf3 · 61.2% White", or the win/draw/loss split — with a hairline marking it; a click still goes there.
- **Your own arrows and marks**: Right-drag on the board to draw an arrow,
  right-click a square to mark it, `Shift` or `Ctrl` for the other two colours.
  They are blue, magenta and white rather than Lichess's green, because green
  already means "the engine likes this" on this board — amber is the move that
  was played, violet the threat, and red-to-green the candidate scale. Marks
  clear on your next move or left click, the way the drawn arrows do. Mouse
  only: both gestures live on the right button and there is no touch equivalent
  yet, which Settings says on a touch device rather than describing a gesture
  the screen cannot perform.
- **Opening and endgame intelligence**: Offline ECO names work immediately; optional session-only Lichess tokens unlock Masters/Lichess opening stats, while eligible endgames use Lichess tablebase data.

### Throughout

- **Export the library as PGN**: Alongside the JSON backup, which only this app
  reads, the whole library saves as one PGN database that Lichess, chess.com,
  SCID and ChessBase all open. It round-trips: the file it writes is one the
  database import above reads straight back.
- **Import a whole database**: Paste or open a PGN file with many games in it —
  which is what Lichess and chess.com hand you — and add the lot to the library
  in one go, each named from its own headers. A game in the file that will not
  parse is skipped and counted rather than silently dropped, and a file that
  would overflow the library says how many were left out.
- **Saved games**: Keep games in a library stored in IndexedDB, search them by player, event or opening, star and rename them, and export or import the whole shelf as JSON. The game in progress is auto-saved separately, so a reload offers to pick up where you left off — and for a game that was being *played*, that now includes the opponent, the side you had and the clock, stopped where it stood.
- **PGN and FEN workflows**: Import/export annotated PGN, copy FEN/share links, and build custom FEN positions with editable pieces, side to move, castling rights, and move counters.
- **Share a game, not just a position**: `Copy Game Link` on the Export tab puts
  the whole game in the URL — the position it started from and every move — so
  opening the link replays it rather than showing where it ended up. An 8-ply
  game is a 166-character link and a 120-ply one is under 1,200. Refused rather
  than truncated past 8,000 characters, and a link that has been edited or cut
  short plays as far as it really goes instead of being thrown away.
- **Board themes**: Five schemes in Settings. Each ships its own coordinate ink
  rather than reusing one: the coordinates are drawn inside the squares, and an
  ink chosen by eye is how a board ends up with rank numbers nobody can read on
  the dark squares. Every ink clears WCAG AA against its own dark square and is
  no less legible than the original pair's, both computed in the tests rather
  than asserted in a comment.
- **Command palette**: `Ctrl`/`Cmd`+`K` opens a searchable list of every
  toolbar and mode action, with recently used commands first. Ported in shape
  from web-katrain, sized for this app's twenty-odd commands. `Copy FEN`,
  `Copy PGN` and `Open in Lichess` live there too, so the position or the line
  you are looking at can leave without a trip through the PGN dialog; each
  says what it did in a one-line notice, since a copy that finishes in silence
  leaves you checking the clipboard.
- **Installable app metadata**: PWA manifest and app icon are configured for hosted releases.

## Technology Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Chess Logic**: `chess.js`
- **Chess Engine**: `stockfish.js`
- **UI Components**: `react-chessboard` plus local SVG icon components
- **Engine Profiles**: local Stockfish 18 lite assets with optional full-strength CDN profiles. On a
  cross-origin-isolated page the multi-threaded build is chosen automatically and sized to the
  device; both the analysis engine and the opponent fall back to the single-threaded build if it
  cannot start, and say so.
- **Service worker**: `public/sw.js` does two jobs at once — it adds COOP/COEP
  to its own responses, which is the only way a host like GitHub Pages can give
  the page the cross-origin isolation multi-threaded Stockfish needs, and it
  caches what it serves so the app opens offline. They live in one worker
  because a second one registered at the same scope replaces the first.

## Quality Gates

Run every check with one command:

```bash
npm run verify
```

That is typecheck → lint → tests → build, chained so the first failure stops it.
Prefer it to running the parts by hand: `npm run typecheck | tail -2 && npm run
lint` reports `tail`'s exit code rather than the compiler's, so a real failure
reads as success. Note also that `npm test` typechecks nothing — Vitest
transpiles without checking, so a test can pass while failing to compile.

The parts, and the one thing `verify` leaves out:

```bash
npm run audit   # not in verify, so verify works offline
npm run typecheck
npm run lint
npm test
npm run build
```

Two more that `verify` leaves out because they drive a real browser:

```bash
npm run test:ui:install   # once per machine
npm run test:ui:browser
```

`test:ui:browser` is the only test here that clicks anything. It builds the app,
serves it, and drives Chromium with a fake Stockfish injected in place of the
real worker — so a review runs end to end, deterministically, in seconds and
with no WASM. The technique is borrowed from web-xiangqi, which has had it
longer.

`npm run audit` uses `--audit-level=moderate`, matching the sibling apps. A bare
`npm audit` fails on any severity, which once blocked a release over a single
low advisory in a dev dependency.

## Stockfish Assets

Local browser engine files are synced from the installed `stockfish` npm package:

```bash
npm run sync:stockfish
```

The bundled Stockfish engine assets in `public/engine` are GPL-3.0 licensed. See `public/engine/Copying.txt`.

## Opening Explorer

The Lichess Opening Explorer endpoints require API authentication. Create a personal token at <https://lichess.org/account/oauth/token/create?> with no scopes, then paste it into the app's session-only token field when using Masters/Lichess book stats. Local ECO opening names continue to work offline from `src/assets/eco.json`.

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd web-chess
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

## Continuous Deployment

This project includes a GitHub Actions workflow that audits dependencies, lints, tests, builds, and then deploys to GitHub Pages whenever code is pushed to the `main` branch.

## Related Apps

Two sibling apps share this one's shape — an engine in a worker, a move tree, a
review pass, a saved-game library — for Go and xiangqi:

- [web-katrain](https://github.com/Sir-Teo/web-katrain) — Go, KataGo in the browser
- [web-xiangqi](https://github.com/Sir-Teo/web-xiangqi) — xiangqi, Pikafish compiled to WASM

[`docs/parity.md`](docs/parity.md) is the feature matrix for the three, kept
current as things land here.
[`docs/cross-app-learning-plan.md`](docs/cross-app-learning-plan.md) compares the
three and tracks what is worth moving between them.
[`docs/architecture.md`](docs/architecture.md) covers this app on its own.

## License

Application code is distributed under the MIT License; see [LICENSE](LICENSE). Bundled Stockfish engine assets are distributed under GPL-3.0; see `public/engine/Copying.txt`.
