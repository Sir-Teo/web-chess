# Chess Analysis Tool — Design Document

## Overview

A world-class, free, browser-native chess analysis tool deployed on GitHub Pages.
Engine: **Stockfish 18 WASM** (`nmrugg/stockfish.js` v18.0.5 — the latest, via `npm install stockfish`).
Stack kept as-is: **Vite + React + TypeScript**.

---

## Competitive Landscape & Gaps

| Platform | Strength | Weakness |
|---|---|---|
| Lichess analysis board | Powerful, multi-pv, arrows | Dense UI, browser chess only |
| chess.com analysis | Beautiful review, brilliant moves | Paywalled depth |
| ChessKit | Open-source, Stockfish 16 NNUE | Next.js complexity |
| ChessCompass | Clean analysis board | No mobile, limited UI |
| OpenChess-Insights | Move explanations, metrics | Rough UI |

**Our differentiation**: Best-in-class dark UI, interactive move navigator, annotated PGN import/export, engine arrows drawn on the board, vertical eval bar, animated winrate graph, opening name detection, and full Stockfish 18 UCI option exposure — all free, single-page, GitHub Pages compatible.

---

## Stockfish 18 Engine Configs (Full UCI Reference)

### Engine Flavor Selection (smart auto-detect)
```
Priority order:
1. stockfish-18.js + .wasm      [Full, multi-thread] — requires CORS isolation (COOP/COEP)
2. stockfish-18-single.js       [Full, single-thread] — ~113MB, no CORS needed
3. stockfish-18-lite.js         [Lite, multi-thread] — ~7MB, CORS needed  (current default when isolated)
4. stockfish-18-lite-single.js  [Lite, single-thread] — ~7MB, no CORS (current fallback)
5. stockfish-18-asm.js          [ASM.js, JS only]     — last resort, very slow
```
For GitHub Pages we'll use the same strategy: lite-single → lite-multi → full-single → full-multi CDN path.

### Key UCI Options We'll Expose
```
Hash          [16..1024 MB]     Transposition table size
Threads       [1..max-1]        Number of CPU threads (multi only)
MultiPV       [1..5]            Simultaneous lines
Skill Level   [0..20]           Engine strength (for Play mode)
UCI_ShowWDL   [true/false]      Show Win/Draw/Loss percentages
UCI_LimitStrength [true/false]  Enable Elo limiting
UCI_Elo       [1320..3190]      Target Elo when limiting
Move Overhead [0..5000 ms]      Safety margin for time controls
Slow Mover    [10..1000]        Time usage aggressiveness
nodestime     [0..10000]        Use nodes instead of time
Contempt      (Stockfish 17+)   contempt factor
Analysis Bonus (Stockfish 18)   Bonus for analysis mode positions
SyzygyPath    [string]          Tablebase path (n/a in browser)
```

### Key UCI Commands We'll Use
```
uci                             Initialize, get id/option list
setoption name X value Y        Set any option live
isready                         Sync before position
position startpos moves ...     Set position from moves
position fen X moves ...        Set arbitrary FEN
go depth N                      Fixed-depth analysis
go movetime N                   Fixed time analysis
go infinite                     Continuous analysis
stop                            Stop search, get bestmove
ponderhit                       Accept ponder move
quit                            Terminate worker
```

---

## UI Architecture

### Layout — Desktop (≥1024px)

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR: Logo | Tabs[Analysis · Play · Import · Opening] | Engine Badge  │
├───┬──────────────────────────────────────────────┬─────────────┤
│   │                                              │  RIGHT PANEL │
│ E │  ┌─ Player Black ─────────────── [clock] ─┐  │  ┌─ Tabs ──┐ │
│ V │  │                                        │  │  │Lines│Moves│ │
│ A │  │         C H E S S B O A R D           │  │  └────────┘ │
│ L │  │         (animated, arrows, highlights)  │  │  [Engine Lines] │
│ B │  │                                        │  │  #1 +0.41 D18 │
│ A │  │                                        │  │  e4 Nf6 Nc3  │
│ R │  └─ Player White ─────────────── [clock] ─┘  │  #2 +0.38 D18 │
│   │  ══════════════════════════════════════════  │  d4 d5 c4... │
│   │  [← Prev] [▶ Play] [Next →] [|◀ Start] [▶|End] │  ─────────── │
│   │  ══════════════════════════════════════════  │  [Move List] │
│   │  [▓░░░░░░░░░░] WINRATE GRAPH [░░░░░░░░░▓]   │  1. e4 e5   │
│   │  (smooth animated SVG with hover tooltip)    │  2. Nf3 Nc6 │
└───┴──────────────────────────────────────────────┴─────────────┘
│  STATUSBAR: Engine name · Status · Depth · NPS · Nodes · Best move    │
└─────────────────────────────────────────────────────────────────┘
```

### Layout — Mobile (< 768px)
Stacked vertically: Top nav → Eval bar (horizontal) → Board → Move controls → Tabbed bottom panel (Lines / Moves / Graph)

---

## Design System

### Colors — Dark Theme (Primary)
```css
--bg-base:         #0d1117   /* GitHub-dark near-black */
--bg-surface:      #161b22   /* cards, panels */
--bg-elevated:     #21262d   /* dropdowns, menus */
--bg-board-light:  #f0d9b5   /* classic lichess cream */
--bg-board-dark:   #b58863   /* warm brown */

