import { useLayoutEffect, useRef } from 'react'
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
    /** A pass-and-play clock or human Step turn; undefined when unavailable. */
    clockRunning?: boolean
    paused: boolean
    isGameOver: boolean
    stepMode: boolean
    canStep: boolean
    stepThinking?: boolean
    stepUnavailable?: boolean
    onPause: () => void
    onResume: () => void
    onStep: () => void      // advance one AI move in step mode
    // speed
    aiSpeed: AiSpeed
    onSpeedChange: (s: AiSpeed) => void
    /**
     * Replaying a line on its own: the moves already on the board, stepped
     * through at the chosen speed. Offered wherever the engine is not playing
     * -- an imported game, a finished one, a pass-and-play game being looked
     * back over -- because a game you can only replay with a held-down arrow
     * key is a game you cannot watch. `canAutoplay` is whether there is a game
     * to replay at all; at its end the button stays, disabled like Next beside
     * it, rather than vanishing under the pointer.
     */
    autoplay?: boolean
    canAutoplay?: boolean
    onAutoplayToggle?: () => void
}

const SPEEDS: { id: AiSpeed; label: string }[] = [
    { id: 'slow', label: 'Slow' },
    { id: 'normal', label: 'Normal' },
    { id: 'fast', label: 'Fast' },
    { id: 'step', label: 'Step' },
]

function revealControl(strip: HTMLElement, control: HTMLElement) {
    const box = control.getBoundingClientRect(), bounds = strip.getBoundingClientRect()
    let left = Math.max(0, bounds.left), right = Math.min(document.documentElement.clientWidth, bounds.right)
    for (let parent = control.parentElement; parent && strip.contains(parent); parent = parent.parentElement) {
        if (parent.scrollWidth > parent.clientWidth) {
            const clipped = parent.getBoundingClientRect()
            left = Math.max(left, clipped.left)
            right = Math.min(right, clipped.right)
        }
        if (parent === strip) break
    }
    if (box.left < left - 1 || box.right > right + 1) {
        control.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    }
}

