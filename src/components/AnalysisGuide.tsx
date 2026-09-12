import { memo } from 'react'
import './AnalysisGuide.css'

/** The two chart models are useful together, but their percentages differ. */
export const GraphEstimateGuide = memo(function GraphEstimateGuide() {
  return (
    <details className="analysis-guide graph-estimate-guide">
      <summary>About these percentages</summary>
      <div>
        <p><strong>Winrate</strong> converts the position’s score into a winning-chance
          estimate based on human games. The graph’s neutral point is 50%, including drawn positions.</p>
        <p><strong>Win / draw / loss</strong> uses Stockfish’s model of games between
          strong engines. It includes the likelihood of a draw.</p>
        <p>A level position can show 50% Winrate and a high draw percentage. The models
          answer different questions; your rating, opponent and clock affect the practical outcome.</p>
        <div className="graph-guide-links">
          <a href="https://lichess.org/page/accuracy" target="_blank" rel="noreferrer">Winrate model ↗</a>
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
        <p><strong>Why two percentages?</strong> The win-chance graph converts the score using a human-game model.
          Win/draw/loss splits use Stockfish’s engine-game model. Neither predicts your personal chance of winning.</p>
        <p><strong>Try an idea.</strong> Play on the board or enter a move by name.
          Click a move in an engine line to explore it as a variation. Use the navigation arrows to return.</p>
        <p><strong>Learn from a game.</strong> Import a PGN, open Review, and choose Review game.
          In Coach view you can retry critical mistakes on the board.</p>
      </div>
    </details>
  )
}
