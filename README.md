# Web Chess 1.0

A browser chess app for playing, importing, and reviewing games with Stockfish-powered analysis.

## Features

- **Play and watch modes**: Play human vs human, human vs Stockfish, or AI vs AI with adjustable difficulty, pause/resume controls, speed control, and single-step playback.
- **Beginner and pro analysis**: Coach mode keeps the right panel focused on plain-language move guidance, while Pro mode exposes MultiPV, WDL, cloud evals, opening stats, tablebase moves, and UCI controls.
- **Game review**: Import a PGN, run a review pass, filter critical moments by side, inspect accuracy, and jump from a review row back to the board. Accuracy and move labels are scored on winning chances rather than raw centipawns, so an imprecision in a decided game is not called a blunder.
- **Saved games**: Keep games in a library stored in IndexedDB, search them by player, event or opening, star and rename them, and export or import the whole shelf as JSON. The game in progress is auto-saved separately, so a reload offers to pick up where you left off.
- **PGN and FEN workflows**: Import/export annotated PGN, copy FEN/share links, and build custom FEN positions with editable pieces, side to move, castling rights, and move counters.
- **Opening and endgame intelligence**: Offline ECO names work immediately; optional session-only Lichess tokens unlock Masters/Lichess opening stats, while eligible endgames use Lichess tablebase data.
- **Command palette**: `Ctrl`/`Cmd`+`K` opens a searchable list of every
  toolbar and mode action, with recently used commands first. Ported in shape
  from web-katrain, sized for this app's twenty-odd commands.
- **Interactive analysis visuals**: Clickable winrate/WDL graphs, move transcript navigation, and board arrows for the played move, best move, and candidate lines.
- **Your own arrows and marks**: Right-drag on the board to draw an arrow,
  right-click a square to mark it, `Shift` or `Ctrl` for the other two colours.
  They are blue, magenta and white rather than Lichess's green, because green
  already means "the engine likes this" on this board — amber is the move that
  was played, violet the threat, and red-to-green the candidate scale. Marks
  clear on your next move or left click, the way the drawn arrows do.
- **Steppable engine lines**: Click any move in a principal variation — in the
  Lines panel or the Coach card — and the board walks into the line up to that
  move. It lands as a variation like any other, so it can be reviewed, promoted
  to the main line, or discarded.
- **Move sounds**: A knock when a piece lands, heavier for a capture, a two-part
  knock for castling, and tones for check, promotion and the end of the game.
  Synthesized in the browser rather than shipped as audio files, and off with
  one switch in Settings. Moves you *navigate* to are silent — scrubbing a
  60-move review with the arrow keys should not be a hundred knocks.
- **Threats**: `T`, or the button in the Coach card, asks what the opponent is
  threatening — a null-move search, drawn on the board in violet so it reads as
  neither the move that was played nor a move the engine recommends.
- **A review offered where the game ends**: when a game finishes in Play mode
  the result card offers to review it, rather than leaving you to find the
  Review tab yourself.
- **Play from here**: Hand the position on the board to the engine and take the
  move yourself — to try a critical moment again, or to see whether you can
  convert the endgame the review just graded. New Game always starts from the
  initial position; this does not.
- **Variations you can manage**: A move played from a mid-game position becomes
  a variation. Promote one to the main line and the review, the accuracy
  summary, both graphs and the exported PGN follow it; discard one and it is
  gone from all of them. The move list shows the branch you are standing in
  however deep you have gone, and says how much of it is still folded away.
- **Installable app metadata**: PWA manifest and app icon are configured for hosted releases.

## Technology Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Chess Logic**: `chess.js`
- **Chess Engine**: `stockfish.js`
- **UI Components**: `react-chessboard` plus local SVG icon components
- **Engine Profiles**: local Stockfish 18 lite assets with optional full-strength CDN profiles
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
