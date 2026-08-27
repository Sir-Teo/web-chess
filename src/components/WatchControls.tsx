import type { AiSpeed } from './aiSpeed'
import { IconSkipBack, IconChevronLeft, IconChevronRight, IconSkipForward, IconStepForward, IconPlay, IconPause } from './icons'

type Props = {
    // playback
    canGoBack: boolean
    canGoForward: boolean
    onFirst: () => void
    onPrev: () => void
    onNext: () => void
    onLast: () => void
    // play/pause (AI modes)
    aiActive: boolean
    paused: boolean
    isGameOver: boolean
    stepMode: boolean
    canStep: boolean
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
    aiActive,
    paused,
    isGameOver,
    stepMode,
    canStep,
    onPause,
    onResume,
    onStep,
    aiSpeed,
    onSpeedChange,
}: Props) {
    return (
        <div className="watch-controls">
            {/* ── Navigation ── */}
            <div className="wc-nav" aria-label="Move navigation">
                <button type="button" className="wc-btn" onClick={onFirst} disabled={!canGoBack} title="First position (⏮)" aria-label="Go to first position" aria-keyshortcuts="Home">
                    <IconSkipBack />
                </button>
                <button type="button" className="wc-btn" onClick={onPrev} disabled={!canGoBack} title="Previous move (←)" aria-label="Go to previous move" aria-keyshortcuts="ArrowLeft">
                    <IconChevronLeft />
                </button>
                <button type="button" className="wc-btn" onClick={onNext} disabled={!canGoForward} title="Next move (→)" aria-label="Go to next move" aria-keyshortcuts="ArrowRight">
                    <IconChevronRight />
                </button>
                <button type="button" className="wc-btn" onClick={onLast} disabled={!canGoForward} title="Last position (⏭)" aria-label="Go to last position" aria-keyshortcuts="End">
                    <IconSkipForward />
                </button>
            </div>

            {/* ── Play / Pause / Step (AI only) ── */}
            {aiActive && !isGameOver && (
                <div className="wc-play">
                    {stepMode ? (
                        <button
                            type="button"
                            className="wc-btn wc-btn-step"
                            onClick={onStep}
                            disabled={!canStep}
                            title={canStep ? 'Advance one AI move' : 'Waiting for AI turn'}
                            aria-label={canStep ? 'Advance one AI move' : 'Waiting for AI turn'}
                        >
                            <IconStepForward /> Step
                        </button>
                    ) : paused ? (
                        <button type="button" className="wc-btn wc-btn-resume" onClick={onResume} title="Resume AI" aria-label="Resume AI play" aria-keyshortcuts="Space">
                            <IconPlay /> Resume
                        </button>
                    ) : (
                        <button type="button" className="wc-btn wc-btn-pause" onClick={onPause} title="Pause & analyze" aria-label="Pause AI and analyze" aria-keyshortcuts="Space">
                            <IconPause /> Pause
                        </button>
                    )}
                </div>
            )}

            {/* ── Speed selector (AI only) ── */}
            {aiActive && (
                <div className="wc-speed" aria-label="AI speed">
                    <span className="wc-speed-label">Speed</span>
                    {SPEEDS.map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            className={`wc-speed-pill ${aiSpeed === id ? 'wc-speed-active' : ''}`}
                            aria-label={`Set AI speed to ${label}`}
                            aria-pressed={aiSpeed === id}
                            onClick={() => onSpeedChange(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Paused indicator ── */}
            {paused && aiActive && (
                <span className="wc-paused-label" role="status"><IconPause /> Analyzing</span>
            )}
        </div>
    )
}
