import type { GameMode } from './NewGameDialog'

export type AiSpeed = 'slow' | 'normal' | 'fast' | 'step'

export const AI_SPEED_MS: Record<AiSpeed, number> = {
    slow: 1200,
    normal: 600,
    fast: 150,
    step: 0,   // 0 = manual advance
}

type Props = {
    // playback
    canGoBack: boolean
    canGoForward: boolean
    onFirst: () => void
    onPrev: () => void
    onNext: () => void
    onLast: () => void
    // play/pause (AI modes)
    gameMode: GameMode
    paused: boolean
    isGameOver: boolean
    stepMode: boolean
    onPause: () => void
    onResume: () => void
    onStep: () => void      // advance one AI move in step mode
    // speed
    aiSpeed: AiSpeed
    onSpeedChange: (s: AiSpeed) => void
}

const SPEEDS: { id: AiSpeed; label: string }[] = [
    { id: 'slow', label: 'Slow' },
    { id: 'normal', label: 'Normal' },
    { id: 'fast', label: 'Fast' },
    { id: 'step', label: 'Step' },
]

export function WatchControls({
    canGoBack,
    canGoForward,
    onFirst,
    onPrev,
    onNext,
    onLast,
    gameMode,
    paused,
    isGameOver,
    stepMode,
    onPause,
    onResume,
    onStep,
    aiSpeed,
    onSpeedChange,
}: Props) {
    const aiActive = gameMode !== 'human-vs-human'

    return (
        <div className="watch-controls">
            {/* ── Navigation ── */}
            <div className="wc-nav">
                <button type="button" className="wc-btn" onClick={onFirst} disabled={!canGoBack} title="First position (⏮)">
                    ⏮
                </button>
                <button type="button" className="wc-btn" onClick={onPrev} disabled={!canGoBack} title="Previous move (←)">
                    ‹
                </button>
                <button type="button" className="wc-btn" onClick={onNext} disabled={!canGoForward} title="Next move (→)">
                    ›
                </button>
                <button type="button" className="wc-btn" onClick={onLast} disabled={!canGoForward} title="Last position (⏭)">
                    ⏭
                </button>
            </div>

            {/* ── Play / Pause / Step (AI only) ── */}
            {aiActive && !isGameOver && (
                <div className="wc-play">
                    {stepMode && paused ? (
                        <button type="button" className="wc-btn wc-btn-step" onClick={onStep} title="Advance one AI move">
                            ► Step
                        </button>
                    ) : paused ? (
                        <button type="button" className="wc-btn wc-btn-resume" onClick={onResume} title="Resume AI">
                            ▶ Resume
                        </button>
                    ) : (
                        <button type="button" className="wc-btn wc-btn-pause" onClick={onPause} title="Pause & analyze">
                            ⏸ Pause
                        </button>
                    )}
                </div>
            )}

            {/* ── Speed selector (AI only) ── */}
            {aiActive && (
                <div className="wc-speed">
                    <span className="wc-speed-label">Speed</span>
                    {SPEEDS.map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            className={`wc-speed-pill ${aiSpeed === id ? 'wc-speed-active' : ''}`}
                            onClick={() => onSpeedChange(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Paused indicator ── */}
            {paused && aiActive && (
                <span className="wc-paused-label">⏸ Analyzing</span>
            )}
        </div>
    )
}
