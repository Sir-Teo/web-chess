import { useEffect, useId, useRef, useState } from 'react'
import { useModalFocus } from '../hooks/useModalFocus'
import type { AiDifficulty } from '../hooks/useAiPlayer'
import { DIFFICULTY_LABELS } from '../hooks/useAiPlayer'
import { TIME_CONTROL_PRESETS } from '../engine/chessClock'
import { SIDE_CHOICES, resolveSideChoice, type SideChoice } from '../engine/sideChoice'

export type GameMode = 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'
export type PlayerColor = 'white' | 'black'

type NewGameConfig = {
    mode: GameMode
    /** The colour actually played -- Random is already resolved. */
    playerColor: PlayerColor
    /** What was asked for, so the dialog can open on Random again. */
    sideChoice: SideChoice
    difficulty: AiDifficulty
    timeControlId: string
}

type Props = {
    open: boolean
    initialMode: GameMode
    initialSideChoice: SideChoice
    initialDifficulty: AiDifficulty
    initialTimeControlId: string
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

export function NewGameDialog({
    open,
    initialMode,
    initialSideChoice,
    initialDifficulty,
    initialTimeControlId,
    onStart,
    onCancel,
}: Props) {
    const [mode, setMode] = useState<GameMode>(initialMode)
    const [sideChoice, setSideChoice] = useState<SideChoice>(initialSideChoice)
    const [difficulty, setDifficulty] = useState<AiDifficulty>(initialDifficulty)
    const [timeControlId, setTimeControlId] = useState<string>(initialTimeControlId)
    const panelRef = useRef<HTMLDivElement>(null)
    const titleId = useId()
    const difficultyLabelId = useId()
    const timeControlLabelId = useId()

    const handleStart = () => {
        // Rolled here rather than where the game starts, so the dialog closing
        // and the board appearing are one decision and not two.
        onStart({ mode, playerColor: resolveSideChoice(sideChoice), sideChoice, difficulty, timeControlId })
    }

    const showColorPicker = mode === 'human-vs-ai'
    const showDifficulty = mode === 'human-vs-ai' || mode === 'ai-vs-ai'

    useEffect(() => {
        if (!open) return
        setMode(initialMode)
        setSideChoice(initialSideChoice)
        setDifficulty(initialDifficulty)
        setTimeControlId(initialTimeControlId)
    }, [initialDifficulty, initialMode, initialSideChoice, initialTimeControlId, open])

    useModalFocus(open, panelRef, onCancel, { initialFocus: '[data-selected-mode="true"]' })

    if (!open) return null

    return (
        <div className="dialog-backdrop" onClick={onCancel}>
            <div
                ref={panelRef}
                className="dialog-panel new-game-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="dialog-header">
                    <span className="dialog-icon"><IconSwords /></span>
                    <h2 id={titleId}>New Game</h2>
                </header>

                <div className="dialog-body">
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
                                    aria-label={`${opt.label}: ${opt.description}`}
                                    aria-pressed={mode === opt.value}
                                    data-selected-mode={mode === opt.value ? 'true' : undefined}
                                >
                                    <span className="mode-icon">{opt.icon}</span>
                                    <strong>{opt.label}</strong>
                                    <span className="mode-desc">{opt.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Time control */}
                    <div className="dialog-section">
                        <p className="dialog-label" id={timeControlLabelId}>Time control</p>
                        <div className="time-control-grid" role="group" aria-labelledby={timeControlLabelId}>
                            {TIME_CONTROL_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className={`time-control-card ${timeControlId === preset.id ? 'selected' : ''}`}
                                    onClick={() => setTimeControlId(preset.id)}
                                    aria-pressed={timeControlId === preset.id}
                                    aria-label={`${preset.label}: ${preset.blurb}`}
                                >
                                    <strong>{preset.label}</strong>
                                    <span>{preset.blurb}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color picker */}
                    {showColorPicker && (
                        <div className="dialog-section">
                            <p className="dialog-label">Play as</p>
                            <div className="color-picker">
                                {SIDE_CHOICES.map(({ id, label }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        className={`color-btn ${sideChoice === id ? 'selected' : ''}`}
                                        onClick={() => setSideChoice(id)}
                                        aria-pressed={sideChoice === id}
                                    >
                                        {/* Random gets both kings, which is the picture of the
                                            choice: one of these, decided when you press Start. */}
                                        {id === 'random' ? (
                                            <span className="color-piece random" aria-hidden="true">
                                                <IconKing /><IconKing />
                                            </span>
                                        ) : (
                                            <span className={`color-piece ${id === 'black' ? 'dark' : ''}`}><IconKing /></span>
                                        )}
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Difficulty slider */}
                    {showDifficulty && (
                        <div className="dialog-section">
                            <p className="dialog-label" id={difficultyLabelId}>
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
                                aria-labelledby={difficultyLabelId}
                                aria-valuetext={DIFFICULTY_LABELS[difficulty]}
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
                </div>

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
