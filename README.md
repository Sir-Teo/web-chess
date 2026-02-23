# ♞ Web Chess

A modern, highly polished, and feature-rich chess application built with React, TypeScript, and Vite. It offers a stunning user interface, powerful AI capabilities driven by Stockfish, and advanced game analysis tools.

## ✨ Features

- **🤖 Play against AI**: Challenge the powerful Stockfish engine directly in your browser with adjustable difficulty levels to match your skill.
- **👁️ AI Watch Mode**: Automate AI vs. AI matches with full playback controls (pause/resume, speed adjustment, step mode) for deep analysis and learning.
- **📊 Advanced Game Analysis**: 
  - **Winrate Graph**: Interactive, clickable game evaluation graph with vertical markers indicating the current position.
  - **Engine Lines & WDL**: View detailed engine analysis, full lines, and Win/Draw/Loss probability breakdowns.
  - **Visual Board Indicators**: Intuitive SVG board arrows indicating the played move (orange), best engine move (green), and alternative lines (blue).
- **📖 Opening Explorer**: Automatic opening names lookup and identification as you play.
- **🎮 Premium UI/UX**: Keyboard navigation support (left/right arrows), a clickable "Move Navigator" transcript, high-quality SVG iconography, and a fast, responsive design tailored for performance.
- **📁 Batch Game Review**: Effortlessly load, review, and analyze multiple games seamlessly.

## 🛠️ Technology Stack

- **Framework**: [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev)
- **Chess Logic**: [`chess.js`](https://github.com/jhlywa/chess.js) for move generation, validation, and game state administration.
- **Chess Engine**: [`stockfish.js`](https://github.com/nmrugg/stockfish.js) for localized, WASM-powered browser-based move analysis.
- **UI Components**: [`react-chessboard`](https://github.com/Clariity/react-chessboard) for interactive drag-and-drop board rendering, and [`lucide-react`](https://lucide.dev/) for crisp, scalable icons.

## 🚀 Getting Started

Follow these instructions to get a local copy of the project up and running.

### Prerequisites
Make sure you have Node.js and a package manager (`npm`, `yarn`, or `pnpm`) installed on your system.

### Installation

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

4. **Launch:** Open your browser and navigate to `http://localhost:5173` (or the local port provided by Vite in your terminal).

## 🌍 Continuous Deployment

This project includes an automated GitHub Actions workflow (`.github/workflows/deploy.yml`) designed to seamlessly build and deploy the application to **GitHub Pages** whenever code is pushed to the `main` branch. 

## 📜 License

Distributed under the MIT License.
