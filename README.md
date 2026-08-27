# Web Chess 1.0

A browser chess app for playing, importing, and reviewing games with Stockfish-powered analysis.

## Features

- **Play and watch modes**: Play human vs human, human vs Stockfish, or AI vs AI with adjustable difficulty, pause/resume controls, speed control, and single-step playback.
- **Beginner and pro analysis**: Coach mode keeps the right panel focused on plain-language move guidance, while Pro mode exposes MultiPV, WDL, cloud evals, opening stats, tablebase moves, and UCI controls.
- **Game review**: Import a PGN, run a review pass, filter critical moments by side, inspect accuracy, and jump from a review row back to the board.
- **PGN and FEN workflows**: Import/export annotated PGN, copy FEN/share links, and build custom FEN positions with editable pieces, side to move, castling rights, and move counters.
- **Opening and endgame intelligence**: Offline ECO names work immediately; optional session-only Lichess tokens unlock Masters/Lichess opening stats, while eligible endgames use Lichess tablebase data.
- **Interactive analysis visuals**: Clickable winrate/WDL graphs, move transcript navigation, and board arrows for the played move, best move, and candidate lines.
- **Installable app metadata**: PWA manifest and app icon are configured for hosted releases.

## Technology Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Chess Logic**: `chess.js`
- **Chess Engine**: `stockfish.js`
- **UI Components**: `react-chessboard` plus local SVG icon components
- **Engine Profiles**: local Stockfish 18 lite assets with optional full-strength CDN profiles

## Quality Gates

Run the same checks used by CI:

```bash
npm audit
npm run lint
npm test -- --run
npm run build
```

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

## License

Application code is distributed under the MIT License; see [LICENSE](LICENSE). Bundled Stockfish engine assets are distributed under GPL-3.0; see `public/engine/Copying.txt`.
