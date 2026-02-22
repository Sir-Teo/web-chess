import { Chess, type Square } from 'chess.js'
import { useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import './App.css'

type Orientation = 'white' | 'black'

function App() {
  const game = useMemo(() => new Chess(), [])
  const [fen, setFen] = useState(game.fen())
  const [orientation, setOrientation] = useState<Orientation>('white')
  const [topPanelOpen, setTopPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [searchDepth, setSearchDepth] = useState(16)
  const [multiPv, setMultiPv] = useState(2)
  const [hashMb, setHashMb] = useState(64)

  const moveHistory = game.history({ verbose: true })

  const undoMove = () => {
    game.undo()
    setFen(game.fen())
  }

  const resetBoard = () => {
    game.reset()
    setFen(game.fen())
  }

  const flipBoard = () => {
    setOrientation((value) => (value === 'white' ? 'black' : 'white'))
  }

  const onPieceDrop = (sourceSquare: Square, targetSquare: Square, pieceType: string) => {
    const promotion = pieceType.toLowerCase().endsWith('p') && ['1', '8'].includes(targetSquare[1]) ? 'q' : undefined
    const move = game.move({
      from: sourceSquare,
      to: targetSquare,
      promotion,
    })

    if (!move) return false

    setFen(game.fen())
    return true
  }

  const boardWidth = Math.min(
    window.innerWidth < 900 ? window.innerWidth - 32 : window.innerWidth - (rightPanelOpen ? 420 : 80),
    window.innerHeight - (bottomPanelOpen ? 230 : 70),
    760,
  )

  return (
    <main className="app-shell">
      <section className={`panel top-left ${topPanelOpen ? '' : 'hidden'}`}>
        <header className="panel-header">
          <h2>Quick Controls</h2>
          <button type="button" className="panel-toggle" onClick={() => setTopPanelOpen(false)}>
            Hide
          </button>
        </header>
        <div className="panel-content compact-grid">
          <button type="button" onClick={resetBoard}>
            New game
          </button>
          <button type="button" onClick={undoMove}>
            Undo
          </button>
          <button type="button" onClick={flipBoard}>
            Flip board
          </button>
          <button type="button" onClick={() => setBottomPanelOpen((value) => !value)}>
            {bottomPanelOpen ? 'Hide moves' : 'Show moves'}
          </button>
        </div>
      </section>

      {!topPanelOpen && (
        <button type="button" className="floating-toggle top-left-toggle" onClick={() => setTopPanelOpen(true)}>
          Show controls
        </button>
      )}

      <section className="board-stage" aria-label="Chessboard">
        <div className="board-wrap">
          <Chessboard
            options={{
              position: fen,
              boardOrientation: orientation,
              onPieceDrop: ({ sourceSquare, targetSquare, piece }) => {
                if (!targetSquare) return false
                return onPieceDrop(sourceSquare as Square, targetSquare as Square, piece.pieceType)
              },
              darkSquareStyle: { backgroundColor: '#6f695f' },
              lightSquareStyle: { backgroundColor: '#e7dbc9' },
              boardStyle: {
                width: `${Math.max(260, boardWidth)}px`,
                borderRadius: 14,
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
              },
            }}
          />
        </div>
      </section>

      <aside className={`panel right ${rightPanelOpen ? '' : 'hidden'}`}>
        <header className="panel-header">
          <h2>Analysis</h2>
          <button type="button" className="panel-toggle" onClick={() => setRightPanelOpen(false)}>
            Hide
          </button>
        </header>
        <div className="panel-content">
          <p className="panel-copy">
            Beginner mode is active. You can analyze right away, then open advanced controls when needed.
          </p>

          <label className="control">
            <span>Search depth</span>
            <input
              type="range"
              min={8}
              max={30}
              step={1}
              value={searchDepth}
              onChange={(event) => setSearchDepth(Number(event.target.value))}
            />
            <strong>{searchDepth}</strong>
          </label>

          <label className="control">
            <span>MultiPV</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={multiPv}
              onChange={(event) => setMultiPv(Number(event.target.value))}
            />
            <strong>{multiPv} lines</strong>
          </label>

          <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}>
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>

          {showAdvanced && (
            <div className="advanced-section">
              <label className="control">
                <span>Hash</span>
                <input
                  type="range"
                  min={16}
                  max={512}
                  step={16}
                  value={hashMb}
                  onChange={(event) => setHashMb(Number(event.target.value))}
                />
                <strong>{hashMb} MB</strong>
              </label>
              <p className="panel-copy small">
                Full Stockfish options will be wired in the next step via the engine worker.
              </p>
            </div>
          )}
        </div>
      </aside>

      {!rightPanelOpen && (
        <button type="button" className="floating-toggle right-toggle" onClick={() => setRightPanelOpen(true)}>
          Analysis
        </button>
      )}

      <section className={`panel bottom ${bottomPanelOpen ? '' : 'hidden'}`}>
        <header className="panel-header">
          <h2>Moves</h2>
          <button type="button" className="panel-toggle" onClick={() => setBottomPanelOpen(false)}>
            Hide
          </button>
        </header>
        <div className="panel-content move-list">
          {moveHistory.length === 0 && <p className="panel-copy">Make a move on the board to start the move list.</p>}
          {moveHistory.length > 0 && (
            <ol>
              {moveHistory.map((move, index) => (
                <li key={`${move.san}-${index}`}>
                  <span>{Math.floor(index / 2) + 1}.</span>
                  <strong>{move.san}</strong>
                  <span>{move.from}-{move.to}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {!bottomPanelOpen && (
        <button type="button" className="floating-toggle bottom-toggle" onClick={() => setBottomPanelOpen(true)}>
          Show moves
        </button>
      )}
    </main>
  )
}

export default App
