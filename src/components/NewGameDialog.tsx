import { type AiDifficulty, DIFFICULTY_LABELS } from '../hooks/useAiPlayer'

export type GameMode = 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'
export type PlayerColor = 'white' | 'black'

type NewGameConfig = {
    mode: GameMode
    playerColor: PlayerColor
    difficulty: AiDifficulty
}

type Props = {
    open: boolean
    onStart: (config: NewGameConfig) => void
    onCancel: () => void
}

import { useState } from 'react'
import './NewGameDialog.css'

const DIFFICULTY_DESCRIPTIONS: Record<AiDifficulty, string> = {
    1: 'Perfect for learning chess basics',
    2: 'Casual friendly play',
    3: 'Club-level competition',
    4: 'A solid challenge',
    5: 'Strong tactical play',
    6: 'Near-master strength',
    7: 'Grandmaster class',
    8: 'Maximum engine strength',
}

const MODE_OPTIONS: { value: GameMode; icon: string; label: string; description: string }[] = [
    { value: 'human-vs-human', icon: '👥', label: 'Human vs Human', description: 'Pass & play on the same device' },
    { value: 'human-vs-ai', icon: '🤖', label: 'Human vs AI', description: 'Challenge Stockfish 18' },
    { value: 'ai-vs-ai', icon: '⚡', label: 'AI vs AI', description: 'Watch engines battle it out' },
]

export function NewGameDialog({ open, onStart, onCancel }: Props) {
    const [mode, setMode] = useState<GameMode>('human-vs-ai')
    const [playerColor, setPlayerColor] = useState<PlayerColor>('white')
    const [difficulty, setDifficulty] = useState<AiDifficulty>(4)

    if (!open) return null

    const handleStart = () => {
        onStart({ mode, playerColor, difficulty })
    }

    const showColorPicker = mode === 'human-vs-ai'
    const showDifficulty = mode === 'human-vs-ai' || mode === 'ai-vs-ai'

    return (
        <div className="dialog-backdrop" onClick={onCancel}>
            <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
                <header className="dialog-header">
                    <span className="dialog-icon">♟</span>
                    <h2>New Game</h2>
                </header>

                {/* Mode selector */}
                <div className="dialog-section">
                    <p className="dialog-label">Game mode</p>
                    <div className="mode-grid">
                        {MODE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={`mode-card ${mode === opt.value ? 'selected' : ''}`}
                                onClick={() => setMode(opt.value)}
                            >
                                <span className="mode-icon">{opt.icon}</span>
                                <strong>{opt.label}</strong>
                                <span className="mode-desc">{opt.description}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Color picker */}
                {showColorPicker && (
                    <div className="dialog-section">
                        <p className="dialog-label">Play as</p>
                        <div className="color-picker">
                            <button
                                type="button"
                                className={`color-btn ${playerColor === 'white' ? 'selected' : ''}`}
                                onClick={() => setPlayerColor('white')}
                            >
                                <span className="color-piece">♔</span>
                                White
                            </button>
                            <button
                                type="button"
                                className={`color-btn ${playerColor === 'black' ? 'selected' : ''}`}
                                onClick={() => setPlayerColor('black')}
                            >
                                <span className="color-piece dark">♚</span>
                                Black
                            </button>
                        </div>
                    </div>
                )}

                {/* Difficulty slider */}
                {showDifficulty && (
                    <div className="dialog-section">
                        <p className="dialog-label">
                            Difficulty —{' '}
                            <strong className="difficulty-label-value">{DIFFICULTY_LABELS[difficulty]}</strong>
                        </p>
                        <input
                            type="range"
                            min={1}
                            max={8}
                            step={1}
                            value={difficulty}
                            className="difficulty-slider"
                            onChange={(e) => setDifficulty(Number(e.target.value) as AiDifficulty)}
                        />
                        <div className="difficulty-ticks">
                            {([1, 2, 3, 4, 5, 6, 7, 8] as AiDifficulty[]).map((level) => (
                                <span
                                    key={level}
                                    className={`tick ${difficulty === level ? 'active' : ''}`}
                                    onClick={() => setDifficulty(level)}
                                />
                            ))}
                        </div>
                        <p className="difficulty-desc">{DIFFICULTY_DESCRIPTIONS[difficulty]}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="dialog-actions">
                    <button type="button" className="btn-cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className="btn-start" onClick={handleStart}>
                        ▶ Start Game
                    </button>
                </div>
            </div>
        </div>
    )
}
