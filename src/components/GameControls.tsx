import type { GameMode } from './NewGameDialog'
import { IconUsers, IconBot, IconZap, IconPlay, IconPause } from './icons'

type Props = {
    gameMode: GameMode
    paused: boolean
    isGameOver: boolean
    onPause: () => void
    onResume: () => void
    onModeChange: (mode: GameMode) => void
}

const MODES: { id: GameMode; label: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
    { id: 'human-vs-human', label: 'H vs H', Icon: IconUsers },
    { id: 'human-vs-ai', label: 'H vs AI', Icon: IconBot },
    { id: 'ai-vs-ai', label: 'AI vs AI', Icon: IconZap },
]

export function GameControls({ gameMode, paused, isGameOver, onPause, onResume, onModeChange }: Props) {
    const aiActive = gameMode !== 'human-vs-human' && !isGameOver

    return (
        <div className="game-controls">
            {/* Pause / Resume — only visible when AI is involved */}
            {aiActive && (
                <button
                    type="button"
                    className={`gc-btn ${paused ? 'gc-btn-resume' : 'gc-btn-pause'}`}
                    onClick={paused ? onResume : onPause}
                    title={paused ? 'Resume AI' : 'Pause & analyze'}
                >
                    {paused
                        ? <><IconPlay className="gc-icon" /> Resume</>
                        : <><IconPause className="gc-icon" /> Pause</>
                    }
                </button>
            )}

            {/* Mode switcher pills */}
            <div className="gc-mode-pills">
                {MODES.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        type="button"
                        className={`gc-pill ${gameMode === id ? 'gc-pill-active' : ''}`}
                        onClick={() => id !== gameMode && onModeChange(id)}
                        title={id}
                    >
                        <Icon className="gc-pill-icon" />
                        {label}
                    </button>
                ))}
            </div>
        </div>
    )
}
