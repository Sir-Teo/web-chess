# Web Chess Analysis Tool Design (GitHub Pages + Stockfish.js 18)

## Product intent

Build a browser-first analysis tool that is:

- **Instantly usable** for casual users (paste PGN/FEN and analyze in one action).
- **Deep enough for power users** (full Stockfish option control, MultiPV, WDL, search modes).
- **Visually and interaction-wise ahead** of current open analysis UIs.
- **Deployable on GitHub Pages** with strong fallback behavior.

## Competitive teardown (what we copied, what we must beat)

Based on local code and docs review of:

- `lichess-org/lila` (analysis + ceval architecture)
- `goodvibs/eval.bar` (simple React analysis UI)
- `LabinatorSolutions/stockfish-chess-web-gui` (+ `boldchess-web-app`)

### Best patterns to keep

- Lichess-level engine orchestration:
  - resilient engine selection/fallbacks
  - throttled eval updates
  - persistent settings
  - worker lifecycle control
- Simple first-run usability from eval.bar:
  - low-friction import/analyze flow
  - visible eval + PV at all times
- Strong game-tooling breadth from BoldChess:
  - PGN/FEN/move list handling
  - board annotations

### Gaps to outperform

- Too many controls mixed together (feature density hurts clarity).
- Weak onboarding for non-experts (UCI terms appear too early).
- Outdated visual direction in many tools (dense panels, low hierarchy).
- Limited "analysis story":
  - tools show lines, but not clear "why this move matters now."

## Design principles

1. **Progressive power**
   - Basic mode by default, advanced controls on demand.
2. **Board-first, insight-second, controls-third**
   - visual hierarchy follows user intent.
3. **One-click confidence**
   - predictable state, no mystery engine behavior.
4. **Fast feedback**
   - user sees engine warming, depth growth, and stability confidence.
5. **Mobile parity**
   - no "desktop-only serious mode."

## Information architecture

## Desktop layout (three-column but elastic)

- **Center (primary):**
  - chessboard
  - move list with inline eval deltas
- **Right rail (insight stack):**
  - top line card (best move + reason tags)
  - MultiPV cards (up to selected N)
  - eval bar + WDL capsule
  - depth/nodes/nps/status row
- **Left rail (analysis timeline):**
  - game phase segmentation
  - blunder/mistake/inaccuracy markers
  - jump-to-critical-moment list

## Mobile layout

- Board pinned top.
- Swipeable bottom sheet tabs:
  - `Lines`
  - `Moves`
  - `Review`
  - `Settings`
- Sticky mini eval bar + current best move row.

## UX flows

## Flow A: Quick analyze (default)

1. User lands on clean board + "Paste PGN/FEN" CTA.
2. Engine starts with safe defaults automatically.
3. User sees:
   - best move
   - eval
   - 1-3 PVs
4. Optional "Review game" button runs post-pass classification.

## Flow B: Deep analysis (advanced)

1. User opens `Engine Lab`.
2. Full UCI controls available with grouped sections:
   - Performance
   - Search
   - Strength simulation
   - Variant/notation
   - NNUE model files (expert)
3. Presets:
   - `Battery Saver`
   - `Balanced`
   - `Max Strength`
   - `Blitz Prep`

## Flow C: Study/review mode

1. Run whole-game review.
2. Produce:
   - move quality labels
   - centipawn-loss graph
   - critical moments
   - opening summary
3. Click any moment to jump board + show best line.

## Stockfish integration design

Use `stockfish@18.0.5` with a capability ladder:

1. `stockfish-18.js` (MT) when cross-origin isolated.
2. `stockfish-18-single.js` for standard GitHub Pages compatibility.
3. `stockfish-18-lite-single.js` for low-memory or mobile fallback.

Optional high-performance toggle:

- add `coi-serviceworker` path for environments without header control.

## Full option mapping (UI)

Expose all live UCI options from Stockfish 18 with two tiers:

- **Basic tier (visible by default):**
  - `MultiPV`
  - `Hash`
  - `Threads` (when available)
  - `UCI_ShowWDL`
  - search mode (`depth` / `movetime` / `infinite`)
- **Advanced tier (Engine Lab):**
  - `Ponder`
  - `Skill Level`
  - `Move Overhead`
  - `nodestime`
  - `UCI_Chess960`
  - `UCI_LimitStrength`
  - `UCI_Elo`
  - `EvalFile`
  - `EvalFileSmall`
  - `Clear Hash` button

## Feature scope for v1

- PGN/FEN import and export
- Board editor (simple)
- Real-time local analysis
- MultiPV lines with SAN + UCI toggle
- Eval bar + WDL
- Move list with eval deltas
- Review pass:
  - inaccuracy / mistake / blunder tags
  - critical moments panel
- Keyboard shortcuts (essential nav + analysis controls)
- Persistent local settings (localStorage/IndexedDB)

## Visual direction (intentional, not generic)

- Typography:
  - `Space Grotesk` for UI/headings
  - `IBM Plex Mono` for eval/depth/engine telemetry
- Color system:
  - warm paper neutrals + high-contrast graphite
  - emerald/coral accents for eval polarity
  - avoid default purple-driven palettes
- Motion:
  - subtle depth pulse when PV stabilizes
  - staggered reveal for review insights
  - no constant ambient motion

## Technical architecture (GitHub Pages-friendly)

- Frontend: React + Vite + TypeScript.
- Board: `chessground` (or `cm-chessboard`) with annotation layer.
- Game model: `chessops` (or `chess.js` if simpler initial scope).
- Engine layer:
  - dedicated worker manager
  - command queue + parser
  - throttled state emitter
  - stale-result cancellation on position changes
- State:
  - lightweight central store (Zustand)
  - split stores: `position`, `engine`, `ui`, `review`
- Storage:
  - local settings in localStorage
  - optional IndexedDB for cached NNUE artifacts and analysis snapshots

## Non-functional targets

- Initial interactive UI under 2s on desktop broadband.
- Engine warm start under 1.5s after first asset cache.
- UI updates at 60fps while dragging pieces.
- No memory leaks after 100+ position switches.

## Risks and mitigations

- **Risk:** GitHub Pages header limitations reduce MT usage.
  - **Mitigation:** single-thread default + optional COI service worker route.
- **Risk:** full 113MB wasm hurts first load.
  - **Mitigation:** progressive loader + lite fallback + caching strategy.
- **Risk:** too many controls overwhelms users.
  - **Mitigation:** strict progressive disclosure.

## Implementation plan

## Phase 0: Skeleton + engine lane

- App shell + responsive board layout
- worker manager + parser
- single-position analysis
- basic settings (MultiPV/hash/search mode)

## Phase 1: Core analysis UX

- move list + eval deltas
- MultiPV cards
- WDL + eval bar polish
- import/export PGN/FEN

## Phase 2: Review engine

- game pass classification
- timeline + key moments
- review explanations

## Phase 3: Power mode + performance

- complete advanced UCI panel
- optional COI service worker flow
- engine profile presets

## Acceptance criteria for design approval

- New users can analyze in under 10 seconds without opening settings.
- Advanced users can reach all Stockfish 18 options.
- Mobile experience retains full analysis function.
- UI feels modern and intentional, not template-like.
