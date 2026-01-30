# web-chess

Vulcan Analysis Lab — a high‑performance Stockfish.js analysis workstation designed for static hosting.

## Run locally with maximum performance

Multi‑threaded Stockfish requires cross‑origin isolation (COOP/COEP). Use the built‑in server:

```bash
node server.js
```

Then open `http://localhost:4173`. You can change the port with `PORT=...`.

## GitHub Pages note

GitHub Pages cannot set COOP/COEP headers, so the app will automatically fall back to single‑threaded engines there. For maximum speed, host with COOP/COEP support (Cloudflare Pages, Netlify, or your own server).

## Features

- Multi‑threaded and single‑threaded Stockfish.js 17.1 variants
- Full UCI option surface + raw console (with filter)
- Engine asset preloading for faster start
- Deep analysis (infinite, depth, time, nodes, mate)
- Time‑control search (wtime/btime/winc/binc/movestogo/ponder)
- Perft, eval trace, position dump, compiler info
- Tablebase (Syzygy) configuration controls
- Strength limiting (Skill Level, Elo)
- Auto‑play / play best move
- PV lines with SAN preview, hover board highlights, and playback controls
- Move list with blunder/inaccuracy detection + thresholds
- Eval timeline chart + WDL/hash KPIs
- Batch analysis queue with JSON/CSV export + progress chart
- Exportable JSON analysis reports