--accent:          #3fb950   /* GitHub green — primary CTA */
--accent-glow:     rgba(63, 185, 80, 0.25)
--accent-secondary: #58a6ff  /* blue — secondary highlights */

--text-primary:    #e6edf3
--text-secondary:  #8b949e
--text-tertiary:   #6e7681

--border-subtle:   rgba(240, 246, 252, 0.07)
--border-default:  rgba(240, 246, 252, 0.12)

/* Quality badge colors */
--quality-brilliant: #1bada6  /* teal */
--quality-best:      #4caf50  /* green */
--quality-good:      #8bc34a  /* light green */
--quality-inaccuracy:#ffc107  /* amber */
--quality-mistake:   #ff9800  /* orange */
--quality-blunder:   #f44336  /* red */
--quality-miss:      #e91e63  /* pink */
```

### Typography
```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
/* All weights: 400, 500, 600, 700 */
/* Monospace for eval/notation: 'JetBrains Mono', 'Fira Code', monospace */
```

### Spacing & Radii
```css
--radius-sm: 6px   --radius-md: 10px   --radius-lg: 16px   --radius-xl: 24px
--space-xs: 4px    --space-sm: 8px     --space-md: 12px     --space-lg: 20px
```

---

## Features — Priority Ordered

### Phase 1 — Core Analysis (MVP)
1. **Vertical evaluation bar** — animated gradient showing white/black advantage, updating live
2. **Multi-line engine output** — 1–5 PV lines with eval + depth + SAN notation
3. **Move navigator** — click any move in the list to jump to that position; keyboard arrows navigate
4. **Best-move & top-line arrows** — SVG overlay on the board (green=best, blue=alt lines)
5. **Move quality badges** — Brilliant/Best/Good/Inaccuracy/Mistake/Blunder/Miss with emoji icons
6. **Animated SVG winrate graph** — smooth transitions, hover tooltip showing move + eval
7. **PGN import** — paste or file-upload; parse headers (White/Black/Date/Event)
8. **Opening name detection** — lookup against ECO database built into the bundle
9. **Auto-analysis mode** — analyze every position as user navigates
10. **Engine depth/NPS/nodes** — live display in status bar

### Phase 2 — Power Features  
11. **Full-game batch review** — "Review Game" button triggers bulk analysis at user-selected depth
12. **Comparison arrows** — show what was played vs. what engine suggests simultaneously
13. **WDL bar** — Win/Draw/Loss probability breakdown per line (requires UCI_ShowWDL)
14. **Engine profile switcher** — Lite / Full Single / Full Multi with intelligent auto-detect
15. **Hash & Threads sliders** — dynamically applied via setoption
16. **Skill Level mode** — for play-against-AI integration
17. **FEN input** — paste any FEN to jump to position
18. **Board themes** — 4 board color presets (Classic, Marble, Green, Blue)
19. **Piece set selector** — at minimum 2 sets (Neo, Classic)
20. **PGN export** — download annotated PGN with engine eval comments

### Phase 3 — Delight & Polish
21. **Opening Explorer integration** — show opening name + ECO code + brief description
22. **Critical moments detection** — auto-jump to biggest blunders/turning points
23. **Keyboard shortcuts panel** — ← → navigate, Space play/pause, F flip, R reset
24. **Animated piece moves** — smooth piece slide animations on navigation
25. **Shareable FEN links** — URL hash encodes current FEN position
26. **Light mode toggle** — warm cream light theme as alternative
27. **Annotated PGN comments** — export eval scores as `{+0.41}` style PGN comments

---

## Component Architecture

```
src/
├── App.tsx                    ← Main layout orchestrator
├── components/
│   ├── TopBar.tsx             ← App logo, tabs, engine badge
│   ├── EvalBar.tsx            ← Vertical evaluation bar (SVG animated)
│   ├── BoardArea.tsx          ← Board + player cards + nav controls
│   │   ├── PlayerCard.tsx     ← Avatar, name, rating, clock
│   │   ├── MoveControls.tsx   ← ← ▶ → keyboard nav buttons  
│   │   └── ArrowOverlay.tsx   ← SVG arrows above chessboard
│   ├── RightPanel.tsx         ← Tab container (Lines / Moves)
│   │   ├── EngineLines.tsx    ← Multi-PV with WDL
│   │   └── MoveList.tsx       ← Annotated move list, clickable
│   ├── WinrateGraph.tsx       ← Bottom animated SVG graph
│   ├── StatusBar.tsx          ← Engine status, depth, NPS
│   ├── PgnImporter.tsx        ← Modal for PGN paste/upload
│   ├── SettingsModal.tsx      ← Engine options (exposed UCI)
│   └── NewGameDialog.tsx      ← (existing, keep)
├── engine/
│   ├── analysis.ts            ← (extend: batch review, opening db)
│   ├── profiles.ts            ← (extend: full-18 profiles)
│   └── openings.ts            ← ECO opening name lookup (compact)
├── hooks/
│   ├── useStockfishEngine.ts  ← (extend: WDL, movetime, go infinite)
│   ├── useAiPlayer.ts         ← (existing)
│   ├── useGameNavigator.ts    ← NEW: ply-level position navigation
│   ├── usePgnParser.ts        ← NEW: PGN import/export
│   └── useKeyboardNav.ts      ← NEW: keyboard shortcuts
└── styles/
    ├── index.css              ← Design tokens (dark theme)
    └── App.css                ← Component styles
