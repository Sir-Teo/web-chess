# Web Chess

A modern, highly polished chess application built with React, TypeScript, and Vite. It offers a stunning user interface, powerful AI capabilities driven by Stockfish, and advanced game analysis tools.

## Features

- **Play against AI**: Challenge the Stockfish engine directly in your browser with adjustable difficulty levels.
- **AI Watch Mode**: Automate AI vs. AI matches with full playback controls (pause/resume, speed adjustment, step mode).
- **Advanced Game Analysis**: 
  - **Winrate Graph**: Interactive, clickable game evaluation graph with vertical markers.
  - **Engine Lines & WDL**: View detailed engine analysis, full lines, and Win/Draw/Loss probability breakdowns.
  - **Visual Board Indicators**: SVG board arrows indicating the played move (orange), best engine move (green), and alternative lines (blue).
- **Opening Explorer**: Automatic opening names lookup and identification.
- **Premium UI/UX**: Keyboard navigation, clickable move transcript, high-quality SVG iconography, and a fast, responsive design.
- **Batch Game Review**: Effortlessly load, review, and analyze multiple games seamlessly.

## Technology Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Chess Logic**: `chess.js`
- **Chess Engine**: `stockfish.js`
- **UI Components**: `react-chessboard` and `lucide-react`

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/web-chess.git
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

This project includes a GitHub Actions workflow to automatically deploy the application to GitHub Pages whenever code is pushed to the `main` branch. 

## License

Distributed under the MIT License.
