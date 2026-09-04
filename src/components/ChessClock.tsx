import { memo, useEffect, useState } from 'react'
import {
  CLOCK_TENTHS_THRESHOLD_MS,
  describeClockTime,
  formatClockTime,
  lowTimeThresholdMs,
  remainingMs,
  type ClockSide,
  type ClockState,
} from '../engine/chessClock'
import './ChessClock.css'

type Props = {
  state: ClockState
  /** The clocks are stopped but the game is not over — Play mode's pause. */
  paused: boolean
  /** Which side sits at the top of the board, so the pair reads in board order. */
  orientation: 'white' | 'black'
}

/**
 * Below this the display needs tenths, so it has to be repainted ten times a
 * second. Above it a quarter-second tick still lands each new whole second
 * within 250ms of the boundary, which nobody can see.
 */
const FAST_TICK_MS = 100
const SLOW_TICK_MS = 250

const SIDES: ClockSide[] = ['w', 'b']
const SIDE_NAMES: Record<ClockSide, string> = { w: 'White', b: 'Black' }

/**
 * The two clock faces.
 *
 * Memoized and self-ticking on purpose. `ClockState` changes only when a move
 * is made, the clock is paused, or somebody flags; what is *displayed* is
 * derived from `Date.now()` on every paint. So the repaint loop lives here and
 * nothing above this component re-renders while a clock runs — which is the
 * whole reason `engine/chessClock` stores a bank and a start time rather than a
 * countdown.
 */
export const ChessClock = memo(function ChessClock({ state, paused, orientation }: Props) {
  /**
   * The instant the faces are drawn for, kept in state rather than read during
   * render — a render has to be pure, and `Date.now()` in the body is exactly
   * the unstable read that rule is about.
   *
   * Starting at 0 is safe rather than approximate: `remainingMs` clamps a
   * negative elapsed to zero, so the very first paint shows each side's full
   * bank, and the effect below corrects it within a tick.
   */
  const [now, setNow] = useState(0)
  const running = state.running

  useEffect(() => {
    if (running === null) return
    // Re-read the remaining time on every tick rather than fixing a rate once:
    // a clock that starts at 3:00 has to speed up on its own as it passes ten
    // seconds, and nothing else will tell it to.
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      const current = Date.now()
      setNow(current)
      const left = remainingMs(state, running, current)
      timer = setTimeout(step, left <= CLOCK_TENTHS_THRESHOLD_MS ? FAST_TICK_MS : SLOW_TICK_MS)
    }
    step()
    return () => clearTimeout(timer)
  }, [running, state])

  // Top of the board is Black when White is at the bottom.
  const ordered: ClockSide[] = orientation === 'white' ? ['b', 'w'] : ['w', 'b']
  const lowTime = lowTimeThresholdMs(state.control)

  return (
    <div className="chess-clock" role="group" aria-label="Clocks">
      {ordered.map(side => {
        const ms = remainingMs(state, side, now)
        const isRunning = running === side && !paused
        const flagged = state.flagged === side
        const classes = [
          'clock-face',
          `clock-${side === 'w' ? 'white' : 'black'}`,
          isRunning ? 'running' : '',
          flagged ? 'flagged' : '',
          !flagged && ms <= lowTime ? 'low' : '',
        ].filter(Boolean).join(' ')

        return (
          <span
            key={side}
            className={classes}
            title={`${SIDE_NAMES[side]}${flagged ? ' — flagged' : isRunning ? ' — thinking' : ''}`}
            aria-label={flagged
              ? `${SIDE_NAMES[side]} flagged`
              : `${SIDE_NAMES[side]} ${describeClockTime(ms)}${isRunning ? ', running' : ''}`}
          >
            <i aria-hidden="true">{side === 'w' ? 'W' : 'B'}</i>
            <strong aria-hidden="true">{formatClockTime(ms)}</strong>
          </span>
        )
      })}
      {/*
        Read from the clock, not from `paused`. `paused` means "the reader
        stopped the AI", and step mode sets it after every engine move while
        the clock keeps running -- so a condition of `paused && running !== null`
        showed the badge in the one state where the clock was *not* paused, and
        hid it in the state it exists for: `pauseClock` clears `running`, so a
        real pause never satisfied it. Both halves were measured in the browser:
        Space stopped the clock and showed nothing, step mode showed "Paused"
        over a clock counting down from 2:55 to 2:52.

        A flagged or finished game also has no side counting, and neither is a
        pause; `paused` is what tells those apart, so it stays in the condition.
      */}
      {paused && running === null && !state.flagged && (
        <span className="clock-paused" role="status">Paused</span>
      )}
    </div>
  )
})

export { SIDES as CLOCK_SIDES }