```

---

## Stockfish Integration Enhancements

### go infinite + stop Pattern (for analysis mode)
Instead of `go depth N`, use `go infinite` with a `stop` trigger when the position changes.
This gives the smoothest UX — eval updates continuously, no depth ceiling.

### Batch Review Algorithm
```
For each position in game:
  send: position fen {fen}
  send: go movetime 500ms   ← budget per move
  wait for: bestmove response
  record: cp score
  compute: delta vs previous position
  classify: quality label
```

### WDL Display
Parse from UCI info line: `score cp 41 wdl 452 368 180`
Display as: W 45.2% · D 36.8% · L 18.0%

---

## Arrow Rendering on Board

Use `react-chessboard`'s `customArrows` prop:
```tsx
customArrows={[
  [bestMoveFrom, bestMoveTo, 'rgba(63, 185, 80, 0.85)'],   // green = #1 line
  [line2From, line2To, 'rgba(88, 166, 255, 0.65)'],          // blue = #2 line
  [playedMoveFrom, playedMoveTo, 'rgba(255, 152, 0, 0.55)'], // orange = played move
]}
```
Also support user-drawn arrows (right-click drag) via `onSquareRightClick`.

---

## GitHub Pages Deployment Notes

- `vite.config.ts`: `base: '/web-chess/'`
- Since GitHub Pages doesn't set COOP/COEP headers, multi-threaded Stockfish won't work.
- Default auto-profile: `lite-single` (7MB WASM, no CORS needed, works on gh-pages)
- CDN full-single profile remains available as opt-in (113MB)

---

## Implementation Plan

### Step 1: Dark Theme Design System
- Overhaul `index.css` with dark theme tokens
- New App.css with glassmorphism panels

### Step 2: Layout Restructure
- New layout with eval bar, board area, right panel, bottom graph
- Re-implement `App.tsx` with component split

### Step 3: Eval Bar + Arrow Overlay
- `EvalBar.tsx` — animated gradient, white/black labels, centipawn display
- `ArrowOverlay.tsx` — multi-arrow SVG positioned over board

### Step 4: Move Navigator
- `useGameNavigator.ts` — ply-indexed position history
- `MoveList.tsx` — clickable annotated moves with quality badges
- `MoveControls.tsx` — prev/next/start/end buttons + keyboard

### Step 5: PGN Import
- Minimal PGN parser (no heavy deps) with header extraction
- Opening name lookup via compact ECO map

### Step 6: Batch Review
- "Review Game" button triggers sequential movetime analysis

### Step 7: Polish
- Animations, transitions, responsive mobile layout
- Opening name display, WDL bar

---

*Estimated scope: ~2500–3500 lines TSX/CSS across all files.*
