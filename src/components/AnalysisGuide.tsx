import { memo } from 'react'
import './AnalysisGuide.css'

/** Explain what the two related charts measure. */
export const GraphEstimateGuide = memo(function GraphEstimateGuide() {
  return (
    <details className="analysis-guide graph-estimate-guide">
      <summary>About these percentages</summary>
      <div>
        <p><strong>White score</strong> counts a win as one point and a draw as half a point.
          It uses Stockfish's win/draw/loss estimate when available and a score-based estimate otherwise.</p>
        <p><strong>Win / draw / loss</strong> shows Stockfish's separate outcome estimates
          for games between strong engines. Your rating, opponent and clock affect the practical outcome.</p>
        <div className="graph-guide-links">
          <a href="https://lichess.org/page/accuracy" target="_blank" rel="noreferrer">Score estimate ↗</a>
          <a href="https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html#uci-showwdl"
            target="_blank" rel="noreferrer">Stockfish WDL ↗</a>
        </div>
      </div>
    </details>
  )
})

/** Optional guidance beside the analysis; never covers the board. */
export function AnalysisGuide() {
  return (
    <details className="analysis-guide">
      <summary>How to read this analysis</summary>
      <div>
        <p><strong>Whose score?</strong> Positive scores favor White; negative scores favor Black,
          even after you flip the board. +1.0 is about a pawn of advantage, not a guaranteed extra pawn.</p>
        <p><strong>What is depth?</strong> D16 means a search depth of 16 half-moves.
          Stockfish explores some lines further than others. A deeper search can change its recommendation.</p>
        <p><strong>Why two charts?</strong> White score combines wins and half of draws into one number.
          Win/draw/loss shows the three outcomes separately. Neither predicts your personal result.</p>
        <p><strong>Try an idea.</strong> Play on the board or enter a move by name.
          Click a move in an engine line to explore it as a variation. Use the navigation arrows to return.</p>
        <p><strong>Learn from a game.</strong> Import a PGN, open Review, and choose Review game.
          In Coach view you can retry critical mistakes on the board.</p>
      </div>
    </details>
  )
}