export function WatchControls({
    canGoBack,
    canGoForward,
    onFirst,
    onPrev,
    onNext,
    onLast,
    aiActive,
    clockRunning,
    paused,
    isGameOver,
    stepMode,
    canStep,
    stepThinking = false,
    stepUnavailable = false,
    onPause,
    onResume,
    onStep,
    aiSpeed,
    onSpeedChange,
    autoplay = false,
    canAutoplay = false,
    onAutoplayToggle,
}: Props) {
    const stripRef = useRef<HTMLDivElement>(null)
    // The engine's controls and the replay's are never both on offer: one
    // plays moves, the other walks the ones already there.
    const replayOffered = !aiActive && Boolean(onAutoplayToggle) && (canAutoplay || autoplay)
    const clockOffered = clockRunning !== undefined && (!aiActive || stepMode)
    // Replays use Normal's delay for the AI's manual Step setting. Show that
    // effective speed without changing the setting when returning to AI play.
    const displayedSpeed = !aiActive && aiSpeed === 'step' ? 'normal' : aiSpeed
    useLayoutEffect(() => {
        const strip = stripRef.current, active = document.activeElement
        // Thinking and clock labels can grow while the same button keeps focus.
        // Reveal it after that commit, without changing the reader's focus.
        if (strip && active instanceof HTMLElement && strip.contains(active)) revealControl(strip, active)
    }, [aiActive, autoplay, canStep, clockRunning, paused, stepMode, stepThinking, stepUnavailable])
    return (
        <div className="watch-controls" ref={stripRef} onFocus={event => revealControl(event.currentTarget, event.target)}>
            {/* ── Navigation ── */}
            <div className="wc-nav" role="group" aria-label="Move navigation">
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

            {/* ── Play / Pause / Step, or the human clock in Step mode ── */}
            {(aiActive || clockOffered) && !isGameOver && (
                <div className="wc-play" role={clockOffered ? 'group' : undefined} aria-label={clockOffered ? 'Game clock' : undefined}>
                    {clockOffered ? (
                        <button
                            type="button"
                            className={`wc-btn wc-btn-clock ${clockRunning ? 'wc-btn-pause' : 'wc-btn-resume'}`}
                            onClick={clockRunning ? onPause : onResume}
                            title={`${clockRunning ? 'Pause' : 'Resume'} clock (Space)`}
                            aria-label={`${clockRunning ? 'Pause' : 'Resume'} clock`}
                            aria-keyshortcuts="Space"
                        >
                            {clockRunning ? <IconPause /> : <IconPlay />}
                            <span>{clockRunning ? 'Pause clock' : 'Resume clock'}</span>
                        </button>
                    ) : stepMode ? (
                        <button
                            type="button"
                            className="wc-btn wc-btn-step"
                            onClick={stepThinking || stepUnavailable ? undefined : onStep}
                            disabled={!canStep || stepUnavailable}
                            aria-disabled={stepThinking || undefined}
                            aria-busy={stepThinking || undefined}
                            title={stepUnavailable ? 'Retry the opponent in the Opponent panel' : stepThinking ? 'The engine is choosing its move' : canStep ? 'Advance one AI move' : 'Waiting for AI turn'}
                            aria-label={stepUnavailable ? 'Engine unavailable' : stepThinking ? 'Engine is thinking' : canStep ? 'Advance one AI move' : 'Waiting for AI turn'}
                        >
                            <IconStepForward /> {stepThinking ? 'Thinking…' : 'Step'}
                        </button>
                    ) : paused ? (
                        <button type="button" className="wc-btn wc-btn-resume" onClick={onResume} title="Resume AI" aria-label="Resume AI play" aria-keyshortcuts="Space">
                            <IconPlay /> Resume
                        </button>
                    ) : (
                        <button type="button" className="wc-btn wc-btn-pause" onClick={onPause} title="Pause AI" aria-label="Pause AI" aria-keyshortcuts="Space">
                            <IconPause /> Pause
                        </button>
                    )}
                </div>
            )}

            {aiActive && stepMode && stepThinking && !isGameOver && (
                <span className="visually-hidden" role="status">The engine is choosing its move.</span>
            )}

            {/* ── Autoplay (no engine playing) ── */}
            {replayOffered && (
                <div className="wc-play">
                    <button
                        type="button"
                        className={`wc-btn ${autoplay ? 'wc-btn-pause' : 'wc-btn-resume'}`}
                        onClick={onAutoplayToggle}
                        disabled={!autoplay && !canGoForward}
                        title={autoplay ? 'Stop autoplay (Space)' : 'Play through the moves (Space)'}
                        aria-label={autoplay ? 'Stop autoplay' : 'Autoplay the moves'}
                        aria-pressed={autoplay}
                        aria-keyshortcuts="Space"
                        data-testid="autoplay-btn"
                    >
                        {autoplay ? <><IconPause /> Stop</> : <><IconPlay /> Autoplay</>}
                    </button>
                </div>
            )}

            {/* ── Speed selector (AI, or a replay in progress) ──
                Only while a replay runs: on a phone the pills are a second
                row of the bottom bar, and a row for a speed nothing is
                moving at is space taken from the board. */}
            {(aiActive || autoplay) && (
                <div className="wc-speed" role="group" aria-label={aiActive ? 'AI speed' : 'Autoplay speed'}>
                    <span className="wc-speed-label">Speed</span>
                    {SPEEDS.filter(({ id }) => aiActive || id !== 'step').map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            className={`wc-speed-pill ${displayedSpeed === id ? 'wc-speed-active' : ''}`}
                            aria-label={`Set ${aiActive ? 'AI' : 'autoplay'} speed to ${label}`}
                            aria-pressed={displayedSpeed === id}
                            onClick={() => onSpeedChange(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Paused indicator ── */}
            {paused && aiActive && (
                <span className="wc-paused-label" role="status"><IconPause /> AI paused</span>
            )}
        </div>
    )
}
