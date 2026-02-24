import { useEffect, useId, useRef, useState } from 'react'
import type { AiDifficulty } from '../hooks/useAiPlayer'
import { DIFFICULTY_LABELS } from '../hooks/useAiPlayer'

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

import { IconUsers, IconBot, IconZap, IconSwords, IconKing, IconPlay } from './icons'
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

import * as React from 'react'

const MODE_OPTIONS: { value: GameMode; icon: React.ReactNode; label: string; description: string }[] = [
    { value: 'human-vs-human', icon: <IconUsers />, label: 'Human vs Human', description: 'Pass & play on the same device' },
    { value: 'human-vs-ai', icon: <IconBot />, label: 'Human vs AI', description: 'Challenge Stockfish 18' },
    { value: 'ai-vs-ai', icon: <IconZap />, label: 'AI vs AI', description: 'Watch engines battle it out' },
]

export function NewGameDialog({ open, onStart, onCancel }: Props) {
    const [mode, setMode] = useState<GameMode>('human-vs-ai')
    const [playerColor, setPlayerColor] = useState<PlayerColor>('white')
    const [difficulty, setDifficulty] = useState<AiDifficulty>(4)
    const panelRef = useRef<HTMLDivElement>(null)
    const titleId = useId()

    const handleStart = () => {
        onStart({ mode, playerColor, difficulty })
    }

    const showColorPicker = mode === 'human-vs-ai'
    const showDifficulty = mode === 'human-vs-ai' || mode === 'ai-vs-ai'

    useEffect(() => {
        if (!open) return

        const previouslyFocused = document.activeElement as HTMLElement | null
        const panelEl = panelRef.current
        if (!panelEl) return

        const focusableSelector = [
            'button:not([disabled])',
            '[href]',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(', ')

        const getFocusable = () =>
            Array.from(panelEl.querySelectorAll<HTMLElement>(focusableSelector))
                .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)

        const focusable = getFocusable()
        focusable[0]?.focus()

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
                return
            }

            if (event.key !== 'Tab') return
            const currentFocusable = getFocusable()
            if (!currentFocusable.length) return

            const first = currentFocusable[0]
            const last = currentFocusable[currentFocusable.length - 1]
            const active = document.activeElement as HTMLElement | null

            if (event.shiftKey) {
                if (active === first || !panelEl.contains(active)) {
                    event.preventDefault()
                    last.focus()
                }
                return
            }

            if (active === last || !panelEl.contains(active)) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            previouslyFocused?.focus?.()
        }
    }, [onCancel, open])

    if (!open) return null

    return (
        <div className="dialog-backdrop" onClick={onCancel}>
            <div
                ref={panelRef}
                className="dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="dialog-header">
                    <span className="dialog-icon"><IconSwords /></span>
                    <h2 id={titleId}>New Game</h2>
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
                                aria-pressed={mode === opt.value}
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
                                aria-pressed={playerColor === 'white'}
                            >
                                <span className="color-piece"><IconKing /></span>
                                White
                            </button>
                            <button
                                type="button"
                                className={`color-btn ${playerColor === 'black' ? 'selected' : ''}`}
                                onClick={() => setPlayerColor('black')}
                                aria-pressed={playerColor === 'black'}
                            >
                                <span className="color-piece dark"><IconKing /></span>
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
                                <button
                                    key={level}
                                    type="button"
                                    className={`tick ${difficulty === level ? 'active' : ''}`}
                                    onClick={() => setDifficulty(level)}
                                    aria-label={`Set difficulty to ${DIFFICULTY_LABELS[level]}`}
                                    aria-pressed={difficulty === level}
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
                        <IconPlay /> Start Game
                    </button>
                </div>
            </div>
        </div>
    )
}
